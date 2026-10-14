import { createHash } from 'node:crypto';

const LEGAL_FORMS = new Set(['ike', 'ικε', 'επε', 'οε', 'εε', 'αε', 'ltd', 'llc', 'sa', 'ι', 'κ', 'ε', 'π', 'ο', 'α']);

/** Πεζά, χωρίς τόνους, χωρίς σημεία στίξης, χωρίς νομική μορφή (Ι.Κ.Ε., Ο.Ε. …): για σύγκριση ονομάτων. */
export function normName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((t) => t && !LEGAL_FORMS.has(t))
    .join(' ');
}

/**
 * Ελληνικό τηλέφωνο σε E.164 (+30XXXXXXXXXX). Δέχεται «210 123 4567», «+30 210…», «0030…».
 * Επιστρέφει null αν δεν είναι έγκυρο ελληνικό 10ψήφιο.
 */
export function phoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('0030')) d = d.slice(4);
  else if (d.startsWith('30') && d.length === 12) d = d.slice(2);
  if (!/^[26]\d{9}$/.test(d)) return null;
  return `+30${d}`;
}

/** Κινητό (69x). Τα προσωπικά κινητά δεν κρατιούνται, εκτός αν δηλώνονται ως τηλέφωνο της επιχείρησης. */
export const isMobile = (e164: string) => /^\+3069\d{8}$/.test(e164);

export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return host.includes('.') ? host : null;
  } catch {
    return null;
  }
}

export function normEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase().replace(/^mailto:/, '').split('?')[0]!;
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e) ? e : null;
}

/** Τοπικό μέρος email που δείχνει ρόλο (info@, reservations@…) και όχι πρόσωπο. */
export function isRoleEmail(email: string, rolePrefixes: readonly string[]): boolean {
  const local = email.split('@')[0]!.replace(/[._-]?\d+$/, '');
  return rolePrefixes.includes(local);
}

/** Πλατφόρμες δωρεάν email: ένα gmail μιας επιχείρησης είναι συνήθως προσωπικό. */
const FREEMAIL = new Set(['gmail.com', 'yahoo.com', 'yahoo.gr', 'hotmail.com', 'hotmail.gr', 'outlook.com', 'live.com', 'otenet.gr', 'icloud.com', 'windowslive.com']);
export const isFreemail = (email: string) => FREEMAIL.has(email.split('@')[1] ?? '');

export const sha256 = (s: string) => createHash('sha256').update(s.trim().toLowerCase()).digest('hex');
