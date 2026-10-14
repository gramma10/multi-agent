import fs from 'node:fs';
import { p, type FactoryPaths } from './paths.ts';

/**
 * Κουμπί κινδύνου: αρχείο PAUSE στη ρίζα του repo, ή FACTORY_PAUSED=true
 * (στο GitHub Actions περνά από το repo variable).
 */
export function pauseReason(ps: FactoryPaths, env: NodeJS.ProcessEnv = process.env): string | null {
  if (fs.existsSync(p.pause(ps))) return 'υπάρχει αρχείο PAUSE στη ρίζα του repo';
  const v = (env.FACTORY_PAUSED ?? '').trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return 'FACTORY_PAUSED=true';
  return null;
}
