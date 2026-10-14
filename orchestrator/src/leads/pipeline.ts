import type { LeadSource, SourceQuery } from './sources.ts';
import { QuotaError } from './http.ts';
import { domainOf, isFreemail, isMobile, isRoleEmail, normEmail, normName, phoneE164 } from './normalize.ts';
import { scoreLead } from './scoring.ts';
import type { FieldSource, LeadStore, NormalizedLead } from './store.ts';
import type { LeadsConfig, RawLead, WebsiteInfo } from './types.ts';
import type { WebsiteEnricher } from './website.ts';

export interface LeadRunInput {
  cellId: string;
  vertical: string;
  service: string;
  kad: string[];
  placesTerms: string[];
  cities: string[];
  /** Πόσα ΝΕΑ leads επιτρέπονται σε αυτή την εκτέλεση (όριο ημέρας μείον όσα μπήκαν σήμερα). */
  budget: number;
}

export interface LeadRunStats {
  fetched: number;
  inserted: number;
  merged: number;
  suppressed: number;
  closedOrInvalid: number;
  mobilesDropped: number;
  personalEmailsDropped: number;
  robotsBlocked: number;
  sitesEnriched: number;
  /** true = τελείωσαν όλες οι πηγές για το κελί. false = σταμάτησε στο όριο ή σε quota· συνεχίζει μετά. */
  exhausted: boolean;
  stoppedBy: 'budget' | 'quota' | null;
  quotaMessage?: string;
}

export interface LeadEnv {
  store: LeadStore;
  sources: LeadSource[];
  enricher: WebsiteEnricher | null;
  cfg: LeadsConfig;
  now: () => Date;
  log: (m: string) => void;
}

const emptyStats = (): LeadRunStats => ({
  fetched: 0,
  inserted: 0,
  merged: 0,
  suppressed: 0,
  closedOrInvalid: 0,
  mobilesDropped: 0,
  personalEmailsDropped: 0,
  robotsBlocked: 0,
  sitesEnriched: 0,
  exhausted: false,
  stoppedBy: null,
});

/**
 * Προμήθεια leads για ένα κελί: πηγές → κανονικοποίηση → suppression → εμπλουτισμός από website →
 * suppression ξανά (με τα emails) → dedupe/αποθήκευση → scoring. Σε batches (σελίδες πηγών),
 * με cursor ανά query ώστε να συνεχίζει από εκεί που σταμάτησε.
 */
export async function runLeadSourcing(env: LeadEnv, input: LeadRunInput): Promise<LeadRunStats> {
  const stats = emptyStats();
  const queries: Array<{ src: LeadSource; q: SourceQuery }> = env.sources.flatMap((src) =>
    src.queries(input.vertical, input.kad, input.placesTerms, input.cities).map((q) => ({ src, q })),
  );
  let allExhausted = true;

  outer: for (const { src, q } of queries) {
    let { cursor, exhausted } = await env.store.getCursor(q.key);
    if (exhausted) continue;
    for (;;) {
      if (stats.inserted >= input.budget) {
        stats.stoppedBy = 'budget';
        allExhausted = false;
        break outer;
      }
      let page;
      try {
        page = await src.fetchPage(q, cursor);
      } catch (err) {
        if (err instanceof QuotaError) {
          stats.stoppedBy = 'quota';
          stats.quotaMessage = err.message;
          allExhausted = false;
          break outer;
        }
        throw err;
      }
      let cut = false;
      for (const raw of page.leads) {
        if (stats.inserted >= input.budget) {
          // Σταματάμε ακριβώς στο όριο. Ο cursor ΔΕΝ προχωρά: την επόμενη φορά η σελίδα ξαναδιαβάζεται
          // και όσα μπήκαν ήδη απλά συγχωνεύονται (dedupe).
          cut = true;
          break;
        }
        stats.fetched++;
        await processLead(env, input, raw, stats);
      }
      if (cut) {
        stats.stoppedBy = 'budget';
        allExhausted = false;
        break outer;
      }
      cursor = page.next;
      exhausted = page.next == null;
      await env.store.setCursor(q.key, cursor, exhausted);
      if (exhausted) break;
    }
  }
  stats.exhausted = allExhausted && stats.stoppedBy == null;
  if (stats.inserted) await env.store.addImported(stats.inserted);
  return stats;
}

