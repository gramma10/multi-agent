import type { CellDef } from './config.ts';
import { cellLabel } from './config.ts';
import type { FactoryContext } from './context.ts';
import { pauseReason } from './killswitch.ts';
import { p } from './paths.ts';
import { gateForState } from './state/machine.ts';
import { enteredStateAt, type Task } from './state/task.ts';
import { writeFileAtomic } from './util/fs.ts';

function ago(fromIso: string, now: Date): string {
  const h = Math.floor((now.getTime() - new Date(fromIso).getTime()) / 3_600_000);
  if (h < 1) return 'λιγότερο από 1 ώρα';
  if (h < 48) return `${h} ώρες`;
  return `${Math.floor(h / 24)} ημέρες`;
}

export interface ReviewEntry {
  task: Task;
  cell: CellDef;
}

/**
 * Το ημερήσιο digest: τι περιμένει έγκριση, από πότε, με links.
 * Ξαναγράφεται ολόκληρο σε κάθε εκτέλεση.
 */
export function renderReview(ctx: FactoryContext, entries: ReviewEntry[]): string {
  const now = ctx.now();
  const out: string[] = [
    '# Τι περιμένει έγκριση',
    '',
    `> Το ξαναγράφει ο orchestrator σε κάθε εκτέλεση. Τελευταία: ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC.` +
      (ctx.ps.dryRun ? ' **DRY-RUN** (fixtures).' : ''),
    '',
  ];

  const paused = pauseReason(ctx.ps, ctx.env);
  if (paused) out.push(`> ⏸️ **Ο orchestrator είναι σε παύση:** ${paused}.`, '');

  const waiting = entries
    .filter((e) => gateForState(e.task.state))
    .sort((a, b) => enteredStateAt(a.task).localeCompare(enteredStateAt(b.task)));

  const gateOrder = ['idea', 'demo', 'publish', 'campaign'] as const;
  out.push(`## Περιμένουν εσένα (${waiting.length})`, '');
  if (waiting.length === 0) out.push('Τίποτα. 🎉', '');
  for (const gate of gateOrder) {
    const g = ctx.config.gates.gates[gate];
    const list = waiting.filter((e) => gateForState(e.task.state) === gate);
    if (list.length === 0) continue;
    out.push(`### Gate ${g?.number}: ${g?.title}`, '');
    for (const { task, cell } of list) {
      const rec = task.gates[gate];
      const link = rec?.url ? `[issue #${rec.ref}](${rec.url})` : rec?.ref === 'review' ? 'έγκριση τοπικά (χωρίς GitHub)' : 'issue δεν άνοιξε ακόμα';
      const score = gate === 'idea' && task.scout_score != null ? ` · βαθμολογία ${task.scout_score}/10` : '';
      out.push(
        `- **${cellLabel(ctx.config.matrix, cell)}** (\`${cell.id}\`) · περιμένει ${ago(enteredStateAt(task), now)} · ${link}${score}`,
      );
      if (ctx.approvals.kind === 'dry-run') {
        const flag = ctx.ps.dryRun ? ' --dry-run' : '';
        out.push(`  - \`npm run factory -- decide ${cell.id} approved|changes|rejected --by <όνομα> [--comment "…"]${flag}\``);
      }
    }
    out.push('');
  }

  const max = ctx.config.volume.max_step_attempts;
  const stuck = entries.filter((e) => e.task.last_error);
  if (stuck.length) {
    out.push('## Χρειάζονται προσοχή', '');
    for (const { task, cell } of stuck) {
      const attempts = Math.max(0, ...Object.values(task.attempts));
      const capped = attempts >= max ? ` · **σταμάτησε μετά από ${attempts} προσπάθειες**, τρέξε χειροκίνητα: \`npm run factory -- cell ${cell.id} <βήμα>\`` : ` · προσπάθειες ${attempts}/${max}`;
      out.push(`- \`${cell.id}\` (${task.state}): ${task.last_error}${capped}`);
    }
    out.push('');
  }

  const cooling = ctx.pool.coolingDown();
  if (cooling.length) {
    out.push('## Workers σε cooldown (όρια χρήσης)', '');
    for (const c of cooling) out.push(`- ${c.worker}: μέχρι ${c.until.slice(0, 16).replace('T', ' ')} UTC (${c.reason})`);
    out.push('');
  }

  const counts = new Map<string, number>();
  for (const { task } of entries) counts.set(task.state, (counts.get(task.state) ?? 0) + 1);
  out.push('## Σύνοψη πίνακα', '', '| State | Κελιά |', '|---|---|');
  for (const [s, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) out.push(`| ${s} | ${n} |`);
  out.push('');
  return out.join('\n');
}

export function writeReview(ctx: FactoryContext, entries: ReviewEntry[]): void {
  writeFileAtomic(p.review(ctx.ps), renderReview(ctx, entries));
}
