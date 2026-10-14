import type { State } from '../state/machine.ts';
import { buildStep } from './build.ts';
import { campaignStep, qaStep } from './campaign.ts';
import { contentStep } from './content.ts';
import { leadsStep } from './leads.ts';
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

/**
 * Το export ΔΕΝ τρέχει αυτόματα τη νύχτα: το ζητά άνθρωπος με `factory -- export <campaign-id>`
 * (τα αρχεία έχουν στοιχεία επαφών και δεν πρέπει να καταλήγουν σε logs/artifacts του CI).
 */
const exportStep: StepDef = {
  name: 'export',
  agent: null,
  readyStates: ['campaign_approved'],
  working: 'campaign_approved',
  done: 'exported',
  available: true,
  manual: true,
  async execute() {
    return { ok: false, error: 'το export γίνεται μόνο με `factory -- export <campaign-id>`' };
  },
};

export const STEPS: StepDef[] = [
  scoutStep,
  buildStep,
  contentStep,
  leadsStep,
  campaignStep,
  qaStep,
  exportStep,
  pending('track', ['exported'], 'tracking', 'done', 7),
];

export function stepByName(name: string): StepDef | undefined {
  return STEPS.find((s) => s.name === name);
}

/** Ποιο βήμα μπορεί να τρέξει από αυτό το state (έτοιμο ή resume από state εργασίας). */
export function stepForState(state: State): StepDef | undefined {
  return STEPS.find((s) => s.readyStates.includes(state) || s.working === state);
}
