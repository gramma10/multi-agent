import type { CellDef } from './config.ts';
import type { FactoryContext } from './context.ts';
import { gateNeedsOpening, openGateFor, writeFeedbackFile } from './gates.ts';
import { pauseReason } from './killswitch.ts';
import { publishCell, syncCellContent, unpublishCell } from './publish.ts';
import { openLeadDb } from './leads/index.ts';
import { acquireLock } from './lock.ts';
import { sortCells, updateMatrixCells } from './matrix.ts';
import { writeReview, type ReviewEntry } from './review.ts';
import { GATE_OUTCOMES, WAITING_STATES, gateForState, isTerminal } from './state/machine.ts';
import { applyTransition, loadTask, recordGateDecision, saveTask, type Task } from './state/task.ts';
import { stepByName, stepForState } from './steps/index.ts';
import type { BudgetKey, StepDef, StepName } from './steps/types.ts';
import { CooldownStore } from './workers/cooldown.ts';
import type { AgentName } from './config.ts';

export interface StepReport {
  cell: string;
  step: StepName;
  ok: boolean;
  from: string;
  to: string;
  note?: string;
  gateOpened?: boolean;
  /** Το βήμα έκανε πρόοδο χωρίς μετάβαση (θα συνεχίσει σε επόμενη εκτέλεση). */
  stayed?: boolean;
}

export interface RunReport {
  paused: string | null;
  steps: StepReport[];
  decisions: Array<{ cell: string; gate: string; decision: string; by: string }>;
  gatesOpened: string[];
  skipped: Array<{ cell: string; reason: string }>;
}

const emptyReport = (paused: string | null = null): RunReport => ({
  paused,
  steps: [],
  decisions: [],
  gatesOpened: [],
  skipped: [],
});

export interface Loaded {
  cell: CellDef;
  task: Task;
}

export function loadAll(ctx: FactoryContext): Loaded[] {
  const now = ctx.now();
  return sortCells(ctx.config.matrix.cells).map((cell) => ({ cell, task: loadTask(ctx.ps, cell, now) }));
}

/** Αποθηκεύει το task και ενημερώνει τον καθρέφτη status στο matrix.yaml. */
function persist(ctx: FactoryContext, task: Task): void {
  saveTask(ctx.ps, task);
  updateMatrixCells(ctx.ps, { [task.id]: { status: task.state } });
}

function pendingReviews(all: Loaded[]): number {
  return all.filter((l) => WAITING_STATES.has(l.task.state)).length;
}

/**
 * Τρέχει ΕΝΑ βήμα για ένα κελί. Δεν πετά για αποτυχίες του agent: τις καταγράφει στο task.
 * Πετά μόνο για σφάλματα προγραμματισμού (π.χ. μη επιτρεπτή μετάβαση).
 */
export async function runStep(ctx: FactoryContext, l: Loaded, step: StepDef): Promise<StepReport & { agentUnavailable?: boolean }> {
  const { task, cell } = l;
  const from = task.state;
  if (task.state !== step.working) {
    applyTransition(task, step.working, { kind: 'system', name: 'orchestrator' }, ctx.now());
    persist(ctx, task);
  }

  ctx.log(`▶ ${cell.id}: ${step.name} (${from === step.working ? `συνέχεια από ${from}` : `${from} → ${step.working}`})`);
  const result = await step.execute(ctx, task, cell);

  if (!result.ok) {
    task.attempts[step.name] = (task.attempts[step.name] ?? 0) + 1;
    task.last_error = `${step.name}: ${result.error}`;
    task.updated_at = ctx.now().toISOString();
    persist(ctx, task);
    ctx.log(`  ✗ ${result.error}`);
    return { cell: cell.id, step: step.name, ok: false, from, to: task.state, note: result.error, agentUnavailable: result.agentUnavailable };
  }

  if (result.stay) {
    task.attempts[step.name] = 0;
    task.last_error = null;
    task.updated_at = ctx.now().toISOString();
    persist(ctx, task);
    ctx.log(`  … ${task.state}${result.note ? ` (${result.note})` : ''}`);
    return { cell: cell.id, step: step.name, ok: true, from, to: task.state, note: result.note, stayed: true };
  }

  const to = result.nextState ?? step.done;
  applyTransition(task, to, { kind: step.agent ? 'agent' : 'system', name: step.agent ?? 'orchestrator' }, ctx.now(), {
    worker: result.worker,
    model: result.model,
    duration_ms: result.durationMs,
    result: 'ok',
    note: result.note,
  });
  task.attempts[step.name] = 0;
  task.last_error = null;
  persist(ctx, task);
  ctx.log(`  ✓ ${task.state}${result.note ? ` (${result.note})` : ''}`);

  let gateOpened = false;
  if (gateNeedsOpening(task, ctx.approvals.kind) && (await openGateFor(ctx, task, cell))) {
    persist(ctx, task);
    gateOpened = true;
  }
  return { cell: cell.id, step: step.name, ok: true, from, to: task.state, note: result.note, gateOpened };
}

