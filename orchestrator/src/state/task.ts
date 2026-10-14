import fs from 'node:fs';
import { parse, stringify } from 'yaml';
import { z } from 'zod';
import type { CellDef, GateId } from '../config.ts';
import { p, type FactoryPaths } from '../paths.ts';
import { writeFileAtomic } from '../util/fs.ts';
import { assertTransition, actorToString, STATES, type Actor, type GateDecision, type State } from './machine.ts';

const HistoryEntrySchema = z.object({
  at: z.string(),
  from: z.enum(STATES),
  to: z.enum(STATES),
  actor: z.string(),
  worker: z.string().optional(),
  model: z.string().nullable().optional(),
  duration_ms: z.number().optional(),
  result: z.string().optional(),
  note: z.string().optional(),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

const GateRecordSchema = z.object({
  opened_at: z.string(),
  ref: z.string().optional(), // αριθμός issue ή «review»
  url: z.string().optional(),
  decided_at: z.string().optional(),
  decision: z.enum(['approved', 'changes', 'rejected']).optional(),
  by: z.string().optional(),
});
export type GateRecord = z.infer<typeof GateRecordSchema>;

const FeedbackSchema = z.object({
  gate: z.string(),
  at: z.string(),
  by: z.string(),
  decision: z.enum(['approved', 'changes', 'rejected']),
  comments: z.array(z.string()).default([]),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

const TaskSchema = z.object({
  id: z.string(),
  vertical: z.string(),
  service: z.string(),
  state: z.enum(STATES),
  created_at: z.string(),
  updated_at: z.string(),
  attempts: z.record(z.string(), z.number()).default({}),
  last_error: z.string().nullable().default(null),
  scout_score: z.number().nullable().default(null),
  gates: z.record(z.string(), GateRecordSchema).default({}),
  feedback: z.array(FeedbackSchema).default([]),
  meta: z.record(z.string(), z.unknown()).default({}),
  history: z.array(HistoryEntrySchema).default([]),
});
export type Task = z.infer<typeof TaskSchema>;

export function newTask(cell: CellDef, now: Date): Task {
  const at = now.toISOString();
  return {
    id: cell.id,
    vertical: cell.vertical,
    service: cell.service,
    state: 'queued',
    created_at: at,
    updated_at: at,
    attempts: {},
    last_error: null,
    scout_score: null,
    gates: {},
    feedback: [],
    meta: {},
    history: [],
  };
}

export function taskExists(ps: FactoryPaths, id: string): boolean {
  return fs.existsSync(p.task(ps, id));
}

export function parseTask(text: string): Task {
  return TaskSchema.parse(parse(text));
}

export function serializeTask(task: Task): string {
  return (
    '# Το γράφει ΜΟΝΟ ο orchestrator. Μην το επεξεργάζεσαι με το χέρι.\n' +
    '# Για να περάσεις gate: label στο GitHub issue (ή `factory -- decide` σε dry-run).\n' +
    stringify(task, { lineWidth: 0 })
  );
}

/** Φορτώνει το task του κελιού. Αν δεν υπάρχει, επιστρέφει νέο (χωρίς να το γράψει). */
export function loadTask(ps: FactoryPaths, cell: CellDef, now: Date): Task {
  const file = p.task(ps, cell.id);
  if (!fs.existsSync(file)) return newTask(cell, now);
  try {
    return parseTask(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Χαλασμένο ${file}: ${(err as Error).message}`, { cause: err });
  }
}

export function saveTask(ps: FactoryPaths, task: Task): void {
  writeFileAtomic(p.task(ps, task.id), serializeTask(task));
}

export interface TransitionMeta {
  worker?: string;
  model?: string | null;
  duration_ms?: number;
  result?: string;
  note?: string;
}

/**
 * Η ΜΟΝΗ πόρτα για αλλαγή state. Ελέγχει τον κανόνα και τον actor, γράφει ιστορικό.
 * Δεν αποθηκεύει: ο caller καλεί saveTask.
 */
export function applyTransition(task: Task, to: State, actor: Actor, now: Date, meta: TransitionMeta = {}): Task {
  assertTransition(task.state, to, actor);
  const at = now.toISOString();
  const entry: HistoryEntry = { at, from: task.state, to, actor: actorToString(actor) };
  for (const [k, v] of Object.entries(meta)) {
    if (v !== undefined) (entry as Record<string, unknown>)[k] = v;
  }
  task.history.push(entry);
  task.state = to;
  task.updated_at = at;
  return task;
}

export function recordGateOpened(task: Task, gate: GateId, now: Date, ref?: string, url?: string): void {
  task.gates[gate] = { opened_at: now.toISOString(), ...(ref ? { ref } : {}), ...(url ? { url } : {}) };
}

export function recordGateDecision(
  task: Task,
  gate: GateId,
  decision: GateDecision,
  by: string,
  comments: string[],
  now: Date,
): void {
  const rec = task.gates[gate] ?? { opened_at: now.toISOString() };
  rec.decided_at = now.toISOString();
  rec.decision = decision;
  rec.by = by;
  task.gates[gate] = rec;
  task.feedback.push({ gate, at: now.toISOString(), by, decision, comments });
}

/** Πότε μπήκε το κελί στο τρέχον state. */
export function enteredStateAt(task: Task): string {
  for (let i = task.history.length - 1; i >= 0; i--) {
    const h = task.history[i]!;
    if (h.to === task.state) return h.at;
  }
  return task.created_at;
}
