import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openSqlite } from '../src/leads/db.ts';
import { FakeWorld } from '../src/leads/fake-world.ts';
import { RateLimiter } from '../src/leads/http.ts';
import { domainOf, isMobile, isRoleEmail, normName, phoneE164, sha256 } from '../src/leads/normalize.ts';
import { runLeadSourcing, type LeadEnv } from '../src/leads/pipeline.ts';
import { SQLITE_SCHEMA, tablesAndColumns } from '../src/leads/schema.ts';
import { scoreLead } from '../src/leads/scoring.ts';
import { GemiSource, PlacesSource } from '../src/leads/sources.ts';
import { LeadStore, type NormalizedLead } from '../src/leads/store.ts';
import { loadLeadsConfig } from '../src/leads/types.ts';
import { extractFromHtml, robotsDisallowsAll, WebsiteEnricher } from '../src/leads/website.ts';
import { resolvePaths } from '../src/paths.ts';
import { REAL_REPO } from './helpers.ts';

const cfg = loadLeadsConfig(resolvePaths({ repoRoot: REAL_REPO, dryRun: false }));
const TERMS = ['κομμωτήριο', 'κουρείο', 'barber shop'];

describe('κανονικοποίηση', () => {
  it('τηλέφωνα σε E.164', () => {
    expect(phoneE164('210 123 4567')).toBe('+302101234567');
    expect(phoneE164('+30 210-123-4567')).toBe('+302101234567');
    expect(phoneE164('0030 6912345678')).toBe('+306912345678');
    expect(phoneE164('12345')).toBeNull();
    expect(isMobile('+306912345678')).toBe(true);
    expect(isMobile('+302101234567')).toBe(false);
  });

  it('domains, ονόματα, εταιρικά emails', () => {
    expect(domainOf('https://www.Salon-Maria.gr/epikoinonia')).toBe('salon-maria.gr');
    expect(domainOf('salon.gr')).toBe('salon.gr');
    expect(domainOf('not a url')).toBeNull();
    expect(normName('ΚΟΜΜΩΤΗΡΙΟ ΜΑΡΙΑ Ι.Κ.Ε.')).toBe(normName('Κομμωτήριο Μαρία'));
    expect(isRoleEmail('info@x.gr', cfg.role_email_prefixes)).toBe(true);
    expect(isRoleEmail('reservations@x.gr', cfg.role_email_prefixes)).toBe(true);
    expect(isRoleEmail('maria.papadopoulou@x.gr', cfg.role_email_prefixes)).toBe(false);
  });
});

describe('website', () => {
  it('robots.txt που απαγορεύει τα πάντα', () => {
    expect(robotsDisallowsAll('User-agent: *\nDisallow: /', cfg.sources.website.user_agent)).toBe(true);
    expect(robotsDisallowsAll('User-agent: *\nDisallow: /admin', cfg.sources.website.user_agent)).toBe(false);
    expect(robotsDisallowsAll('User-agent: Googlebot\nDisallow: /', cfg.sources.website.user_agent)).toBe(false);
  });

  it('εξάγει emails, τηλέφωνα, φόρμα και σήματα από HTML', () => {
    const html = `<a href="mailto:Info@Salon.gr">x</a> <a href="tel:+302101234567">x</a> <form></form>
      <a href="https://www.fresha.com/book">Κλείσε online</a> <script src="https://embed.tawk.to/x"></script> © 2021 Salon`;
    const x = extractFromHtml(html, cfg);
    expect(x.emails).toEqual(['info@salon.gr']);
    expect(x.phones).toEqual(['+302101234567']);
    expect(x.hasForm).toBe(true);
    expect(x.signals).toMatchObject({ has_online_booking: true, has_chat: true, last_updated_year: 2021 });
  });

  it('σέβεται το robots.txt και δεν διαβάζει σελίδες', async () => {
    const world = new FakeWorld({ size: 200, vertical: 'kommotiria', kad: '96.02', terms: TERMS, cities: cfg.cities });
    const blocked = world.businesses.find((b) => b.robotsBlocked && b.domain && !b.siteDown)!;
    const enricher = new WebsiteEnricher(cfg, world.http, new RateLimiter(Date.now, async () => {}));
    const before = world.requests;
    const info = await enricher.enrich(`https://${blocked.domain}`);
    expect(info?.blockedByRobots).toBe(true);
    expect(world.requests - before).toBe(1); // μόνο το robots.txt
  });
});

