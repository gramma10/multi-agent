import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { findBanned, findClientClaims, findUnsourcedNumbers } from './brand.ts';

export interface Frontmatter {
  data: Record<string, unknown>;
  body: string;
}

export function splitFrontmatter(md: string): Frontmatter {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(md);
  if (!m) return { data: {}, body: md };
  return { data: (parse(m[1]!) as Record<string, unknown>) ?? {}, body: m[2]! };
}

const stripComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '');
export const wordCount = (s: string) => stripComments(s).split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;

export const PAGE_HEADINGS = ['Το πρόβλημα', 'Πώς δουλεύει', 'ΠΡΙΝ → ΜΕΤΑ', 'Τι περιλαμβάνει ένα pilot', 'Κλείσε τον Χάρτη AI'];

/** Κοινοί έλεγχοι ύφους/ειλικρίνειας για κάθε κείμενο που βγαίνει προς τα έξω. */
export function lintText(file: string, text: string, banned: readonly string[]): string[] {
  const t = stripComments(text);
  return [
    ...findBanned(t, banned).map((b) => `${file}: απαγορευμένη φράση «${b}» (config/brand.md)`),
    ...findClientClaims(t).map((r) => `${file}: φράση που υπονοεί πελάτη/αποτέλεσμα (${r})`),
    ...findUnsourcedNumbers(t).map((n) => `${file}: νούμερο χωρίς πηγή ${n}`),
  ];
}

/**
 * Ελέγχει ένα content pack (pipeline/<slug>/content/) όπως το ορίζει το agents/content.md.
 * Επιστρέφει λίστα προβλημάτων· κενή = περνά.
 */
export function lintContentPack(dir: string, banned: readonly string[]): string[] {
  const read = (f: string) => {
    const p = path.join(dir, f);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  };
  const problems: string[] = [];

  const page = read('page.md');
  if (page == null) problems.push('λείπει το page.md');
  else {
    const { data, body } = splitFrontmatter(page);
    for (const k of ['title', 'description', 'vertical', 'service']) {
      if (typeof data[k] !== 'string' || !(data[k] as string).trim()) problems.push(`page.md: λείπει το frontmatter «${k}»`);
    }
    if (typeof data.description === 'string' && data.description.length > 155) {
      problems.push(`page.md: description ${data.description.length} χαρακτήρες (όριο 155)`);
    }
    for (const h of PAGE_HEADINGS) if (!body.includes(`## ${h}`)) problems.push(`page.md: λείπει η ενότητα «${h}»`);
    if (!/demo/i.test(body)) problems.push('page.md: δεν λέει πουθενά ότι είναι demo');
    problems.push(...lintText('page.md', page, banned));
  }

  const reel = read('reel.md');
  if (reel == null) problems.push('λείπει το reel.md');
  else {
    const reels = reel.split(/^###\s+Reel/m).slice(1);
    if (reels.length < 2 || reels.length > 3) problems.push(`reel.md: χρειάζονται 2–3 scripts, βρέθηκαν ${reels.length}`);
    reels.forEach((r, i) => {
      if (!/Hook/.test(r)) problems.push(`reel.md: το Reel ${i + 1} δεν έχει Hook`);
      if (!/CTA/.test(r)) problems.push(`reel.md: το Reel ${i + 1} δεν έχει CTA`);
    });
    problems.push(...lintText('reel.md', reel, banned));
  }

  const loom = read('loom.md');
  if (loom == null) problems.push('λείπει το loom.md');
  else problems.push(...lintText('loom.md', loom, banned));

  const li = read('linkedin.md');
  if (li == null) problems.push('λείπει το linkedin.md');
  else {
    if (li.length > 1300) problems.push(`linkedin.md: ${li.length} χαρακτήρες (όριο 1.300)`);
    if (!li.includes('{{demo_url}}')) problems.push('linkedin.md: λείπει το {{demo_url}}');
    if (!li.includes('{{booking_url}}')) problems.push('linkedin.md: λείπει το {{booking_url}} (CTA Χάρτη AI)');
    problems.push(...lintText('linkedin.md', li, banned));
  }

  const seo = read('seo-section.md');
  if (seo == null) problems.push('λείπει το seo-section.md');
  else {
    const n = wordCount(seo);
    if (n < 150 || n > 300) problems.push(`seo-section.md: ${n} λέξεις (150–300)`);
    problems.push(...lintText('seo-section.md', seo, banned));
  }
  return problems;
}

export function lintVerticalIntro(file: string, banned: readonly string[]): string[] {
  if (!fs.existsSync(file)) return [`λείπει το ${file}`];
  const md = fs.readFileSync(file, 'utf8');
  const { data, body } = splitFrontmatter(md);
  const problems: string[] = [];
  if (typeof data.title !== 'string') problems.push('intro.md: λείπει το frontmatter «title»');
  if (typeof data.description !== 'string') problems.push('intro.md: λείπει το frontmatter «description»');
  else if (data.description.length > 155) problems.push(`intro.md: description ${data.description.length} χαρακτήρες (όριο 155)`);
  const n = wordCount(body);
  if (n < 80 || n > 250) problems.push(`intro.md: ${n} λέξεις (100–200 περίπου)`);
  problems.push(...lintText('intro.md', md, banned));
  return problems;
}
