import type { GateId } from '../config.ts';
import type { GateDecision } from '../state/machine.ts';
import type { Task } from '../state/task.ts';

export interface GateRequest {
  task: Task;
  gate: GateId;
  title: string;
  body: string;
}

export interface OpenedGate {
  ref: string;
  url?: string;
}

export interface Decision {
  decision: GateDecision;
  /** Ποιος αποφάσισε (GitHub login ή όνομα σε dry-run). Πάντα άνθρωπος. */
  by: string;
  at: string;
  comments: string[];
}

export interface ApprovalsAdapter {
  readonly kind: 'github' | 'dry-run';
  openGate(req: GateRequest): Promise<OpenedGate>;
  /** null = δεν έχει αποφασίσει ακόμα άνθρωπος. */
  readDecision(task: Task, gate: GateId): Promise<Decision | null>;
  closeGate(task: Task, gate: GateId, decision: Decision): Promise<void>;
  openAlert(title: string, body: string): Promise<OpenedGate>;
}
