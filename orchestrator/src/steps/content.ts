import { runLlmStep } from './llm-step.ts';
import type { StepDef } from './types.ts';

export const CONTENT_FILES = ['page.md', 'reel.md', 'loom.md', 'linkedin.md', 'seo-section.md'] as const;

export const contentStep: StepDef = {
  name: 'content',
  agent: 'content',
  readyStates: ['approved_demo'],
  working: 'content_writing',
  done: 'content_ready',
  budget: 'content_packs_per_night',
  available: true,
  execute(ctx, task, cell) {
    const dir = `pipeline/${cell.id}/content`;
    return runLlmStep(ctx, task, cell, {
      agent: 'content',
      outputs: CONTENT_FILES.map((f) => `${dir}/${f}`),
      writeScope: [`${dir}/**`, `pipeline/_verticals/${cell.vertical}/intro.md`],
      reads: [`pipeline/${cell.id}/brief.md`, `pipeline/${cell.id}/build.md`, `showcase/src/demos/${cell.id}/`],
    });
  },
};
