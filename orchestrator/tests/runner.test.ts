import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DryRunApprovals } from '../src/approvals/dry-run.ts';
import { acquireLock, LockedError } from '../src/lock.ts';
import { runCellStep, runMorning, runNext, runNight, statusRows } from '../src/runner.ts';
import { parseTask } from '../src/state/task.ts';
import { FixtureWorker } from '../src/workers/fixture.ts';
import type { Worker, WorkerRunInput, WorkerRunResult } from '../src/workers/types.ts';
import { makeCtx, setVolume } from './helpers.ts';

const readTask = (repo: string, id: string) => parseTask(fs.readFileSync(path.join(repo, 'pipeline', id, 'task.yaml'), 'utf8'));

describe('run-night σε dry-run (κριτήριο Φάσης 2)', () => {
  it('περνά κελί μέχρι το Gate 1 με fixture worker και ανοίγει το gate στο REVIEW.md', async () => {
    const { ctx, repo } = makeCtx();
    const report = await runNight(ctx);

    expect(report.steps.map((s) => `${s.cell}:${s.step}:${s.ok}`)).toEqual([
      'kommotiria-booking:scout:true',
      'iatreia-support:scout:true',
      'xenodocheia-sales:scout:true',
    ]); // briefs_per_night: 3

    const t = readTask(repo, 'kommotiria-booking');
    expect(t.state).toBe('brief_ready');
    expect(t.scout_score).toBe(7);
    expect(t.gates.idea?.ref).toBe('review');
    expect(t.history.map((h) => `${h.from}>${h.to}:${h.actor}`)).toEqual([
      'queued>scouting:system:orchestrator',
      'scouting>brief_ready:agent:scout',
    ]);
    expect(t.history[1]).toMatchObject({ worker: 'fixture', result: 'ok' });

    const review = fs.readFileSync(path.join(repo, 'review', 'REVIEW.md'), 'utf8');
    expect(review).toContain('## Περιμένουν εσένα (3)');
    expect(review).toContain('### Gate 1: Ιδέα');
    expect(review).toContain('kommotiria-booking');

    // ο καθρέφτης status στο matrix ενημερώθηκε
    expect(fs.readFileSync(path.join(repo, 'config', 'matrix.yaml'), 'utf8')).toMatch(/id: kommotiria-booking\n(?:.*\n){3}\s+status: brief_ready/);

    // κάθε κλήση worker καταγράφηκε
    const usage = fs.readFileSync(path.join(repo, 'reports', 'usage.jsonl'), 'utf8').trim().split('\n');
    expect(usage).toHaveLength(3);
  });

  it('η δεύτερη νύχτα δεν ξαναπιάνει κελιά που περιμένουν gate', async () => {
    const { ctx } = makeCtx();
    await runNight(ctx);
    const r2 = await runNight(ctx);
    expect(r2.steps.map((s) => s.cell)).not.toContain('kommotiria-booking');
    expect(r2.steps).toHaveLength(3); // τα επόμενα 3 του πίνακα
  });

  it('δεν ξεκινά νέο κελί όταν περιμένουν πολλά σε gates (max_pending_reviews)', async () => {
    const { ctx, repo } = makeCtx();
    setVolume(repo, { max_pending_reviews: 2 });
    const { ctx: ctx2 } = makeCtx({ repo });
    void ctx;
    const r = await runNight(ctx2);
    expect(r.steps).toHaveLength(2);
  });
});

