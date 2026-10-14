import type { FactoryContext } from '../context.ts';
import { json } from '../leads/db.ts';
import type { LeadStore } from '../leads/store.ts';
import { campaignMetrics, isEmailChannel, rate, type Metrics } from './metrics.ts';

export interface Baseline {
  sent: number;
  bounces: number;
  spam: number;
}

export interface FreezeResult {
  campaignId: string;
  cellId: string;
  reasons: string[];
  sent: number;
  bounceRate: number;
  spamRate: number;
  alertUrl?: string;
}

/**
 * Αυτόματη προστασία (§7.3): bounce ή spam πάνω από τα όρια του `volume.yaml` → η καμπάνια παγώνει,
 * το export μπλοκάρεται, ανοίγει [ALERT] issue. Μετράει μόνο ό,τι έγινε μετά το τελευταίο ξεπάγωμα.
 * Κρίνει μόνο όταν υπάρχουν αρκετές αποστολές (`guards.min_sent_before_freeze`), ώστε 1 bounce στα 3
 * πρώτα να μην παγώνει την καμπάνια.
 */
export async function runGuards(ctx: FactoryContext, store: LeadStore, onlyCell?: string): Promise<FreezeResult[]> {
  const g = ctx.config.volume.guards;
  const frozen: FreezeResult[] = [];
  const rows = await campaignMetrics(store);
  for (const r of rows) {
    if (!r.campaignId || !isEmailChannel(r.channel)) continue;
    if (onlyCell && r.cellId !== onlyCell) continue;
    if (!['approved', 'exported'].includes(r.status)) continue;
    const c = await store.db.get<{ stats: unknown }>('select stats from campaigns where id = ?', [r.campaignId]);
    const stats = json<Record<string, unknown>>(c?.stats, {});
    const base = (stats.guard_baseline as Baseline | undefined) ?? { sent: 0, bounces: 0, spam: 0 };
    const m: Pick<Metrics, 'sent' | 'bounces' | 'spam'> = { sent: r.m.sent - base.sent, bounces: r.m.bounces - base.bounces, spam: r.m.spam - base.spam };
    if (m.sent < g.min_sent_before_freeze) continue;
    const bounceRate = rate(m.bounces, m.sent);
    const spamRate = rate(m.spam, m.sent);
    const reasons: string[] = [];
    if (bounceRate > g.max_bounce_rate) reasons.push(`bounce ${(bounceRate * 100).toFixed(1)}% > ${(g.max_bounce_rate * 100).toFixed(1)}%`);
    if (spamRate > g.max_spam_rate) reasons.push(`spam complaints ${(spamRate * 100).toFixed(2)}% > ${(g.max_spam_rate * 100).toFixed(2)}%`);
    if (reasons.length === 0) continue;

    const at = ctx.now().toISOString();
    const next = { ...stats, frozen: { from: r.status, at, reasons, sent: m.sent, bounces: m.bounces, spam: m.spam } };
    await store.db.run("update campaigns set status = 'frozen', stats = ? where id = ?", [next, r.campaignId]);
    const res: FreezeResult = { campaignId: r.campaignId, cellId: r.cellId, reasons, sent: m.sent, bounceRate, spamRate };
    try {
      const alert = await ctx.approvals.openAlert(
        `[ALERT] Πάγωμα καμπάνιας ${r.campaignId}`,
        [
          `Η καμπάνια **${r.campaignId}** (κελί ${r.cellId}) πάγωσε αυτόματα.`,
          '',
          `| | τιμή | όριο |`,
          `|---|---|---|`,
          `| αποστολές (από το τελευταίο ξεπάγωμα) | ${m.sent} | ≥ ${g.min_sent_before_freeze} για κρίση |`,
          `| bounces | ${m.bounces} (${(bounceRate * 100).toFixed(1)}%) | ${(g.max_bounce_rate * 100).toFixed(1)}% |`,
          `| spam complaints | ${m.spam} (${(spamRate * 100).toFixed(2)}%) | ${(g.max_spam_rate * 100).toFixed(2)}% |`,
          '',
          'Δεν βγαίνει άλλο export μέχρι να ξεπαγώσει. Πριν το ξεπάγωμα: σταμάτα την καμπάνια και στο εργαλείο αποστολής,',
          'έλεγξε τη λίστα (παλιά emails; λάθος στοιχεία;) και τα DNS του sending domain (`compliance/DELIVERABILITY.md`).',
          '',
          `Ξεπάγωμα (μόνο άνθρωπος): \`npm run factory -- unfreeze ${r.campaignId} --by <όνομα>\``,
        ].join('\n'),
      );
      res.alertUrl = alert.url;
    } catch (err) {
      ctx.log(`⚠ δεν άνοιξε το [ALERT] για ${r.campaignId}: ${(err as Error).message}`);
    }
    ctx.log(`🧊 πάγωσε η ${r.campaignId}: ${reasons.join(', ')}`);
    frozen.push(res);
  }
  return frozen;
}

/** Ξεπάγωμα από άνθρωπο. Οι μετρήσεις του guard ξεκινούν από το μηδέν από εδώ και πέρα. */
export async function unfreezeCampaign(store: LeadStore, campaignId: string, by: string, now: Date): Promise<string> {
  if (!by.trim()) throw new Error('Χρειάζεται --by <όνομα>: το ξεπάγωμα το κάνει άνθρωπος.');
  const c = await store.db.get<{ status: string; stats: unknown }>('select status, stats from campaigns where id = ?', [campaignId]);
  if (!c) throw new Error(`Άγνωστη καμπάνια «${campaignId}»`);
  if (c.status !== 'frozen') throw new Error(`Η ${campaignId} δεν είναι παγωμένη (status: ${c.status}).`);
  const stats = json<Record<string, unknown>>(c.stats, {});
  const from = (stats.frozen as { from?: string } | undefined)?.from ?? 'approved';
  const all = (await campaignMetrics(store)).find((r) => r.campaignId === campaignId)!;
  const next = {
    ...stats,
    frozen: undefined,
    guard_baseline: { sent: all.m.sent, bounces: all.m.bounces, spam: all.m.spam },
    unfrozen: [...((stats.unfrozen as unknown[]) ?? []), { by, at: now.toISOString(), was: stats.frozen }],
  };
  await store.db.run('update campaigns set status = ?, stats = ? where id = ?', [from, next, campaignId]);
  return from;
}
