import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { enforceScope, takeSnapshot } from '../src/scope-guard.ts';
import { globToRegExp, matchesAny } from '../src/util/glob.ts';

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-'));
  fs.mkdirSync(path.join(d, 'pipeline', 'a'), { recursive: true });
  fs.mkdirSync(path.join(d, 'config'), { recursive: true });
  fs.writeFileSync(path.join(d, 'pipeline', 'a', 'task.yaml'), 'state: scouting\n');
  fs.writeFileSync(path.join(d, 'config', 'volume.yaml'), 'leads_per_day: 1000\n');
  fs.writeFileSync(path.join(d, 'README.md'), 'hello\n');
  return d;
}

describe('glob', () => {
  it('ταιριάζει * και **', () => {
    expect(matchesAny('showcase/src/demos/a/demo.ts', ['showcase/src/demos/a/**'])).toBe(true);
    expect(matchesAny('showcase/src/demos/a/x/y.tsx', ['showcase/src/demos/a/**'])).toBe(true);
    expect(matchesAny('showcase/src/demos/b/demo.ts', ['showcase/src/demos/a/**'])).toBe(false);
    expect(matchesAny('pipeline/a/task.yaml', ['pipeline/*/task.yaml'])).toBe(true);
    expect(matchesAny('pipeline/a/b/task.yaml', ['pipeline/*/task.yaml'])).toBe(false);
    expect(globToRegExp('a.b').test('axb')).toBe(false);
  });
});

describe('scope guard', () => {
  it('δέχεται αλλαγές μέσα στο scope', () => {
    const d = tmp();
    const snap = takeSnapshot(d);
    fs.writeFileSync(path.join(d, 'pipeline', 'a', 'brief.md'), '# Brief');
    const r = enforceScope(snap, ['pipeline/a/brief.md']);
    expect(r.violations).toEqual([]);
    expect(r.changed).toEqual(['pipeline/a/brief.md']);
  });

  it('επαναφέρει προστατευμένα αρχεία ακόμα κι αν είναι μέσα σε ευρύ scope', () => {
    const d = tmp();
    const snap = takeSnapshot(d);
    fs.writeFileSync(path.join(d, 'pipeline', 'a', 'task.yaml'), 'state: approved_idea\n');
    fs.writeFileSync(path.join(d, 'config', 'volume.yaml'), 'leads_per_day: 999999\n');
    const r = enforceScope(snap, ['pipeline/a/**', 'config/**']);
    expect(r.violations.sort()).toEqual(['config/volume.yaml', 'pipeline/a/task.yaml']);
    expect(fs.readFileSync(path.join(d, 'pipeline', 'a', 'task.yaml'), 'utf8')).toBe('state: scouting\n');
    expect(fs.readFileSync(path.join(d, 'config', 'volume.yaml'), 'utf8')).toBe('leads_per_day: 1000\n');
  });

  it('σβήνει νέα αρχεία εκτός scope, επαναφέρει σβησμένα προστατευμένα, αναφέρει τα υπόλοιπα', () => {
    const d = tmp();
    const snap = takeSnapshot(d);
    fs.writeFileSync(path.join(d, 'evil.sh'), 'rm -rf /');
    fs.rmSync(path.join(d, 'pipeline', 'a', 'task.yaml'));
    fs.appendFileSync(path.join(d, 'README.md'), 'changed\n');
    const r = enforceScope(snap, ['pipeline/a/brief.md']);
    expect(fs.existsSync(path.join(d, 'evil.sh'))).toBe(false);
    expect(fs.existsSync(path.join(d, 'pipeline', 'a', 'task.yaml'))).toBe(true);
    expect(r.unreverted).toEqual(['README.md']);
  });

  it('αγνοεί node_modules και .git', () => {
    const d = tmp();
    const snap = takeSnapshot(d);
    fs.mkdirSync(path.join(d, 'node_modules', 'x'), { recursive: true });
    fs.writeFileSync(path.join(d, 'node_modules', 'x', 'i.js'), '');
    expect(enforceScope(snap, []).violations).toEqual([]);
  });
});
