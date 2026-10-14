import { randomUUID } from 'node:crypto';
import type { Db } from './db.ts';
import { json } from './db.ts';
import { sha256 } from './normalize.ts';
import type { SourceName } from './types.ts';

export type SuppressionKind = 'email' | 'domain' | 'phone' | 'afm' | 'hash';

export interface SuppressionKeys {
  emails?: string[];
  domain?: string | null;
  phone?: string | null;
  afm?: string | null;
  /** `name_norm|city`: ελέγχεται μόνο ως hash (από propagation). */
  nameCity?: string | null;
}

export interface FieldSource {
  source: SourceName;
  collected_at: string;
}

/** Ένα lead μετά την κανονικοποίηση, έτοιμο για dedupe και αποθήκευση. */
export interface NormalizedLead {
  name: string;
  name_norm: string;
  afm: string | null;
  gemi: string | null;
  vertical: string;
  kad: string[];
  city: string | null;
  address: string | null;
  website: string | null;
  domain: string | null;
  phone_e164: string | null;
  rating: number | null;
  reviews_count: number | null;
  signals: Record<string, unknown>;
  /** Για κάθε πεδίο: από ποια πηγή και πότε. */
  sources: Record<string, FieldSource>;
  contacts: Array<{ kind: 'email' | 'phone' | 'form'; value: string; value_norm: string; source: SourceName }>;
}

export interface BusinessRow {
  id: string;
  afm: string | null;
  gemi: string | null;
  name: string;
  name_norm: string;
  vertical: string | null;
  kad: string[];
  city: string | null;
  address: string | null;
  website: string | null;
  domain: string | null;
  phone_e164: string | null;
  rating: number | null;
  reviews_count: number | null;
  signals: Record<string, unknown>;
  sources: Record<string, FieldSource>;
}

const MERGEABLE = ['afm', 'gemi', 'vertical', 'city', 'address', 'website', 'domain', 'phone_e164', 'rating', 'reviews_count'] as const;

export class LeadStore {
  constructor(
    readonly db: Db,
    private readonly now: () => Date = () => new Date(),
    private readonly uuid: () => string = randomUUID,
  ) {}

  private iso(): string {
    return this.now().toISOString();
  }

  // ---------- suppression ----------

  async suppress(kind: SuppressionKind, value: string, reason: string): Promise<void> {
    await this.db.run(
      'insert into suppression (id, kind, value, reason, created_at) values (?, ?, ?, ?, ?) on conflict (kind, value) do nothing',
      [this.uuid(), kind, value.trim().toLowerCase(), reason, this.iso()],
    );
  }

  /** Επιστρέφει τον λόγο αν οποιοδήποτε από τα στοιχεία είναι στη suppression list (και ως hash). */
  async suppressedReason(keys: SuppressionKeys): Promise<string | null> {
    const pairs: Array<[SuppressionKind, string]> = [];
    if (keys.nameCity) pairs.push(['hash', sha256(keys.nameCity)]);
    for (const e of keys.emails ?? []) pairs.push(['email', e], ['hash', sha256(e)]);
    if (keys.domain) pairs.push(['domain', keys.domain], ['hash', sha256(keys.domain)]);
    if (keys.phone) pairs.push(['phone', keys.phone], ['hash', sha256(keys.phone)]);
    if (keys.afm) pairs.push(['afm', keys.afm], ['hash', sha256(keys.afm)]);
    if (pairs.length === 0) return null;
    const where = pairs.map(() => '(kind = ? and value = ?)').join(' or ');
    const row = await this.db.get<{ kind: string; reason: string }>(`select kind, reason from suppression where ${where} limit 1`, pairs.flat());
    return row ? `${row.kind}: ${row.reason}` : null;
  }

  /**
   * Όταν μια εγγραφή είναι suppressed, «κλειδώνουμε» και τα υπόλοιπα στοιχεία της (ως hash), ώστε η ίδια
   * επιχείρηση να μην ξαναμπεί από άλλη πηγή (π.χ. suppressed με ΑΦΜ από το ΓΕΜΗ, βρέθηκε μετά στο
   * Places χωρίς ΑΦΜ). Αν είχε ήδη μπει από άλλη πηγή, σβήνεται.
   */
  async propagateSuppression(keys: SuppressionKeys, match: Pick<NormalizedLead, 'afm' | 'gemi' | 'domain' | 'phone_e164' | 'name_norm' | 'city'>): Promise<void> {
    const values = [
      ...(keys.emails ?? []),
      keys.domain,
      keys.phone,
      keys.afm,
      keys.nameCity,
    ].filter((v): v is string => !!v);
    for (const v of values) await this.suppress('hash', sha256(v), 'propagated');
    const existing = await this.findMatch(match);
    if (existing) {
      await this.db.run('delete from cell_leads where business_id = ?', [existing.id]);
      await this.db.run('delete from contacts where business_id = ?', [existing.id]);
      await this.db.run('delete from campaign_members where business_id = ?', [existing.id]);
      await this.db.run('delete from businesses where id = ?', [existing.id]);
    }
  }

