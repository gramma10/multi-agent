import fs from 'node:fs';
import { parse, stringify } from 'yaml';
import { z } from 'zod';
import type { GateId } from '../config.ts';
import { p, type FactoryPaths } from '../paths.ts';
import type { Task } from '../state/task.ts';
import { writeFileAtomic, appendLine } from '../util/fs.ts';
import type { ApprovalsAdapter, Decision, GateRequest, OpenedGate } from './types.ts';

const EntrySchema = z.object({
  cell: z.string(),
  gate: z.enum(['idea', 'demo', 'publish', 'campaign']),
  decision: z.enum(['approved', 'changes', 'rejected']),
  by: z.string().min(1),
  at: z.string(),
  comment: z.string().default(''),
  applied_at: z.string().optional(),
});
type Entry = z.infer<typeof EntrySchema>;

/**
 * Εγκρίσεις χωρίς GitHub: τα gates φαίνονται στο review/REVIEW.md και οι αποφάσεις
 * γράφονται στο review/decisions.yaml (με `factory -- decide`, από άνθρωπο).
 * Κανένας agent δεν έχει write scope στο review/ (το επιβάλλει ο scope guard).
 */
export class DryRunApprovals implements ApprovalsAdapter {
  readonly kind = 'dry-run' as const;

  constructor(
    private readonly ps: FactoryPaths,
    private readonly now: () => Date,
  ) {}

  private read(): Entry[] {
    const file = p.decisions(this.ps);
    if (!fs.existsSync(file)) return [];
    const raw = parse(fs.readFileSync(file, 'utf8')) as unknown;
    if (raw == null) return [];
    return z.array(EntrySchema).parse(raw);
  }

  private write(entries: Entry[]): void {
    writeFileAtomic(
      p.decisions(this.ps),
      '# Αποφάσεις gates σε dry-run. Γράψε με: npm run factory -- decide <κελί> <approved|changes|rejected> --by <όνομα> [--comment "..."]\n' +
        stringify(entries, { lineWidth: 0 }),
    );
  }

  /** Καταγράφει απόφαση ανθρώπου (καλείται από το CLI `decide`). */
  record(cell: string, gate: GateId, decision: Entry['decision'], by: string, comment = ''): void {
    if (!by.trim()) throw new Error('Χρειάζεται --by <όνομα>: κάθε απόφαση έχει υπογραφή.');
    const entries = this.read();
    entries.push({ cell, gate, decision, by, at: this.now().toISOString(), comment });
    this.write(entries);
  }

  async openGate(req: GateRequest): Promise<OpenedGate> {
    appendLine(
      p.gatesLog(this.ps),
      `${this.now().toISOString()} OPEN ${req.title}`,
    );
    return { ref: 'review' };
  }

  async readDecision(task: Task, gate: GateId): Promise<Decision | null> {
    const opened = task.gates[gate]?.opened_at;
    const e = this.read()
      .filter((x) => x.cell === task.id && x.gate === gate && !x.applied_at && (!opened || x.at >= opened))
      .at(-1);
    if (!e) return null;
    return { decision: e.decision, by: e.by, at: e.at, comments: e.comment ? [e.comment] : [] };
  }

  async closeGate(task: Task, gate: GateId, _decision: Decision): Promise<void> {
    const entries = this.read();
    const at = this.now().toISOString();
    for (const e of entries) {
      if (e.cell === task.id && e.gate === gate && !e.applied_at) e.applied_at = at;
    }
    this.write(entries);
  }

  async openAlert(title: string, _body: string): Promise<OpenedGate> {
    appendLine(p.gatesLog(this.ps), `${this.now().toISOString()} ALERT ${title}`);
    return { ref: 'review' };
  }
}