/** Διαβάζει αποφάσεις ανθρώπων σε όλα τα ανοιχτά gates και κάνει τις μεταβάσεις. */
export async function syncApprovals(ctx: FactoryContext, all: Loaded[], report: RunReport = emptyReport()): Promise<RunReport> {
  for (const l of all) {
    const gate = gateForState(l.task.state);
    if (!gate) continue;
    const rec = l.task.gates[gate];
    if (!rec || rec.decided_at) continue;
    let d;
    try {
      d = await ctx.approvals.readDecision(l.task, gate);
    } catch (err) {
      ctx.log(`⚠️  Δεν διαβάστηκε η απόφαση για ${l.cell.id}/${gate}: ${(err as Error).message}`);
      continue;
    }
    if (!d) continue;
    const now = ctx.now();
    recordGateDecision(l.task, gate, d.decision, d.by, d.comments, now);
    applyTransition(l.task, GATE_OUTCOMES[gate][d.decision], { kind: 'human', name: d.by }, now, {
      result: d.decision,
      note: d.comments.join(' | ').slice(0, 500) || undefined,
    });
    if (d.decision !== 'approved') writeFeedbackFile(ctx, l.task);
    if (l.task.state === 'published') publishCell(ctx, l.cell);
    if (l.task.state === 'rejected') unpublishCell(ctx, l.cell.id);
    if (gate === 'campaign') await setCampaignStatus(ctx, l.cell.id, d.decision === 'approved' ? 'approved' : 'draft', d.by);
    persist(ctx, l.task);
    try {
      await ctx.approvals.closeGate(l.task, gate, d);
    } catch (err) {
      ctx.log(`⚠️  Δεν έκλεισε το gate ${gate} για ${l.cell.id}: ${(err as Error).message}`);
    }
    ctx.log(`☑ ${l.cell.id}: gate ${gate} → ${d.decision} από ${d.by}`);
    report.decisions.push({ cell: l.cell.id, gate, decision: d.decision, by: d.by });
  }
  return report;
}

/** Gate 4: οι καμπάνιες του κελιού που πέρασαν QA εγκρίνονται (ή γυρίζουν σε draft) με όνομα και ώρα. */
async function setCampaignStatus(ctx: FactoryContext, cellId: string, status: 'approved' | 'draft', by: string): Promise<void> {
  const db = await openLeadDb(ctx);
  try {
    await db.run(
      "update campaigns set status = ?, approved_by = ?, approved_at = ? where cell_id = ? and status in ('ready', 'approved')",
      [status, status === 'approved' ? by : null, status === 'approved' ? ctx.now().toISOString() : null, cellId],
    );
  } finally {
    await db.close();
  }
}

/** Ανοίγει gate issues που λείπουν (π.χ. αν απέτυχε το gh στην προηγούμενη εκτέλεση). */
async function ensureGatesOpened(ctx: FactoryContext, all: Loaded[], report: RunReport): Promise<void> {
  for (const l of all) {
    if (!gateNeedsOpening(l.task, ctx.approvals.kind)) continue;
    if (await openGateFor(ctx, l.task, l.cell)) {
      persist(ctx, l.task);
      report.gatesOpened.push(l.cell.id);
    }
  }
}

function finish(ctx: FactoryContext, all: Loaded[]): void {
  const entries: ReviewEntry[] = all.map((l) => ({ task: l.task, cell: l.cell }));
  writeReview(ctx, entries);
}

interface Selection {
  l: Loaded;
  step: StepDef;
}

interface SelectOptions {
  budgets?: Map<BudgetKey, number>;
  blockedAgents?: Set<AgentName>;
  done?: Set<string>;
}

/** Το επόμενο κελί που μπορεί να προχωρήσει, με τη σειρά του πίνακα. */
export function selectNext(ctx: FactoryContext, all: Loaded[], opts: SelectOptions = {}, skipped?: RunReport['skipped']): Selection | null {
  const max = ctx.config.volume.max_step_attempts;
  const reviewsFull = pendingReviews(all) >= ctx.config.volume.max_pending_reviews;
  // Πρώτα η κανονική δουλειά, μετά τα βήματα παρακολούθησης (track), ώστε να μην μπλοκάρουν το `next`.
  for (const background of [false, true]) {
    const sel = selectPass(ctx, all, opts, background, reviewsFull, max, skipped);
    if (sel) return sel;
  }
  return null;
}