  // ---------- businesses ----------

  private rowToBusiness(r: Record<string, unknown>): BusinessRow {
    return {
      ...(r as unknown as BusinessRow),
      kad: json<string[]>(r.kad, []),
      signals: json<Record<string, unknown>>(r.signals, {}),
      sources: json<Record<string, FieldSource>>(r.sources, {}),
      rating: r.rating == null ? null : Number(r.rating),
      reviews_count: r.reviews_count == null ? null : Number(r.reviews_count),
    };
  }

  /**
   * Dedupe: ΑΦΜ, μετά ΓΕΜΗ, μετά domain, μετά τηλέφωνο, και τελευταία όνομα + πόλη (D030) για να
   * ενώνονται εγγραφές του ΓΕΜΗ (με ΑΦΜ, χωρίς site) με εγγραφές του Places (με site, χωρίς ΑΦΜ).
   */
  async findMatch(l: Pick<NormalizedLead, 'afm' | 'gemi' | 'domain' | 'phone_e164' | 'name_norm' | 'city'>): Promise<BusinessRow | null> {
    const tries: Array<[string, string | null]> = [
      ['afm', l.afm],
      ['gemi', l.gemi],
      ['domain', l.domain],
      ['phone_e164', l.phone_e164],
    ];
    for (const [col, val] of tries) {
      if (!val) continue;
      const r = await this.db.get(`select * from businesses where ${col} = ? and anonymized_at is null limit 1`, [val]);
      if (r) return this.rowToBusiness(r);
    }
    if (l.name_norm && l.city) {
      const r = await this.db.get('select * from businesses where name_norm = ? and city = ? and anonymized_at is null limit 1', [l.name_norm, l.city]);
      if (r) return this.rowToBusiness(r);
    }
    return null;
  }