async function enrich(env: LeadEnv, domain: string, website: string, stats: LeadRunStats): Promise<WebsiteInfo | null> {
  if (!env.enricher) return null;
  const key = `web:${domain}`;
  const cached = await env.store.cacheGet<WebsiteInfo>(key, 30);
  if (cached) return cached;
  const info = await env.enricher.enrich(website);
  if (info) {
    await env.store.cachePut(key, info);
    if (info.blockedByRobots) stats.robotsBlocked++;
    else stats.sitesEnriched++;
  }
  return info;
}

async function processLead(env: LeadEnv, input: LeadRunInput, raw: RawLead, stats: LeadRunStats): Promise<void> {
  const at = env.now().toISOString();
  const src = (): FieldSource => ({ source: raw.source, collected_at: at });
  const name = raw.name.trim();
  const name_norm = normName(name);
  if (!name_norm) {
    stats.closedOrInvalid++;
    return;
  }

  let phone = phoneE164(raw.phone);
  // Κινητά από το ΓΕΜΗ: συνήθως προσωπικά (ατομικές επιχειρήσεις). Από Places/website κρατιούνται μόνο
  // επειδή τα έχει δηλώσει η ίδια η επιχείρηση ως τηλέφωνό της.
  if (phone && isMobile(phone) && raw.source === 'gemi') {
    phone = null;
    stats.mobilesDropped++;
  }
  const domain = domainOf(raw.website);

  const nameCity = raw.city ? `${name_norm}|${raw.city}` : null;
  const matchKeys = { afm: raw.afm ?? null, gemi: raw.gemi ?? null, domain, phone_e164: phone, name_norm, city: raw.city ?? null };
  const early = await env.store.suppressedReason({ domain, phone, afm: raw.afm ?? null, nameCity });
  if (early) {
    stats.suppressed++;
    await env.store.propagateSuppression({ domain, phone, afm: raw.afm ?? null, nameCity }, matchKeys);
    return;
  }

  const sources: Record<string, FieldSource> = { name: src() };
  for (const [k, v] of Object.entries({ afm: raw.afm, gemi: raw.gemi, city: raw.city, address: raw.address, website: raw.website, phone_e164: phone, rating: raw.rating, reviews_count: raw.reviewsCount })) {
    if (v != null && v !== '') sources[k] = src();
  }
  if (domain) sources.domain = src();

  const contacts: NormalizedLead['contacts'] = [];
  if (phone) contacts.push({ kind: 'phone', value: phone, value_norm: phone, source: raw.source });

  let signals: Record<string, unknown> = {};
  if (domain && raw.website) {
    const info = await enrich(env, domain, raw.website, stats);
    if (info && !info.blockedByRobots) {
      signals = { ...info.signals };
      sources.signals = { source: 'website', collected_at: at };
      for (const e of info.emails) {
        const em = normEmail(e);
        if (!em) continue;
        // Μόνο εταιρικά: ρόλος (info@…), όχι δωρεάν πάροχοι, στο domain της επιχείρησης.
        if (isRoleEmail(em, env.cfg.role_email_prefixes) && !isFreemail(em) && em.endsWith(`@${domain}`)) {
          contacts.push({ kind: 'email', value: em, value_norm: em, source: 'website' });
        } else {
          stats.personalEmailsDropped++;
        }
      }
      for (const t of info.phones) {
        const p = phoneE164(t);
        if (p && !contacts.some((c) => c.value_norm === p)) contacts.push({ kind: 'phone', value: p, value_norm: p, source: 'website' });
      }
      if (info.formUrl) contacts.push({ kind: 'form', value: info.formUrl, value_norm: info.formUrl, source: 'website' });
    } else if (info?.blockedByRobots) {
      signals = {};
    }
  }

  const emails = contacts.filter((c) => c.kind === 'email').map((c) => c.value_norm);
  const late = await env.store.suppressedReason({ emails });
  if (late) {
    stats.suppressed++;
    await env.store.propagateSuppression({ emails, domain, phone, afm: raw.afm ?? null, nameCity }, matchKeys);
    return;
  }

  const lead: NormalizedLead = {
    name,
    name_norm,
    afm: raw.afm ?? null,
    gemi: raw.gemi ?? null,
    vertical: raw.vertical,
    kad: raw.kad ?? [],
    city: raw.city ?? null,
    address: raw.address ?? null,
    website: raw.website ?? null,
    domain,
    phone_e164: phone,
    rating: raw.rating ?? null,
    reviews_count: raw.reviewsCount ?? null,
    signals,
    sources,
    contacts,
  };

  const { id, created } = await env.store.upsert(lead);
  if (created) stats.inserted++;
  else stats.merged++;

  const biz = await env.store.getBusiness(id);
  const all = await env.store.contactsOf(id);
  const s = scoreLead({
    service: input.service,
    kadMatch: (biz?.kad ?? []).some((k) => input.kad.some((p) => k.startsWith(p))),
    foundByVerticalQuery: raw.source === 'places' || biz?.reviews_count != null,
    reviewsCount: biz?.reviews_count ?? null,
    hasWebsite: Boolean(biz?.domain),
    signals: (biz?.signals ?? {}) as Parameters<typeof scoreLead>[0]['signals'],
    hasRoleEmail: all.some((c) => c.kind === 'email'),
    hasForm: all.some((c) => c.kind === 'form'),
    hasPhone: all.some((c) => c.kind === 'phone'),
    currentYear: env.now().getUTCFullYear(),
  });
  await env.store.setCellLead(input.cellId, id, s.score, s.reasons);
}

