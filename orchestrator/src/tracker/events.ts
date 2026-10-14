import { createHash } from 'node:crypto';
import type { FactoryContext } from '../context.ts';
import { isFreemail } from '../leads/normalize.ts';
import type { LeadStore } from '../leads/store.ts';
import { fold } from '../qa/brand.ts';
import { categoryFromToolStatus, classifyReplies, type ReplyCategory } from './classify.ts';
import { parseCsv, pick } from './csv.ts';

export type EventType = 'sent' | 'bounce' | 'open' | 'reply_positive' | 'reply_negative' | 'reply_other' | 'unsubscribe' | 'spam' | 'call_booked' | 'pilot';

/** Ένα event όπως έρχεται από εργαλείο/Cal.com/άνθρωπο, πριν το ταίριασμα με τη βάση. */
export interface RawEvent {
  /** Μοναδικό κλειδί στην πηγή: ίδιο κλειδί = ίδιο event (η εισαγωγή είναι idempotent). */
  key: string;
  source: string;
  kind: 'sent' | 'bounce' | 'open' | 'reply' | 'unsubscribe' | 'spam' | 'call_booked' | 'pilot';
  occurredAt: string;
  email?: string | null;
  businessId?: string | null;
  campaignId?: string | null;
  cellId?: string | null;
  hardBounce?: boolean;
  replyText?: string;
  toolStatus?: string;
  note?: string;
}

export interface ImportSummary {
  read: number;
  imported: number;
  duplicates: number;
  unmatched: number;
  ignored: number;
  suppressed: number;
  byType: Partial<Record<EventType, number>>;
}

