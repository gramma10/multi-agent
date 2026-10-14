import type { AgentName, CellDef } from '../config.ts';
import type { FactoryContext } from '../context.ts';
import type { State } from '../state/machine.ts';
import type { Task } from '../state/task.ts';

export type StepName = 'scout' | 'build' | 'content' | 'leads' | 'campaign' | 'qa' | 'export' | 'track';

export type BudgetKey = 'briefs_per_night' | 'demos_per_night' | 'content_packs_per_night';

export interface StepSuccess {
  ok: true;
  /** Αν διαφέρει από το `done` του βήματος (π.χ. το QA γυρίζει σε campaign_drafting). */
  nextState?: State;
  /** Πρόοδος χωρίς μετάβαση (π.χ. leads: συνεχίζει αύριο από τον cursor). */
  stay?: boolean;
  note?: string;
  worker?: string;
  model?: string | null;
  durationMs?: number;
}

export interface StepFailure {
  ok: false;
  error: string;
  worker?: string;
  model?: string | null;
  durationMs?: number;
  /** Όλοι οι workers του agent είναι εκτός (όρια χρήσης): σταματά κάθε βήμα του agent απόψε. */
  agentUnavailable?: boolean;
}

export type StepResult = StepSuccess | StepFailure;

export interface StepDef {
  name: StepName;
  /** Ο agent που «υπογράφει» την ολοκλήρωση (actor agent:<name>). null για βήματα κώδικα. */
  agent: AgentName | null;
  /** States από τα οποία μπορεί να ξεκινήσει. Το `working` είναι πάντα αποδεκτό (resume). */
  readyStates: State[];
  working: State;
  done: State;
  budget?: BudgetKey;
  /** false = δεν έχει υλοποιηθεί ακόμα σε αυτή τη φάση· το κελί περιμένει. */
  available: boolean;
  execute(ctx: FactoryContext, task: Task, cell: CellDef): Promise<StepResult>;
}
