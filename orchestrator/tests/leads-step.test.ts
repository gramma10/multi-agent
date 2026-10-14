import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DryRunApprovals } from '../src/approvals/dry-run.ts';
import { runCellStep, runNight } from '../src/runner.ts';
import { parseTask } from '../src/state/task.ts';
import { makeCtx, setVolume } from './helpers.ts';

describe('βήμα leads στον orchestrator (dry-run)', () => {
  it('published → lead_sourcing (όριο ημέρας, συνεχίζει) → leads_ready, με αναφορά χωρίς προσωπικά δεδομένα', async () => {
    const { repo } = makeCtx();
    setVolume(repo, { leads_per_day: 80, briefs_per_night: 1 });
    const clock = { t: new Date('2026-10-14T22:00:00Z') };
    const { ctx } = makeCtx({ repo, now: () => new Date(clock.t), env: { FACTORY_FAKE_LEADS: '150' } });
    const approvals = ctx.approvals as DryRunApprovals;
    const id = 'kommotiria-booking';
    const read = () => parseTask(fs.readFileSync(path.join(repo, 'pipeline', id, 'task.yaml'), 'utf8'));

    await runNight(ctx);
    approvals.record(id, 'idea', 'approved', 'christos');
    await runNight(ctx);
    approvals.record(id, 'demo', 'approved', 'christos');
    await runNight(ctx);
    approvals.record(id, 'publish', 'approved', 'christos');
    const n1 = await runNight(ctx);
    const leads1 = n1.steps.find((s) => s.cell === id && s.step === 'leads')!;
    expect(leads1).toMatchObject({ ok: true, stayed: true });
    expect(leads1.note).toMatch(/^80 νέα.*όριο ημέρας/);
    expect(read().state).toBe('lead_sourcing');

    // Την ίδια μέρα: δεν προχωρά άλλο (όριο ημέρας εξαντλημένο).
    const same = await runCellStep(ctx, id, 'leads');
    expect(same.steps[0]!.note).toMatch(/^0 νέα/);

    // Επόμενες μέρες: συνεχίζει από τον cursor μέχρι να τελειώσουν οι πηγές.
    for (let day = 1; day <= 3 && read().state === 'lead_sourcing'; day++) {
      clock.t = new Date(clock.t.getTime() + 86_400_000);
      await runNight(ctx);
    }
    expect(read().state).toBe('leads_ready');

    const stats = fs.readFileSync(path.join(repo, 'pipeline', id, 'campaign', 'leads-stats.md'), 'utf8');
    expect(stats).toContain('Οι πηγές για αυτό το κελί τελείωσαν.');
    expect(stats).not.toMatch(/@|\+30\d/); // κανένα email ή τηλέφωνο
    expect(fs.existsSync(path.join(repo, 'data', 'leads.sqlite'))).toBe(true);
  }, 60_000);

  it('χωρίς κλειδιά σε κανονική λειτουργία: αποτυγχάνει καθαρά με εξήγηση', async () => {
    const { repo } = makeCtx();
    const { ctx } = makeCtx({ repo, dryRun: false, env: {} });
    const { sourceLeads } = await import('../src/steps/leads.ts');
    const cell = ctx.config.matrix.cells.find((c) => c.id === 'kommotiria-booking')!;
    await expect(sourceLeads(ctx, cell)).rejects.toThrow(/GOOGLE_PLACES_API_KEY και GEMI_API_KEY/);
  });

  it('σε CI χωρίς SUPABASE_DB_URL αρνείται (η SQLite θα χανόταν)', async () => {
    const { repo } = makeCtx();
    const { ctx } = makeCtx({ repo, dryRun: false, env: { CI: 'true', GOOGLE_PLACES_API_KEY: 'x' } });
    const { sourceLeads } = await import('../src/steps/leads.ts');
    const cell = ctx.config.matrix.cells.find((c) => c.id === 'kommotiria-booking')!;
    await expect(sourceLeads(ctx, cell)).rejects.toThrow(/SUPABASE_DB_URL/);
  });
});