function lead(over: Partial<NormalizedLead>): NormalizedLead {
  return {
    name: 'Κομμωτήριο Δοκιμή',
    name_norm: 'κομμωτηριο δοκιμη',
    afm: null,
    gemi: null,
    vertical: 'kommotiria',
    kad: [],
    city: 'Αθήνα',
    address: null,
    website: null,
    domain: null,
    phone_e164: null,
    rating: null,
    reviews_count: null,
    signals: {},
    sources: {},
    contacts: [],
    ...over,
  };
}

describe('LeadStore', () => {
  it('dedupe: ΑΦΜ, domain, τηλέφωνο, όνομα+πόλη· συγχώνευση κρατά την αρχική πηγή', async () => {
    const store = new LeadStore(await openSqlite(':memory:'));
    const at = '2026-10-14T00:00:00.000Z';
    const a = await store.upsert(lead({ afm: '999000001', name_norm: 'a', sources: { afm: { source: 'gemi', collected_at: at } } }));
    const b = await store.upsert(lead({ afm: '999000001', name_norm: 'a', domain: 'a.example', sources: { domain: { source: 'places', collected_at: at } } }));
    expect(b).toEqual({ id: a.id, created: false });
    const c = await store.upsert(lead({ domain: 'a.example', name_norm: 'x', phone_e164: '+302100000001' }));
    expect(c.id).toBe(a.id);
    const d = await store.upsert(lead({ phone_e164: '+302100000001', name_norm: 'y' }));
    expect(d.id).toBe(a.id);
    const e = await store.upsert(lead({ name_norm: 'a', city: 'Αθήνα' }));
    expect(e.id).toBe(a.id);
    const f = await store.upsert(lead({ name_norm: 'a', city: 'Πάτρα' }));
    expect(f.created).toBe(true);
    const biz = await store.getBusiness(a.id);
    expect(biz?.sources.afm?.source).toBe('gemi');
    expect(biz?.sources.domain?.source).toBe('places');
    expect(biz?.phone_e164).toBe('+302100000001');
  });

  it('suppression: email, domain, τηλέφωνο, ΑΦΜ, και hash μετά από gdpr-erase', async () => {
    const store = new LeadStore(await openSqlite(':memory:'));
    await store.suppress('email', 'Info@A.example', 'unsubscribe');
    await store.suppress('afm', '999000002', 'αίτημα στο τηλέφωνο');
    expect(await store.suppressedReason({ emails: ['info@a.example'] })).toMatch(/unsubscribe/);
    expect(await store.suppressedReason({ afm: '999000002' })).toMatch(/τηλέφωνο/);
    expect(await store.suppressedReason({ domain: 'b.example' })).toBeNull();
    await store.suppress('hash', sha256('b.example'), 'gdpr-erase');
    expect(await store.suppressedReason({ domain: 'b.example' })).toMatch(/hash/);
  });

  it('gdpr-erase: σβήνει επιχείρηση, επαφές, μέλη καμπάνιας, events· μένει μόνο hash', async () => {
    const db = await openSqlite(':memory:');
    const store = new LeadStore(db);
    const { id } = await store.upsert(
      lead({ domain: 'erase.example', contacts: [{ kind: 'email', value: 'info@erase.example', value_norm: 'info@erase.example', source: 'website' }] }),
    );
    await store.setCellLead('kommotiria-booking', id, 70, []);
    await db.run("insert into campaigns (id, cell_id, channel, created_at) values ('c1', 'kommotiria-booking', 'email_gr', '2026-10-14')");
    await db.run("insert into campaign_members (campaign_id, business_id) values ('c1', ?)", [id]);
    await db.run("insert into events (id, campaign_id, business_id, type, occurred_at, created_at) values ('e1', 'c1', ?, 'sent', '2026-10-14', '2026-10-14')", [id]);
    await store.suppress('email', 'info@erase.example', 'unsubscribe');

    const r = await store.gdprErase('info@erase.example');
    expect(r.businesses).toBe(1);
    for (const t of ['businesses', 'contacts', 'cell_leads', 'campaign_members', 'events']) {
      expect((await db.get<{ n: number }>(`select count(*) as n from ${t}`))!.n, t).toBe(0);
    }
    const supp = await db.all<{ kind: string; value: string }>('select kind, value from suppression');
    expect(supp.every((s) => s.kind === 'hash')).toBe(true);
    expect(JSON.stringify(supp)).not.toContain('erase.example');
    expect(await store.suppressedReason({ emails: ['info@erase.example'] })).not.toBeNull();
    expect(await store.suppressedReason({ domain: 'erase.example' })).not.toBeNull();
    expect((await db.get<{ subject_hash: string }>('select subject_hash from gdpr_requests'))!.subject_hash).toBe(sha256('info@erase.example'));
  });

  it('retention: ανωνυμοποιεί όσα δεν μετατράπηκαν και είναι παλιά', async () => {
    let now = new Date('2025-01-01T00:00:00Z');
    const store = new LeadStore(await openSqlite(':memory:'), () => now);
    const old = await store.upsert(lead({ domain: 'old.example', contacts: [{ kind: 'email', value: 'info@old.example', value_norm: 'info@old.example', source: 'website' }] }));
    now = new Date('2026-10-01T00:00:00Z');
    const fresh = await store.upsert(lead({ domain: 'fresh.example', name_norm: 'fresh' }));
    expect(await store.retention(12)).toBe(1);
    const o = await store.getBusiness(old.id);
    expect(o).toMatchObject({ name: '[ανωνυμοποιημένο]', domain: null, website: null });
    expect(await store.contactsOf(old.id)).toEqual([]);
    expect((await store.getBusiness(fresh.id))?.domain).toBe('fresh.example');
  });
});

