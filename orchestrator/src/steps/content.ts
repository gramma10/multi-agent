import fs from 'node:fs';
import path from 'node:path';
import { syncCellContent } from '../publish.ts';
import { loadBannedPhrases } from '../qa/brand.ts';
import { lintContentPack, lintVerticalIntro } from '../qa/content-lint.ts';
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
  async execute(ctx, task, cell) {
    const dir = `pipeline/${cell.id}/content`;
    const intro = `pipeline/_verticals/${cell.vertical}/intro.md`;
    const banned = loadBannedPhrases(ctx.ps.repoRoot);
    const introExists = fs.existsSync(path.join(ctx.ps.stateRoot, intro));
    const result = await runLlmStep(ctx, task, cell, {
      agent: 'content',
      outputs: [...CONTENT_FILES.map((f) => `${dir}/${f}`), ...(introExists ? [] : [intro])],
      writeScope: [`${dir}/**`, intro],
      reads: [`pipeline/${cell.id}/brief.md`, `pipeline/${cell.id}/build.md`, `showcase/src/demos/${cell.id}/`],
      extraPrompt: introExists
        ? `Η εισαγωγή του κλάδου υπάρχει ήδη στο ${intro}. Άλλαξέ τη μόνο αν χρειάζεται.`
        : `Δεν υπάρχει ακόμα εισαγωγή για τον κλάδο: γράψε και το ${intro}.`,
      // Ντετερμινιστικός έλεγχος: μορφή, μαύρη λίστα του brand, «πελάτες μας», νούμερα χωρίς πηγή.
      validate: (c) => [
        ...lintContentPack(path.join(c.ps.stateRoot, dir), banned),
        ...lintVerticalIntro(path.join(c.ps.stateRoot, intro), banned),
      ],
    });
    // Προεπισκόπηση στη showcase (ως πρόχειρο). Δημόσια γίνεται μόνο μετά το Gate 3.
    if (result.ok) syncCellContent(ctx, cell);
    return result;
  },
};
