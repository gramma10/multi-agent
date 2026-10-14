import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, type CreateContextOptions, type FactoryContext } from '../src/context.ts';

export const REAL_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Φτιάχνει προσωρινό «repo» με αντίγραφο των πραγματικών config/, agents/, compliance/, CLAUDE.md. */
export function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-test-'));
  for (const d of ['config', 'agents', 'compliance']) {
    fs.cpSync(path.join(REAL_REPO, d), path.join(dir, d), { recursive: true });
  }
  fs.copyFileSync(path.join(REAL_REPO, 'CLAUDE.md'), path.join(dir, 'CLAUDE.md'));
  return dir;
}

export class Clock {
  constructor(public t: Date = new Date('2026-10-14T22:00:00Z')) {}
  now = (): Date => new Date(this.t);
  advance(ms: number): void {
    this.t = new Date(this.t.getTime() + ms);
  }
}

export interface TestCtx {
  ctx: FactoryContext;
  repo: string;
  clock: Clock;
  logs: string[];
}

/** Context σε προσωρινό repo, με τη ρίζα του state ΙΣΗ με το repo (όπως σε κανονική εκτέλεση). */
export function makeCtx(opts: Partial<CreateContextOptions> & { repo?: string; clock?: Clock } = {}): TestCtx {
  const repo = opts.repo ?? makeTempRepo();
  const clock = opts.clock ?? new Clock();
  const logs: string[] = [];
  const ctx = createContext({
    dryRun: true,
    repoRoot: repo,
    stateRoot: repo,
    now: clock.now,
    log: (m) => logs.push(m),
    env: {},
    ...opts,
  });
  return { ctx, repo, clock, logs };
}

export function setVolume(repo: string, patch: Record<string, number>): void {
  const file = path.join(repo, 'config', 'volume.yaml');
  let text = fs.readFileSync(file, 'utf8');
  for (const [k, v] of Object.entries(patch)) {
    text = text.replace(new RegExp(`^${k}:.*$`, 'm'), `${k}: ${v}`);
  }
  fs.writeFileSync(file, text);
}
