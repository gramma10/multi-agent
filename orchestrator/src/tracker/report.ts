import path from 'node:path';
import type { FactoryContext } from '../context.ts';
import type { LeadStore } from '../leads/store.ts';
import { writeFileAtomic } from '../util/fs.ts';
import { runGuards, type FreezeResult } from './guards.ts';
import { addMetrics, byCell, byCellChannel, campaignMetrics, emptyMetrics, isEmailChannel, positives, rate, type CellChannelMetrics, type Metrics } from './metrics.ts';
import { applyPriorityChanges, computePriorityChanges, type PriorityChange } from './priority.ts';
import { weekRange } from './week.ts';

export interface WeeklyResult {
  week: string;
  file: string;
  frozen: FreezeResult[];
  changes: PriorityChange[];
  weekTotals: Metrics;
  allTotals: Metrics;
  tooLittleData: boolean;
}

const pct = (n: number, d: number, digits = 1) => (d > 0 ? `${((n / d) * 100).toFixed(digits)}%` : '—');

function table(rows: CellChannelMetrics[], weekly: boolean): string[] {
  const lines = [
    '| Κελί | Κανάλι | Επαφές | Bounce | Opens* | Θετικές | Αρνητικές | Άλλες | Διαγραφές | Spam | Κλήσεις | Pilots |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const r of rows) {
    const m = r.m;
    const email = isEmailChannel(r.channel);
    const contacts = !email && weekly ? '—' : String(m.contacts);
    lines.push(
      `| ${r.cellId} | ${r.channel} | ${contacts} | ${email ? pct(m.bounces, m.sent) : '—'} | ${email ? pct(m.opens, m.contacts, 0) : '—'} | ${m.positive} | ${m.negative} | ${m.otherReplies} | ${m.unsubscribes} | ${m.spam} | ${m.calls} | ${m.pilots} |`,
    );
  }
  if (rows.length === 0) lines.push('| — | — | 0 | — | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 |');
  return lines;
}

const sum = (ms: Iterable<Metrics>) => [...ms].reduce(addMetrics, emptyMetrics());

/**
 * Εβδομαδιαίος κύκλος: μετρικές (εβδομάδα + σύνολο), αυτόματο πάγωμα, αλλαγές priority, αναφορά
 * `reports/YYYY-WW.md`. Μόνο αθροίσματα: κανένα όνομα, email ή τηλέφωνο. Νούμερα μόνο από τα events.
 */
