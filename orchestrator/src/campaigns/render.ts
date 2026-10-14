import { createHash } from 'node:crypto';
import type { ChannelsConfig } from '../config.ts';
import type { BusinessRow } from '../leads/store.ts';
import type { CallTemplate, DraftTemplate, EmailTemplate } from './template.ts';

/**
 * Προσωποποίηση ΜΟΝΟ από πεδία του lead record που έχουν πηγή (agents/outreach.md, QA Q1).
 * Ο agent γράφει `{{business.name}}` ή συνθήκες `signals.has_online_booking == false`· εδώ γεμίζουν.
 * Πεδίο χωρίς πηγή = η συνθήκη είναι ψευδής (πάμε στο default) και το placeholder δεν γεμίζει.
 */

export const PERSONALIZATION_FIELDS: Record<string, { source: string; describe: string }> = {
  'business.name': { source: 'name', describe: 'επωνυμία (ΓΕΜΗ ή Places)' },
  'business.city': { source: 'city', describe: 'πόλη' },
  'business.rating': { source: 'rating', describe: 'βαθμολογία στο Google (1–5)' },
  'business.reviews_count': { source: 'reviews_count', describe: 'πλήθος κριτικών στο Google' },
  'signals.has_online_booking': { source: 'signals', describe: 'το site έχει online κράτηση (true/false)' },
  'signals.has_chat': { source: 'signals', describe: 'το site έχει chat (true/false)' },
  'signals.has_viber': { source: 'signals', describe: 'το site έχει link Viber (true/false)' },
  'signals.has_whatsapp': { source: 'signals', describe: 'το site έχει link WhatsApp (true/false)' },
};

/** Τιμές που δεν προέρχονται από το lead: τις βάζει ο κώδικας. */
export const SYSTEM_PLACEHOLDERS = ['demo_url', 'booking_url', 'sender_block', 'unsubscribe', 'vertical.name', 'service.name'];

export interface LeadView {
  businessId: string;
  contactId: string | null;
  email: string | null;
  phone: string | null;
  formUrl: string | null;
  business: BusinessRow;
}

type Value = string | number | boolean | null;

export function fieldValue(lead: LeadView, field: string): { value: Value; sourced: boolean } {
  const def = PERSONALIZATION_FIELDS[field];
  if (!def) return { value: null, sourced: false };
  const b = lead.business;
  let sourced = Boolean(b.sources[def.source]);
  // Επωνυμίες μητρώου σε ΚΕΦΑΛΑΙΑ με νομική μορφή («ΣΤΟΥΝΤΙΟ Χ Ι.Κ.Ε.») δεν μπαίνουν σε μήνυμα:
  // μοιάζουν με spam και δεν είναι το όνομα που χρησιμοποιεί η επιχείρηση. Τότε πάμε στο default.
  if (field === 'business.name' && isShoutingName(b.name)) sourced = false;
  let value: Value;
  if (field.startsWith('signals.')) {
    const v = b.signals[field.slice('signals.'.length)];
    value = typeof v === 'boolean' ? v : null;
  } else {
    const key = field.slice('business.'.length) as keyof BusinessRow;
    const v = b[key];
    value = typeof v === 'string' || typeof v === 'number' ? v : null;
  }
  return { value, sourced: sourced && value !== null };
}

export function isShoutingName(name: string): boolean {
  const letters = name.match(/\p{L}/gu) ?? [];
  const upper = name.match(/\p{Lu}/gu) ?? [];
  return letters.length > 3 && upper.length / letters.length > 0.7;
}

