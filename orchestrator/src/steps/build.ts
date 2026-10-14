import { runLlmStep } from './llm-step.ts';
import type { StepDef } from './types.ts';

/**
 * Builder: γράφει μόνο στον φάκελο του demo του, στο test του και στο build.md (D011).
 * Στη Φάση 3 προστίθεται: branch demo/<slug>, εκτέλεση των tests από τον orchestrator, PR.
 */
export function builderScope(id: string): string[] {
  return [`showcase/src/demos/${id}/**`, `showcase/e2e/demos/${id}.spec.ts`, `pipeline/${id}/build.md`];
}

export const buildStep: StepDef = {
  name: 'build',
  agent: 'builder',
  readyStates: ['approved_idea'],
  working: 'building',
  done: 'demo_ready',
  budget: 'demos_per_night',
  available: true,
  execute(ctx, task, cell) {
    const id = cell.id;
    return runLlmStep(ctx, task, cell, {
      agent: 'builder',
      outputs: [`showcase/src/demos/${id}/demo.ts`, `showcase/e2e/demos/${id}.spec.ts`, `pipeline/${id}/build.md`],
      writeScope: builderScope(id),
      extraTools: [
        'Bash(npm run lint)',
        'Bash(npm run typecheck)',
        `Bash(npx playwright test e2e/demos/${id}.spec.ts)`,
        'Bash(npm run gen:registry)',
      ],
      reads: [`pipeline/${id}/brief.md`, 'showcase/README.md'],
    });
  },
};
