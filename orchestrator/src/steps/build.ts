import fs from 'node:fs';
import path from 'node:path';
import { cellLabel } from '../config.ts';
import type { FactoryContext } from '../context.ts';
import { ensurePullRequest, listFilesUnder, publishFilesToBranch } from '../git.ts';
import { tail } from '../util/exec.ts';
import { runLlmStep } from './llm-step.ts';
import type { StepDef } from './types.ts';

/**
 * Builder: γράφει μόνο στον φάκελο του demo του, στο test του και στο build.md (D011).
 * Μετά τον worker, ο orchestrator ο ίδιος τρέχει typecheck, lint και το Playwright test του demo
 * στα 390px. Αν ζητηθεί (FACTORY_PUBLISH_BRANCHES=1), ανεβάζει τα αρχεία του demo σε branch
 * `demo/<slug>` και ανοίγει draft PR (ποτέ push στο main).
 */
export function builderScope(id: string): string[] {
  return [`showcase/src/demos/${id}/**`, `showcase/e2e/demos/${id}.spec.ts`, `pipeline/${id}/build.md`];
}

export function demoFiles(root: string, id: string): string[] {
  return [...listFilesUnder(root, `showcase/src/demos/${id}`), ...listFilesUnder(root, `showcase/e2e/demos/${id}.spec.ts`)];
}

/** Οι έλεγχοι της showcase για ένα demo. Επιστρέφει λίστα προβλημάτων (κενή = όλα εντάξει). */
export async function runShowcaseChecks(ctx: FactoryContext, id: string): Promise<string[]> {
  const cwd = path.join(ctx.ps.stateRoot, 'showcase');
  if (!fs.existsSync(path.join(cwd, 'node_modules'))) return ['η showcase δεν έχει node_modules (τρέξε npm ci στο showcase/)'];
  const env = { ...process.env, SHOWCASE_SHOW_DRAFTS: '1', CI: '1', NEXT_TELEMETRY_DISABLED: '1' };
  const checks: Array<[string, string, string[]]> = [
    ['typecheck', 'npm', ['run', 'typecheck']],
    ['lint', 'npm', ['run', 'lint']],
    ['playwright 390px', 'npx', ['playwright', 'test', `e2e/demos/${id}.spec.ts`]],
  ];
  for (const [name, cmd, args] of checks) {
    const r = await ctx.exec(cmd, args, { cwd, env, timeoutMs: 15 * 60_000 });
    if (r.code !== 0) return [`${name} απέτυχε:\n${tail(`${r.stdout}\n${r.stderr}`)}`];
  }
  return [];
}

export const buildStep: StepDef = {
  name: 'build',
  agent: 'builder',
  readyStates: ['approved_idea'],
  working: 'building',
  done: 'demo_ready',
  budget: 'demos_per_night',
  available: true,
  async execute(ctx, task, cell) {
    const id = cell.id;
    const result = await runLlmStep(ctx, task, cell, {
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
    if (!result.ok || ctx.ps.dryRun) return result;

    const problems = await runShowcaseChecks(ctx, id);
    if (problems.length) return { ok: false, error: problems.join('; '), worker: result.worker, model: result.model };

    if (ctx.env.FACTORY_PUBLISH_BRANCHES === '1') {
      const base = ctx.env.FACTORY_BASE_BRANCH ?? 'main';
      const branch = `demo/${id}`;
      try {
        const pub = await publishFilesToBranch(ctx.exec, {
          repoRoot: ctx.ps.stateRoot,
          branch,
          base,
          files: demoFiles(ctx.ps.stateRoot, id),
          message: `demo: ${cellLabel(ctx.config.matrix, cell)} (${id})`,
        });
        task.meta.branch = branch;
        task.meta.commit = pub.commit;
        if (pub.pushed) {
          task.meta.pr_url = await ensurePullRequest(ctx.exec, {
            repoRoot: ctx.ps.stateRoot,
            repo: ctx.env.GITHUB_REPOSITORY,
            branch,
            base,
            title: `Demo: ${cellLabel(ctx.config.matrix, cell)}`,
            body: `Demo για το κελί \`${id}\`. Περιμένει το Gate 2.\n\nΑναφορά builder: \`pipeline/${id}/build.md\`. Το preview URL το προσθέτει το Vercel σε αυτό το PR.`,
          });
        }
      } catch (err) {
        // Το demo πέρασε τους ελέγχους· το PR μπορεί να ανοίξει και χειροκίνητα.
        ctx.log(`⚠️  ${id}: δεν ανέβηκε το branch ${branch}: ${(err as Error).message}`);
        result.note = `δεν ανέβηκε branch: ${(err as Error).message}`.slice(0, 300);
      }
    }
    return result;
  },
};
