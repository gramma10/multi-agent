import fs from 'node:fs';
import path from 'node:path';
import type { CellDef } from '../config.ts';
import type { FactoryContext } from '../context.ts';
import { buildCampaigns } from '../campaigns/build.ts';
import { runCampaignQa, writeQaReports } from '../campaigns/qa-run.ts';
import { PERSONALIZATION_FIELDS, SYSTEM_PLACEHOLDERS } from '../campaigns/render.ts';
import { loadTemplates, TEMPLATE_FILES } from '../campaigns/template.ts';
import { openLeadDb } from '../leads/index.ts';
import { LeadStore } from '../leads/store.ts';
import type { Task } from '../state/task.ts';
import { AllWorkersUnavailableError } from '../workers/pool.ts';
import { runLlmStep } from './llm-step.ts';
import type { StepDef } from './types.ts';

const campaignDir = (id: string) => `pipeline/${id}/campaign`;

function fieldsPrompt(): string {
  return [
    'Πεδία προσωποποίησης που υπάρχουν (ΜΟΝΟ αυτά, και μόνο όταν έχουν πηγή· αλλιώς πάει το default):',
    ...Object.entries(PERSONALIZATION_FIELDS).map(([k, v]) => `- {{${k}}}: ${v.describe}`),
    `Τιμές που βάζει ο κώδικας: ${SYSTEM_PLACEHOLDERS.map((x) => `{{${x}}}`).join(', ')}.`,
    'Συνθήκες στο `when`: `πεδίο == τιμή` (==, !=, >=, <=, >, <), ενωμένες με `&&`, ή `default`.',
    'Τα {{sender_block}} και {{unsubscribe}} τα προσθέτει ο κώδικας σε κάθε μήνυμα: ΜΗΝ τα γράψεις.',
  ].join('\n');
}

/**
 * Outreach: ο agent γράφει τα templates (ποτέ δεν βλέπει leads)· ο κώδικας τα ελέγχει, φτιάχνει τις
 * καμπάνιες στη βάση και αποδίδει τα μηνύματα. Μετά: qa_check.
 */
export const campaignStep: StepDef = {
  name: 'campaign',
  agent: 'outreach',
  readyStates: ['leads_ready'],
  working: 'campaign_drafting',
  done: 'qa_check',
  available: true,
  async execute(ctx, task, cell) {
    const dir = campaignDir(cell.id);
    const r = await runLlmStep(ctx, task, cell, {
      agent: 'outreach',
      outputs: [`${dir}/email.yaml`, `${dir}/call.yaml`, `${dir}/dm.yaml`],
      writeScope: Object.values(TEMPLATE_FILES).map((f) => `${dir}/${f}`),
      reads: [`pipeline/${cell.id}/brief.md`, `pipeline/${cell.id}/content/page.md`, 'config/channels.yaml', 'compliance/LEGAL_STATUS.md'],
      extraPrompt: fieldsPrompt(),
      validate: (c) => loadTemplates(path.join(c.ps.stateRoot, dir)).problems,
    });
    if (!r.ok) return r;
    const db = await openLeadDb(ctx);
    try {
      const store = new LeadStore(db, ctx.now);
      const { templates } = loadTemplates(path.join(ctx.ps.stateRoot, dir));
      const built = await buildCampaigns(ctx, cell, store, templates);
      task.meta.campaigns = built.map((b) => ({ id: b.id, channel: b.channel, members: b.members.length, suppressed: b.skippedSuppressed }));
      if (built.every((b) => b.members.length === 0)) return { ok: false, error: 'καμία καμπάνια δεν έχει μέλη (λείπουν leads με email/τηλέφωνο;)', worker: r.worker };
      r.note = built.map((b) => `${b.channel}: ${b.members.length}`).join(', ');
      return r;
    } finally {
      await db.close();
    }
  },
};

/** QA: deterministic σε κάθε μήνυμα + LLM σε κάθε μοναδικό κείμενο. Περνά → campaign_ready (Gate 4). */
export const qaStep: StepDef = {
  name: 'qa',
  agent: 'qa',
  readyStates: ['qa_check'],
  working: 'qa_check',
  done: 'campaign_ready',
  available: true,
  async execute(ctx, task, cell) {
    const db = await openLeadDb(ctx);
    try {
      const store = new LeadStore(db, ctx.now);
      const { templates, problems } = loadTemplates(path.join(ctx.ps.stateRoot, campaignDir(cell.id)));
      if (problems.length) return { ok: true, nextState: 'campaign_drafting', note: `templates: ${problems.join('; ')}` };
      const built = await buildCampaigns(ctx, cell, store, templates);
      let qa;
      try {
        qa = await runCampaignQa(ctx, cell, store, built);
      } catch (err) {
        return { ok: false, error: (err as Error).message, agentUnavailable: err instanceof AllWorkersUnavailableError };
      }
      const min = ctx.config.volume.campaigns.min_qa_pass_rate;
      writeQaReports(ctx, cell, qa, min);
      const worst = Math.min(...qa.map((q) => (q.total ? q.passRate : 1)));
      const rounds = Number(task.meta.qa_rounds ?? 0) + 1;
      task.meta.qa_rounds = rounds;
      task.meta.qa = qa.map((q) => ({ campaign: q.campaignId, total: q.total, passed: q.passed, pass_rate: Number(q.passRate.toFixed(3)) }));
      const note = qa.map((q) => `${q.channel} ${(q.passRate * 100).toFixed(1)}%`).join(', ');
      if (worst >= min) {
        for (const q of qa) await db.run("update campaigns set status = 'ready', stats = ? where id = ?", [{ total: q.total, passed: q.passed, pass_rate: q.passRate }, q.campaignId]);
        task.meta.qa_rounds = 0;
        return { ok: true, note };
      }
      if (rounds >= ctx.config.volume.campaigns.max_qa_rounds) {
        return { ok: false, error: `QA κάτω από ${(min * 100).toFixed(0)}% μετά από ${rounds} γύρους (${note}). Χρειάζεται άνθρωπος: δες το qa-report.md.` };
      }
      writeQaFeedback(ctx, task, cell, qa.flatMap((q) => q.rejected.map((x) => `- \`${x.textId}\` (${q.channel}): ${x.note}`)));
      return { ok: true, nextState: 'campaign_drafting', note: `QA κάτω από το όριο (${note}), γύρος ${rounds}: ξαναγράφεται` };
    } finally {
      await db.close();
    }
  },
};

function writeQaFeedback(ctx: FactoryContext, task: Task, cell: CellDef, lines: string[]): void {
  const file = path.join(ctx.ps.stateRoot, 'pipeline', cell.id, 'feedback.md');
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : `# Feedback για ${task.id}\n`;
  const block = [`\n## ${ctx.now().toISOString().slice(0, 10)} · QA καμπάνιας · απορρίψεις`, '', 'Ξαναγράψε τα templates ώστε να περνούν αυτούς τους κανόνες (agents/qa.md):', '', ...lines.slice(0, 30), ''].join('\n');
  fs.writeFileSync(file, prev + block);
}
