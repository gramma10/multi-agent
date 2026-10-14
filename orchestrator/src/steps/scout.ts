import fs from 'node:fs';
import path from 'node:path';
import { runLlmStep } from './llm-step.ts';
import type { StepDef } from './types.ts';

export const BRIEF_HEADINGS = [
  'Το πρόβλημα',
  'Ποιος πονάει',
  'Πηγές',
  'Η ιδέα για το demo',
  'ΠΡΙΝ → ΜΕΤΑ',
  'Σύνδεση με pilot',
  'Βαθμολογία ελκυστικότητας',
  'Υποθέσεις',
] as const;

export interface BriefCheck {
  problems: string[];
  score: number | null;
  sources: number;
}

function section(md: string, heading: string): string | null {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/** Ελέγχει τη μορφή του brief.md όπως ορίζεται στο agents/scout.md. */
export function checkBrief(md: string): BriefCheck {
  const problems: string[] = [];
  if (!/^# Brief:/m.test(md)) problems.push('λείπει ο τίτλος «# Brief: …»');

  let lastIdx = -1;
  for (const h of BRIEF_HEADINGS) {
    const idx = md.indexOf(`\n## ${h}`);
    if (idx === -1) problems.push(`λείπει η ενότητα «${h}»`);
    else if (idx < lastIdx) problems.push(`η ενότητα «${h}» είναι εκτός σειράς`);
    else lastIdx = idx;
  }

  const sourcesText = section(md, 'Πηγές') ?? '';
  const urls = new Set(sourcesText.match(/https?:\/\/[^\s)>\]]+/g) ?? []);
  if (urls.size < 3) problems.push(`χρειάζονται 3–5 πηγές με URL, βρέθηκαν ${urls.size}`);
  if (urls.size > 5) problems.push(`το πολύ 5 πηγές, βρέθηκαν ${urls.size}`);

  const scoreText = section(md, 'Βαθμολογία ελκυστικότητας') ?? '';
  const m = /(\d{1,2})\s*\/\s*10/.exec(scoreText);
  let score: number | null = null;
  if (!m) problems.push('η βαθμολογία πρέπει να είναι στη μορφή «X/10»');
  else {
    score = Number(m[1]);
    if (score < 1 || score > 10) problems.push(`βαθμολογία εκτός 1–10: ${score}`);
  }
  return { problems, score, sources: urls.size };
}

export const scoutStep: StepDef = {
  name: 'scout',
  agent: 'scout',
  readyStates: ['queued'],
  working: 'scouting',
  done: 'brief_ready',
  budget: 'briefs_per_night',
  available: true,
  async execute(ctx, task, cell) {
    const brief = `pipeline/${cell.id}/brief.md`;
    const result = await runLlmStep(ctx, task, cell, {
      agent: 'scout',
      outputs: [brief],
      writeScope: [brief],
      extraTools: ['WebSearch', 'WebFetch'],
      reads: [`config/matrix.yaml (το κελί ${cell.id})`],
      validate: (c) => checkBrief(fs.readFileSync(path.join(c.ps.stateRoot, brief), 'utf8')).problems,
    });
    if (result.ok) {
      const check = checkBrief(fs.readFileSync(path.join(ctx.ps.stateRoot, brief), 'utf8'));
      task.scout_score = check.score;
      result.note = `βαθμολογία ${check.score}/10, ${check.sources} πηγές`;
    }
    return result;
  },
};
