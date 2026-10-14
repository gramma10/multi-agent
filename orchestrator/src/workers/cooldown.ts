import fs from 'node:fs';
import { p, type FactoryPaths } from '../paths.ts';
import { writeFileAtomic } from '../util/fs.ts';

export interface WorkerStateEntry {
  cooling_down_until: string;
  reason: string;
  since: string;
}

export interface WorkerState {
  workers: Record<string, WorkerStateEntry>;
}

/** Αποθήκη cooldowns στο reports/worker-state.json, ώστε να επιβιώνει ανάμεσα στις εκτελέσεις. */
export class CooldownStore {
  constructor(private readonly ps: FactoryPaths) {}

  read(): WorkerState {
    try {
      return JSON.parse(fs.readFileSync(p.workerState(this.ps), 'utf8')) as WorkerState;
    } catch {
      return { workers: {} };
    }
  }

  coolingUntil(worker: string, now: Date): Date | null {
    const e = this.read().workers[worker];
    if (!e) return null;
    const until = new Date(e.cooling_down_until);
    return until > now ? until : null;
  }

  set(worker: string, until: Date, reason: string, now: Date): void {
    const s = this.read();
    s.workers[worker] = { cooling_down_until: until.toISOString(), reason, since: now.toISOString() };
    writeFileAtomic(p.workerState(this.ps), `${JSON.stringify(s, null, 2)}\n`);
  }

  /** Καθαρίζει όσα cooldowns έχουν λήξει. */
  prune(now: Date): void {
    const s = this.read();
    let changed = false;
    for (const [w, e] of Object.entries(s.workers)) {
      if (new Date(e.cooling_down_until) <= now) {
        delete s.workers[w];
        changed = true;
      }
    }
    if (changed) writeFileAtomic(p.workerState(this.ps), `${JSON.stringify(s, null, 2)}\n`);
  }
}
