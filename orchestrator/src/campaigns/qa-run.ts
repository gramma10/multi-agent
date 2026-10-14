import fs from 'node:fs';
import path from 'node:path';
import type { CellDef } from '../config.ts';
import type { FactoryContext } from '../context.ts';
import { loadBannedPhrases } from '../qa/brand.ts';
import { checkMessage, RULES, type QaFinding, type Rule } from '../qa/messages.ts';
import type { LeadStore } from '../leads/store.ts';
import { AllWorkersUnavailableError } from '../workers/pool.ts';
import type { BuiltCampaign } from './build.ts';
import type { RenderedMessage } from './render.ts';

export interface LlmVerdict {
  pass: boolean;
  rules: string[];
  note: string;
}

export interface CampaignQa {
  campaignId: string;
  channel: string;
  total: number;
  passed: number;
  passRate: number;
  byRule: Record<string, number>;
  rejected: Array<{ textId: string; rules: string[]; note: string }>;
  sample: RenderedMessage[];
  sampleVerdicts: Array<{ pass: boolean; findings: string[] }>;
}

/** Seeded PRNG ώστε το δείγμα να αναπαράγεται (ίδια καμπάνια → ίδιο δείγμα). */
function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 3432918353);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function sampleOf<T>(items: T[], n: number, seed: string): T[] {
  const r = seeded(seed);
  const idx = items.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  return idx.slice(0, n).map((i) => items[i]!);
}

/** «Κομμωτήριο Μαρία 12» → «Κ••••••••ο Μ•••α 12». Για ό,τι μπαίνει στο git ή σε issue. */
export function maskName(name: string): string {
  return name
    .split(/(\s+)/)
    .map((w) => (/\p{L}{3,}/u.test(w) ? `${w[0]}${'•'.repeat(Math.max(1, w.length - 2))}${w.at(-1)}` : w))
    .join('');
}

export function maskMessage(m: RenderedMessage): string {
  let t = m.text.split(m.businessName).join(maskName(m.businessName));
  t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]').replace(/\+30\d{10}/g, '[τηλέφωνο]');
  return t;
}

/** Ζητά από τον QA agent κρίση για κάθε ΜΟΝΑΔΙΚΟ κείμενο (ίδιο template + variant = ένα κείμενο). */
async function llmCheck(ctx: FactoryContext, cell: CellDef, unique: Map<string, RenderedMessage>): Promise<Map<string, LlmVerdict>> {
  const payload = [...unique.entries()].map(([textId, m]) => ({
    text_id: textId,
    channel: m.channel,
    text: maskMessage(m),
    personalization_fields_used: m.usedFields,
  }));
  const prompt = [
    'Είσαι ο agent «qa» του Auragram Showcase Factory.',
    'Διάβασε ΠΡΩΤΑ: CLAUDE.md, config/brand.md, agents/qa.md.',
    `Καμπάνια για το κελί ${cell.id}. Έλεγξε κάθε κείμενο για τους κανόνες Q1–Q10 του agents/qa.md (ιδίως Q4 κακά ελληνικά, ύφος β' ενικού, υπονοούμενοι ισχυρισμοί).`,
    'Τα ονόματα είναι κρυμμένα με •. Δεν γράφεις αρχεία. Σε αμφιβολία: fail.',
    'Απάντησε ΜΟΝΟ με JSON: {"results":[{"text_id":"…","pass":true|false,"rules":["Q4"],"note":"…"}]}',
    '',
    JSON.stringify(payload, null, 1),
  ].join('\n');
  const out = await ctx.pool.runAgent('qa', { prompt, cwd: ctx.ps.stateRoot, allowedTools: ['Read'], cellId: cell.id, outputs: [], context: { 'cell.id': cell.id } });
  if (out.result.exitReason !== 'ok') throw new Error(`QA agent: ${out.result.exitReason} ${out.result.errorMessage ?? ''}`);
  const m = /\{[\s\S]*\}/.exec(out.result.output);
  if (!m) throw new Error('QA agent: δεν επέστρεψε JSON');
  const parsed = JSON.parse(m[0]) as { results?: Array<{ text_id: string; pass: boolean; rules?: string[]; note?: string }>; all_pass?: boolean };
  const verdicts = new Map<string, LlmVerdict>();
  if (parsed.all_pass === true && (parsed.results ?? []).length === 0) {
    for (const id of unique.keys()) verdicts.set(id, { pass: true, rules: [], note: '' });
    return verdicts;
  }
  for (const r of parsed.results ?? []) verdicts.set(r.text_id, { pass: r.pass === true, rules: r.rules ?? [], note: r.note ?? '' });
  return verdicts;
}

