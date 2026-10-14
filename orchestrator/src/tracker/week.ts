/** ISO εβδομάδα (Δευτέρα–Κυριακή, UTC): «2026-W42». */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Αρχή (Δευτέρα 00:00 UTC) και τέλος (επόμενη Δευτέρα) μιας ISO εβδομάδας. */
export function weekRange(week: string): { start: Date; end: Date } {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) throw new Error(`Μη έγκυρη εβδομάδα «${week}» (π.χ. 2026-W42)`);
  const year = Number(m[1]);
  const w = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (w - 1) * 7);
  const end = new Date(monday);
  end.setUTCDate(monday.getUTCDate() + 7);
  if (isoWeek(monday) !== week) throw new Error(`Μη έγκυρη εβδομάδα «${week}»`);
  return { start: monday, end };
}

/** Η τελευταία ολοκληρωμένη εβδομάδα (αυτή που αναφέρει το report της Δευτέρας). */
export function previousWeek(now: Date): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 7);
  return isoWeek(d);
}