function selectPass(
  ctx: FactoryContext,
  all: Loaded[],
  opts: SelectOptions,
  background: boolean,
  reviewsFull: boolean,
  max: number,
  skipped?: RunReport['skipped'],
): Selection | null {
  for (const l of all) {
    if (opts.done?.has(l.cell.id)) continue;
    if (isTerminal(l.task.state)) continue;
    const step = stepForState(l.task.state);
    if (!step || !step.available || step.manual) continue;
    if ((step.background === true) !== background) continue;
    if ((l.task.attempts[step.name] ?? 0) >= max) {
      skipped?.push({ cell: l.cell.id, reason: `${step.name}: ${max} αποτυχημένες προσπάθειες` });
      continue;
    }
    if (step.agent && opts.blockedAgents?.has(step.agent)) continue;
    if (l.task.state === 'queued' && reviewsFull) continue;
    if (step.budget && opts.budgets) {
      const left = opts.budgets.get(step.budget) ?? 0;
      if (left <= 0) continue;
    }
    return { l, step };
  }
  return null;
}

function budgetsFor(ctx: FactoryContext): Map<BudgetKey, number> {
  const v = ctx.config.volume;
  return new Map<BudgetKey, number>([
    ['briefs_per_night', v.briefs_per_night],
    ['demos_per_night', v.demos_per_night],
    ['content_packs_per_night', v.content_packs_per_night],
  ]);
}

async function guarded(ctx: FactoryContext, fn: (all: Loaded[], report: RunReport) => Promise<void>): Promise<RunReport> {
  const paused = pauseReason(ctx.ps, ctx.env);
  if (paused) {
    ctx.log(`⏸️  Παύση: ${paused}. Δεν κάνω τίποτα.`);
    return emptyReport(paused);
  }
  const release = acquireLock(ctx.ps, ctx.now());
  try {
    new CooldownStore(ctx.ps).prune(ctx.now());
    const all = loadAll(ctx);
    const report = emptyReport();
    await fn(all, report);
    finish(ctx, all);
    return report;
  } finally {
    release();
  }
}

/** `factory -- next`: ένα βήμα για το επόμενο κελί. */
export function runNext(ctx: FactoryContext): Promise<RunReport> {
  return guarded(ctx, async (all, report) => {
    await syncApprovals(ctx, all, report);
    const sel = selectNext(ctx, all, {}, report.skipped);
    if (!sel) {
      ctx.log('Τίποτα να προχωρήσει (όλα περιμένουν gate, είναι σε επόμενη φάση ή ξεπέρασαν τις προσπάθειες).');
      return;
    }
    report.steps.push(await runStep(ctx, sel.l, sel.step));
    await ensureGatesOpened(ctx, all, report);
  });
}

/**
 * `factory -- run-night`: πλήρης βραδινός κύκλος.
 * Κάθε κελί προχωρά όσο μπορεί (π.χ. leads → campaign → QA χωρίς gate ανάμεσα), μέσα στα
 * όρια του volume.yaml. Ένας agent που έμεινε χωρίς workers (όρια χρήσης) σταματά για απόψε.
 */
export function runNight(ctx: FactoryContext): Promise<RunReport> {
  return guarded(ctx, async (all, report) => {
    await syncApprovals(ctx, all, report);
    const budgets = budgetsFor(ctx);
    const blockedAgents = new Set<AgentName>();
    const failedTonight = new Set<string>();
    // Όριο ασφαλείας: ποτέ περισσότερα βήματα απ' όσα κελιά × βήματα.
    const maxIterations = all.length * 8;
    for (let i = 0; i < maxIterations; i++) {
      const sel = selectNext(ctx, all, { budgets, blockedAgents, done: failedTonight });
      if (!sel) break;
      const r = await runStep(ctx, sel.l, sel.step);
      report.steps.push(r);
      if (sel.step.budget) budgets.set(sel.step.budget, (budgets.get(sel.step.budget) ?? 0) - 1);
      if (!r.ok || r.stayed) {
        // Κάθε κελί αποτυγχάνει το πολύ μία φορά ανά βράδυ· ό,τι «συνεχίζει αύριο» δεν ξαναπιάνεται απόψε.
        failedTonight.add(sel.l.cell.id);
        if (!r.ok && r.agentUnavailable && sel.step.agent) blockedAgents.add(sel.step.agent);
      }
    }
    // Για το report: όσα κελιά έμειναν πίσω λόγω ορίου προσπαθειών.
    selectNext(ctx, all, { budgets: new Map(), blockedAgents }, report.skipped);
    await ensureGatesOpened(ctx, all, report);
  });
}

/** `factory -- run-morning`: διαβάζει εγκρίσεις, ανοίγει issues, ξαναγράφει το REVIEW.md. */
export function runMorning(ctx: FactoryContext): Promise<RunReport> {
  return guarded(ctx, async (all, report) => {
    await syncApprovals(ctx, all, report);
    await ensureGatesOpened(ctx, all, report);
  });
}

