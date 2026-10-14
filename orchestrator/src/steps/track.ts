import type { FactoryContext } from '../context.ts';
import { openLeadDb } from '../leads/index.ts';
import { LeadStore } from '../leads/store.ts';
import { runGuards } from '../tracker/guards.ts';
import type { StepDef } from './types.ts';

/** Μετά από τόσες ημέρες χωρίς νέα events, ένα κελί που έχει βγάλει όλα τα μέλη του κλείνει. */
export const QUIET_DAYS = 30;

/**
 * Το κελί μένει σε `tracking` όσο έχει ενεργές καμπάνιες: κάθε νύχτα ελέγχει τα όρια (πάγωμα).
 * Κλείνει (`done`) όταν δεν μένει κανένα μέλος για export και δεν έχει έρθει event για 30 ημέρες.
 * Τα events τα φέρνει ο άνθρωπος (`track-import`) ή το εβδομαδιαίο job.
 */
export const trackStep: StepDef = {
  name: 'track',
  agent: null,
  readyStates: ['exported'],
  working: 'tracking',
  done: 'done',
  available: true,
  background: true,
  async execute(ctx: FactoryContext, task, cell) {
    const db = await openLeadDb(ctx);
    try {
      const store = new LeadStore(db, ctx.now);
      const frozen = await runGuards(ctx, store, cell.id);
      const remaining = await db.get<{ n: number }>(
        `select count(*) as n from campaign_members m join campaigns c on c.id = m.campaign_id
         where c.cell_id = ? and m.status = 'qa_passed' and c.status in ('approved', 'exported', 'frozen')`,
        [cell.id],
      );
      const last = await db.get<{ at: string | null }>(
        'select max(e.occurred_at) as at from events e join campaigns c on c.id = e.campaign_id where c.cell_id = ?',
        [cell.id],
      );
      const exportedAt = task.history.findLast((h) => h.to === 'exported')?.at ?? task.updated_at;
      const quietSince = new Date(last?.at && last.at > exportedAt ? last.at : exportedAt);
      const quietDays = (ctx.now().getTime() - quietSince.getTime()) / 86_400_000;
      const note = frozen.length ? `πάγωσαν: ${frozen.map((f) => f.campaignId).join(', ')}` : undefined;
      if (Number(remaining?.n ?? 0) === 0 && quietDays >= QUIET_DAYS) {
        await db.run("update campaigns set status = 'done' where cell_id = ? and status = 'exported'", [cell.id]);
        return { ok: true, note: `όλα τα μέλη βγήκαν, ${Math.floor(quietDays)} ημέρες χωρίς νέα events` };
      }
      return { ok: true, stay: true, note: note ?? `μένουν ${remaining?.n ?? 0} μέλη για export` };
    } finally {
      await db.close();
    }
  },
};
