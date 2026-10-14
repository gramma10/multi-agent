import fs from 'node:fs';
import path from 'node:path';

/** Πεζά, χωρίς τόνους: «Επανάσταση» και «επανασταση» ταιριάζουν. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Διαβάζει τη «μαύρη λίστα» λέξεων από το config/brand.md (ενότητα «Λέξεις που δεν χρησιμοποιούμε»),
 * ώστε η λίστα να ζει σε ένα σημείο και να την αλλάζει άνθρωπος χωρίς κώδικα.
 */
export function parseBannedPhrases(brandMd: string): string[] {
  const m = /###\s*Λέξεις που δεν χρησιμοποιούμε\s*\n+([\s\S]*?)(?:\n#{2,3}\s|$)/.exec(brandMd);
  if (!m) return [];
  return m[1]!
    .replace(/\([^)]*\)/g, '') // σχόλια σε παρένθεση
    .split(/[,\n]/)
    .flatMap((x) => x.split(' / '))
    .map((x) => x.replace(/[«»"“”.]/g, '').trim())
    .filter((x) => x.length > 2);
}

export function loadBannedPhrases(repoRoot: string): string[] {
  const file = path.join(repoRoot, 'config', 'brand.md');
  return fs.existsSync(file) ? parseBannedPhrases(fs.readFileSync(file, 'utf8')) : [];
}

/** Ποιες απαγορευμένες φράσεις εμφανίζονται στο κείμενο (σε όριο λέξης). */
export function findBanned(text: string, banned: readonly string[]): string[] {
  const t = ` ${fold(text).replace(/[^\p{L}\p{N}%]+/gu, ' ')} `;
  return banned.filter((b) => {
    const f = fold(b).replace(/[^\p{L}\p{N}%]+/gu, ' ').trim();
    return f && t.includes(` ${f} `);
  });
}

/** Φράσεις που υπονοούν ότι ένα demo είναι έργο για πελάτη ή ότι έχουμε πελάτες/αποτελέσματα. */
const CLIENT_CLAIMS: RegExp[] = [
  /πελατ(?:ης|ες|ων|ισσα|ισσες)\s+μας/,
  /για\s+(?:τον|την|το)\s+πελατη\s+μας/,
  /φτιαξαμε\s+για\s+(?:το|τον|την|τη)\s+(?!demo)/,
  /case stud/,
  /μας\s+εμπιστευ/,
  /συνεργαζομαστε\s+(?:ηδη\s+)?με/,
  /εχουμε\s+βοηθησει/,
  /testimonial/,
];

export function findClientClaims(text: string): string[] {
  const t = fold(text);
  return CLIENT_CLAIMS.filter((re) => re.test(t)).map((re) => re.source);
}

/**
 * Νούμερα-ισχυρισμοί χωρίς πηγή: ποσοστά, «x φορές», «+50». Μια γραμμή περνά αν έχει link,
 * «πηγή» ή `{{TODO`. Τηλέφωνα, ώρες, ημερομηνίες και τιμές της κλίμακας προσφορών δεν πιάνονται.
 */
export function findUnsourcedNumbers(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    if (/https?:\/\/|πηγή|πηγη|\{\{TODO/i.test(line)) continue;
    const hits = line.match(/\d+(?:[.,]\d+)?\s*%|\b\d+\s*(?:x|φορές)\b|\+\s?\d{2,}/g);
    if (hits) out.push(...hits.map((h) => `«${h.trim()}» στη γραμμή: ${line.trim().slice(0, 80)}`));
  }
  return out;
}
