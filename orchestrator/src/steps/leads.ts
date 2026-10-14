import fs from 'node:fs';
import path from 'node:path';
import type { CellDef } from '../config.ts';
import type { FactoryContext } from '../context.ts';
import { buildLeadEnv, openLeadDb, type LeadEnvOptions } from '../leads/index.ts';
import { renderLeadStats, runLeadSourcing, type LeadRunStats } from '../leads/pipeline.ts';
import type { StepDef } from './types.ts';

/**
 * Προμήθεια leads για ένα κελί. Κώδικας, όχι LLM (agents/leads.md). Σέβεται το leads_per_day
 * (κοινό για όλα τα κελιά) και συνεχίζει από τον cursor την επόμενη φορά.
 */
export async function sourceLeads(
  ctx: FactoryContext,
  cell: CellDef,
  opts: LeadEnvOptions & { limit?: number } = {},
): Promise<{ stats: LeadRunStats; statsFile: string; sourcesUsed: string[] }> {
  const db = await openLeadDb(ctx);
  try {
    const { env, cities, placesTerms, kad } = await buildLeadEnv(ctx, cell, db, opts);
    if (env.sources.length === 0) {
      throw new Error('Καμία πηγή leads: λείπουν GOOGLE_PLACES_API_KEY και GEMI_API_KEY (ή ΚΑΔ/όροι για τον κλάδο στο matrix.yaml).');
    }
    const left = Math.max(0, ctx.config.volume.leads_per_day - (await env.store.importedToday()));
    const budget = Math.min(left, opts.limit ?? Infinity);
    const stats = await runLeadSourcing(env, { cellId: cell.id, vertical: cell.vertical, service: cell.service, kad, placesTerms, cities, budget });
    const totals = await env.store.cellStats(cell.id);
    const statsFile = path.join(ctx.ps.stateRoot, 'pipeline', cell.id, 'campaign', 'leads-stats.md');
    fs.mkdirSync(path.dirname(statsFile), { recursive: true });
    fs.writeFileSync(statsFile, renderLeadStats(cell.id, stats, totals, ctx.now()));
    return { stats, statsFile, sourcesUsed: env.sources.map((s) => s.name) };
  } finally {
    await db.close();
  }
}

export const leadsStep: StepDef = {
  name: 'leads',
  agent: null,
  readyStates: ['published'],
  working: 'lead_sourcing',
  done: 'leads_ready',
  available: true,
  async execute(ctx, task, cell) {
    let r;
    try {
      r = await sourceLeads(ctx, cell);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
    const s = r.stats;
    task.meta.leads = { last_run: ctx.now().toISOString(), inserted: s.inserted, merged: s.merged, suppressed: s.suppressed, sources: r.sourcesUsed };
    const note = `${s.inserted} νέα, ${s.merged} διπλότυπα, ${s.suppressed} suppressed`;
    // Τελείωσαν οι πηγές → leads_ready. Αλλιώς μένει σε lead_sourcing και συνεχίζει αύριο.
    return s.exhausted ? { ok: true, note } : { ok: true, stay: true, note: `${note} · συνεχίζει (${s.stoppedBy === 'budget' ? 'όριο ημέρας' : 'quota'})` };
  },
};
