import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { CLAUDE_SPEC, CliWorker, type ChildLike, type SpawnFn } from '../src/workers/cli-worker.ts';
import { detectLimit, parseResetAt } from '../src/workers/limits.ts';
import { AllWorkersUnavailableError } from '../src/workers/pool.ts';
import { FixtureWorker } from '../src/workers/fixture.ts';
import type { Worker, WorkerRunInput, WorkerRunResult } from '../src/workers/types.ts';
import { Clock, makeCtx } from './helpers.ts';

const NOW = new Date('2026-10-14T22:00:00Z');

describe('ανίχνευση ορίων χρήσης', () => {
  it.each([
    ['claude', 'Claude AI usage limit reached|1792000000', 'usage_limit'],
    ['claude', "You've hit your limit · resets 3am (Europe/Athens)", 'usage_limit'],
    ['claude', '5-hour limit reached ∙ resets 2am', 'usage_limit'],
    ['claude', 'API Error: 429 rate_limit_error', 'rate_limit'],
    ['codex', "You've hit your usage limit. Try again in 2 hours.", 'usage_limit'],
    ['codex', 'stream error: 429 Too Many Requests', 'rate_limit'],
    ['gemini', 'Error: Quota exceeded for quota metric', 'usage_limit'],
    ['gemini', '{"error":{"status":"RESOURCE_EXHAUSTED"}}', 'usage_limit'],
  ])('%s: %s → %s', (worker, text, expected) => {
    expect(detectLimit(worker, text)).toBe(expected);
  });

  it('δεν μπερδεύει κανονικά σφάλματα με όρια', () => {
    expect(detectLimit('claude', 'Error: ENOENT no such file')).toBeNull();
  });

  it('βρίσκει την ώρα επαναφοράς', () => {
    expect(parseResetAt('usage limit reached|1792000000', NOW)?.toISOString()).toBe(new Date(1792000000 * 1000).toISOString());
    expect(parseResetAt('Try again in 2 hours.', NOW)?.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(parseResetAt('retry in 30 minutes', NOW)?.toISOString()).toBe('2026-10-14T22:30:00.000Z');
    expect(parseResetAt('reset at 2026-10-15T05:00:00Z', NOW)?.toISOString()).toBe('2026-10-15T05:00:00.000Z');
    expect(parseResetAt('limit reached', NOW)).toBeNull();
  });
});

/** Fake child process: γράφει stdout/stderr και κλείνει με exit code. */
function fakeSpawn(script: { stdout?: string; stderr?: string; code?: number; error?: NodeJS.ErrnoException; hang?: boolean }) {
  const calls: Array<{ cmd: string; args: string[]; stdin: string }> = [];
  const fn: SpawnFn = (cmd, args) => {
    const ee = new EventEmitter() as EventEmitter & ChildLike;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdin = new PassThrough();
    let stdinText = '';
    stdin.on('data', (d: Buffer) => (stdinText += d.toString()));
    Object.assign(ee, { stdout, stderr, stdin, kill: () => (setImmediate(() => ee.emit('close', null, 'SIGTERM')), true) });
    calls.push({ cmd, args, get stdin() { return stdinText; } } as never);
    setImmediate(() => {
      if (script.error) {
        ee.emit('error', script.error);
        return;
      }
      if (script.hang) return;
      stdout.end(script.stdout ?? '');
      stderr.end(script.stderr ?? '');
      setImmediate(() => ee.emit('close', script.code ?? 0, null));
    });
    return ee;
  };
  return { fn, calls };
}

const input: WorkerRunInput = {
  agent: 'scout',
  prompt: 'γράψε το brief',
  cwd: '/tmp',
  allowedTools: ['Read', 'Edit(pipeline/x/brief.md)'],
  timeoutMs: 5000,
  model: 'sonnet',
};

describe('CliWorker', () => {
  it('Claude: διαβάζει JSON output και usage, στέλνει το prompt από stdin', async () => {
    const out = JSON.stringify({ type: 'result', is_error: false, result: 'έγραψα το brief', usage: { input_tokens: 10, output_tokens: 20 }, total_cost_usd: 0.01 });
    const { fn, calls } = fakeSpawn({ stdout: out });
    const r = await new CliWorker(CLAUDE_SPEC(), fn).run(input);
    expect(r).toMatchObject({ exitReason: 'ok', output: 'έγραψα το brief', usage: { input_tokens: 10, output_tokens: 20, cost_usd: 0.01 } });
    expect(calls[0]!.args).toEqual(['-p', '--output-format', 'json', '--model', 'sonnet', '--allowedTools', 'Read,Edit(pipeline/x/brief.md)']);
    expect(calls[0]!.stdin).toBe('γράψε το brief');
    expect(calls[0]!.args.join(' ')).not.toContain('γράψε');
  });

  it('Claude: όριο χρήσης → usage_limit με resetAt', async () => {
    const out = JSON.stringify({ type: 'result', is_error: true, result: 'Claude AI usage limit reached|1792000000' });
    const { fn } = fakeSpawn({ stdout: out, code: 1 });
    const r = await new CliWorker(CLAUDE_SPEC(), fn, () => NOW).run(input);
    expect(r.exitReason).toBe('usage_limit');
    expect(r.resetAt).toBe(new Date(1792000000 * 1000).toISOString());
  });

  it('το "429" σε επιτυχημένο output ΔΕΝ είναι όριο', async () => {
    const out = JSON.stringify({ type: 'result', is_error: false, result: 'Το ιατρείο έχει 429 κριτικές' });
    const { fn } = fakeSpawn({ stdout: out });
    expect((await new CliWorker(CLAUDE_SPEC(), fn).run(input)).exitReason).toBe('ok');
  });

  it('μη εγκατεστημένο CLI → not_installed', async () => {
    const err = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
    const { fn } = fakeSpawn({ error: err });
    expect((await new CliWorker(CLAUDE_SPEC(), fn).run(input)).exitReason).toBe('not_installed');
  });

  it('timeout → σκοτώνει τη διεργασία και επιστρέφει timeout', async () => {
    const { fn } = fakeSpawn({ hang: true });
    const r = await new CliWorker(CLAUDE_SPEC(), fn).run({ ...input, timeoutMs: 50 });
    expect(r.exitReason).toBe('timeout');
  });
});

/** Worker που επιστρέφει προκαθορισμένα αποτελέσματα και μετρά κλήσεις. */
class ScriptedWorker implements Worker {
  calls = 0;
  constructor(
    readonly name: string,
    private readonly result: Partial<WorkerRunResult>,
  ) {}
  async run(): Promise<WorkerRunResult> {
    this.calls++;
    return { output: '', usage: null, exitReason: 'ok', durationMs: 1, ...this.result };
  }
}

describe('WorkerPool: όρια, cooldown, fallback', () => {
  it('όριο στον primary → cooldown + fallback· την επόμενη φορά ο primary παραλείπεται', async () => {
    const claude = new ScriptedWorker('claude', { exitReason: 'usage_limit', resetAt: '2026-10-15T03:00:00.000Z' });
    const gemini = new ScriptedWorker('gemini', { exitReason: 'ok' });
    const { ctx, repo } = makeCtx({ workers: { claude, gemini } });

    const r1 = await ctx.pool.runAgent('scout', { prompt: 'x', cwd: repo, allowedTools: [] });
    expect(r1.worker).toBe('gemini');
    expect(claude.calls).toBe(1);

    const state = JSON.parse(fs.readFileSync(path.join(repo, 'reports', 'worker-state.json'), 'utf8'));
    expect(state.workers.claude.cooling_down_until).toBe('2026-10-15T03:00:00.000Z');

    const r2 = await ctx.pool.runAgent('scout', { prompt: 'x', cwd: repo, allowedTools: [] });
    expect(r2.worker).toBe('gemini');
    expect(claude.calls).toBe(1); // δεν ξανακλήθηκε

    const usage = fs.readFileSync(path.join(repo, 'reports', 'usage.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(usage.map((u) => `${u.worker}:${u.exit_reason}`)).toEqual([
      'claude:usage_limit',
      'gemini:ok',
      'claude:skipped_cooldown',
      'gemini:ok',
    ]);
  });

  it('όριο σε primary ΚΑΙ fallback → σταματά καθαρά, χωρίς επαναλήψεις', async () => {
    const claude = new ScriptedWorker('claude', { exitReason: 'usage_limit' });
    const gemini = new ScriptedWorker('gemini', { exitReason: 'rate_limit' });
    const { ctx, repo } = makeCtx({ workers: { claude, gemini } });
    await expect(ctx.pool.runAgent('scout', { prompt: 'x', cwd: repo, allowedTools: [] })).rejects.toBeInstanceOf(AllWorkersUnavailableError);
    expect(claude.calls).toBe(1);
    expect(gemini.calls).toBe(1);
  });

  it('χωρίς ώρα επαναφοράς: default cooldown από το workers.yaml· μετά τη λήξη ξαναδοκιμάζει', async () => {
    const clock = new Clock();
    const claude = new ScriptedWorker('claude', { exitReason: 'usage_limit' });
    const gemini = new ScriptedWorker('gemini', { exitReason: 'ok' });
    const { ctx, repo } = makeCtx({ workers: { claude, gemini }, clock });
    await ctx.pool.runAgent('scout', { prompt: 'x', cwd: repo, allowedTools: [] });
    expect(ctx.pool.coolingDown()[0]).toMatchObject({ worker: 'claude', until: '2026-10-15T03:00:00.000Z' }); // +300 λεπτά
    clock.advance(301 * 60_000);
    expect(ctx.pool.coolingDown()).toHaveLength(0);
    await ctx.pool.runAgent('scout', { prompt: 'x', cwd: repo, allowedTools: [] });
    expect(claude.calls).toBe(2);
  });

  it('σφάλμα (όχι όριο) δεν πάει σε fallback και δεν ξαναδοκιμάζει', async () => {
    const claude = new ScriptedWorker('claude', { exitReason: 'error', errorMessage: 'boom' });
    const gemini = new ScriptedWorker('gemini', { exitReason: 'ok' });
    const { ctx, repo } = makeCtx({ workers: { claude, gemini } });
    const r = await ctx.pool.runAgent('scout', { prompt: 'x', cwd: repo, allowedTools: [] });
    expect(r.result.exitReason).toBe('error');
    expect(gemini.calls).toBe(0);
  });

  it('ο fixture worker γράφει τα αναμενόμενα outputs', async () => {
    const w = new FixtureWorker();
    const { repo } = makeCtx();
    await w.run({ ...input, cwd: repo, outputs: ['pipeline/a-b/brief.md'], context: { 'cell.id': 'a-b', 'vertical.name': 'Κλάδος', 'service.name': 'Υπηρεσία' } });
    const brief = fs.readFileSync(path.join(repo, 'pipeline', 'a-b', 'brief.md'), 'utf8');
    expect(brief).toContain('# Brief: Κλάδος × Υπηρεσία');
    expect(brief).toContain('FIXTURE');
  });
});