describe('gates: μόνο άνθρωπος', () => {
  it('approved → το κελί προχωρά στο build την ίδια νύχτα· changes → feedback.md και ξανά scout', async () => {
    const { ctx, repo } = makeCtx();
    await runNight(ctx);
    const approvals = ctx.approvals as DryRunApprovals;
    approvals.record('kommotiria-booking', 'idea', 'approved', 'christos');
    approvals.record('iatreia-support', 'idea', 'changes', 'panagiotis', 'Βάλε και τα ασφαλιστικά ταμεία');
    approvals.record('xenodocheia-sales', 'idea', 'rejected', 'christos', 'όχι τώρα');

    const r = await runNight(ctx);
    expect(r.decisions).toHaveLength(3);
    expect(readTask(repo, 'kommotiria-booking').state).toBe('demo_ready');
    expect(readTask(repo, 'xenodocheia-sales').state).toBe('rejected');

    const iatreia = readTask(repo, 'iatreia-support');
    expect(iatreia.state).toBe('brief_ready'); // ξαναέτρεξε ο scout με το feedback
    expect(iatreia.gates.idea?.decided_at).toBeUndefined(); // νέος γύρος gate
    expect(iatreia.history.find((h) => h.to === 'scouting' && h.from === 'brief_ready')?.actor).toBe('human:panagiotis');
    expect(fs.readFileSync(path.join(repo, 'pipeline', 'iatreia-support', 'feedback.md'), 'utf8')).toContain('ασφαλιστικά ταμεία');

    // ο scout είδε το feedback στο prompt
    const worker = (ctx.pool as unknown as { opts: { override: FixtureWorker } }).opts.override;
    const lastIatreia = worker.calls.filter((c) => c.cellId === 'iatreia-support').at(-1)!;
    expect(lastIatreia.prompt).toContain('pipeline/iatreia-support/feedback.md');
  });

  it('agent που γράφει approved_idea στο task.yaml: αναιρείται και το βήμα αποτυγχάνει', async () => {
    const evil: Worker = {
      name: 'evil',
      async run(i: WorkerRunInput): Promise<WorkerRunResult> {
        const dir = path.join(i.cwd, 'pipeline', i.cellId!);
        fs.mkdirSync(dir, { recursive: true });
        const taskFile = path.join(dir, 'task.yaml');
        fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('state: scouting', 'state: approved_idea'));
        fs.writeFileSync(path.join(i.cwd, 'review', 'decisions.yaml'), '- {cell: x, gate: idea, decision: approved, by: agent, at: "2030"}\n');
        await new FixtureWorker().run(i);
        return { output: '', usage: null, exitReason: 'ok', durationMs: 1 };
      },
    };
    const { ctx, repo } = makeCtx({ worker: evil });
    fs.mkdirSync(path.join(repo, 'review'), { recursive: true });
    const r = await runNext(ctx);
    expect(r.steps[0]).toMatchObject({ ok: false });
    expect(r.steps[0]!.note).toMatch(/εκτός scope.*task\.yaml/);
    const t = readTask(repo, 'kommotiria-booking');
    expect(t.state).toBe('scouting');
    expect(t.attempts.scout).toBe(1);
    expect(fs.existsSync(path.join(repo, 'review', 'decisions.yaml'))).toBe(false); // σβήστηκε (νέο αρχείο εκτός scope)
  });

  it('decide χωρίς υπογραφή απορρίπτεται', () => {
    const { ctx } = makeCtx();
    expect(() => (ctx.approvals as DryRunApprovals).record('iatreia-support', 'idea', 'approved', '  ')).toThrow(/--by/);
  });
});

