import type { AgentName } from '../config.ts';

export interface WorkerRunInput {
  agent: AgentName;
  prompt: string;
  /** Φάκελος εργασίας του worker (η ρίζα του state). */
  cwd: string;
  /** Εργαλεία που επιτρέπονται (σύνταξη Claude Code, π.χ. `Edit(pipeline/x/brief.md)`). */
  allowedTools: string[];
  timeoutMs: number;
  model: string | null;
  cellId?: string;
  /** Αρχεία που περιμένουμε να γραφτούν (σχετικά με το cwd). Τα χρησιμοποιεί ο fixture worker. */
  outputs?: string[];
  /** Τιμές για templates των fixtures. */
  context?: Record<string, string>;
}

export type ExitReason = 'ok' | 'usage_limit' | 'rate_limit' | 'timeout' | 'error' | 'not_installed';

export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
}

export interface WorkerRunResult {
  output: string;
  usage: Usage | null;
  exitReason: ExitReason;
  durationMs: number;
  /** Πότε ξαναρχίζει ο worker, αν το έλεγε το μήνυμα ορίου. */
  resetAt?: string;
  errorMessage?: string;
}

export interface Worker {
  readonly name: string;
  run(input: WorkerRunInput): Promise<WorkerRunResult>;
}

export const isLimit = (r: ExitReason): boolean => r === 'usage_limit' || r === 'rate_limit';