/**
 * QA ΟΛΩΝ των μηνυμάτων: deterministic σε κάθε μήνυμα + LLM σε κάθε μοναδικό κείμενο.
 * Ένα μήνυμα περνά μόνο αν περνά και τα δύο. Ενημερώνει τα μέλη στη βάση (qa_passed / qa_failed).
 */
export async function runCampaignQa(ctx: FactoryContext, cell: CellDef, store: LeadStore, campaigns: BuiltCampaign[]): Promise<CampaignQa[]> {
  const banned = loadBannedPhrases(ctx.ps.repoRoot);
  const otherTerms = ctx.config.matrix.verticals.filter((v) => v.id !== cell.vertical).flatMap((v) => v.places).filter((t) => t.length >= 6);
  const all = campaigns.flatMap((c) => c.messages);
  const unique = new Map<string, RenderedMessage>();
  for (const m of all) if (!unique.has(m.textId)) unique.set(m.textId, m);

  let verdicts: Map<string, LlmVerdict>;
  try {
    verdicts = await llmCheck(ctx, cell, unique);
  } catch (err) {
    if (err instanceof AllWorkersUnavailableError) throw err;
    throw new Error(`Το LLM QA δεν ολοκληρώθηκε: ${(err as Error).message}`, { cause: err });
  }

  const sampleSize = ctx.config.volume.campaigns.sample_size_for_review;
  const results: CampaignQa[] = [];
  for (const c of campaigns) {
    const byRule: Record<string, number> = {};
    const findingsByMsg = new Map<RenderedMessage, QaFinding[]>();
    const failedMembers = new Set<string>();
    const rejected = new Map<string, { textId: string; rules: Set<string>; note: string }>();
    for (const m of c.messages) {
      const f = checkMessage(m, { banned, otherVerticalTerms: otherTerms });
      const v = verdicts.get(m.textId) ?? { pass: false, rules: ['LLM'], note: 'χωρίς απάντηση από το LLM QA' };
      if (!v.pass) for (const r of v.rules.length ? v.rules : ['LLM']) f.push({ rule: (r as Rule) in RULES ? (r as Rule) : 'Q4', detail: `LLM: ${v.note}` });
      findingsByMsg.set(m, f);
      if (f.length) {
        failedMembers.add(m.businessId);
        for (const x of new Set(f.map((y) => y.rule))) byRule[x] = (byRule[x] ?? 0) + 1;
        const key = m.textId;
        const r = rejected.get(key) ?? { textId: key, rules: new Set<string>(), note: '' };
        for (const x of f) r.rules.add(x.rule);
        r.note ||= f.map((x) => `${x.rule}: ${x.detail}`).join('; ').slice(0, 300);
        rejected.set(key, r);
      }
    }
    const total = c.members.length;
    const passed = total - failedMembers.size;
    await store.db.transaction(async () => {
      for (const b of c.members) {
        await store.db.run('update campaign_members set status = ? where campaign_id = ? and business_id = ?', [failedMembers.has(b) ? 'qa_failed' : 'qa_passed', c.id, b]);
      }
    });
    const sample = sampleOf(c.messages, sampleSize, c.id);
    results.push({
      campaignId: c.id,
      channel: c.channel,
      total,
      passed,
      passRate: total ? passed / total : 0,
      byRule,
      rejected: [...rejected.values()].map((r) => ({ textId: r.textId, rules: [...r.rules], note: r.note })),
      sample,
      sampleVerdicts: sample.map((m) => {
        const f = findingsByMsg.get(m) ?? [];
        return { pass: f.length === 0, findings: f.map((x) => `${x.rule}: ${x.detail}`) };
      }),
    });
  }
  return results;
}

