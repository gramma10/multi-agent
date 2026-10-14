import type { State } from '../state/machine.ts';
import { buildStep } from './build.ts';
import { contentStep } from './content.ts';
import { scoutStep } from './scout.ts';
import type { StepDef, StepName } from './types.ts';

/** Βήματα που υλοποιούνται σε επόμενες φάσεις. Μέχρι τότε το κελί περιμένει στο state του. */
function pending(name: StepName, readyStates: State[], working: State, done: State, phase: number): StepDef {
  return {
    name,
    agent: null,
    readyStates,
    working,
    done,
    available: false,
    async execute() {
      return { ok: false, error: `το βήμα ${name} υλοποιείται στη Φάση ${phase}` };
    },
  };
}

export const STEPS: StepDef[] = [
  scoutStep,
  buildStep,
  contentStep,
  pending('leads', ['published'], 'lead_sourcing', 'leads_ready', 5),
  pending('campaign', ['leads_ready'], 'campaign_drafting', 'qa_check', 6),
  pending('qa', ['qa_check'], 'qa_check', 'campaign_ready', 6),
  pending('export', ['campaign_approved'], 'campaign_approved', 'exported', 6),
  pending('track', ['exported'], 'tracking', 'done', 7),
];

export function stepByName(name: string): StepDef | undefined {
  return STEPS.find((s) => s.name === name);
}

/** Ποιο βήμα μπορεί να τρέξει από αυτό το state (έτοιμο ή resume από state εργασίας). */
export function stepForState(state: State): StepDef | undefined {
  return STEPS.find((s) => s.readyStates.includes(state) || s.working === state);
}
