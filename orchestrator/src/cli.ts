#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { DryRunApprovals } from './approvals/dry-run.ts';
import { cellLabel, GATE_IDS } from './config.ts';
import { createContext } from './context.ts';
import { runCellStep, runMorning, runNext, runNight, runSyncApprovals, statusRows, type RunReport } from './runner.ts';
import { gateForState } from './state/machine.ts';

const HELP = `Auragram Showcase Factory

Χρήση: npm run factory -- <εντολή> [επιλογές]

  status                       πίνακας κελιών και states
  next                         ένα βήμα για το επόμενο κελί
  run-night                    πλήρης βραδινός κύκλος
  run-morning                  εγκρίσεις, issues, REVIEW.md
  sync-approvals               διαβάζει μόνο τις αποφάσεις στα gates
  cell <id> <βήμα>             χειροκίνητη εκτέλεση βήματος (scout|build|content|...)
  decide <id> <approved|changes|rejected> --by <όνομα> [--comment "..."]
                               απόφαση gate σε dry-run (στην κανονική λειτουργία: labels στο GitHub)
  export <campaign-id>         batch για εργαλείο αποστολής (Φάση 6)

Επιλογές:
  --dry-run                    fixtures αντί για workers, εγκρίσεις στο REVIEW.md, state στο .dry-run/
  --all                        (status) δείξε και τα κελιά σε αναμονή
  --worker prepared|fixture    (cell) ίδιος worker για αυτή την εκτέλεση. «prepared» = τα αρχεία
                               γράφτηκαν ήδη από άνθρωπο/session· ο orchestrator κάνει μόνο ελέγχους
`;

function printReport(r: RunReport): void {
  if (r.paused) return;
  const ok = r.steps.filter((s) => s.ok).length;
  console.log(
    `\nΣύνοψη: ${r.steps.length} βήματα (${ok} ok, ${r.steps.length - ok} απέτυχαν), ` +
      `${r.decisions.length} αποφάσεις, ${r.gatesOpened.length + r.steps.filter((s) => s.gateOpened).length} νέα gates.`,
  );
  for (const s of r.skipped) console.log(`  ⚠ ${s.cell}: ${s.reason}`);
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean', default: false },
      all: { type: 'boolean', default: false },
      by: { type: 'string' },
      comment: { type: 'string' },
      worker: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [cmd, ...args] = positionals;
  if (!cmd || values.help) {
    console.log(HELP);
    return cmd ? 0 : 1;
  }
  const dryRun = values['dry-run'] === true;
  const ctx = createContext({ dryRun, workerName: values.worker });
  if (dryRun) console.log(`🧪 dry-run: state στο ${ctx.ps.stateRoot}\n`);

  switch (cmd) {
    case 'status': {
      const rows = statusRows(ctx);
      const shown = values.all ? rows : rows.filter((r) => r.task.state !== 'queued');
      const queued = rows.length - shown.length;
      console.log('κελί'.padEnd(26) + 'fit'.padEnd(8) + 'prio'.padEnd(6) + 'state'.padEnd(20) + 'επόμενο');
      for (const r of shown) {
        console.log(
          r.cell.id.padEnd(26) +
            r.cell.fit.padEnd(8) +
            String(r.cell.priority).padEnd(6) +
            r.task.state.padEnd(20) +
            r.next +
            (r.task.last_error ? `  ⚠ ${r.task.last_error.slice(0, 80)}` : ''),
        );
      }
      if (!values.all) {
        const nextUp = rows.filter((r) => r.task.state === 'queued').slice(0, 5);
        console.log(`\n${queued} κελιά σε αναμονή (queued). Τα επόμενα:`);
        for (const r of nextUp) console.log(`  ${r.cell.id.padEnd(24)} ${r.cell.fit.padEnd(7)} ${r.cell.priority}  ${cellLabel(ctx.config.matrix, r.cell)}`);
        console.log('Όλα: npm run factory -- status --all');
      }
      return 0;
    }
    case 'next':
      printReport(await runNext(ctx));
      return 0;
    case 'run-night':
      printReport(await runNight(ctx));
      return 0;
    case 'run-morning':
      printReport(await runMorning(ctx));
      return 0;
    case 'sync-approvals':
      printReport(await runSyncApprovals(ctx));
      return 0;
    case 'cell': {
      const [id, step] = args;
      if (!id || !step) throw new Error('Χρήση: cell <id> <βήμα>');
      const r = await runCellStep(ctx, id, step);
      printReport(r);
      return r.steps.every((s) => s.ok) ? 0 : 1;
    }
    case 'decide': {
      const [id, decision] = args;
      if (!(ctx.approvals instanceof DryRunApprovals)) {
        throw new Error('Το decide δουλεύει μόνο σε dry-run. Στην κανονική λειτουργία βάλε label στο GitHub issue.');
      }
      if (!id || !decision || !['approved', 'changes', 'rejected'].includes(decision)) {
        throw new Error('Χρήση: decide <id> <approved|changes|rejected> --by <όνομα> [--comment "..."]');
      }
      const row = statusRows(ctx).find((r) => r.cell.id === id);
      if (!row) throw new Error(`Άγνωστο κελί «${id}»`);
      const gate = gateForState(row.task.state);
      if (!gate || !GATE_IDS.includes(gate)) throw new Error(`Το κελί ${id} δεν περιμένει gate (state: ${row.task.state})`);
      ctx.approvals.record(id, gate, decision as 'approved' | 'changes' | 'rejected', values.by ?? '', values.comment ?? '');
      console.log(`Καταγράφηκε: ${id} gate ${gate} → ${decision}. Εφαρμόζεται στην επόμενη εκτέλεση (ή τώρα με sync-approvals).`);
      return 0;
    }
    case 'export':
      throw new Error('Το export υλοποιείται στη Φάση 6.');
    default:
      console.error(`Άγνωστη εντολή «${cmd}».\n`);
      console.log(HELP);
      return 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: Error) => {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  },
);