describe('scoring', () => {
  it('κομμωτήριο χωρίς online κράτηση > με online κράτηση, για Σύστημα κρατήσεων', () => {
    const base = { service: 'booking_system', kadMatch: true, foundByVerticalQuery: true, reviewsCount: 80, hasWebsite: true, hasRoleEmail: true, hasForm: false, hasPhone: true, currentYear: 2026 };
    const without = scoreLead({ ...base, signals: { has_online_booking: false } });
    const withB = scoreLead({ ...base, signals: { has_online_booking: true } });
    expect(without.score).toBeGreaterThan(withB.score);
    expect(without.reasons).toContain('πόνος: χωρίς online κράτηση');
    expect(without.score).toBeLessThanOrEqual(100);
  });
});

describe('schema', () => {
  it('SQLite και Supabase migration έχουν ίδιους πίνακες και στήλες', () => {
    const pg = fs.readFileSync(path.join(REAL_REPO, 'supabase/migrations/20261014000001_leads.sql'), 'utf8');
    expect(tablesAndColumns(SQLITE_SCHEMA)).toEqual(tablesAndColumns(pg));
    // RLS σε κάθε πίνακα του migration
    for (const t of Object.keys(tablesAndColumns(pg))) expect(pg).toMatch(new RegExp(`alter table ${t}\\s+enable row level security`));
  });
});

async function runWorld(size: number, budget: number, suppress?: (store: LeadStore, w: FakeWorld) => Promise<void>, existing?: { store: LeadStore; world: FakeWorld }) {
  const world = existing?.world ?? new FakeWorld({ size, vertical: 'kommotiria', kad: '96.02', terms: TERMS, cities: cfg.cities });
  const store = existing?.store ?? new LeadStore(await openSqlite(':memory:'));
  if (suppress) await suppress(store, world);
  const lim = new RateLimiter(Date.now, async () => {});
  const env: LeadEnv = {
    store,
    sources: [new GemiSource(cfg.sources.gemi, 'k', world.http, lim), new PlacesSource(cfg.sources.places, 'k', world.http, lim)],
    enricher: new WebsiteEnricher(cfg, world.http, lim),
    cfg,
    now: () => new Date(),
    log: () => {},
  };
  const stats = await runLeadSourcing(env, {
    cellId: 'kommotiria-booking',
    vertical: 'kommotiria',
    service: 'booking_system',
    kad: ['96.02'],
    placesTerms: TERMS,
    cities: cfg.cities,
    budget,
  });
  return { world, store, stats, db: store.db };
}

