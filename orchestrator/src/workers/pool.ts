import type { AgentName, WorkerRef, WorkersConfig } from '../config.ts';
import type { FactoryPaths } from '../paths.ts';
import { logUsage } from '../usage.ts';
import { CLAUDE_SPEC, CODEX_SPEC, CliWorker, GEMINI_SPEC, type SpawnFn } from './cli-worker.ts';
import { CooldownStore } from './cooldown.ts';
import { isLimit, type Worker, type WorkerRunInput, type WorkerRunResult } from './types.ts';

export interface AgentRunOutcome {
  result: WorkerRunResult;
  worker: string;
  model: string | null;
}

export class AllWorkersUnavailableError extends Error {
  constructor(
    public readonly agent: AgentName,
    public readonly reasons: string[],
  ) {
    super(`Κανένας διαθέσιμος worker για τον agent ${agent}: ${reasons.join('; ')}`);
    this.name = 'AllWorkersUnavailableError';
  }
}

export interface WorkerPoolOptions {
  ps: FactoryPaths;
  config: WorkersConfig;
  now: () => Date;
  /** Αν δοθεί, ΟΛΟΙ οι agents τρέχουν με αυτόν (dry-run / tests). */
  override?: Worker;
  /** Συγκεκριμένοι workers ανά όνομα (για tests). */
  workers?: Record<string, Worker>;
  spawnFn?: SpawnFn;
}

/**
 * Διαλέγει worker για κάθε agent: primary, και fallback ΜΟΝΟ αν ο primary είναι σε cooldown,
 * χτύπησε όριο χρήσης ή δεν είναι εγκατεστημένος. Ποτέ δεύτερη προσπάθεια στον ίδιο worker
 * μέσα στην ίδια εκτέλεση: ποτέ loop επαναλήψεων.
 */
export class WorkerPool {
  private readonly cooldowns: CooldownStore;
  private readonly cache = new Map<string, Worker>();

  constructor(private readonly opts: WorkerPoolOptions) {
    this.cooldowns = new CooldownStore(opts.ps);
  }

  private resolve(name: string): Worker {
    if (this.opts.override) return this.opts.override;
    const injected = this.opts.workers?.[name];
    if (injected) return injected;
    const cached = this.cache.get(name);
    if (cached) return cached;
    const cfg = this.opts.config.workers[name];
    if (!cfg) throw new Error(`workers.yaml: άγνωστος worker «${name}»`);
    const specFor = { claude: CLAUDE_SPEC, codex: CODEX_SPEC, gemini: GEMINI_SPEC }[name];
    if (!specFor) throw new Error(`Δεν υπάρχει adapter για τον worker «${name}»`);
    const w = new CliWorker(specFor(cfg.command, cfg.extra_args), this.opts.spawnFn, this.opts.now);
    this.cache.set(name, w);
    return w;
  }

  candidates(agent: AgentName): WorkerRef[] {
    const a = this.opts.config.agents[agent];
    if (!a) throw new Error(`workers.yaml: δεν ορίζεται worker για τον agent «${agent}»`);
    return [a.primary, ...(a.fallback ? [a.fallback] : [])];
  }

  timeoutMs(agent: AgentName): number {
    return (this.opts.config.agents[agent]?.timeout_minutes ?? 20) * 60_000;
  }

  /** Workers που είναι τώρα σε cooldown (για το REVIEW.md). */
  coolingDown(): Array<{ worker: string; until: string; reason: string }> {
    const now = this.opts.now();
    return Object.entries(this.cooldowns.read().workers)
      .filter(([, e]) => new Date(e.cooling_down_until) > now)
      .map(([worker, e]) => ({ worker, until: e.cooling_down_until, reason: e.reason }));
  }

  async runAgent(agent: AgentName, input: Omit<WorkerRunInput, 'agent' | 'model' | 'timeoutMs'>): Promise<AgentRunOutcome> {
    const reasons: string[] = [];
    const tried = new Set<string>();
    for (const ref of this.candidates(agent)) {
      const workerName = this.opts.override ? this.opts.override.name : ref.worker;
      if (tried.has(workerName)) continue;
      tried.add(workerName);
      const now = this.opts.now();

      const until = this.opts.override ? null : this.cooldowns.coolingUntil(ref.worker, now);
      if (until) {
        reasons.push(`${ref.worker} σε cooldown μέχρι ${until.toISOString()}`);
        logUsage(this.opts.ps, {
          ts: now.toISOString(),
          agent,
          ...(input.cellId ? { cell: input.cellId } : {}),
          worker: ref.worker,
          model: ref.model,
          duration_ms: 0,
          exit_reason: 'skipped_cooldown',
          usage: null,
        });
        continue;
      }

      const worker = this.resolve(ref.worker);
      const result = await worker.run({ ...input, agent, model: ref.model, timeoutMs: this.timeoutMs(agent) });
      logUsage(this.opts.ps, {
        ts: this.opts.now().toISOString(),
        agent,
        ...(input.cellId ? { cell: input.cellId } : {}),
        worker: worker.name,
        model: ref.model,
        duration_ms: result.durationMs,
        exit_reason: result.exitReason,
        usage: result.usage,
        ...(result.resetAt ? { reset_at: result.resetAt } : {}),
        ...(result.errorMessage ? { error: result.errorMessage } : {}),
      });

      if (isLimit(result.exitReason)) {
        const cfg = this.opts.config.workers[ref.worker];
        const defaultMin = result.exitReason === 'rate_limit' ? 30 : (cfg?.default_cooldown_minutes ?? 300);
        const reset = result.resetAt ? new Date(result.resetAt) : new Date(this.opts.now().getTime() + defaultMin * 60_000);
        if (!this.opts.override) this.cooldowns.set(ref.worker, reset, result.exitReason, this.opts.now());
        reasons.push(`${ref.worker}: ${result.exitReason} (μέχρι ${reset.toISOString()})`);
        continue; // → fallback
      }
      if (result.exitReason === 'not_installed') {
        reasons.push(`${ref.worker}: δεν είναι εγκατεστημένος`);
        continue; // → fallback
      }
      // ok, error ή timeout: τέλος. Σε σφάλμα δεν ξαναδοκιμάζουμε· το βήμα αποτυγχάνει καθαρά.
      return { result, worker: worker.name, model: ref.model };
    }
    throw new AllWorkersUnavailableError(agent, reasons);
  }
}
