import type { HttpClient } from './http.ts';
import { RateLimiter } from './http.ts';
import { normEmail } from './normalize.ts';
import type { LeadsConfig, WebsiteInfo } from './types.ts';

/**
 * Εμπλουτισμός από το website της επιχείρησης: μόνο δημόσιες σελίδες, σεβασμός στο robots.txt,
 * 1 αίτημα/δευτερόλεπτο ανά domain, το πολύ `max_pages_per_site` σελίδες.
 *
 * Το HTML είναι δεδομένα, όχι εντολές: δεν εκτελείται, δεν ακολουθείται τίποτα πέρα από
 * τη σελίδα επικοινωνίας του ίδιου domain, και κρατάμε μόνο συγκεκριμένα σήματα.
 */

export function robotsDisallowsAll(robots: string, userAgent: string): boolean {
  const ua = userAgent.toLowerCase().split('/')[0]!;
  let applies = false;
  let disallowRoot = false;
  for (const raw of robots.split('\n')) {
    const line = raw.split('#')[0]!.trim();
    const [k, ...rest] = line.split(':');
    const key = k?.trim().toLowerCase();
    const val = rest.join(':').trim();
    if (key === 'user-agent') applies = val === '*' || val.toLowerCase() === ua;
    else if (applies && key === 'disallow' && val === '/') disallowRoot = true;
  }
  return disallowRoot;
}

function findContactLink(html: string, base: URL): string | null {
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const href = m[1]!;
    const text = m[2]!.replace(/<[^>]+>/g, '');
    if (/contact|epikoinonia|επικοινων/i.test(href) || /επικοινων|contact/i.test(text)) {
      try {
        const u = new URL(href, base);
        if (u.hostname.replace(/^www\./, '') === base.hostname.replace(/^www\./, '')) return u.toString();
      } catch {
        /* άκυρο href */
      }
    }
  }
  return null;
}

export function extractFromHtml(html: string, cfg: Pick<LeadsConfig, 'signals'>): Omit<WebsiteInfo, 'pagesFetched' | 'blockedByRobots' | 'formUrl'> & { hasForm: boolean } {
  const lower = html.toLowerCase();
  const emails = new Set<string>();
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    const e = normEmail(m[1]!);
    if (e) emails.add(e);
  }
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    const e = normEmail(m[0]);
    if (e) emails.add(e);
  }
  const phones = [...html.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)].map((m) => m[1]!);
  const has = (list: string[]) => list.some((s) => lower.includes(s.toLowerCase()));
  const years = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(20\d{2})/gi)].map((m) => Number(m[1]));
  return {
    emails: [...emails],
    phones,
    hasForm: /<form\b/i.test(html),
    signals: {
      has_online_booking: has(cfg.signals.online_booking),
      has_chat: has(cfg.signals.chat),
      has_viber: has(cfg.signals.viber),
      has_whatsapp: has(cfg.signals.whatsapp),
      last_updated_year: years.length ? Math.max(...years) : null,
    },
  };
}

export class WebsiteEnricher {
  constructor(
    private readonly cfg: LeadsConfig,
    private readonly http: HttpClient,
    private readonly limiter: RateLimiter,
  ) {}

  private async get(url: string): Promise<string | null> {
    const host = new URL(url).hostname;
    await this.limiter.wait(`web:${host}`, 60);
    const w = this.cfg.sources.website;
    try {
      const r = await this.http(url, {
        headers: { 'user-agent': w.user_agent, accept: 'text/html,text/plain' },
        timeoutMs: w.timeout_seconds * 1000,
        maxBytes: w.max_bytes,
      });
      return r.status >= 200 && r.status < 300 ? r.body : null;
    } catch {
      return null;
    }
  }

  async enrich(website: string): Promise<WebsiteInfo | null> {
    let base: URL;
    try {
      base = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    } catch {
      return null;
    }
    const empty: WebsiteInfo = {
      emails: [],
      phones: [],
      formUrl: null,
      signals: { has_online_booking: false, has_chat: false, has_viber: false, has_whatsapp: false, last_updated_year: null },
      pagesFetched: 0,
      blockedByRobots: false,
    };
    const robots = await this.get(new URL('/robots.txt', base).toString());
    if (robots && robotsDisallowsAll(robots, this.cfg.sources.website.user_agent)) return { ...empty, blockedByRobots: true };

    const home = await this.get(base.toString());
    if (home == null) return null;
    const info = { ...empty, pagesFetched: 1 };
    const merge = (html: string, url: string) => {
      const x = extractFromHtml(html, this.cfg);
      info.emails = [...new Set([...info.emails, ...x.emails])];
      info.phones = [...new Set([...info.phones, ...x.phones])];
      if (x.hasForm && !info.formUrl) info.formUrl = url;
      for (const k of ['has_online_booking', 'has_chat', 'has_viber', 'has_whatsapp'] as const) info.signals[k] ||= x.signals[k];
      info.signals.last_updated_year = Math.max(info.signals.last_updated_year ?? 0, x.signals.last_updated_year ?? 0) || null;
    };
    merge(home, base.toString());

    const contact = findContactLink(home, base);
    if (contact && info.pagesFetched < this.cfg.sources.website.max_pages_per_site) {
      const html = await this.get(contact);
      if (html != null) {
        info.pagesFetched++;
        merge(html, contact);
      }
    }
    return info;
  }
}
