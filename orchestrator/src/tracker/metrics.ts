import { json } from '../leads/db.ts';
import type { LeadStore } from '../leads/store.ts';

export interface Metrics {
  /** Email: επιχειρήσεις που έλαβαν τουλάχιστον ένα email. Κλήσεις/DM: μέλη που βγήκαν σε export. */
  contacts: number;
  sent: number;
  bounces: number;
  opens: number;
  positive: number;
  negative: number;
  otherReplies: number;
  unsubscribes: number;
  spam: number;
  calls: number;
  pilots: number;
}

export const emptyMetrics = (): Metrics => ({ contacts: 0, sent: 0, bounces: 0, opens: 0, positive: 0, negative: 0, otherReplies: 0, unsubscribes: 0, spam: 0, calls: 0, pilots: 0 });

export interface CampaignMetrics {
  campaignId: string | null;
  cellId: string;
  channel: string;
  status: string;
  m: Metrics;
}

export const isEmailChannel = (ch: string) => ch.startsWith('email');

export function addMetrics(a: Metrics, b: Metrics): Metrics {
  const out = { ...a };
  for (const k of Object.keys(out) as Array<keyof Metrics>) out[k] += b[k];
  return out;
}

/** Θετική απόκριση: θετική απάντηση, κλήση ή pilot. */
export const positives = (m: Metrics) => m.positive + m.calls + m.pilots;
export const rate = (n: number, d: number) => (d > 0 ? n / d : 0);

/**
 * Μετρικές ανά καμπάνια, μόνο από events (και από τα μέλη που βγήκαν σε export, για κανάλια χωρίς
 * events αποστολής). Με `from/to` μετρά μόνο τα events του διαστήματος· οι επαφές κλήσεων/DM
 * μετριούνται μόνο στο σύνολο (δεν έχουν χρόνο).
 * Events χωρίς καμπάνια (π.χ. κράτηση από το site, pilot χωρίς επιχείρηση) πάνε στο κελί τους με κανάλι «άλλο».
 */
export async function campaignMetrics(store: LeadStore, window: { from?: Date; to?: Date } = {}): Promise<CampaignMetrics[]> {
  const rows = new Map<string, CampaignMetrics>();
  for (const c of await store.db.all<{ id: string; cell_id: string; channel: string; status: string }>('select id, cell_id, channel, status from campaigns')) {
    rows.set(c.id, { campaignId: c.id, cellId: c.cell_id, channel: c.channel, status: c.status, m: emptyMetrics() });
  }
  const params: unknown[] = [];
  let where = '1 = 1';
  if (window.from) {
    where += ' and occurred_at >= ?';
    params.push(window.from.toISOString());
  }
  if (window.to) {
    where += ' and occurred_at < ?';
    params.push(window.to.toISOString());
  }
  const sentTo = new Map<string, Set<string>>();
  const openedBy = new Map<string, Set<string>>();
  const events = await store.db.all<{ campaign_id: string | null; business_id: string | null; type: string; meta: unknown }>(
    `select campaign_id, business_id, type, meta from events where ${where}`,
    params,
  );
  for (const e of events) {
    let key = e.campaign_id;
    if (!key || !rows.has(key)) {
      const cell = json<Record<string, unknown>>(e.meta, {}).cell_id;
      if (typeof cell !== 'string') continue;
      key = `${cell}--άλλο`;
      if (!rows.has(key)) rows.set(key, { campaignId: null, cellId: cell, channel: 'άλλο', status: '—', m: emptyMetrics() });
    }
    const r = rows.get(key)!;
    const biz = e.business_id ?? '';
    switch (e.type) {
      case 'sent':
        r.m.sent++;
        if (!sentTo.has(key)) sentTo.set(key, new Set());
        sentTo.get(key)!.add(biz);
        break;
      case 'bounce':
        r.m.bounces++;
        break;
      case 'open':
        if (!openedBy.has(key)) openedBy.set(key, new Set());
        openedBy.get(key)!.add(biz);
        break;
      case 'reply_positive':
        r.m.positive++;
        break;
      case 'reply_negative':
        r.m.negative++;
        break;
      case 'reply_other':
        r.m.otherReplies++;
        break;
      case 'unsubscribe':
        r.m.unsubscribes++;
        break;
      case 'spam':
        r.m.spam++;
        break;
      case 'call_booked':
        r.m.calls++;
        break;
      case 'pilot':
        r.m.pilots++;
        break;
    }
  }
  for (const [key, s] of sentTo) rows.get(key)!.m.contacts = s.size;
  for (const [key, s] of openedBy) rows.get(key)!.m.opens = s.size;
  if (!window.from && !window.to) {
    const exported = await store.db.all<{ campaign_id: string; n: number }>(
      "select campaign_id, count(*) as n from campaign_members where status = 'exported' group by campaign_id",
    );
    for (const x of exported) {
      const r = rows.get(x.campaign_id);
      if (r && !isEmailChannel(r.channel)) r.m.contacts = Number(x.n);
    }
  }
  return [...rows.values()];
}

export interface CellChannelMetrics {
  cellId: string;
  channel: string;
  m: Metrics;
}

export function byCellChannel(rows: CampaignMetrics[]): CellChannelMetrics[] {
  const out = new Map<string, CellChannelMetrics>();
  for (const r of rows) {
    const k = `${r.cellId}|${r.channel}`;
    const cur = out.get(k);
    if (cur) cur.m = addMetrics(cur.m, r.m);
    else out.set(k, { cellId: r.cellId, channel: r.channel, m: { ...r.m } });
  }
  return [...out.values()].sort((a, b) => a.cellId.localeCompare(b.cellId) || a.channel.localeCompare(b.channel));
}

export function byCell(rows: CampaignMetrics[]): Map<string, Metrics> {
  const out = new Map<string, Metrics>();
  for (const r of rows) out.set(r.cellId, addMetrics(out.get(r.cellId) ?? emptyMetrics(), r.m));
  return out;
}
