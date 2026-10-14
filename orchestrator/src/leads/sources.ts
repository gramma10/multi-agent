import type { HttpClient } from './http.ts';
import { QuotaError, RateLimiter } from './http.ts';
import type { LeadsConfig, RawLead } from './types.ts';

export interface SourcePage {
  leads: RawLead[];
  /** null = τέλος για αυτό το query. */
  next: string | null;
}

export interface SourceQuery {
  /** Σταθερό κλειδί για cursor και cache, π.χ. `places:kommotiria:κομμωτήριο:Αθήνα`. */
  key: string;
  vertical: string;
  term: string;
  city?: string;
}

export interface LeadSource {
  readonly name: 'places' | 'gemi';
  queries(vertical: string, kad: string[], placesTerms: string[], cities: string[]): SourceQuery[];
  fetchPage(q: SourceQuery, cursor: string | null): Promise<SourcePage>;
}

// ---------------- Google Places API (New): Text Search ----------------

interface PlacesResponse {
  places?: Array<{
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    websiteUri?: string;
    rating?: number;
    userRatingCount?: number;
    businessStatus?: string;
  }>;
  nextPageToken?: string;
}

export class PlacesSource implements LeadSource {
  readonly name = 'places' as const;

  constructor(
    private readonly cfg: LeadsConfig['sources']['places'],
    private readonly apiKey: string,
    private readonly http: HttpClient,
    private readonly limiter: RateLimiter,
  ) {}

  queries(vertical: string, _kad: string[], terms: string[], cities: string[]): SourceQuery[] {
    return terms.flatMap((term) => cities.map((city) => ({ key: `places:${vertical}:${term}:${city}`, vertical, term, city })));
  }

  async fetchPage(q: SourceQuery, cursor: string | null): Promise<SourcePage> {
    await this.limiter.wait('places', this.cfg.requests_per_minute);
    const r = await this.http(this.cfg.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': this.cfg.field_mask },
      body: JSON.stringify({
        textQuery: `${q.term} ${q.city ?? ''}`.trim(),
        languageCode: 'el',
        regionCode: 'GR',
        pageSize: this.cfg.page_size,
        ...(cursor ? { pageToken: cursor } : {}),
      }),
    });
    if (r.status === 429 || r.status === 403) throw new QuotaError('places', `HTTP ${r.status}`);
    if (r.status !== 200) throw new Error(`places: HTTP ${r.status}: ${r.body.slice(0, 200)}`);
    const j = JSON.parse(r.body) as PlacesResponse;
    const leads: RawLead[] = (j.places ?? [])
      .filter((pl) => !pl.businessStatus || pl.businessStatus === 'OPERATIONAL')
      .map((pl) => ({
        source: 'places' as const,
        sourceId: pl.id,
        name: pl.displayName?.text ?? '',
        address: pl.formattedAddress ?? null,
        city: q.city ?? null,
        website: pl.websiteUri ?? null,
        phone: pl.internationalPhoneNumber ?? pl.nationalPhoneNumber ?? null,
        rating: pl.rating ?? null,
        reviewsCount: pl.userRatingCount ?? null,
        vertical: q.vertical,
      }))
      .filter((l) => l.name);
    return { leads, next: j.nextPageToken ?? null };
  }
}

// ---------------- ΓΕΜΗ open data ----------------

/**
 * Το σχήμα της απάντησης του ΓΕΜΗ είναι υπόθεση μέχρι να επαληθευτεί στο Swagger (D031):
 * περιμένουμε { searchResults: [{ arGemi, coNameEl, afm, city, url, phone, activities: [{ activity: { id } }] }], searchMetadata: { totalCount } }.
 * Ό,τι λείπει απλά δεν συμπληρώνεται.
 */
interface GemiCompany {
  arGemi?: string | number;
  coNameEl?: string;
  coNamesEn?: string[];
  afm?: string;
  city?: string;
  municipality?: { descr?: string };
  url?: string;
  phone?: string;
  activities?: Array<{ activity?: { id?: string } }>;
  status?: { descr?: string };
}

export class GemiSource implements LeadSource {
  readonly name = 'gemi' as const;

  constructor(
    private readonly cfg: LeadsConfig['sources']['gemi'],
    private readonly apiKey: string,
    private readonly http: HttpClient,
    private readonly limiter: RateLimiter,
  ) {}

  queries(vertical: string, kad: string[]): SourceQuery[] {
    return kad.map((k) => ({ key: `gemi:${vertical}:${k}`, vertical, term: k }));
  }

  async fetchPage(q: SourceQuery, cursor: string | null): Promise<SourcePage> {
    await this.limiter.wait('gemi', this.cfg.requests_per_minute);
    const offset = cursor ? Number(cursor) : 0;
    const url = new URL(this.cfg.endpoint);
    url.searchParams.set(this.cfg.activity_param, q.term);
    url.searchParams.set(this.cfg.offset_param, String(offset));
    url.searchParams.set(this.cfg.size_param, String(this.cfg.page_size));
    const r = await this.http(url.toString(), { headers: { api_key: this.apiKey, accept: 'application/json' } });
    if (r.status === 429) throw new QuotaError('gemi', 'HTTP 429');
    if (r.status !== 200) throw new Error(`gemi: HTTP ${r.status}: ${r.body.slice(0, 200)}`);
    const j = JSON.parse(r.body) as { searchResults?: GemiCompany[]; searchMetadata?: { totalCount?: number } };
    const rows = j.searchResults ?? [];
    const leads: RawLead[] = rows
      .filter((c) => !c.status?.descr || /ενεργ/i.test(c.status.descr))
      .map((c) => ({
        source: 'gemi' as const,
        sourceId: String(c.arGemi ?? ''),
        name: c.coNameEl ?? c.coNamesEn?.[0] ?? '',
        gemi: c.arGemi != null ? String(c.arGemi) : null,
        afm: c.afm ?? null,
        kad: (c.activities ?? []).map((a) => a.activity?.id).filter((x): x is string => !!x),
        city: c.city ?? c.municipality?.descr ?? null,
        website: c.url ?? null,
        // Τηλέφωνο από ΓΕΜΗ: συχνά προσωπικό σε ατομικές επιχειρήσεις. Το pipeline κρατά μόνο σταθερά.
        phone: c.phone ?? null,
        vertical: q.vertical,
      }))
      .filter((l) => l.name);
    const total = j.searchMetadata?.totalCount ?? offset + rows.length;
    const nextOffset = offset + rows.length;
    return { leads, next: rows.length > 0 && nextOffset < total ? String(nextOffset) : null };
  }
}
