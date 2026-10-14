import fs from 'node:fs';
import path from 'node:path';
import type { CellDef } from './config.ts';
import type { FactoryContext } from './context.ts';
import { writeFileAtomic } from './util/fs.ts';

/**
 * Γέφυρα pipeline → showcase. Ο orchestrator (όχι κάποιος agent) αντιγράφει:
 *   pipeline/<id>/content/page.md          → showcase/content/demos/<id>.md
 *   pipeline/<id>/content/seo-section.md   → showcase/content/seo/<κλάδος>/<id>.md
 *   pipeline/_verticals/<κλάδος>/intro.md  → showcase/content/seo/<κλάδος>/_intro.md
 * και, ΜΟΝΟ μετά το Gate 3, προσθέτει το id στο showcase/content/published.json.
 *
 * Η showcase δείχνει δημόσια μόνο ό,τι είναι στο published.json. Τα υπόλοιπα φαίνονται μόνο
 * σε preview (SHOWCASE_SHOW_DRAFTS=1), ως «Πρόχειρο» και noindex.
 */

const showcase = (ctx: FactoryContext, ...p: string[]) => path.join(ctx.ps.stateRoot, 'showcase', 'content', ...p);
const pipeline = (ctx: FactoryContext, ...p: string[]) => path.join(ctx.ps.stateRoot, 'pipeline', ...p);

function copyIfExists(from: string, to: string): boolean {
  if (!fs.existsSync(from)) return false;
  const content = fs.readFileSync(from, 'utf8');
  if (fs.existsSync(to) && fs.readFileSync(to, 'utf8') === content) return false;
  writeFileAtomic(to, content);
  return true;
}

/** Συγχρονίζει το περιεχόμενο ενός κελιού στη showcase. Επιστρέφει τα αρχεία που άλλαξαν. */
export function syncCellContent(ctx: FactoryContext, cell: CellDef): string[] {
  const changed: string[] = [];
  const pairs: Array<[string, string]> = [
    [pipeline(ctx, cell.id, 'content', 'page.md'), showcase(ctx, 'demos', `${cell.id}.md`)],
    [pipeline(ctx, cell.id, 'content', 'seo-section.md'), showcase(ctx, 'seo', cell.vertical, `${cell.id}.md`)],
    [pipeline(ctx, '_verticals', cell.vertical, 'intro.md'), showcase(ctx, 'seo', cell.vertical, '_intro.md')],
  ];
  for (const [from, to] of pairs) {
    if (copyIfExists(from, to)) changed.push(path.relative(ctx.ps.stateRoot, to));
  }
  return changed;
}

export function readPublished(ctx: FactoryContext): string[] {
  const file = showcase(ctx, 'published.json');
  if (!fs.existsSync(file)) return [];
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

function writePublished(ctx: FactoryContext, ids: string[]): void {
  writeFileAtomic(showcase(ctx, 'published.json'), `${JSON.stringify([...new Set(ids)].sort(), null, 2)}\n`);
}

/** Μετά το Gate 3 (approved): συγχρονισμός + δημοσίευση. */
export function publishCell(ctx: FactoryContext, cell: CellDef): void {
  syncCellContent(ctx, cell);
  writePublished(ctx, [...readPublished(ctx), cell.id]);
  ctx.log(`📣 ${cell.id}: δημοσιεύτηκε (showcase/content/published.json). Θα φανεί στο site στο επόμενο deploy.`);
}

/** Αφαιρεί από τη δημοσίευση (π.χ. αν απορριφθεί αργότερα). */
export function unpublishCell(ctx: FactoryContext, cellId: string): void {
  const now = readPublished(ctx);
  if (now.includes(cellId)) writePublished(ctx, now.filter((x) => x !== cellId));
}
