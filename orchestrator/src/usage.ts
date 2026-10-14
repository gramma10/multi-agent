import { p, type FactoryPaths } from './paths.ts';
import { appendLine } from './util/fs.ts';
import type { ExitReason, Usage } from './workers/types.ts';

export interface UsageRecord {
  ts: string;
  agent: string;
  cell?: string;
  worker: string;
  model: string | null;
  duration_ms: number;
  exit_reason: ExitReason | 'skipped_cooldown';
  usage: Usage | null;
  reset_at?: string;
  error?: string;
}

/** Κάθε κλήση worker → μία γραμμή στο reports/usage.jsonl. Χωρίς prompts και χωρίς output (μπορεί να έχουν δεδομένα). */
export function logUsage(ps: FactoryPaths, rec: UsageRecord): void {
  appendLine(p.usage(ps), JSON.stringify(rec));
}
