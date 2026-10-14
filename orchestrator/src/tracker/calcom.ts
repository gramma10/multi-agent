import type { HttpClient } from '../leads/http.ts';
import type { RawEvent } from './events.ts';

/**
 * Κρατήσεις «Χάρτης AI» από το Cal.com API v2 (`GET /v2/bookings`). Το σχήμα της απάντησης
 * ακολουθεί την τεκμηρίωση του v2 (D043): αν αλλάξει, η εισαγωγή από CSV export δουλεύει πάντα.
 * Το κλειδί (CAL_API_KEY) μένει στο περιβάλλον, ποτέ στο repo.
 */
export interface CalcomBooking {
  uid: string;
  status?: string;
  createdAt?: string;
  start?: string;
  attendees?: Array<{ email?: string }>;
  metadata?: Record<string, unknown>;
}

export async function fetchCalcomBookings(http: HttpClient, apiKey: string, since: Date, base = 'https://api.cal.com'): Promise<RawEvent[]> {
  const out: RawEvent[] = [];
  const take = 100;
  for (let skip = 0; skip < 10_000; skip += take) {
    const url = `${base}/v2/bookings?take=${take}&skip=${skip}&afterCreatedAt=${encodeURIComponent(since.toISOString())}`;
    const r = await http(url, { headers: { authorization: `Bearer ${apiKey}`, 'cal-api-version': '2024-08-13' } });
    if (r.status === 401 || r.status === 403) throw new Error(`Cal.com: άρνηση πρόσβασης (${r.status}). Έλεγξε το CAL_API_KEY.`);
    if (r.status >= 400) throw new Error(`Cal.com: HTTP ${r.status}`);
    const body = JSON.parse(r.body) as { data?: CalcomBooking[] };
    const page = body.data ?? [];
    for (const b of page) {
      if (/cancel|reject/i.test(b.status ?? '')) continue;
      const at = b.createdAt ?? b.start;
      if (!at) continue;
      const utm = typeof b.metadata?.utm_campaign === 'string' ? b.metadata.utm_campaign : null;
      out.push({
        key: b.uid,
        source: 'calcom',
        kind: 'call_booked',
        occurredAt: new Date(at).toISOString(),
        email: b.attendees?.[0]?.email?.toLowerCase() ?? null,
        campaignId: utm,
      });
    }
    if (page.length < take) break;
  }
  return out;
}