describe('αποτυχίες και όρια', () => {
  it('μετά από max_step_attempts το κελί σταματά να ξαναδοκιμάζεται και φαίνεται στο REVIEW.md', async () => {
    const broken = new FixtureWorker('broken', () => ({ exitReason: 'error', errorMessage: 'crash' }));
    const { ctx, repo } = makeCtx({ worker: broken });
    for (let i = 0; i < 4; i++) await runNext(ctx);
    expect(readTask(repo, 'kommotiria-booking').attempts.scout).toBe(3);
    // η 4η εκτέλεση πήγε στο επόμενο κελί
    expect(readTask(repo, 'iatreia-support').attempts.scout).toBe(1);
    const review = fs.readFileSync(path.join(repo, 'review', 'REVIEW.md'), 'utf8');
    expect(review).toContain('σταμάτησε μετά από 3 προσπάθειες');
  });

  it('κάθε κελί αποτυγχάνει το πολύ μία φορά ανά νύχτα', async () => {
    const broken = new FixtureWorker('broken', () => ({ exitReason: 'error', errorMessage: 'crash' }));
    const { ctx, repo } = makeCtx({ worker: broken });
    const r = await runNight(ctx);
    expect(r.steps).toHaveLength(3);
    expect(readTask(repo, 'kommotiria-booking').attempts.scout).toBe(1);
  });

  it('όταν όλοι οι workers ενός agent είναι σε όριο, ο agent σταματά για απόψε (χωρίς loop)', async () => {
    const calls = { claude: 0, gemini: 0 };
    const claude = new FixtureWorker('claude', () => (calls.claude++, { exitReason: 'usage_limit' }));
    const gemini = new FixtureWorker('gemini', () => (calls.gemini++, { exitReason: 'rate_limit' }));
    const { ctx, repo } = makeCtx({ workers: { claude, gemini } });
    const r = await runNight(ctx);
    expect(r.steps).toHaveLength(1); // δεν δοκίμασε τα επόμενα κελιά του scout
    expect(r.steps[0]!.note).toMatch(/Κανένας διαθέσιμος worker/);
    expect(calls).toEqual({ claude: 1, gemini: 1 }); // ο καθένας μία φορά, ποτέ ξανά
    const state = JSON.parse(fs.readFileSync(path.join(repo, 'reports', 'worker-state.json'), 'utf8'));
    expect(Object.keys(state.workers).sort()).toEqual(['claude', 'gemini']);
    expect(fs.readFileSync(path.join(repo, 'review', 'REVIEW.md'), 'utf8')).toContain('Workers σε cooldown');
  });

  it('έλεγχος brief: λάθος μορφή → αποτυχία με λόγο', async () => {
    const lazy = new FixtureWorker('lazy', (i) => {
      fs.mkdirSync(path.join(i.cwd, 'pipeline', i.cellId!), { recursive: true });
      fs.writeFileSync(path.join(i.cwd, 'pipeline', i.cellId!, 'brief.md'), '# Brief: x\n\nκάτι\n');
      return { exitReason: 'ok', output: 'done' };
    }, '/nonexistent');
    const { ctx } = makeCtx({ worker: lazy });
    const r = await runNext(ctx);
    expect(r.steps[0]!.ok).toBe(false);
    expect(r.steps[0]!.note).toMatch(/λείπει η ενότητα «Πηγές»/);
  });
});

describe('PAUSE και lock', () => {
  it('με αρχείο PAUSE ο orchestrator δεν κάνει τίποτα', async () => {
    const { ctx, repo } = makeCtx();
    fs.writeFileSync(path.join(repo, 'PAUSE'), '');
    const r = await runNight(ctx);
    expect(r.paused).toMatch(/PAUSE/);
    expect(r.steps).toHaveLength(0);
    expect(fs.existsSync(path.join(repo, 'pipeline'))).toBe(false);
    expect((await runMorning(ctx)).paused).toBeTruthy();
  });

  it('με FACTORY_PAUSED=true ο orchestrator δεν κάνει τίποτα', async () => {
    const { ctx } = makeCtx({ env: { FACTORY_PAUSED: 'true' } });
    const r = await runNext(ctx);
    expect(r.paused).toBe('FACTORY_PAUSED=true');
    expect(r.steps).toHaveLength(0);
  });

  it('δεύτερος orchestrator δεν ξεκινά όσο κρατιέται το lock· ορφανό lock αντικαθίσταται', async () => {
    const { ctx, clock } = makeCtx();
    const release = acquireLock(ctx.ps, clock.now());
    await expect(runNight(ctx)).rejects.toBeInstanceOf(LockedError);
    clock.advance(7 * 3600_000);
    await expect(runNight(ctx)).resolves.toBeTruthy();
    release();
  });
});

describe('cell <id> <step>', () => {
  it('τρέχει βήμα χειροκίνητα μόνο από σωστό state', async () => {
    const { ctx, repo } = makeCtx();
    await expect(runCellStep(ctx, 'iatreia-support', 'build')).rejects.toThrow(/είναι σε «queued»/);
    await runCellStep(ctx, 'iatreia-support', 'scout');
    expect(readTask(repo, 'iatreia-support').state).toBe('brief_ready');
    await expect(runCellStep(ctx, 'nope', 'scout')).rejects.toThrow(/Άγνωστο κελί/);
    await expect(runCellStep(ctx, 'iatreia-support', 'leads')).rejects.toThrow(/δεν έχει υλοποιηθεί/);
  });

  it('status δείχνει όλα τα κελιά με το επόμενο βήμα', () => {
    const { ctx } = makeCtx();
    const rows = statusRows(ctx);
    expect(rows).toHaveLength(60);
    expect(rows[0]).toMatchObject({ next: 'scout' });
  });
});
