import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';
import { detectLimit, parseResetAt } from './limits.ts';
import type { Usage, Worker, WorkerRunInput, WorkerRunResult } from './types.ts';

/** Ελάχιστο interface του child process που χρειαζόμαστε. Επιτρέπει fake spawn στα tests. */
export interface ChildLike {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  stdin: NodeJS.WritableStream | null;
  on(event: 'error', cb: (err: NodeJS.ErrnoException) => void): this;
  on(event: 'close', cb: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  kill(signal?: NodeJS.Signals): boolean;
}
export type SpawnFn = (cmd: string, args: string[], opts: SpawnOptions) => ChildLike;

interface Parsed {
  output: string;
  usage: Usage | null;
  isError: boolean;
}

export interface CliSpec {
  /** Όνομα του worker στο workers.yaml (claude | codex | gemini). */
  name: string;
  command: string;
  buildArgs(input: WorkerRunInput): string[];
  parse(stdout: string): Parsed;
}

function tryJson(text: string): Record<string, unknown> | null {
  const t = text.trim();
  if (!t.startsWith('{')) return null;
  try {
    return JSON.parse(t) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const CLAUDE_SPEC = (command = 'claude', extra: string[] = []): CliSpec => ({
  name: 'claude',
  command,
  buildArgs: (i) => [
    '-p',
    '--output-format',
    'json',
    ...(i.model ? ['--model', i.model] : []),
    ...extra,
    ...(i.allowedTools.length ? ['--allowedTools', i.allowedTools.join(',')] : []),
  ],
  parse: (stdout) => {
    const j = tryJson(stdout);
    if (!j) return { output: stdout, usage: null, isError: false };
    const u = (j.usage ?? {}) as Record<string, number>;
    return {
      output: String(j.result ?? ''),
      usage: {
        input_tokens: u.input_tokens,
        output_tokens: u.output_tokens,
        cost_usd: typeof j.total_cost_usd === 'number' ? j.total_cost_usd : undefined,
      },
      isError: j.is_error === true,
    };
  },
});

export const CODEX_SPEC = (command = 'codex', extra: string[] = []): CliSpec => ({
  name: 'codex',
  command,
  buildArgs: (i) => [
    'exec',
    '--skip-git-repo-check',
    '--sandbox',
    'workspace-write',
    ...(i.model ? ['-m', i.model] : []),
    ...extra,
    '-', // prompt από stdin
  ],
  parse: (stdout) => ({ output: stdout, usage: null, isError: false }),
});

export const GEMINI_SPEC = (command = 'gemini', extra: string[] = []): CliSpec => ({
  name: 'gemini',
  command,
  buildArgs: (i) => [
    ...(i.model ? ['-m', i.model] : []),
    '--approval-mode',
    'auto_edit',
    '--output-format',
    'json',
    ...extra,
  ],
  parse: (stdout) => {
    const j = tryJson(stdout);
    if (!j) return { output: stdout, usage: null, isError: false };
    return { output: String(j.response ?? ''), usage: null, isError: j.error != null };
  },
});

/**
 * Γενικός worker για headless CLI. Το prompt πηγαίνει από stdin (όχι argv), ώστε να μη
 * χτυπάμε όρια μήκους εντολής και να μη φαίνεται στη λίστα διεργασιών.
 */
export class CliWorker implements Worker {
  readonly name: string;

  constructor(
    private readonly spec: CliSpec,
    private readonly spawnFn: SpawnFn = nodeSpawn as unknown as SpawnFn,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.name = spec.name;
  }

  run(input: WorkerRunInput): Promise<WorkerRunResult> {
    const started = Date.now();
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      let timedOut = false;
      const done = (r: Omit<WorkerRunResult, 'durationMs'>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ...r, durationMs: Date.now() - started });
      };

      let child: ChildLike;
      try {
        child = this.spawnFn(this.spec.command, this.spec.buildArgs(input), {
          cwd: input.cwd,
          env: process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err) {
        done({ output: '', usage: null, exitReason: 'error', errorMessage: (err as Error).message });
        return;
      }

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000).unref();
      }, input.timeoutMs);

      child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
      child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          done({ output: '', usage: null, exitReason: 'not_installed', errorMessage: `${this.spec.command}: δεν βρέθηκε` });
        } else {
          done({ output: '', usage: null, exitReason: 'error', errorMessage: err.message });
        }
      });
      child.on('close', (code) => {
        if (timedOut) {
          done({ output: stdout, usage: null, exitReason: 'timeout', errorMessage: `timeout μετά από ${input.timeoutMs}ms` });
          return;
        }
        const parsed = this.spec.parse(stdout);
        const failed = code !== 0 || parsed.isError;
        if (failed) {
          const text = `${parsed.output}\n${stdout}\n${stderr}`;
          const limit = detectLimit(this.spec.name, text);
          if (limit) {
            const reset = parseResetAt(text, this.now());
            done({
              output: parsed.output,
              usage: parsed.usage,
              exitReason: limit,
              ...(reset ? { resetAt: reset.toISOString() } : {}),
              errorMessage: firstLine(text),
            });
            return;
          }
          done({
            output: parsed.output,
            usage: parsed.usage,
            exitReason: 'error',
            errorMessage: firstLine(stderr || parsed.output || `exit code ${code}`),
          });
          return;
        }
        done({ output: parsed.output, usage: parsed.usage, exitReason: 'ok' });
      });

      child.stdin?.end(input.prompt);
    });
  }
}

function firstLine(text: string): string {
  const line = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  return line.slice(0, 300);
}
