import type { GateId } from '../config.ts';

/**
 * State machine ανά κελί (§5.1 του brief).
 *
 * queued → scouting → brief_ready → [GATE idea] → approved_idea
 *   → building → demo_ready → [GATE demo] → approved_demo
 *   → content_writing → content_ready → [GATE publish] → published
 *   → lead_sourcing → leads_ready → campaign_drafting → qa_check → campaign_ready
 *   → [GATE campaign] → campaign_approved → exported → tracking → done
 *
 * Το «changes_requested» είναι απόφαση gate που επιστρέφει στο state εργασίας (D005).
 */
export const STATES = [
  'queued',
  'scouting',
  'brief_ready',
  'approved_idea',
  'building',
  'demo_ready',
  'approved_demo',
  'content_writing',
  'content_ready',
  'published',
  'lead_sourcing',
  'leads_ready',
  'campaign_drafting',
  'qa_check',
  'campaign_ready',
  'campaign_approved',
  'exported',
  'tracking',
  'done',
  'rejected',
] as const;
export type State = (typeof STATES)[number];

export type ActorKind = 'agent' | 'human' | 'system';
export interface Actor {
  kind: ActorKind;
  name: string;
}
export const actorToString = (a: Actor): string => `${a.kind}:${a.name}`;

export type GateDecision = 'approved' | 'changes' | 'rejected';

/** States που μπορεί να γράψει ΜΟΝΟ άνθρωπος, ανεξάρτητα από τους κανόνες παρακάτω. */
export const HUMAN_ONLY_STATES: ReadonlySet<State> = new Set<State>([
  'approved_idea',
  'approved_demo',
  'published',
  'campaign_approved',
  'rejected',
]);

/** Σε ποιο state περιμένει κάθε gate. */
export const GATE_WAITING_STATE: Record<GateId, State> = {
  idea: 'brief_ready',
  demo: 'demo_ready',
  publish: 'content_ready',
  campaign: 'campaign_ready',
};

export const WAITING_STATES: ReadonlySet<State> = new Set(Object.values(GATE_WAITING_STATE));

export function gateForState(state: State): GateId | null {
  for (const [gate, s] of Object.entries(GATE_WAITING_STATE)) {
    if (s === state) return gate as GateId;
  }
  return null;
}

/** Πού πηγαίνει κάθε απόφαση σε κάθε gate. */
export const GATE_OUTCOMES: Record<GateId, Record<GateDecision, State>> = {
  idea: { approved: 'approved_idea', changes: 'scouting', rejected: 'rejected' },
  demo: { approved: 'approved_demo', changes: 'building', rejected: 'rejected' },
  publish: { approved: 'published', changes: 'content_writing', rejected: 'rejected' },
  campaign: { approved: 'campaign_approved', changes: 'campaign_drafting', rejected: 'rejected' },
};

interface Rule {
  from: State;
  to: State;
  by: readonly ActorKind[];
}

const SYS: readonly ActorKind[] = ['system'];
const AGENT: readonly ActorKind[] = ['agent', 'system'];
const HUMAN: readonly ActorKind[] = ['human'];

const RULES: readonly Rule[] = [
  { from: 'queued', to: 'scouting', by: SYS },
  { from: 'scouting', to: 'brief_ready', by: AGENT },

  { from: 'approved_idea', to: 'building', by: SYS },
  { from: 'building', to: 'demo_ready', by: AGENT },

  { from: 'approved_demo', to: 'content_writing', by: SYS },
  { from: 'content_writing', to: 'content_ready', by: AGENT },

  { from: 'published', to: 'lead_sourcing', by: SYS },
  { from: 'lead_sourcing', to: 'leads_ready', by: AGENT },
  { from: 'leads_ready', to: 'campaign_drafting', by: SYS },
  { from: 'campaign_drafting', to: 'qa_check', by: AGENT },
  { from: 'qa_check', to: 'campaign_ready', by: AGENT },
  { from: 'qa_check', to: 'campaign_drafting', by: AGENT }, // το QA απέρριψε, ξαναγράφεται

  { from: 'campaign_approved', to: 'exported', by: SYS },
  { from: 'exported', to: 'tracking', by: SYS },
  { from: 'tracking', to: 'done', by: SYS },

  // Gates: μόνο άνθρωπος.
  ...(Object.keys(GATE_OUTCOMES) as GateId[]).flatMap((gate) =>
    Object.values(GATE_OUTCOMES[gate]).map((to) => ({ from: GATE_WAITING_STATE[gate], to, by: HUMAN })),
  ),

  // Ένα απορριφθέν κελί ξανανοίγει μόνο από άνθρωπο (D006).
  { from: 'rejected', to: 'queued', by: HUMAN },
];

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: State,
    public readonly to: State,
  ) {
    super(`Μη επιτρεπτή μετάβαση: ${from} → ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

export class GateViolationError extends Error {
  constructor(
    public readonly to: State,
    public readonly actor: Actor,
  ) {
    super(`Μόνο άνθρωπος μπορεί να γράψει «${to}». Προσπάθησε: ${actorToString(actor)}`);
    this.name = 'GateViolationError';
  }
}

export function isState(x: unknown): x is State {
  return typeof x === 'string' && (STATES as readonly string[]).includes(x);
}

export function allowedTargets(from: State): State[] {
  return RULES.filter((r) => r.from === from).map((r) => r.to);
}

/** Πετά error αν η μετάβαση δεν επιτρέπεται ή αν τη ζητά λάθος actor. */
export function assertTransition(from: State, to: State, actor: Actor): void {
  if (HUMAN_ONLY_STATES.has(to) && actor.kind !== 'human') {
    throw new GateViolationError(to, actor);
  }
  const rule = RULES.find((r) => r.from === from && r.to === to);
  if (!rule) throw new IllegalTransitionError(from, to);
  if (!rule.by.includes(actor.kind)) {
    if (rule.by.length === 1 && rule.by[0] === 'human') throw new GateViolationError(to, actor);
    throw new IllegalTransitionError(from, to);
  }
}

export function isTerminal(state: State): boolean {
  return state === 'done' || state === 'rejected';
}
