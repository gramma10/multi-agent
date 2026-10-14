import { execFile } from 'node:child_process';

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

/** Τρέχει εντολή χωρίς shell (χωρίς injection) και δεν πετά για exit code ≠ 0. Injectable για tests. */
export type Exec = (cmd: string, args: string[], opts: ExecOptions) => Promise<ExecResult>;

export const defaultExec: Exec = (cmd, args, opts) =>
  new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { cwd: opts.cwd, env: opts.env ?? process.env, timeout: opts.timeoutMs ?? 10 * 60_000, maxBuffer: 50 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr || (err && code !== 0 ? err.message : '')) });
      },
    );
  });

export function tail(text: string, lines = 15): string {
  return text.trim().split('\n').slice(-lines).join('\n');
}
