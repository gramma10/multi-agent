import fs from 'node:fs';
import path from 'node:path';
import { p, type FactoryPaths } from './paths.ts';

const STALE_MS = 6 * 60 * 60 * 1000;

export class LockedError extends Error {
  constructor(info: string) {
    super(`Τρέχει ήδη άλλος orchestrator (${info}). Αν είσαι σίγουρος ότι δεν τρέχει, σβήσε το .factory.lock.`);
    this.name = 'LockedError';
  }
}

/**
 * Lock σε αρχείο, για όταν δεν υπάρχει concurrency group (π.χ. routines ή τοπικά).
 * Ένα lock παλαιότερο από 6 ώρες θεωρείται ορφανό (crash) και αντικαθίσταται.
 */
export function acquireLock(ps: FactoryPaths, now: Date): () => void {
  const file = p.lock(ps);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = JSON.stringify({ pid: process.pid, at: now.toISOString() });
  try {
    fs.writeFileSync(file, body, { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    let info = '?';
    let at = 0;
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8')) as { pid: number; at: string };
      info = `pid ${j.pid}, από ${j.at}`;
      at = new Date(j.at).getTime();
    } catch {
      /* χαλασμένο lock: θεωρείται ορφανό */
    }
    if (at && now.getTime() - at < STALE_MS) throw new LockedError(info);
    fs.writeFileSync(file, body);
  }
  return () => {
    try {
      fs.unlinkSync(file);
    } catch {
      /* ήδη σβησμένο */
    }
  };
}