describe('pipeline σε όγκο (κριτήριο Φάσης 5)', () => {
  it('5.000+ ψεύτικα leads: χωρίς διπλότυπα, σωστό suppression και scoring, σε λογικό χρόνο', async () => {
    const t0 = Date.now();
    const suppressed = new Set<number>();
    const { world, stats, db } = await runWorld(5400, 100_000, async (store, w) => {
      // 30 επιχειρήσεις στη suppression list με διάφορους τρόπους
      for (const b of w.businesses.filter((x) => !x.closed).slice(0, 30)) {
        suppressed.add(b.i);
        if (b.i % 3 === 0) await store.suppress('afm', b.afm, 'test');
        else if (b.i % 3 === 1 && b.domain) await store.suppress('domain', b.domain, 'test');
        else await store.suppress('hash', sha256(b.afm), 'gdpr-erase');
      }
    });
    const ms = Date.now() - t0;
    const count = async (sql: string) => Number((await db.get<{ n: number }>(sql))!.n);

    const expected = world.expectedUnique - suppressed.size;
    expect(expected).toBeGreaterThan(5000);
    expect(stats.exhausted).toBe(true);
    expect(stats.fetched).toBeGreaterThan(stats.inserted); // υπήρχαν διπλότυπα στις πηγές
    expect(stats.merged).toBeGreaterThan(1000);
    expect(await count('select count(*) as n from businesses')).toBe(expected);
    expect(await count('select count(*) as n from cell_leads')).toBe(expected);

    for (const col of ['afm', 'gemi', 'domain', 'phone_e164']) {
      expect(await count(`select count(*) as n from (select ${col} from businesses where ${col} is not null group by ${col} having count(*) > 1)`), col).toBe(0);
    }
    expect(await count("select count(*) as n from (select name_norm, city from businesses group by name_norm, city having count(*) > 1)")).toBe(0);

    // Καμία από τις suppressed δεν μπήκε
    const afms = new Set((await db.all<{ afm: string }>('select afm from businesses')).map((r) => r.afm));
    for (const i of suppressed) expect(afms.has(world.businesses[i]!.afm)).toBe(false);

    // Μόνο εταιρικά emails (ρόλος, στο domain της επιχείρησης), κανένα κινητό από το ΓΕΜΗ
    const emails = await db.all<{ value_norm: string; domain: string }>("select c.value_norm, b.domain from contacts c join businesses b on b.id = c.business_id where c.kind = 'email'");
    expect(emails.length).toBeGreaterThan(500);
    for (const e of emails) {
      expect(e.value_norm.startsWith('info@')).toBe(true);
      expect(e.value_norm.endsWith(`@${e.domain}`)).toBe(true);
    }
    expect(stats.personalEmailsDropped).toBeGreaterThan(0);
    expect(stats.mobilesDropped).toBeGreaterThan(0);
    const gemiOnlyMobiles = await count(
      "select count(*) as n from contacts c where c.kind = 'phone' and c.value_norm like '+3069%' and c.source = 'gemi'",
    );
    expect(gemiOnlyMobiles).toBe(0);

    // Κάθε πεδίο έχει πηγή και ημερομηνία
    const sample = await db.all<{ sources: string }>('select sources from businesses limit 50');
    for (const s of sample) {
      const src = JSON.parse(s.sources) as Record<string, { source: string; collected_at: string }>;
      expect(src.name?.source).toMatch(/gemi|places/);
      expect(src.name?.collected_at).toMatch(/^\d{4}-/);
    }

    // Scoring: όσοι δεν έχουν online κράτηση είναι κατά μέσο όρο ψηλότερα
    const avg = async (cond: string) =>
      Number((await db.get<{ a: number }>(`select avg(cl.score) as a from cell_leads cl join businesses b on b.id = cl.business_id where b.domain is not null and ${cond}`))!.a);
    expect(await avg("json_extract(b.signals, '$.has_online_booking') = 0")).toBeGreaterThan(await avg("json_extract(b.signals, '$.has_online_booking') = 1"));

    expect(ms).toBeLessThan(60_000);
  }, 120_000);

  it('σέβεται το όριο και συνεχίζει από τον cursor χωρίς διπλότυπα', async () => {
    const first = await runWorld(600, 250);
    expect(first.stats).toMatchObject({ inserted: 250, stoppedBy: 'budget', exhausted: false });
    const second = await runWorld(600, 100_000, undefined, { store: first.store, world: first.world });
    expect(second.stats.exhausted).toBe(true);
    const n = Number((await first.db.get<{ n: number }>('select count(*) as n from businesses'))!.n);
    expect(n).toBe(first.world.expectedUnique);
  });
});

describe('suppression ανάμεσα σε πηγές', () => {
  it('αν η επιχείρηση μπήκε πρώτα από άλλη πηγή και μετά βρεθεί suppressed, σβήνεται', async () => {
    const store = new LeadStore(await openSqlite(':memory:'));
    const placesFirst = await store.upsert(lead({ name_norm: 'salon x', city: 'Αθήνα', domain: 'x.example' }));
    await store.setCellLead('kommotiria-booking', placesFirst.id, 80, []);
    await store.suppress('afm', '999000077', 'αίτημα');
    const keys = { afm: '999000077', nameCity: 'salon x|Αθήνα' };
    expect(await store.suppressedReason(keys)).not.toBeNull();
    await store.propagateSuppression(keys, { afm: '999000077', gemi: null, domain: null, phone_e164: null, name_norm: 'salon x', city: 'Αθήνα' });
    expect(await store.getBusiness(placesFirst.id)).toBeNull();
    expect(await store.topLeads('kommotiria-booking', 10)).toEqual([]);
    // και δεν ξαναμπαίνει από το Places με όνομα+πόλη
    expect(await store.suppressedReason({ nameCity: 'salon x|Αθήνα' })).not.toBeNull();
  });
});
