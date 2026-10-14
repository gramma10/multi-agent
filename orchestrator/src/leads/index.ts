import path from 'node:path';
import type { CellDef } from '../config.ts';
import type { FactoryContext } from '../context.ts';
import { openPostgres, openSqlite, type Db } from './db.ts';
import { FakeWorld } from './fake-world.ts';
import { fetchHttp, RateLimiter, type HttpClient } from './http.ts';
import { GemiSource, PlacesSource, type LeadSource } from './sources.ts';
import { LeadStore } from './store.ts';
import { loadLeadsConfig, type LeadsConfig } from './types.ts';
import { WebsiteEnricher } from './website.ts';
import type { LeadEnv } from './pipeline.ts';

/**
 * Πού ζουν τα leads:
 *  - SUPABASE_DB_URL ορισμένο → Postgres (Supabase). Το schema το φτιάχνουν τα migrations.
 *  - αλλιώς SQLite στο <state>/data/leads.sqlite (το data/ δεν μπαίνει ποτέ στο git).
 * Σε CI χωρίς SUPABASE_DB_URL αρνούμαστε: η SQLite θα χανόταν στο τέλος του job.
 */
export async function openLeadDb(ctx: FactoryContext): Promise<Db> {
  const url = ctx.ps.dryRun ? undefined : ctx.env.SUPABASE_DB_URL;
  if (url) return openPostgres(url);
  if (!ctx.ps.dryRun && ctx.env.CI) {
    throw new Error('Στο CI τα leads χρειάζονται SUPABASE_DB_URL (αλλιώς η τοπική SQLite χάνεται στο τέλος του job).');
  }
  return openSqlite(path.join(ctx.ps.stateRoot, 'data', 'leads.sqlite'));
}

export interface LeadEnvOptions {
  /** Περιορισμός σε πόλεις (π.χ. δοκιμή με πραγματικά κλειδιά για 1 πόλη). */
  cities?: string[];
  /** HTTP client για tests. Σε dry-run: ο FakeWorld. */
  http?: HttpClient;
  sleep?: (ms: number) => Promise<void>;
}

function seedOf(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export async function buildLeadEnv(
  ctx: FactoryContext,
  cell: CellDef,
  db: Db,
  opts: LeadEnvOptions = {},
): Promise<{ env: LeadEnv; cfg: LeadsConfig; cities: string[]; placesTerms: string[]; kad: string[] }> {
  const cfg = loadLeadsConfig(ctx.ps);
  const v = ctx.config.matrix.verticals.find((x) => x.id === cell.vertical);
  const kad = v?.kad ?? [];
  const placesTerms = v?.places ?? [];
  const cities = opts.cities?.length ? opts.cities : cfg.cities;
  const limiter = new RateLimiter(() => Date.now(), opts.sleep);

  let http = opts.http;
  let placesKey = ctx.env[cfg.sources.places.secret_env];
  let gemiKey = ctx.env[cfg.sources.gemi.secret_env];
  if (ctx.ps.dryRun && !http) {
    const size = Number(ctx.env.FACTORY_FAKE_LEADS ?? 300);
    const world = new FakeWorld({ seed: seedOf(cell.id), size, vertical: cell.vertical, kad: kad[0] ?? '00.00', terms: placesTerms.length ? placesTerms : ['επιχείρηση'], cities });
    http = world.http;
    placesKey = 'fake';
    gemiKey = 'fake';
  }
  if (ctx.ps.dryRun) limiter.wait = async () => {}; // στο dry-run δεν περιμένουμε πραγματικά
  http ??= fetchHttp;

  const sources: LeadSource[] = [];
  if (gemiKey && kad.length) sources.push(new GemiSource(cfg.sources.gemi, gemiKey, http, limiter));
  if (placesKey && placesTerms.length) sources.push(new PlacesSource(cfg.sources.places, placesKey, http, limiter));

  return {
    env: {
      store: new LeadStore(db, ctx.now),
      sources,
      enricher: new WebsiteEnricher(cfg, http, limiter),
      cfg,
      now: ctx.now,
      log: ctx.log,
    },
    cfg,
    cities,
    placesTerms,
    kad,
  };
}