function parseLiteral(raw: string): Value {
  const t = raw.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t.replace(/^["']|["']$/g, '');
}

/** Συνθήκη: `default` ή `πεδίο op τιμή` (op: == != >= <= > <), ενωμένες με `&&`. */
export function evalCondition(cond: string, lead: LeadView): boolean {
  if (cond.trim() === 'default') return true;
  return cond.split('&&').every((part) => {
    const m = /^\s*([a-z_.]+)\s*(==|!=|>=|<=|>|<)\s*(.+?)\s*$/.exec(part);
    if (!m) return false;
    const { value, sourced } = fieldValue(lead, m[1]!);
    if (!sourced) return false; // χωρίς πηγή, καμία προσωποποίηση
    const lit = parseLiteral(m[3]!);
    switch (m[2]) {
      case '==':
        return value === lit;
      case '!=':
        return value !== lit;
      case '>=':
        return typeof value === 'number' && typeof lit === 'number' && value >= lit;
      case '<=':
        return typeof value === 'number' && typeof lit === 'number' && value <= lit;
      case '>':
        return typeof value === 'number' && typeof lit === 'number' && value > lit;
      case '<':
        return typeof value === 'number' && typeof lit === 'number' && value < lit;
      default:
        return false;
    }
  });
}

export interface RenderContext {
  campaignId: string;
  cellId: string;
  channel: string;
  siteUrl: string;
  sender: ChannelsConfig['sender'];
  verticalName: string;
  serviceName: string;
}

export interface FillResult {
  text: string;
  usedFields: string[];
  unsourced: string[];
}

export function unsubscribeToken(campaignId: string, key: string): string {
  return createHash('sha256').update(`${campaignId}|${key}`).digest('hex').slice(0, 16);
}

export function senderBlock(s: ChannelsConfig['sender']): string {
  return `${s.people.join(' & ')} · ${s.company}\n${s.website} · ${s.address}`;
}

function systemValues(ctx: RenderContext, lead: LeadView, kind: 'email' | 'call' | 'draft'): Record<string, string> {
  const utm = `utm_source=${encodeURIComponent(ctx.channel)}&utm_medium=outreach&utm_campaign=${encodeURIComponent(ctx.campaignId)}`;
  const token = unsubscribeToken(ctx.campaignId, lead.email ?? lead.phone ?? lead.businessId);
  const sep = ctx.sender.unsubscribe_url.includes('?') ? '&' : '?';
  const unsubscribe =
    kind === 'email'
      ? `Αν δεν θέλεις να ξαναλάβεις μήνυμα από εμάς: ${ctx.sender.unsubscribe_url}${sep}t=${token}`
      : 'Αν δεν σε ενδιαφέρει, πες το μου και δεν θα ξαναεπικοινωνήσουμε.';
  return {
    demo_url: `${ctx.siteUrl.replace(/\/$/, '')}/demos/${ctx.cellId}?${utm}`,
    booking_url: ctx.sender.booking_url,
    sender_block: senderBlock(ctx.sender),
    unsubscribe,
    'vertical.name': ctx.verticalName,
    'service.name': ctx.serviceName,
  };
}

/** Γεμίζει `{{…}}`: πρώτα τιμές συστήματος, μετά πεδία lead (μόνο με πηγή). Ό,τι δεν γεμίζει μένει ως έχει (Q9). */
export function fill(tpl: string, ctx: RenderContext, lead: LeadView, kind: 'email' | 'call' | 'draft'): FillResult {
  const sys = systemValues(ctx, lead, kind);
  const usedFields: string[] = [];
  const unsourced: string[] = [];
  const text = tpl.replace(/\{\{\s*([a-zA-Z_.]+)\s*\}\}/g, (m, key: string) => {
    if (key in sys) return sys[key]!;
    if (key in PERSONALIZATION_FIELDS) {
      const { value, sourced } = fieldValue(lead, key);
      if (sourced && value !== null) {
        usedFields.push(key);
        return String(value);
      }
      unsourced.push(key);
      return m;
    }
    unsourced.push(key);
    return m;
  });
  return { text, usedFields, unsourced };
}

export interface RenderedMessage {
  /** template + βήμα + variant: ίδιο textId = ίδιο κείμενο πριν την προσωποποίηση (για το LLM QA). */
  textId: string;
  channel: string;
  businessId: string;
  contact: string | null;
  step: string;
  subject: string | null;
  body: string;
  /** Το κείμενο που ελέγχεται (θέμα + σώμα). */
  text: string;
  usedFields: string[];
  unsourced: string[];
  /** Ποια σημεία του template υπάρχουν: για Q7/Q8. */
  parts: { sender: string; unsubscribe: string; demoUrl: string; bookingUrl: string };
  usesBusinessName: boolean;
  businessName: string;
}

/** Όλα τα πεδία προσωποποίησης ενός κειμένου μπορούν να γεμίσουν (έχουν πηγή); */
function fillable(text: string, lead: LeadView): boolean {
  for (const m of text.matchAll(/\{\{\s*([a-zA-Z_.]+)\s*\}\}/g)) {
    const key = m[1]!;
    if (key in PERSONALIZATION_FIELDS && !fieldValue(lead, key).sourced) return false;
  }
  return true;
}

/**
 * Το πρώτο variant που η συνθήκη του ισχύει ΚΑΙ όλα τα πεδία του έχουν πηγή.
 * Αλλιώς η γενική εκδοχή (default): «αν δεν υπάρχει αρκετό υλικό, γενική εκδοχή του κλάδου».
 */
function pickVariant(variants: Array<{ when: string; opener: string }>, lead: LeadView): { index: number; opener: string } {
  const i = variants.findIndex((v) => v.when.trim() !== 'default' && evalCondition(v.when, lead) && fillable(v.opener, lead));
  if (i >= 0) return { index: i, opener: variants[i]!.opener };
  const d = variants.findIndex((v) => v.when.trim() === 'default');
  return { index: d, opener: variants[Math.max(0, d)]!.opener };
}

function finish(
  base: Omit<RenderedMessage, 'text' | 'parts' | 'usesBusinessName' | 'businessName' | 'usedFields' | 'unsourced'>,
  parts: FillResult[],
  ctx: RenderContext,
  lead: LeadView,
  kind: 'email' | 'call' | 'draft',
  rawTemplate: string,
): RenderedMessage {
  const sys = systemValues(ctx, lead, kind);
  return {
    ...base,
    text: [base.subject, base.body].filter(Boolean).join('\n\n'),
    usedFields: [...new Set(parts.flatMap((p) => p.usedFields))],
    unsourced: [...new Set(parts.flatMap((p) => p.unsourced))],
    parts: { sender: sys.sender_block!, unsubscribe: sys.unsubscribe!, demoUrl: sys.demo_url!, bookingUrl: sys.booking_url! },
    usesBusinessName: rawTemplate.includes('business.name'),
    businessName: lead.business.name,
  };
}

export function renderEmail(t: EmailTemplate, ctx: RenderContext, lead: LeadView): RenderedMessage[] {
  return t.steps.map((s) => {
    const v = pickVariant(s.variants, lead);
    const subject = fill(s.subject, ctx, lead, 'email');
    const opener = fill(v.opener, ctx, lead, 'email');
    const body = fill(s.body, ctx, lead, 'email');
    const cta = fill(s.cta, ctx, lead, 'email');
    const sys = systemValues(ctx, lead, 'email');
    const full = [opener.text, body.text, cta.text, sys.sender_block, sys.unsubscribe].join('\n\n');
    return finish(
      { textId: `${t.channel}-d${s.day}-v${v.index}`, channel: t.channel, businessId: lead.businessId, contact: lead.email, step: `day ${s.day}`, subject: subject.text, body: full },
      [subject, opener, body, cta],
      ctx,
      lead,
      'email',
      `${s.subject}${v.opener}${s.body}${s.cta}`,
    );
  });
}

export function renderCall(t: CallTemplate, ctx: RenderContext, lead: LeadView): RenderedMessage {
  const v = pickVariant(t.opening, lead);
  const opening = fill(v.opener, ctx, lead, 'call');
  const close = fill(t.close, ctx, lead, 'call');
  const qs = t.questions.map((q) => fill(q, ctx, lead, 'call'));
  const objs = t.objections.map((o) => ({ o: o.objection, a: fill(o.answer, ctx, lead, 'call') }));
  const body = [
    `ΑΝΟΙΓΜΑ: ${opening.text}`,
    `ΕΡΩΤΗΣΕΙΣ:\n${qs.map((q, i) => `${i + 1}. ${q.text}`).join('\n')}`,
    `ΑΝΤΙΡΡΗΣΕΙΣ:\n${objs.map((x) => `- «${x.o}» → ${x.a.text}`).join('\n')}`,
    `ΚΛΕΙΣΙΜΟ: ${close.text}`,
  ].join('\n\n');
  return finish(
    { textId: `${t.channel}-v${v.index}`, channel: t.channel, businessId: lead.businessId, contact: lead.phone, step: 'call', subject: null, body },
    [opening, close, ...qs, ...objs.map((x) => x.a)],
    ctx,
    lead,
    'call',
    `${v.opener}${t.close}`,
  );
}

export function renderDraft(t: DraftTemplate, ctx: RenderContext, lead: LeadView): RenderedMessage {
  const v = pickVariant(t.variants, lead);
  const opener = fill(v.opener, ctx, lead, 'draft');
  const body = fill(t.body, ctx, lead, 'draft');
  const cta = fill(t.cta, ctx, lead, 'draft');
  const sys = systemValues(ctx, lead, 'draft');
  const full = [opener.text, body.text, cta.text, `${ctx.sender.people.join(' & ')} · ${ctx.sender.company}`, sys.unsubscribe].join('\n\n');
  return finish(
    { textId: `${t.channel}-v${v.index}`, channel: t.channel, businessId: lead.businessId, contact: lead.formUrl ?? lead.email, step: 'draft', subject: null, body: full },
    [opener, body, cta],
    ctx,
    lead,
    'draft',
    `${v.opener}${t.body}${t.cta}`,
  );
}