  /** Εισάγει ή συγχωνεύει. Επιστρέφει το id και αν ήταν νέο. Ο έλεγχος suppression γίνεται πριν (pipeline). */
  async upsert(l: NormalizedLead): Promise<{ id: string; created: boolean }> {
    return this.db.transaction(async () => {
      const existing = await this.findMatch(l);
      const at = this.iso();
      let id: string;
      let created = false;
      if (!existing) {
        id = this.uuid();
        created = true;
        await this.db.run(
          `insert into businesses (id, afm, gemi, name, name_norm, vertical, kad, city, address, website, domain, phone_e164,
             rating, reviews_count, signals, sources, created_at, updated_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, l.afm, l.gemi, l.name, l.name_norm, l.vertical, l.kad, l.city, l.address, l.website, l.domain, l.phone_e164,
            l.rating, l.reviews_count, l.signals, l.sources, at, at],
        );
      } else {
        id = existing.id;
        // Συγχώνευση: συμπληρώνουμε κενά, κρατάμε την αρχική πηγή κάθε πεδίου.
        const merged: Record<string, unknown> = {};
        const sources = { ...existing.sources };
        for (const k of MERGEABLE) {
          const cur = existing[k];
          const nxt = l[k];
          if ((cur == null || cur === '') && nxt != null && nxt !== '') {
            merged[k] = nxt;
            if (l.sources[k]) sources[k] = l.sources[k]!;
          }
        }
        const kad = [...new Set([...existing.kad, ...l.kad])];
        const signals = { ...existing.signals };
        for (const [k, v] of Object.entries(l.signals)) if (v) signals[k] = v;
        const sets = Object.keys(merged).map((k) => `${k} = ?`);
        await this.db.run(
          `update businesses set ${[...sets, 'kad = ?', 'signals = ?', 'sources = ?', 'updated_at = ?'].join(', ')} where id = ?`,
          [...Object.values(merged), kad, signals, sources, at, id],
        );
      }
      for (const c of l.contacts) {
        await this.db.run(
          `insert into contacts (id, business_id, kind, value, value_norm, source, collected_at) values (?, ?, ?, ?, ?, ?, ?)
           on conflict (kind, value_norm) do nothing`,
          [this.uuid(), id, c.kind, c.value, c.value_norm, c.source, at],
        );
      }
      return { id, created };
    });
  }

  async getBusiness(id: string): Promise<BusinessRow | null> {
    const r = await this.db.get('select * from businesses where id = ?', [id]);
    return r ? this.rowToBusiness(r) : null;
  }

  async contactsOf(businessId: string): Promise<Array<{ id: string; kind: string; value_norm: string; source: string }>> {
    return this.db.all('select id, kind, value_norm, source from contacts where business_id = ?', [businessId]);
  }

  async setCellLead(cellId: string, businessId: string, score: number, reasons: string[]): Promise<void> {
    await this.db.run(
      `insert into cell_leads (cell_id, business_id, score, reasons, added_at) values (?, ?, ?, ?, ?)
       on conflict (cell_id, business_id) do update set score = excluded.score, reasons = excluded.reasons`,
      [cellId, businessId, score, reasons, this.iso()],
    );
  }

  async topLeads(cellId: string, limit: number): Promise<Array<{ business_id: string; score: number }>> {
    return this.db.all('select business_id, score from cell_leads where cell_id = ? order by score desc, business_id limit ?', [cellId, limit]);
  }

  // ---------- cursors, cache, όριο ημέρας ----------

  async getCursor(key: string): Promise<{ cursor: string | null; exhausted: boolean }> {
    const r = await this.db.get<{ cursor: string | null; exhausted: number | boolean }>('select cursor, exhausted from lead_cursors where key = ?', [key]);
    return { cursor: r?.cursor ?? null, exhausted: Boolean(r?.exhausted) };
  }

  async setCursor(key: string, cursor: string | null, exhausted: boolean): Promise<void> {
    await this.db.run(
      `insert into lead_cursors (key, cursor, exhausted, updated_at) values (?, ?, ?, ?)
       on conflict (key) do update set cursor = excluded.cursor, exhausted = excluded.exhausted, updated_at = excluded.updated_at`,
      [key, cursor, exhausted, this.iso()],
    );
  }

  async cacheGet<T>(key: string, maxAgeDays: number): Promise<T | null> {
    const r = await this.db.get<{ response: unknown; fetched_at: string }>('select response, fetched_at from api_cache where key = ?', [key]);
    if (!r) return null;
    const age = this.now().getTime() - new Date(r.fetched_at).getTime();
    return age > maxAgeDays * 86_400_000 ? null : json<T | null>(r.response, null);
  }

  async cachePut(key: string, value: unknown): Promise<void> {
    await this.db.run(
      `insert into api_cache (key, response, fetched_at) values (?, ?, ?)
       on conflict (key) do update set response = excluded.response, fetched_at = excluded.fetched_at`,
      [key, value, this.iso()],
    );
  }

  async importedToday(): Promise<number> {
    const r = await this.db.get<{ imported: number }>('select imported from lead_daily where day = ?', [this.iso().slice(0, 10)]);
    return Number(r?.imported ?? 0);
  }

  async addImported(n: number): Promise<void> {
    await this.db.run(
      `insert into lead_daily (day, imported) values (?, ?) on conflict (day) do update set imported = lead_daily.imported + excluded.imported`,
      [this.iso().slice(0, 10), n],
    );
  }

  // ---------- στατιστικά (χωρίς προσωπικά δεδομένα) ----------

  async cellStats(cellId: string): Promise<{ total: number; withEmail: number; withForm: number; withPhone: number; buckets: Record<string, number> }> {
    const total = await this.db.get<{ n: number }>('select count(*) as n from cell_leads where cell_id = ?', [cellId]);
    const kinds = await this.db.all<{ kind: string; n: number }>(
      `select c.kind, count(distinct c.business_id) as n from contacts c join cell_leads cl on cl.business_id = c.business_id
       where cl.cell_id = ? group by c.kind`,
      [cellId],
    );
    const b = await this.db.all<{ bucket: number; n: number }>(
      'select (score / 20) as bucket, count(*) as n from cell_leads where cell_id = ? group by bucket order by bucket',
      [cellId],
    );
    const k = Object.fromEntries(kinds.map((x) => [x.kind, Number(x.n)]));
    const buckets: Record<string, number> = {};
    for (const x of b) {
      const lo = Math.min(4, Number(x.bucket)) * 20;
      const key = `${lo}–${lo === 80 ? 100 : lo + 19}`;
      buckets[key] = (buckets[key] ?? 0) + Number(x.n);
    }
    return { total: Number(total?.n ?? 0), withEmail: k.email ?? 0, withForm: k.form ?? 0, withPhone: k.phone ?? 0, buckets };
  }

  // ---------- GDPR ----------

  /**
   * Άρθρο 17: σβήνει παντού ό,τι αφορά το email ή το domain και κρατά ΜΟΝΟ το hash στη suppression,
   * ώστε να μην ξαναμπεί ποτέ από άλλη πηγή.
   */
  async gdprErase(subject: string): Promise<{ businesses: number; contacts: number }> {
    const s = subject.trim().toLowerCase();
    const isEmail = s.includes('@');
    return this.db.transaction(async () => {
      const bizIds = new Set<string>();
      let contactsDeleted = 0;
      if (isEmail) {
        const rows = await this.db.all<{ id: string; business_id: string }>('select id, business_id from contacts where kind = ? and value_norm = ?', ['email', s]);
        for (const r of rows) {
          await this.db.run('delete from events where contact_id = ?', [r.id]);
          await this.db.run('delete from campaign_members where contact_id = ?', [r.id]);
          contactsDeleted += await this.db.run('delete from contacts where id = ?', [r.id]);
        }
        // Αν το email ήταν στο domain της επιχείρησης, η επιχείρηση αφορά το ίδιο πρόσωπο (ατομική): σβήνεται κι αυτή.
        const domain = s.split('@')[1]!;
        for (const b of await this.db.all<{ id: string }>('select id from businesses where domain = ?', [domain])) bizIds.add(b.id);
      } else {
        for (const b of await this.db.all<{ id: string }>('select id from businesses where domain = ?', [s])) bizIds.add(b.id);
      }
      for (const id of bizIds) {
        await this.db.run('delete from events where business_id = ?', [id]);
        await this.db.run('delete from campaign_members where business_id = ?', [id]);
        contactsDeleted += await this.db.run('delete from contacts where business_id = ?', [id]);
        await this.db.run('delete from cell_leads where business_id = ?', [id]);
        await this.db.run('delete from businesses where id = ?', [id]);
      }
      // Σβήνουμε και τυχόν suppression με το καθαρό κείμενο: κρατάμε μόνο το hash.
      await this.db.run('delete from suppression where kind in (?, ?) and value = ?', ['email', 'domain', s]);
      await this.suppress('hash', sha256(s), 'gdpr-erase');
      if (isEmail) await this.suppress('hash', sha256(s.split('@')[1]!), 'gdpr-erase (domain του email)');
      await this.db.run('insert into gdpr_requests (id, type, subject_hash, created_at) values (?, ?, ?, ?)', [this.uuid(), 'erase', sha256(s), this.iso()]);
      return { businesses: bizIds.size, contacts: contactsDeleted };
    });
  }

  /** Άρθρο 15: ό,τι έχουμε για ένα email ή domain, με πηγή και ημερομηνία συλλογής. */
  async gdprExport(subject: string): Promise<Record<string, unknown>> {
    const s = subject.trim().toLowerCase();
    const domain = s.includes('@') ? s.split('@')[1]! : s;
    const businesses = (await this.db.all('select * from businesses where domain = ?', [domain])).map((r) => this.rowToBusiness(r));
    const contacts = await this.db.all('select kind, value_norm, source, collected_at from contacts where value_norm = ? or business_id in (select id from businesses where domain = ?)', [s, domain]);
    const events = await this.db.all('select type, occurred_at, campaign_id from events where business_id in (select id from businesses where domain = ?)', [domain]);
    await this.db.run('insert into gdpr_requests (id, type, subject_hash, created_at) values (?, ?, ?, ?)', [this.uuid(), 'export', sha256(s), this.iso()]);
    return { subject: s, exported_at: this.iso(), businesses, contacts, events };
  }

  // ---------- retention ----------

  /**
   * Leads που δεν μετατράπηκαν και είναι παλαιότερα από `months`: σβήνονται τα στοιχεία επικοινωνίας
   * και ανωνυμοποιείται η επιχείρηση (κρατάμε μόνο κλάδο/πόλη για στατιστικά).
   */
  async retention(months: number): Promise<number> {
    const cutoff = new Date(this.now());
    cutoff.setMonth(cutoff.getMonth() - months);
    const c = cutoff.toISOString();
    return this.db.transaction(async () => {
      const stale = await this.db.all<{ id: string }>(
        `select id from businesses where converted = ? and anonymized_at is null and created_at < ?
         and (last_contacted_at is null or last_contacted_at < ?)`,
        [false, c, c],
      );
      for (const { id } of stale) {
        await this.db.run('delete from contacts where business_id = ?', [id]);
        await this.db.run('delete from cell_leads where business_id = ?', [id]);
        await this.db.run(
          `update businesses set name = ?, name_norm = ?, afm = null, gemi = null, address = null, website = null, domain = null,
             phone_e164 = null, signals = ?, sources = ?, anonymized_at = ?, updated_at = ? where id = ?`,
          ['[ανωνυμοποιημένο]', '', {}, {}, this.iso(), this.iso(), id],
        );
      }
      return stale.length;
    });
  }
}
