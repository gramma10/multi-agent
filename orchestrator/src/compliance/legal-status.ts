import fs from 'node:fs';
import type { ChannelsConfig, LegalStatus } from '../config.ts';

export interface LegalRow {
  channel: string;
  status: LegalStatus;
  date: string;
  by: string;
}

/**
 * Διαβάζει τον πίνακα του compliance/LEGAL_STATUS.md. Ένα κανάλι είναι `approved` ΜΟΝΟ αν η γραμμή
 * έχει status approved, ημερομηνία YYYY-MM-DD και όνομα. Ό,τι άλλο → pending. `blocked` → blocked.
 */
export function parseLegalStatus(md: string): Map<string, LegalRow> {
  const rows = new Map<string, LegalRow>();
  for (const line of md.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 4) continue;
    const [channel, statusRaw, date, by] = cells as [string, string, string, string];
    if (!/^[a-z0-9_]+$/.test(channel)) continue; // επικεφαλίδα ή διαχωριστικό
    const s = statusRaw.toLowerCase();
    let status: LegalStatus = 'pending';
    if (s === 'blocked') status = 'blocked';
    else if (s === 'approved' && /^\d{4}-\d{2}-\d{2}$/.test(date) && by.length > 0) status = 'approved';
    rows.set(channel, { channel, status, date, by });
  }
  return rows;
}

export function readLegalStatus(file: string): Map<string, LegalRow> {
  return fs.existsSync(file) ? parseLegalStatus(fs.readFileSync(file, 'utf8')) : new Map();
}

/** Διπλό κλειδί (D010): approved και στο channels.yaml και στο LEGAL_STATUS.md. */
export function channelLegal(channel: string, channels: ChannelsConfig, legal: Map<string, LegalRow>): { ok: boolean; reason: string } {
  const c = channels.channels.find((x) => x.id === channel);
  if (!c) return { ok: false, reason: `άγνωστο κανάλι «${channel}»` };
  const row = legal.get(channel);
  if (row?.status === 'blocked' || c.legal_status === 'blocked') return { ok: false, reason: `το κανάλι ${channel} είναι blocked` };
  if (c.legal_status !== 'approved') return { ok: false, reason: `το κανάλι ${channel} είναι «${c.legal_status}» στο config/channels.yaml` };
  if (row?.status !== 'approved') {
    return { ok: false, reason: `το κανάλι ${channel} δεν είναι approved στο compliance/LEGAL_STATUS.md (χρειάζεται status, ημερομηνία και όνομα)` };
  }
  return { ok: true, reason: `approved στις ${row.date} από ${row.by}` };
}
