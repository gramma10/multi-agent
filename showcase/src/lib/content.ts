import fs from 'node:fs';
import path from 'node:path';
import { Marked } from 'marked';
import { parse } from 'yaml';

/**
 * Περιεχόμενο από το content/ (το γράφει ο orchestrator από το pipeline). Διαβάζεται μόνο
 * στο build (server), δεν φτάνει JS στον browser.
 *
 * Το markdown έρχεται από agents που διάβασαν εξωτερικές πηγές: κάθε raw HTML πετιέται.
 */

const CONTENT_DIR = path.join(process.cwd(), 'content');

const md = new Marked({
  gfm: true,
  renderer: {
    html: () => '',
  },
});

export interface Doc {
  data: Record<string, string>;
  html: string;
}

function readDoc(file: string): Doc | null {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  const data = m ? ((parse(m[1]!) as Record<string, string>) ?? {}) : {};
  const body = (m ? m[2]! : raw).replace(/<!--[\s\S]*?-->/g, '');
  return { data, html: md.parse(body, { async: false }) };
}

/** Το κείμενο της σελίδας ενός demo (page.md). */
export function demoPage(slug: string): Doc | null {
  return readDoc(path.join(CONTENT_DIR, 'demos', `${slug}.md`));
}

/** Εισαγωγή της SEO σελίδας ενός κλάδου. */
export function verticalIntro(vertical: string): Doc | null {
  return readDoc(path.join(CONTENT_DIR, 'seo', vertical, '_intro.md'));
}

/** Η ενότητα ενός demo για τη SEO σελίδα του κλάδου του. */
export function seoSection(vertical: string, slug: string): Doc | null {
  return readDoc(path.join(CONTENT_DIR, 'seo', vertical, `${slug}.md`));
}
