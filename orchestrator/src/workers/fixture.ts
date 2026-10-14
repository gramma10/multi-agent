import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Worker, WorkerRunInput, WorkerRunResult } from './types.ts';

export const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');

/** Γεμίζει `{{key}}` από το context. Άγνωστα κλειδιά μένουν όπως είναι. */
export function renderTemplate(tpl: string, ctx: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (m, key: string) => (key in ctx ? ctx[key]! : m));
}

export type FixtureBehavior = (input: WorkerRunInput) => Partial<WorkerRunResult> | null;

/**
 * Worker για dry-run και tests. Δεν τρέχει τίποτα εξωτερικό:
 * για κάθε αναμενόμενο output, γράφει το fixture `fixtures/<agent>/<basename>` με τιμές από το context.
 * Με `behavior` μπορεί να προσομοιώσει όρια χρήσης, σφάλματα ή κακό output.
 */
export class FixtureWorker implements Worker {
  calls: WorkerRunInput[] = [];

  constructor(
    readonly name: string = 'fixture',
    private readonly behavior: FixtureBehavior | null = null,
    private readonly fixturesDir: string = FIXTURES_DIR,
  ) {}

  async run(input: WorkerRunInput): Promise<WorkerRunResult> {
    this.calls.push(input);
    const override = this.behavior?.(input);
    if (override && override.exitReason && override.exitReason !== 'ok') {
      return { output: '', usage: null, durationMs: 1, ...override, exitReason: override.exitReason };
    }
    const written: string[] = [];
    for (const rel of input.outputs ?? []) {
      const base = path.basename(rel);
      const cellId = input.context?.['cell.id'];
      const names = [base, ...(cellId ? [base.replace(cellId, 'cell')] : [])];
      const tplFile = names.map((n) => path.join(this.fixturesDir, input.agent, n)).find((f) => fs.existsSync(f));
      if (!tplFile) continue;
      const content = renderTemplate(fs.readFileSync(tplFile, 'utf8'), input.context ?? {});
      const target = path.join(input.cwd, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
      written.push(rel);
    }
    return {
      output: `fixture: έγραψα ${written.length ? written.join(', ') : 'τίποτα'}`,
      usage: { input_tokens: 0, output_tokens: 0, cost_usd: 0 },
      exitReason: 'ok',
      durationMs: 1,
      ...(override ?? {}),
    };
  }
}
