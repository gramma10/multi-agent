import { DryRunApprovals } from './approvals/dry-run.ts';
import { GitHubApprovals, type GhExec } from './approvals/github.ts';
import type { ApprovalsAdapter } from './approvals/types.ts';
import { loadConfig, type FactoryConfig } from './config.ts';
import { prepareStateRoot, resolvePaths, type FactoryPaths } from './paths.ts';
import { FixtureWorker } from './workers/fixture.ts';
import { WorkerPool } from './workers/pool.ts';
import type { Worker } from './workers/types.ts';

export interface FactoryContext {
  ps: FactoryPaths;
  config: FactoryConfig;
  pool: WorkerPool;
  approvals: ApprovalsAdapter;
  now: () => Date;
  log: (msg: string) => void;
  env: NodeJS.ProcessEnv;
}

export interface CreateContextOptions {
  dryRun: boolean;
  repoRoot?: string;
  stateRoot?: string;
  now?: () => Date;
  log?: (msg: string) => void;
  env?: NodeJS.ProcessEnv;
  /** Αν δοθεί, αντικαθιστά όλους τους workers (tests). Σε dry-run η προεπιλογή είναι FixtureWorker. */
  worker?: Worker;
  workers?: Record<string, Worker>;
  approvals?: ApprovalsAdapter;
  gh?: GhExec;
}

export function createContext(opts: CreateContextOptions): FactoryContext {
  const ps = resolvePaths({ dryRun: opts.dryRun, repoRoot: opts.repoRoot, stateRoot: opts.stateRoot });
  prepareStateRoot(ps);
  const config = loadConfig(ps);
  const now = opts.now ?? (() => new Date());
  const env = opts.env ?? process.env;
  const log = opts.log ?? ((m: string) => console.log(m));

  const override = opts.worker ?? (opts.dryRun && !opts.workers ? new FixtureWorker() : undefined);
  const pool = new WorkerPool({ ps, config: config.workers, now, override, workers: opts.workers });

  let approvals = opts.approvals;
  if (!approvals) {
    const repo = env.GITHUB_REPOSITORY;
    if (opts.dryRun || !repo) {
      if (!opts.dryRun) log('ℹ️  Δεν ορίστηκε GITHUB_REPOSITORY: οι εγκρίσεις πηγαίνουν στο review/REVIEW.md.');
      approvals = new DryRunApprovals(ps, now);
    } else {
      approvals = new GitHubApprovals(repo, config.gates, opts.gh);
    }
  }
  return { ps, config, pool, approvals, now, log, env };
}