/**
 * Η αναφορά QA: στο git (pipeline/<id>/campaign/qa-report.md) με κρυμμένα ονόματα και χωρίς επαφές,
 * και ολόκληρη (για ανάγνωση από τους ιδρυτές) στο exports/review/, που δεν μπαίνει στο git.
 */
export function writeQaReports(ctx: FactoryContext, cell: CellDef, qa: CampaignQa[], minPassRate: number): { masked: string; full: string } {
  const head = (masked: boolean) => [
    `# QA καμπάνιας: ${cell.id}`,
    '',
    masked
      ? '> Ονόματα κρυμμένα, χωρίς emails/τηλέφωνα (αυτό το αρχείο μπαίνει στο git). Ολόκληρο δείγμα: `exports/review/` (μόνο τοπικά).'
      : '> ΠΛΗΡΕΣ ΔΕΙΓΜΑ με πραγματικά ονόματα. ΜΗΝ το βάλεις στο git και μην το μοιραστείς.',
    `> Ελάχιστο pass rate για το Gate 4: ${(minPassRate * 100).toFixed(0)}%. Τα μηνύματα που απορρίφθηκαν ΔΕΝ μπαίνουν στο export.`,
    '',
    '| Κανάλι | Μηνύματα (leads) | Πέρασαν | Pass rate |',
    '|---|---|---|---|',
    ...qa.map((q) => `| ${q.channel} | ${q.total} | ${q.passed} | ${(q.passRate * 100).toFixed(1)}% |`),
    '',
  ];
  const body = (masked: boolean) =>
    qa.flatMap((q) => [
      `## ${q.channel} (\`${q.campaignId}\`)`,
      '',
      '### Απορρίψεις ανά κανόνα',
      '',
      ...(Object.keys(q.byRule).length
        ? ['| Κανόνας | Μηνύματα |', '|---|---|', ...Object.entries(q.byRule).map(([r, n]) => `| ${r}: ${RULES[r as Rule] ?? r} | ${n} |`)]
        : ['Καμία.']),
      '',
      ...(q.rejected.length ? ['### Κείμενα που απορρίφθηκαν', '', ...q.rejected.slice(0, 20).map((r) => `- \`${r.textId}\`: ${r.note}`), ''] : []),
      `### Τυχαίο δείγμα ${q.sample.length} μηνυμάτων`,
      '',
      ...q.sample.flatMap((m, i) => [
        `<details><summary>${i + 1}. ${m.step} · ${q.sampleVerdicts[i]!.pass ? '✅' : '❌'} · ${masked ? maskName(m.businessName) : m.businessName}</summary>`,
        '',
        '```',
        masked ? maskMessage(m) : m.text,
        '```',
        ...(q.sampleVerdicts[i]!.findings.length ? ['', ...q.sampleVerdicts[i]!.findings.map((f) => `- ${f}`)] : []),
        '',
        '</details>',
        '',
      ]),
    ]);
  const masked = [...head(true), ...body(true)].join('\n');
  const full = [...head(false), ...body(false)].join('\n');
  const maskedFile = path.join(ctx.ps.stateRoot, 'pipeline', cell.id, 'campaign', 'qa-report.md');
  const fullFile = path.join(ctx.ps.stateRoot, 'exports', 'review', `${cell.id}-qa-full.md`);
  fs.mkdirSync(path.dirname(maskedFile), { recursive: true });
  fs.mkdirSync(path.dirname(fullFile), { recursive: true });
  fs.writeFileSync(maskedFile, masked);
  fs.writeFileSync(fullFile, full);
  return { masked: maskedFile, full: fullFile };
}