/** `factory -- sync-approvals`: μόνο ανάγνωση εγκρίσεων και μεταβάσεις. */
export function runSyncApprovals(ctx: FactoryContext): Promise<RunReport> {
  return guarded(ctx, async (all, report) => {
    await syncApprovals(ctx, all, report);
  });
}

/** `factory -- cell <id> <step>`: χειροκίνητο βήμα. Αγνοεί budgets και όριο προσπαθειών. */
export function runCellStep(ctx: FactoryContext, cellId: string, stepName: string): Promise<RunReport> {
  return guarded(ctx, async (all, report) => {
    const l = all.find((x) => x.cell.id === cellId);
    if (!l) throw new Error(`Άγνωστο κελί «${cellId}». Δες: npm run factory -- status`);
    const step = stepByName(stepName);
    if (!step) throw new Error(`Άγνωστο βήμα «${stepName}». Βήματα: scout, build, content, leads, campaign, qa, export, track`);
    if (!step.available) throw new Error(`Το βήμα «${stepName}» δεν έχει υλοποιηθεί ακόμα.`);
    if (!step.readyStates.includes(l.task.state) && l.task.state !== step.working) {
      throw new Error(
        `Το κελί ${cellId} είναι σε «${l.task.state}». Το βήμα ${stepName} τρέχει από: ${[...step.readyStates, step.working].join(', ')}`,
      );
    }
    report.steps.push(await runStep(ctx, l, step));
  });
}

/**
 * `factory -- sync-content`: αντιγράφει στη showcase το περιεχόμενο κάθε κελιού που έχει content
 * (ως πρόχειρο για preview). ΔΕΝ δημοσιεύει τίποτα: αυτό γίνεται μόνο στο Gate 3.
 */
export function runSyncContent(ctx: FactoryContext): Promise<RunReport> {
  return guarded(ctx, async (all) => {
    for (const l of all) {
      const changed = syncCellContent(ctx, l.cell);
      if (changed.length) ctx.log(`↻ ${l.cell.id}: ${changed.join(', ')}`);
    }
  });
}

/**
 * `factory -- export <campaign-id>`: compliance gate → αρχείο στο exports/ (εκτός git).
 * Το πρώτο επιτυχημένο export περνά το κελί από campaign_approved σε exported.
 */
export async function runExport(
  ctx: FactoryContext,
  campaignId: string,
  opts: { tool?: import('./campaigns/export.ts').EmailTool; txt?: import('./compliance/dns.ts').TxtResolver } = {},
): Promise<import('./campaigns/export.ts').ExportResult> {
  const { exportCampaign } = await import('./campaigns/export.ts');
  const { LeadStore } = await import('./leads/store.ts');
  let result!: import('./campaigns/export.ts').ExportResult;
  await guarded(ctx, async (all) => {
    const db = await openLeadDb(ctx);
    try {
      result = await exportCampaign(ctx, new LeadStore(db, ctx.now), campaignId, opts);
    } finally {
      await db.close();
    }
    if (result.file) {
      const l = all.find((x) => campaignId.startsWith(`${x.cell.id}--`));
      if (l && l.task.state === 'campaign_approved') {
        applyTransition(l.task, 'exported', { kind: 'system', name: 'orchestrator' }, ctx.now(), { result: 'ok', note: `export ${campaignId}: ${result.rows}` });
        persist(ctx, l.task);
      }
    }
  });
  if (!result) throw new Error('Παύση: το export δεν έτρεξε.');
  return result;
}

/** Για το `status`: διαβάζει χωρίς lock και χωρίς να γράφει τίποτα. */
export function statusRows(ctx: FactoryContext): Array<{ cell: CellDef; task: Task; next: string }> {
  return loadAll(ctx).map(({ cell, task }) => {
    const step = stepForState(task.state);
    const gate = gateForState(task.state);
    const next = gate ? `περιμένει gate ${gate}` : isTerminal(task.state) ? '—' : step ? (step.available ? step.name : `${step.name} (επόμενη φάση)`) : '—';
    return { cell, task, next };
  });
}

/** `factory -- weekly`: μετρικές, πάγωμα, αλλαγές priority και reports/YYYY-WW.md. */
export async function runWeeklyReport(ctx: FactoryContext, week: string): Promise<import('./tracker/report.ts').WeeklyResult> {
  const { runWeekly } = await import('./tracker/report.ts');
  const { LeadStore } = await import('./leads/store.ts');
  let result: import('./tracker/report.ts').WeeklyResult | undefined;
  await guarded(ctx, async () => {
    const db = await openLeadDb(ctx);
    try {
      result = await runWeekly(ctx, new LeadStore(db, ctx.now), week);
    } finally {
      await db.close();
    }
  });
  if (!result) throw new Error('Παύση: η εβδομαδιαία αναφορά δεν έτρεξε.');
  return result;
}
