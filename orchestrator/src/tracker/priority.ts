import fs from 'node:fs';
import path from 'node:path';
import type { CellDef } from '../config.ts';
import type { FactoryContext } from '../context.ts';
import { updateMatrixCells } from '../matrix.ts';
import { writeFileAtomic } from '../util/fs.ts';
import { positives, type Metrics } from './metrics.ts';

export interface PriorityChange {
  cellId: string;
  from: number;
  to: number;
  /** Η αλλαγή που προκύπτει από την εβδομάδα (πριν από τα όρια 0–100). */
  delta: number;
  reasons: string[];
}

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/** Βάρη: μια κλήση αξίζει περισσότερο από μια θετική απάντηση, ένα pilot περισσότερο από μια κλήση. */
export const WEIGHTS = { call: 5, pilot: 10, positive: 2, noResponse: -10, siblingPerCall: 2, siblingMax: 6 };

/**
 * Αλλαγές priority για μια εβδομάδα:
 *  - κάθε κλήση/pilot/θετική απάντηση της εβδομάδας ανεβάζει το κελί,
 *  - τα άλλα κελιά του ίδιου κλάδου ανεβαίνουν λίγο όταν ο κλάδος φέρνει κλήσεις,
 *  - κελί χωρίς καμία θετική απόκριση μετά από `min_contacts_before_judging` επαφές πέφτει,
 *  - η αλλαγή ανά εβδομάδα κόβεται στο ±`max_priority_change_per_week`.
 */
export function computePriorityChanges(
  ctx: FactoryContext,
  week: Map<string, Metrics>,
  total: Map<string, Metrics>,
): Array<Omit<PriorityChange, 'from' | 'to'>> {
  const g = ctx.config.volume.guards;
  const cap = g.max_priority_change_per_week;
  const cells = ctx.config.matrix.cells;
  const callsByVertical = new Map<string, number>();
  for (const c of cells) callsByVertical.set(c.vertical, (callsByVertical.get(c.vertical) ?? 0) + (week.get(c.id)?.calls ?? 0) + (week.get(c.id)?.pilots ?? 0));

  const out: Array<Omit<PriorityChange, 'from' | 'to'>> = [];
  for (const c of cells) {
    const w = week.get(c.id);
    const t = total.get(c.id);
    let delta = 0;
    const reasons: string[] = [];
    if (w?.calls) {
      delta += WEIGHTS.call * w.calls;
      reasons.push(`${n(w.calls, 'κλήση', 'κλήσεις')} Χάρτη AI (+${WEIGHTS.call} η καθεμία)`);
    }
    if (w?.pilots) {
      delta += WEIGHTS.pilot * w.pilots;
      reasons.push(`${n(w.pilots, 'pilot', 'pilots')} (+${WEIGHTS.pilot} το καθένα)`);
    }
    if (w?.positive) {
      delta += WEIGHTS.positive * w.positive;
      reasons.push(`${n(w.positive, 'θετική απάντηση', 'θετικές απαντήσεις')} (+${WEIGHTS.positive} η καθεμία)`);
    }
    const siblingCalls = (callsByVertical.get(c.vertical) ?? 0) - (w?.calls ?? 0) - (w?.pilots ?? 0);
    if (siblingCalls > 0) {
      const s = Math.min(WEIGHTS.siblingMax, WEIGHTS.siblingPerCall * siblingCalls);
      delta += s;
      reasons.push(`ο κλάδος έφερε ${n(siblingCalls, 'κλήση ή pilot', 'κλήσεις ή pilots')} σε άλλο κελί (+${s})`);
    }
    if (t && t.contacts >= g.min_contacts_before_judging && positives(t) === 0) {
      delta += WEIGHTS.noResponse;
      reasons.push(`καμία θετική απόκριση σε ${t.contacts} επαφές (${WEIGHTS.noResponse})`);
    }
    if (delta === 0) continue;
    const capped = Math.max(-cap, Math.min(cap, delta));
    if (capped !== delta) reasons.push(`όριο ±${cap} την εβδομάδα (αντί για ${delta > 0 ? '+' : ''}${delta})`);
    out.push({ cellId: c.id, delta: capped, reasons });
  }
  return out;
}

interface TrackerState {
  /** Τι έχει ήδη εφαρμοστεί ανά εβδομάδα και κελί: το report μπορεί να ξανατρέξει χωρίς διπλή αλλαγή. */
  applied: Record<string, Record<string, number>>;
}

const stateFile = (ctx: FactoryContext) => path.join(ctx.ps.stateRoot, 'reports', 'tracker-state.json');

function readState(ctx: FactoryContext): TrackerState {
  try {
    return JSON.parse(fs.readFileSync(stateFile(ctx), 'utf8')) as TrackerState;
  } catch {
    return { applied: {} };
  }
}

/**
 * Γράφει τα νέα priority στο matrix.yaml (μόνο το πεδίο priority). Idempotent ανά εβδομάδα:
 * αν το report της ίδιας εβδομάδας ξανατρέξει, εφαρμόζεται μόνο η διαφορά από την προηγούμενη φορά.
 */
export function applyPriorityChanges(ctx: FactoryContext, week: string, changes: Array<Omit<PriorityChange, 'from' | 'to'>>): PriorityChange[] {
  const st = readState(ctx);
  const applied = (st.applied[week] ??= {});
  const byId = new Map<string, CellDef>(ctx.config.matrix.cells.map((c) => [c.id, c]));
  const wanted = new Map(changes.map((c) => [c.cellId, c]));
  for (const id of Object.keys(applied)) if (!wanted.has(id)) wanted.set(id, { cellId: id, delta: 0, reasons: ['καμία αλλαγή μετά τα νέα δεδομένα'] });

  const updates: Record<string, { priority: number }> = {};
  const out: PriorityChange[] = [];
  for (const ch of wanted.values()) {
    const cell = byId.get(ch.cellId);
    if (!cell) continue;
    const step = ch.delta - (applied[ch.cellId] ?? 0);
    const to = Math.max(0, Math.min(100, cell.priority + step));
    applied[ch.cellId] = (applied[ch.cellId] ?? 0) + (to - cell.priority);
    if (to !== cell.priority) {
      updates[cell.id] = { priority: to };
      cell.priority = to;
    }
    if (ch.delta !== 0) out.push({ ...ch, from: to - applied[ch.cellId]!, to });
  }
  if (Object.keys(updates).length) updateMatrixCells(ctx.ps, updates);
  writeFileAtomic(stateFile(ctx), JSON.stringify(st, null, 2) + '\n');
  return out;
}