/** Η αναφορά για το pipeline/<id>/campaign/leads-stats.md: ΜΟΝΟ αθροίσματα, κανένα όνομα, email ή τηλέφωνο. */
export function renderLeadStats(
  cellId: string,
  run: LeadRunStats,
  totals: { total: number; withEmail: number; withForm: number; withPhone: number; buckets: Record<string, number> },
  now: Date,
): string {
  const lines = [
    `# Leads: ${cellId}`,
    '',
    `> Μόνο αθροίσματα. Τα στοιχεία των επιχειρήσεων ζουν στη βάση, ποτέ στο git. Τελευταία εκτέλεση: ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
    '',
    '## Σύνολο στο κελί',
    '',
    '| | Πλήθος |',
    '|---|---|',
    `| Επιχειρήσεις | ${totals.total} |`,
    `| Με εταιρικό email | ${totals.withEmail} |`,
    `| Με φόρμα επικοινωνίας | ${totals.withForm} |`,
    `| Με τηλέφωνο επιχείρησης | ${totals.withPhone} |`,
    '',
    '## Κατανομή score',
    '',
    '| Score | Πλήθος |',
    '|---|---|',
    ...Object.entries(totals.buckets).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '## Τελευταία εκτέλεση',
    '',
    '| | Πλήθος |',
    '|---|---|',
    `| Εγγραφές από πηγές | ${run.fetched} |`,
    `| Νέες επιχειρήσεις | ${run.inserted} |`,
    `| Διπλότυπα που συγχωνεύτηκαν | ${run.merged} |`,
    `| Στη suppression list (δεν μπήκαν) | ${run.suppressed} |`,
    `| Κλειστές / άκυρες | ${run.closedOrInvalid} |`,
    `| Κινητά από ΓΕΜΗ που δεν κρατήθηκαν | ${run.mobilesDropped} |`,
    `| Προσωπικά/δωρεάν emails που δεν κρατήθηκαν | ${run.personalEmailsDropped} |`,
    `| Websites που εμπλουτίστηκαν | ${run.sitesEnriched} |`,
    `| Websites που απαγορεύουν robots (σεβαστήκαμε) | ${run.robotsBlocked} |`,
    '',
    run.exhausted
      ? 'Οι πηγές για αυτό το κελί τελείωσαν.'
      : `Συνεχίζει στην επόμενη εκτέλεση (${run.stoppedBy === 'budget' ? 'όριο ημέρας' : run.quotaMessage ?? 'quota'}).`,
    '',
  ];
  return lines.join('\n');
}