export async function runWeekly(ctx: FactoryContext, store: LeadStore, week: string): Promise<WeeklyResult> {
  const { start, end } = weekRange(week);
  const frozen = await runGuards(ctx, store);
  const weekRows = await campaignMetrics(store, { from: start, to: end });
  const allRows = await campaignMetrics(store, { to: end });
  const allWithContacts = await campaignMetrics(store);
  // Οι επαφές κλήσεων/DM δεν έχουν χρόνο: παίρνονται από το σύνολο.
  for (const r of allRows) {
    const full = allWithContacts.find((x) => x.campaignId === r.campaignId && x.cellId === r.cellId && x.channel === r.channel);
    if (full && !isEmailChannel(r.channel)) r.m.contacts = full.m.contacts;
  }
  const weekCells = byCell(weekRows);
  const allCells = byCell(allRows);
  // Για το «καμία απόκριση» μετράνε μόνο επαφές που έγιναν σίγουρα (email). Μια λίστα κλήσεων που
  // βγήκε σε export δεν σημαίνει ότι έγιναν οι κλήσεις (D048).
  const judgedCells = byCell(allRows.map((r) => (isEmailChannel(r.channel) ? r : { ...r, m: { ...r.m, contacts: 0 } })));
  const changes = applyPriorityChanges(ctx, week, computePriorityChanges(ctx, weekCells, judgedCells));

  const weekTotals = sum(weekCells.values());
  const allTotals = sum(allCells.values());
  const minN = ctx.config.volume.guards.min_contacts_before_judging;
  const tooLittleData = allTotals.contacts < minN;
  const label = (id: string) => {
    const c = ctx.config.matrix.cells.find((x) => x.id === id);
    const v = ctx.config.matrix.verticals.find((x) => x.id === c?.vertical);
    const s = ctx.config.matrix.services.find((x) => x.id === c?.service);
    return c ? `${v?.name ?? c.vertical} × ${s?.name ?? c.service}` : id;
  };

  // 1. Σύνοψη σε 3 γραμμές.
  const best = [...weekCells.entries()].filter(([, m]) => positives(m) > 0).sort((a, b) => positives(b[1]) - positives(a[1]))[0];
  const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const bestParts = best
    ? [
        best[1].calls ? plural(best[1].calls, 'κλήση', 'κλήσεις') : '',
        best[1].pilots ? plural(best[1].pilots, 'pilot', 'pilots') : '',
        best[1].positive ? plural(best[1].positive, 'θετική απάντηση', 'θετικές απαντήσεις') : '',
      ].filter(Boolean)
    : [];
  const good = best
    ? `Καλά: ${label(best[0])} με ${bestParts.length > 1 ? `${bestParts.slice(0, -1).join(', ')} και ${bestParts.at(-1)}` : bestParts[0]}.`
    : weekTotals.sent + weekTotals.contacts > 0
      ? 'Καλά: τίποτα θετικό ακόμα· καμία θετική απάντηση ή κλήση αυτή την εβδομάδα.'
      : 'Καλά: δεν υπάρχουν events αυτή την εβδομάδα (δεν έγινε αποστολή ή δεν εισήχθησαν αποτελέσματα).';
  const problems: string[] = [];
  if (frozen.length) problems.push(`${frozen.length} καμπάνιες πάγωσαν`);
  const dropping = changes.filter((c) => c.delta < 0);
  if (dropping.length) problems.push(`${dropping.length} κελιά χωρίς απόκριση πέφτουν`);
  if (weekTotals.unsubscribes) problems.push(`${weekTotals.unsubscribes} αιτήματα διαγραφής (μπήκαν όλα στη suppression)`);
  const bad = `Όχι καλά: ${problems.length ? problems.join(', ') : 'κανένα πρόβλημα deliverability ή διαγραφών'}.`;
  const up = changes.filter((c) => c.delta > 0).length;
  const change = `Αλλάζει: ${changes.length ? `${up} κελιά ανεβαίνουν, ${dropping.length} πέφτουν στον πίνακα` : 'καμία αλλαγή προτεραιοτήτων'}.`;

  const lines: string[] = [
    `# Εβδομαδιαία αναφορά ${week}`,
    '',
    `${start.toISOString().slice(0, 10)} έως ${new Date(end.getTime() - 1).toISOString().slice(0, 10)}. Γράφτηκε αυτόματα από τον tracker στις ${ctx.now().toISOString()}. Μόνο αθροίσματα από τα events της βάσης.`,
    '',
    '## 1. Σύνοψη',
    '',
    `- ${good}`,
    `- ${bad}`,
    `- ${change}`,
  ];
  if (tooLittleData) {
    lines.push('', `> **Πολύ λίγα δεδομένα για συμπέρασμα:** ${allTotals.contacts} επαφές συνολικά (χρειάζονται ${minN}). Οι αριθμοί είναι ενδεικτικοί· κανένα κελί δεν πέφτει ακόμα για «καμία απόκριση».`);
  }
  lines.push(
    '',
    '## 2. Μετρικές ανά κελί × κανάλι',
    '',
    '### Αυτή την εβδομάδα',
    '',
    ...table(byCellChannel(weekRows).filter((r) => Object.values(r.m).some((v) => v > 0)), true),
    '',
    '### Σύνολο από την αρχή',
    '',
    ...table(byCellChannel(allRows).filter((r) => Object.values(r.m).some((v) => v > 0)), false),
    '',
    '*Opens: ενδεικτικά μόνο (το Apple Mail Privacy «ανοίγει» αυτόματα). Επαφές κλήσεων/DM = όσοι βγήκαν σε export, μόνο στο σύνολο.',
    '',
    '## 3. Καμπάνιες που πάγωσαν',
    '',
  );
  const frozenNow = allWithContacts.filter((r) => r.status === 'frozen');
  if (frozenNow.length === 0) lines.push('Καμία.');
  for (const r of frozenNow) {
    const f = frozen.find((x) => x.campaignId === r.campaignId);
    lines.push(`- \`${r.campaignId}\`${f ? ` (πάγωσε τώρα: ${f.reasons.join(', ')})` : ' (παγωμένη από πριν)'}. Ξεπαγώνει μόνο άνθρωπος.`);
  }
  lines.push('', '## 4. Αλλαγές priority', '');
  if (changes.length === 0) lines.push('Καμία.');
  else {
    lines.push('| Κελί | Από | Σε | Γιατί |', '|---|---:|---:|---|');
    for (const c of changes) lines.push(`| ${c.cellId} | ${c.from} | ${c.to} | ${c.reasons.join('· ')} |`);
  }

  // 5. Πρόταση για την επόμενη εβδομάδα.
  lines.push('', '## 5. Επόμενη εβδομάδα', '');
  const channelRows = byCellChannel(allRows).reduce((acc, r) => {
    const cur = acc.get(r.channel) ?? emptyMetrics();
    acc.set(r.channel, sum([cur, r.m]));
    return acc;
  }, new Map<string, Metrics>());
  const judged = [...channelRows.entries()].filter(([ch, m]) => ch !== 'άλλο' && m.contacts >= minN);
  if (judged.length) {
    const ranked = judged.sort((a, b) => rate(positives(b[1]), b[1].contacts) - rate(positives(a[1]), a[1].contacts));
    lines.push(`- Κανάλια με αρκετά δεδομένα, από το καλύτερο: ${ranked.map(([ch, m]) => `${ch} (${pct(positives(m), m.contacts)} θετική απόκριση)`).join(', ')}.`);
  } else lines.push(`- Κανάλια: κανένα δεν έχει ακόμα ${minN} επαφές· πολύ λίγα δεδομένα για να προτιμηθεί κάποιο.`);
  const tracking = new Set(allRows.map((r) => r.cellId));
  const nextCells = [...ctx.config.matrix.cells]
    .filter((c) => !['done', 'rejected'].includes(c.status))
    .sort((a, b) => (a.fit === b.fit ? b.priority - a.priority : a.fit === 'high' ? -1 : b.fit === 'high' ? 1 : a.fit === 'medium' ? -1 : 1))
    .slice(0, 3);
  lines.push(`- Κελιά πρώτα στη σειρά (fit, μετά priority): ${nextCells.map((c) => `${c.id} (${c.priority}${tracking.has(c.id) ? ', σε tracking' : ''})`).join(', ')}.`);
  lines.push('');

  const file = path.join(ctx.ps.stateRoot, 'reports', `${week}.md`);
  writeFileAtomic(file, lines.join('\n'));
  return { week, file, frozen, changes, weekTotals, allTotals, tooLittleData };
}
