import fs from 'node:fs';
import path from 'node:path';

/**
 * Δύο ρίζες:
 * - repoRoot: από εδώ διαβάζονται config/, agents/, CLAUDE.md, compliance/.
 * - stateRoot: εδώ γράφονται pipeline/, review/, reports/ και το αντίγραφο του matrix.
 *   Σε κανονική εκτέλεση είναι το ίδιο το repo. Σε --dry-run είναι το `.dry-run/`,
 *   ώστε τα fixtures να μη μολύνουν ποτέ το πραγματικό state.
 */
export interface FactoryPaths {
  repoRoot: string;
  stateRoot: string;
  dryRun: boolean;
}

export const DRY_RUN_DIR = '.dry-run';

export function findRepoRoot(start: string = process.cwd()): string {
  const fromEnv = process.env.FACTORY_ROOT;
  if (fromEnv) return path.resolve(fromEnv);
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'config', 'matrix.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`Δεν βρέθηκε η ρίζα του factory (config/matrix.yaml) πάνω από ${start}`);
    }
    dir = parent;
  }
}

export function resolvePaths(opts: { repoRoot?: string; dryRun: boolean; stateRoot?: string }): FactoryPaths {
  const repoRoot = opts.repoRoot ?? findRepoRoot();
  const stateRoot = opts.stateRoot ?? (opts.dryRun ? path.join(repoRoot, DRY_RUN_DIR) : repoRoot);
  return { repoRoot, stateRoot, dryRun: opts.dryRun };
}

export const p = {
  config: (ps: FactoryPaths, file: string) => path.join(ps.repoRoot, 'config', file),
  agentSpec: (ps: FactoryPaths, agent: string) => path.join(ps.repoRoot, 'agents', `${agent}.md`),
  legalStatus: (ps: FactoryPaths) => path.join(ps.repoRoot, 'compliance', 'LEGAL_STATUS.md'),
  pause: (ps: FactoryPaths) => path.join(ps.repoRoot, 'PAUSE'),

  /** Το matrix που ενημερώνεται (status, priority). Σε dry-run είναι αντίγραφο μέσα στο sandbox. */
  matrix: (ps: FactoryPaths) => path.join(ps.stateRoot, 'config', 'matrix.yaml'),
  pipeline: (ps: FactoryPaths) => path.join(ps.stateRoot, 'pipeline'),
  cellDir: (ps: FactoryPaths, id: string) => path.join(ps.stateRoot, 'pipeline', id),
  task: (ps: FactoryPaths, id: string) => path.join(ps.stateRoot, 'pipeline', id, 'task.yaml'),
  feedback: (ps: FactoryPaths, id: string) => path.join(ps.stateRoot, 'pipeline', id, 'feedback.md'),
  review: (ps: FactoryPaths) => path.join(ps.stateRoot, 'review', 'REVIEW.md'),
  decisions: (ps: FactoryPaths) => path.join(ps.stateRoot, 'review', 'decisions.yaml'),
  usage: (ps: FactoryPaths) => path.join(ps.stateRoot, 'reports', 'usage.jsonl'),
  workerState: (ps: FactoryPaths) => path.join(ps.stateRoot, 'reports', 'worker-state.json'),
  lock: (ps: FactoryPaths) => path.join(ps.stateRoot, '.factory.lock'),
  gatesLog: (ps: FactoryPaths) => path.join(ps.stateRoot, 'reports', 'gates-dry-run.log'),
};

/** Σε dry-run, φτιάχνει το sandbox και αντιγράφει το matrix την πρώτη φορά. */
export function prepareStateRoot(ps: FactoryPaths): void {
  if (ps.stateRoot === ps.repoRoot) return;
  const target = p.matrix(ps);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(ps.repoRoot, 'config', 'matrix.yaml'), target);
  }
}
