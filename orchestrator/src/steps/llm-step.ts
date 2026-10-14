import fs from 'node:fs';
import path from 'node:path';
import type { AgentName, CellDef } from '../config.ts';
import { cellLabel } from '../config.ts';
import type { FactoryContext } from '../context.ts';
import { p } from '../paths.ts';
import { buildPrompt } from '../prompt.ts';
import { enforceScope, takeSnapshot } from '../scope-guard.ts';
import type { Task } from '../state/task.ts';
import { AllWorkersUnavailableError } from '../workers/pool.ts';
import type { StepResult } from './types.ts';

export interface LlmStepSpec {
  agent: AgentName;
  /** Αρχεία που ΠΡΕΠΕΙ να γραφτούν (σχετικά με τη ρίζα του state). */
  outputs: string[];
  /** Globs όπου επιτρέπεται να γράψει ο agent. Περιέχει πάντα τα outputs. */
  writeScope: string[];
  /** Επιπλέον εργαλεία πέρα από ανάγνωση και εγγραφή στο scope (π.χ. WebSearch, Bash(...)). */
  extraTools?: string[];
  reads?: string[];
  extraPrompt?: string;
  /** Έλεγχος του output. Επιστρέφει λίστα προβλημάτων (κενή = εντάξει). */
  validate?: (ctx: FactoryContext, task: Task) => string[];
}

const READ_TOOLS = ['Read', 'Glob', 'Grep'];

export function toolsFor(spec: LlmStepSpec): string[] {
  const write = spec.writeScope.flatMap((g) => [`Edit(${g})`, `Write(${g})`]);
  return [...READ_TOOLS, ...write, ...(spec.extraTools ?? [])];
}

export function templateContext(ctx: FactoryContext, cell: CellDef): Record<string, string> {
  const v = ctx.config.matrix.verticals.find((x) => x.id === cell.vertical);
  const s = ctx.config.matrix.services.find((x) => x.id === cell.service);
  return {
    'cell.id': cell.id,
    'cell.label': cellLabel(ctx.config.matrix, cell),
    'vertical.id': cell.vertical,
    'vertical.name': v?.name ?? cell.vertical,
    'service.id': cell.service,
    'service.name': s?.name ?? cell.service,
    date: ctx.now().toISOString().slice(0, 10),
  };
}

/**
 * Κοινή ροή για κάθε βήμα που τρέχει LLM worker:
 * στιγμιότυπο → worker → έλεγχος write scope (αναίρεση παραβιάσεων) → έλεγχος output.
 */
export async function runLlmStep(ctx: FactoryContext, task: Task, cell: CellDef, spec: LlmStepSpec): Promise<StepResult> {
  const root = ctx.ps.stateRoot;
  const hasFeedback = fs.existsSync(p.feedback(ctx.ps, cell.id));
  const prompt = buildPrompt({
    agent: spec.agent,
    cell,
    config: ctx.config,
    outputs: spec.outputs,
    reads: spec.reads,
    hasFeedback,
    extra: spec.extraPrompt,
  });

  const before = takeSnapshot(root);
  let outcome;
  try {
    outcome = await ctx.pool.runAgent(spec.agent, {
      prompt,
      cwd: root,
      allowedTools: toolsFor(spec),
      cellId: cell.id,
      outputs: spec.outputs,
      context: templateContext(ctx, cell),
    });
  } catch (err) {
    if (err instanceof AllWorkersUnavailableError) {
      return { ok: false, error: err.message, agentUnavailable: true };
    }
    throw err;
  }
  const meta = { worker: outcome.worker, model: outcome.model, durationMs: outcome.result.durationMs };

  const scope = enforceScope(before, spec.writeScope);
  if (scope.violations.length > 0) {
    const detail = [
      `έγραψε εκτός scope: ${scope.violations.join(', ')}`,
      scope.unreverted.length ? `ΔΕΝ αναιρέθηκαν αυτόματα (χρειάζεται git checkout): ${scope.unreverted.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('. ');
    return { ok: false, error: detail, ...meta };
  }

  if (outcome.result.exitReason !== 'ok') {
    return { ok: false, error: `${outcome.result.exitReason}: ${outcome.result.errorMessage ?? ''}`.trim(), ...meta };
  }

  const missing = spec.outputs.filter((o) => !fs.existsSync(path.join(root, o)));
  if (missing.length) return { ok: false, error: `λείπουν αρχεία: ${missing.join(', ')}`, ...meta };

  const problems = spec.validate?.(ctx, task) ?? [];
  if (problems.length) return { ok: false, error: `μη έγκυρο output: ${problems.join('; ')}`, ...meta };

  return { ok: true, ...meta };
}
