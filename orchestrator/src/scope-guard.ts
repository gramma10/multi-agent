import fs from 'node:fs';
import path from 'node:path';
import { matchesAny } from './util/glob.ts';
import { toPosix } from './util/fs.ts';

/**
 * Ελάχιστα δικαιώματα (§5.3), επιβεβλημένα από τον orchestrator και όχι μόνο από το CLI:
 * πριν από κάθε εκτέλεση worker κρατάμε στιγμιότυπο των αρχείων· μετά, ό,τι άλλαξε εκτός
 * του write scope του agent αναιρείται και το βήμα αποτυγχάνει.
 *
 * Τα «προστατευμένα» αρχεία (task.yaml, review/, compliance/, config/) κρατιούνται ολόκληρα
 * στη μνήμη και επαναφέρονται byte-προς-byte. Για τα υπόλοιπα: νέα αρχεία σβήνονται,
 * τροποποιημένα αναφέρονται (και επαναφέρονται από git από τον caller, αν υπάρχει).
 */

const IGNORE_DIRS = new Set(['.git', 'node_modules', '.next', 'test-results', 'playwright-report', 'blob-report', '.turbo']);
const IGNORE_FILES = new Set(['.factory.lock']);
/** Αρχεία που γράφει ο ίδιος ο orchestrator ΕΝΩ τρέχει ο worker (logs). Δεν μετρούν ως αλλαγές του agent. */
const ORCHESTRATOR_LOGS = new Set(['reports/usage.jsonl', 'reports/worker-state.json', 'reports/gates-dry-run.log']);

export const PROTECTED_GLOBS = [
  'pipeline/*/task.yaml',
  'review/**',
  'compliance/**',
  'config/**',
  'CLAUDE.md',
  'agents/**',
  'PAUSE',
  '.github/**',
];

interface FileSig {
  size: number;
  mtimeMs: number;
}

export interface Snapshot {
  root: string;
  files: Map<string, FileSig>;
  protectedContent: Map<string, Buffer>;
}

function walk(root: string, dir: string, out: Map<string, FileSig>): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      // Το sandbox του dry-run δεν ανήκει στο scope κανενός agent όταν τρέχουμε στο πραγματικό repo.
      if (dir === root && e.name === '.dry-run') continue;
      walk(root, abs, out);
    } else if (e.isFile()) {
      if (IGNORE_FILES.has(e.name) || e.name.endsWith('.tmp')) continue;
      const rel = toPosix(path.relative(root, abs));
      if (ORCHESTRATOR_LOGS.has(rel)) continue;
      const st = fs.statSync(abs);
      out.set(rel, { size: st.size, mtimeMs: st.mtimeMs });
    }
  }
}

export function takeSnapshot(root: string): Snapshot {
  const files = new Map<string, FileSig>();
  walk(root, root, files);
  const protectedContent = new Map<string, Buffer>();
  for (const rel of files.keys()) {
    if (matchesAny(rel, PROTECTED_GLOBS)) protectedContent.set(rel, fs.readFileSync(path.join(root, rel)));
  }
  return { root, files, protectedContent };
}

export interface ScopeCheckResult {
  changed: string[];
  violations: string[];
  /** Τι έκανε ο guard για να αναιρέσει τις παραβιάσεις. */
  reverted: string[];
  /** Παραβιάσεις που δεν μπόρεσε να αναιρέσει μόνος του (τροποποιημένα μη προστατευμένα αρχεία). */
  unreverted: string[];
}

export function diffSnapshot(before: Snapshot): { changed: string[]; deleted: string[] } {
  const after = new Map<string, FileSig>();
  walk(before.root, before.root, after);
  const changed: string[] = [];
  for (const [rel, sig] of after) {
    const prev = before.files.get(rel);
    if (!prev || prev.size !== sig.size || prev.mtimeMs !== sig.mtimeMs) changed.push(rel);
  }
  const deleted = [...before.files.keys()].filter((rel) => !after.has(rel));
  return { changed: changed.sort(), deleted: deleted.sort() };
}

export function enforceScope(before: Snapshot, allowed: readonly string[]): ScopeCheckResult {
  const { changed, deleted } = diffSnapshot(before);
  const touched = [...changed, ...deleted];
  const violations = touched.filter((rel) => !matchesAny(rel, allowed) || matchesAny(rel, PROTECTED_GLOBS));
  const reverted: string[] = [];
  const unreverted: string[] = [];
  for (const rel of violations) {
    const abs = path.join(before.root, rel);
    const saved = before.protectedContent.get(rel);
    if (saved) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, saved);
      reverted.push(rel);
    } else if (!before.files.has(rel)) {
      fs.rmSync(abs, { force: true });
      reverted.push(rel);
    } else {
      unreverted.push(rel);
    }
  }
  return { changed: touched, violations, reverted, unreverted };
}
