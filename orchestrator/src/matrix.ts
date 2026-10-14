import fs from 'node:fs';
import { parseDocument, isMap, isSeq } from 'yaml';
import type { CellDef, Fit } from './config.ts';
import { p, type FactoryPaths } from './paths.ts';
import { writeFileAtomic } from './util/fs.ts';

const FIT_RANK: Record<Fit, number> = { high: 0, medium: 1, low: 2 };

/**
 * Σειρά επιλογής (§4): πρώτα fit high, μετά μεγαλύτερο priority.
 * Ισοπαλία: η σειρά στο αρχείο (σταθερό sort).
 */
export function sortCells(cells: readonly CellDef[]): CellDef[] {
  return [...cells]
    .map((c, i) => ({ c, i }))
    .sort((a, b) => FIT_RANK[a.c.fit] - FIT_RANK[b.c.fit] || b.c.priority - a.c.priority || a.i - b.i)
    .map((x) => x.c);
}

/**
 * Ενημερώνει πεδία κελιών στο matrix.yaml κρατώντας σχόλια και μορφοποίηση.
 * Κελιά που δημιουργήθηκαν αυτόματα (δεν υπάρχουν στο αρχείο) αγνοούνται.
 */
export function updateMatrixCells(
  ps: FactoryPaths,
  updates: Record<string, Partial<Pick<CellDef, 'status' | 'priority'>>>,
): void {
  const file = p.matrix(ps);
  const doc = parseDocument(fs.readFileSync(file, 'utf8'));
  const cells = doc.get('cells');
  if (!isSeq(cells)) return;
  let changed = false;
  for (const item of cells.items) {
    if (!isMap(item)) continue;
    const id = item.get('id');
    if (typeof id !== 'string' || !(id in updates)) continue;
    const u = updates[id]!;
    for (const [k, v] of Object.entries(u)) {
      if (v === undefined) continue;
      if (item.get(k) !== v) {
        item.set(k, v);
        changed = true;
      }
    }
  }
  if (changed) writeFileAtomic(file, doc.toString({ lineWidth: 0 }));
}
