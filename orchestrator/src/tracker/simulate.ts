import type { LeadStore } from '../leads/store.ts';

/**
 * Μόνο για dry-run: φτιάχνει CSV events «σαν από το Instantly» για τα μέλη που βγήκαν σε export,
 * με σταθερό seed. Περνά από τον ίδιο parser και την ίδια εισαγωγή με τα πραγματικά αρχεία.
 * Τα ποσοστά είναι παράμετροι δοκιμής, όχι εκτιμήσεις αποτελεσμάτων.
 */
export interface SimRates {
  bounce: number;
  open: number;
  reply: number;
  positiveShare: number;
  unsubscribe: number;
  spam: number;
  /** Πιθανότητα κράτησης Χάρτη AI μετά από θετική απάντηση. */
  callGivenPositive: number;
}

export const DEFAULT_SIM: SimRates = { bounce: 0.02, open: 0.3, reply: 0.04, positiveShare: 0.5, unsubscribe: 0.005, spam: 0, callGivenPositive: 0.5 };

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export async function simulateEvents(store: LeadStore, campaignId: string, start: Date, rates: SimRates = DEFAULT_SIM, seed = 42): Promise<{ toolCsv: string; calcomCsv: string }> {
  const members = await store.db.all<{ email: string }>(
    `select ct.value_norm as email from campaign_members m join contacts ct on ct.id = m.contact_id
     where m.campaign_id = ? and m.status = 'exported' and ct.kind = 'email' order by m.business_id`,
    [campaignId],
  );
  const r = rng(seed);
  const tool = ['email,event_type,timestamp,campaign,step,bounce_type,lead_status,reply_text'];
  const cal = ['uid,attendee_email,created_at,status'];
  const at = (h: number) => new Date(start.getTime() + h * 3_600_000).toISOString();
  members.forEach(({ email }, i) => {
    tool.push(`${email},sent,${at(i % 48)},${campaignId},1,,,`);
    if (r() < rates.bounce) {
      tool.push(`${email},bounced,${at((i % 48) + 1)},${campaignId},1,hard,,`);
      return;
    }
    if (r() < rates.open) tool.push(`${email},opened,${at((i % 48) + 3)},${campaignId},1,,,`);
    if (r() < rates.spam) tool.push(`${email},spam_complaint,${at((i % 48) + 5)},${campaignId},1,,,`);
    if (r() < rates.unsubscribe) {
      tool.push(`${email},unsubscribed,${at((i % 48) + 6)},${campaignId},1,,,`);
      return;
    }
    if (r() < rates.reply) {
      const pos = r() < rates.positiveShare;
      tool.push(`${email},replied,${at((i % 48) + 8)},${campaignId},1,,${pos ? 'interested' : 'not_interested'},"${pos ? 'Ναι, πείτε μου περισσότερα' : 'Όχι, ευχαριστώ'}"`);
      if (pos && r() < rates.callGivenPositive) cal.push(`sim-${i},${email},${at((i % 48) + 30)},accepted`);
    }
  });
  return { toolCsv: tool.join('\n') + '\n', calcomCsv: cal.join('\n') + '\n' };
}
