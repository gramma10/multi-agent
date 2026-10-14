import { DryRunApprovals } from './approvals/dry-run.ts';
import { GitHubApprovals, type GhExec } from './approvals/github.ts';
import type { ApprovalsAdapter } from './approvals/types.ts';
import { loadConfig, type FactoryConfig } from './config.ts';
import { prepareStateRoot, resolvePaths, type FactoryPaths } from './paths.ts';
import { defaultExec, type Exec } from './util/exec.ts';
import { FixtureWorker } from './workers/fixture.ts';
import { PreparedWorker } from './workers/prepared.ts';
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
  /** Εξωτερικές εντολές (npm, git, gh). Injectable για tests. */
  exec: Exec;
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
  exec?: Exec;
  /** `--worker prepared|fixture` από το CLI: ίδιος worker για όλους τους agents σε αυτή την εκτέλεση. */
  workerName?: string;
}

export function createContext(opts: CreateContextOptions): FactoryContext {
  const ps = resolvePaths({ dryRun: opts.dryRun, repoRoot: opts.repoRoot, stateRoot: opts.stateRoot });
  prepareStateRoot(ps);
  const config = loadConfig(ps);
  const now = opts.now ?? (() => new Date());
  const env = opts.env ?? process.env;
  const log = opts.log ?? ((m: string) => console.log(m));

  let named: Worker | undefined;
  if (opts.workerName === 'prepared') named = new PreparedWorker();
  else if (opts.workerName === 'fixture') named = new FixtureWorker();
  else if (opts.workerName) throw new Error(`Άγνωστος --worker «${opts.workerName}» (prepared | fixture)`);
  const override = opts.worker ?? named ?? (opts.dryRun && !opts.workers ? new FixtureWorker() : undefined);
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
  return { ps, config, pool, approvals, now, log, env, exec: opts.exec ?? defaultExec };
}
