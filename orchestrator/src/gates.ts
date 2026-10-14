import fs from 'node:fs';
import path from 'node:path';
import type { CellDef, GateId } from './config.ts';
import { cellLabel } from './config.ts';
import type { FactoryContext } from './context.ts';
import { p } from './paths.ts';
import { gateForState } from './state/machine.ts';
import { recordGateOpened, type Task } from './state/task.ts';

const MAX_INLINE = 12_000;

function readRel(ctx: FactoryContext, rel: string): string | null {
  const f = path.join(ctx.ps.stateRoot, rel);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
}

function details(summary: string, body: string | null): string {
  if (!body) return `_${summary}: δεν βρέθηκε._`;
  const text = body.length > MAX_INLINE ? `${body.slice(0, MAX_INLINE)}\n\n… (κόπηκε, δες το αρχείο)` : body;
  return `<details><summary>${summary}</summary>\n\n${text}\n\n</details>`;
}

export function fileLink(ctx: FactoryContext, rel: string): string {
  const repo = ctx.env.GITHUB_REPOSITORY;
  const branch = ctx.env.FACTORY_STATE_BRANCH ?? ctx.env.GITHUB_REF_NAME ?? 'main';
  return repo ? `[${rel}](https://github.com/${repo}/blob/${branch}/${rel})` : `\`${rel}\``;
}

export function gateTitle(ctx: FactoryContext, cell: CellDef, gate: GateId): string {
  const g = ctx.config.gates.gates[gate];
  return `[GATE ${g?.number ?? '?'}] ${g?.title ?? gate}: ${cellLabel(ctx.config.matrix, cell)}`;
}

/** Το σώμα του issue: σύνοψη, links, checklist, οδηγίες. Γραμμένο για ανάγνωση από κινητό. */
export function gateBody(ctx: FactoryContext, task: Task, cell: CellDef, gate: GateId): string {
  const id = cell.id;
  const g = ctx.config.gates.gates[gate];
  const parts: string[] = [];
  parts.push(`**Κελί:** \`${id}\` · fit ${cell.fit} · priority ${cell.priority}`);

  if (gate === 'idea') {
    parts.push(`**Βαθμολογία scout:** ${task.scout_score ?? '—'}/10`);
    parts.push(`**Αρχείο:** ${fileLink(ctx, `pipeline/${id}/brief.md`)}`);
    parts.push(details('Διάβασε το brief', readRel(ctx, `pipeline/${id}/brief.md`)));
  } else if (gate === 'demo') {
    const preview = typeof task.meta.preview_url === 'string' ? task.meta.preview_url : null;
    const pr = typeof task.meta.pr_url === 'string' ? task.meta.pr_url : null;
    parts.push(`**Preview:** ${preview ?? `δεν υπάρχει ακόμα (τοπικά: \`cd showcase && npm run dev\` → /demos/${id})`}`);
    if (pr) parts.push(`**PR:** ${pr}`);
    parts.push(details('Αναφορά builder (build.md)', readRel(ctx, `pipeline/${id}/build.md`)));
  } else if (gate === 'publish') {
    parts.push(`**Φάκελος:** ${fileLink(ctx, `pipeline/${id}/content/`)}`);
    parts.push(details('Σελίδα demo (page.md)', readRel(ctx, `pipeline/${id}/content/page.md`)));
    parts.push(details('Reels (reel.md)', readRel(ctx, `pipeline/${id}/content/reel.md`)));
  } else if (gate === 'campaign') {
    parts.push(details('Αναφορά QA + δείγμα', readRel(ctx, `pipeline/${id}/campaign/qa-report.md`)));
  }

  parts.push('### Τι ελέγχεις');
  parts.push((g?.checklist ?? []).map((c) => `- [ ] ${c}`).join('\n'));
  const l = ctx.config.gates.labels;
  parts.push(
    '### Τι κάνεις',
    `Βάλε **ένα** label: \`${l.approved}\` (προχωρά) · \`${l.changes}\` (γράψε σχόλιο με τις αλλαγές) · \`${l.rejected}\` (γράψε τον λόγο).`,
    '_Το διαβάζει ο orchestrator στην επόμενη εκτέλεσή του. Μετράνε μόνο labels από τους approvers του `config/gates.yaml`._',
  );
  return parts.join('\n\n');
}

/**
 * Χρειάζεται νέο issue αν δεν έχει ανοίξει, αν το προηγούμενο του ίδιου gate έχει ήδη αποφασιστεί,
 * ή αν άνοιξε τοπικά (χωρίς GitHub) και τώρα τρέχουμε με GitHub.
 */
export function gateNeedsOpening(task: Task, approvalsKind?: 'github' | 'dry-run'): GateId | null {
  const gate = gateForState(task.state);
  if (!gate) return null;
  const rec = task.gates[gate];
  if (!rec || rec.decided_at) return gate;
  if (approvalsKind === 'github' && !/^\d+$/.test(rec.ref ?? '')) return gate;
  return null;
}

export async function openGateFor(ctx: FactoryContext, task: Task, cell: CellDef): Promise<boolean> {
  const gate = gateNeedsOpening(task, ctx.approvals.kind);
  if (!gate) return false;
  try {
    const opened = await ctx.approvals.openGate({
      task,
      gate,
      title: gateTitle(ctx, cell, gate),
      body: gateBody(ctx, task, cell, gate),
    });
    recordGateOpened(task, gate, ctx.now(), opened.ref, opened.url);
    return true;
  } catch (err) {
    ctx.log(`⚠️  Δεν άνοιξε το gate ${gate} για ${cell.id}: ${(err as Error).message}`);
    return false;
  }
}

/** Γράφει όλο το ιστορικό feedback του κελιού σε markdown, για να το διαβάσει ο agent. */
export function writeFeedbackFile(ctx: FactoryContext, task: Task): void {
  const rounds = task.feedback.filter((f) => f.decision !== 'approved');
  if (rounds.length === 0) return;
  const lines = [
    `# Feedback για ${task.id}`,
    '',
    '> Το γράφει ο orchestrator από τα σχόλια των ιδρυτών στα gates. Το πιο πρόσφατο πρώτο.',
    '',
  ];
  for (const f of [...rounds].reverse()) {
    lines.push(`## ${f.at.slice(0, 10)} · gate ${f.gate} · ${f.decision} · από ${f.by}`, '');
    if (f.comments.length === 0) lines.push('_Χωρίς σχόλιο._', '');
    for (const c of f.comments) lines.push(c, '');
  }
  const file = p.feedback(ctx.ps, task.id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join('\n'));
}