/** uuid από hash: ίδιο event → ίδιο id (το Postgres θέλει uuid). */
export function eventId(source: string, key: string): string {
  const h = createHash('sha256').update(`${source}|${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function isoOrNull(s: string): string | null {
  if (!s) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2} \d/.test(s) ? s.replace(' ', 'T') : s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function kindOf(raw: string): RawEvent['kind'] | null {
  const s = fold(raw).replace(/[_-]/g, ' ');
  if (/spam|complain/.test(s)) return 'spam';
  if (/unsub/.test(s)) return 'unsubscribe';
  if (/bounce/.test(s)) return 'bounce';
  if (/repl/.test(s)) return 'reply';
  if (/open/.test(s)) return 'open';
  if (/\bsent\b|send/.test(s)) return 'sent';
  return null;
}

/**
 * CSV από Instantly / Smartlead / lemlist: μία γραμμή ανά event. Οι στήλες διαφέρουν ανά εργαλείο,
 * γι' αυτό διαβάζουμε συνώνυμα. Γραμμές με άγνωστο τύπο (π.χ. click) αγνοούνται.
 */
export function parseToolCsv(text: string, source: string): { events: RawEvent[]; ignored: number } {
  const events: RawEvent[] = [];
  let ignored = 0;
  for (const row of parseCsv(text)) {
    const email = pick(row, ['email', 'lead_email', 'leademail', 'to', 'recipient', 'contact_email', 'to_email']).toLowerCase();
    const kind = kindOf(pick(row, ['event', 'event_type', 'type', 'activity', 'activity_type', 'event_name']));
    const at = isoOrNull(pick(row, ['timestamp', 'occurred_at', 'event_time', 'date', 'time', 'created_at', 'createdat']));
    if (!email || !kind || !at) {
      ignored++;
      continue;
    }
    const campaign = pick(row, ['campaign_id', 'campaign', 'campaign_name', 'campaignname']);
    const bounceType = fold(pick(row, ['bounce_type', 'bouncetype', 'bounce']));
    const step = pick(row, ['step', 'sequence_step', 'email_seq_number', 'sequencestep']);
    events.push({
      key: `${email}|${kind}|${at}|${campaign}|${step}`,
      source,
      kind,
      occurredAt: at,
      email,
      campaignId: campaign || null,
      hardBounce: kind === 'bounce' ? !/soft|temporar|προσωριν/.test(bounceType) : undefined,
      replyText: kind === 'reply' ? pick(row, ['reply_text', 'reply', 'body', 'message', 'text', 'reply_body']) : undefined,
      toolStatus: pick(row, ['lead_status', 'interest_status', 'interest', 'label', 'status_label']),
    });
  }
  return { events, ignored };
}

/** Export κρατήσεων από το Cal.com (CSV). Ακυρωμένες κρατήσεις αγνοούνται. */
export function parseCalcomCsv(text: string): { events: RawEvent[]; ignored: number } {
  const events: RawEvent[] = [];
  let ignored = 0;
  for (const row of parseCsv(text)) {
    const status = fold(pick(row, ['status', 'booking_status']));
    const email = pick(row, ['attendee_email', 'attendeeemail', 'attendee', 'attendees', 'email', 'responses_email']).split(/[;,\s]+/)[0]!.toLowerCase();
    const at = isoOrNull(pick(row, ['created_at', 'createdat', 'booked_at', 'start_time', 'starttime', 'start']));
    if (/cancel|reject/.test(status) || !at || (!email && !pick(row, ['utm_campaign']))) {
      ignored++;
      continue;
    }
    const uid = pick(row, ['uid', 'booking_uid', 'id', 'booking_id']);
    events.push({
      key: uid || `${email}|${at}`,
      source: 'calcom',
      kind: 'call_booked',
      occurredAt: at,
      email: email || null,
      campaignId: pick(row, ['utm_campaign']) || null,
    });
  }
  return { events, ignored };
}

async function resolve(
  store: LeadStore,
  e: RawEvent,
): Promise<{ businessId: string | null; contactId: string | null; campaignId: string | null; cellId: string | null; channel: string | null; domain: string | null; afm: string | null }> {
  let businessId = e.businessId ?? null;
  let contactId: string | null = null;
  if (e.email) {
    const c = await store.db.get<{ id: string; business_id: string }>('select id, business_id from contacts where kind = ? and value_norm = ? limit 1', ['email', e.email]);
    if (c) {
      contactId = c.id;
      businessId ??= c.business_id;
    }
  }
  let campaign: { id: string; cell_id: string; channel: string } | undefined;
  if (e.campaignId) campaign = await store.db.get('select id, cell_id, channel from campaigns where id = ?', [e.campaignId]);
  if (!campaign && businessId) {
    // Η πιο πρόσφατη καμπάνια όπου η επιχείρηση βγήκε σε export.
    campaign = await store.db.get(
      `select c.id, c.cell_id, c.channel from campaign_members m join campaigns c on c.id = m.campaign_id
       where m.business_id = ? and m.status = 'exported' order by c.created_at desc limit 1`,
      [businessId],
    );
  }
  const biz = businessId ? await store.db.get<{ domain: string | null; afm: string | null }>('select domain, afm from businesses where id = ?', [businessId]) : undefined;
  return {
    businessId,
    contactId,
    campaignId: campaign?.id ?? null,
    cellId: campaign?.cell_id ?? e.cellId ?? null,
    channel: campaign?.channel ?? null,
    domain: biz?.domain ?? null,
    afm: biz?.afm ?? null,
  };
}

function replyType(c: ReplyCategory): EventType {
  return c === 'positive' ? 'reply_positive' : c === 'negative' ? 'reply_negative' : c === 'unsubscribe' ? 'unsubscribe' : 'reply_other';
}

/**
 * Γράφει τα events στη βάση. Idempotent (ίδιο event → ίδιο id). Δεν κρατά ούτε το email ούτε το
 * κείμενο της απάντησης: μόνο τύπο, χρόνο, καμπάνια/επιχείρηση και κατηγορία.
 * Διαγραφή ή spam complaint → suppression αμέσως, για όλα τα κανάλια (και χωρίς ταίριασμα).
 * Hard bounce → suppression του email.
 */
export async function importEvents(ctx: FactoryContext, store: LeadStore, raw: RawEvent[]): Promise<ImportSummary> {
  const sum: ImportSummary = { read: raw.length, imported: 0, duplicates: 0, unmatched: 0, ignored: 0, suppressed: 0, byType: {} };

  const replies = raw.filter((e) => e.kind === 'reply');
  const fromTool = new Map<string, ReplyCategory>();
  for (const e of replies) {
    const c = e.toolStatus ? categoryFromToolStatus(e.toolStatus) : null;
    if (c) fromTool.set(e.key, c);
  }
  const llm = await classifyReplies(
    ctx,
    replies.filter((e) => !fromTool.has(e.key)).map((e) => ({ id: e.key, text: e.replyText ?? '' })),
  );
  // Το κείμενο της απάντησης δεν το χρειαζόμαστε άλλο.
  for (const e of replies) delete e.replyText;

  const now = ctx.now().toISOString();
  await store.db.transaction(async () => {
    for (const e of raw) {
      const r = await resolve(store, e);
      let type: EventType;
      let category: ReplyCategory | undefined;
      if (e.kind === 'reply') {
        category = fromTool.get(e.key) ?? llm.get(e.key) ?? 'unclassified';
        type = replyType(category);
      } else type = e.kind;

      // Suppression πριν από οτιδήποτε άλλο: ισχύει και αν δεν βρήκαμε την επιχείρηση.
      if (type === 'unsubscribe' || type === 'spam') {
        const reason = type === 'spam' ? 'spam complaint' : 'αίτημα διαγραφής';
        if (e.email) await store.suppress('email', e.email, reason);
        const emailDomain = e.email?.split('@')[1] ?? null;
        if (e.email && !isFreemail(e.email) && emailDomain) await store.suppress('domain', emailDomain, reason);
        if (r.domain) await store.suppress('domain', r.domain, reason);
        if (r.afm) await store.suppress('afm', r.afm, reason);
        sum.suppressed++;
      } else if (type === 'bounce' && e.hardBounce && e.email) {
        await store.suppress('email', e.email, 'hard bounce');
        sum.suppressed++;
      }

      if (!r.businessId && !r.cellId) {
        sum.unmatched++;
        continue;
      }
      const meta: Record<string, unknown> = { source: e.source };
      if (category) meta.category = category;
      if (type === 'bounce') meta.hard = e.hardBounce !== false;
      if (!r.campaignId && r.cellId) meta.cell_id = r.cellId;
      if (e.note) meta.note = e.note;
      const inserted = await store.db.run(
        `insert into events (id, campaign_id, business_id, contact_id, type, occurred_at, meta, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?) on conflict (id) do nothing`,
        [eventId(e.source, e.key), r.campaignId, r.businessId, r.contactId, type, e.occurredAt, meta, now],
      );
      if (inserted === 0) {
        sum.duplicates++;
        continue;
      }
      sum.imported++;
      sum.byType[type] = (sum.byType[type] ?? 0) + 1;
      if (r.businessId && type === 'sent') {
        await store.db.run('update businesses set last_contacted_at = ? where id = ? and (last_contacted_at is null or last_contacted_at < ?)', [e.occurredAt, r.businessId, e.occurredAt]);
      }
      if (r.businessId && (type === 'call_booked' || type === 'pilot')) {
        await store.db.run('update businesses set converted = ? where id = ?', [true, r.businessId]);
      }
    }
  });
  return sum;
}
