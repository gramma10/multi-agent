import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, parseMatrix } from '../src/config.ts';
import { sortCells, updateMatrixCells } from '../src/matrix.ts';
import { resolvePaths } from '../src/paths.ts';
import { makeTempRepo, REAL_REPO } from './helpers.ts';

describe('config/matrix.yaml', () => {
  const real = fs.readFileSync(path.join(REAL_REPO, 'config', 'matrix.yaml'), 'utf8');

  it('έχει 60 κελιά (10 κλάδοι × 6 υπηρεσίες) με μοναδικά ids', () => {
    const m = parseMatrix(real);
    expect(m.verticals).toHaveLength(10);
    expect(m.services).toHaveLength(6);
    expect(m.cells).toHaveLength(60);
    expect(new Set(m.cells.map((c) => c.id)).size).toBe(60);
    expect(m.cells.every((c) => !c.synthesized)).toBe(true);
  });

  it('όλα τα config φορτώνουν και περνούν validation', () => {
    const cfg = loadConfig(resolvePaths({ repoRoot: REAL_REPO, dryRun: false }));
    expect(cfg.volume.email.inboxes).toBe(0);
    expect(cfg.channels.channels.find((c) => c.id === 'inbound')?.legal_status).toBe('approved');
    expect(cfg.channels.channels.filter((c) => c.id !== 'inbound').every((c) => c.legal_status === 'pending')).toBe(true);
  });

  it('διαλέγει πρώτα fit high και μετά priority', () => {
    const sorted = sortCells(parseMatrix(real).cells);
    expect(sorted.slice(0, 3).map((c) => c.id)).toEqual(['kommotiria-booking', 'iatreia-support', 'xenodocheia-sales']);
    const firstNonHigh = sorted.findIndex((c) => c.fit !== 'high');
    expect(sorted.slice(firstNonHigh).some((c) => c.fit === 'high')).toBe(false);
    for (let i = 1; i < firstNonHigh; i++) expect(sorted[i - 1]!.priority).toBeGreaterThanOrEqual(sorted[i]!.priority);
  });

  it('νέος κλάδος σε μία γραμμή → 6 κελιά αυτόματα', () => {
    const text = real.replace(
      'services:',
      '  - { id: ktiniatreia, name: "Κτηνιατρεία", kad: ["75.00"], places: ["κτηνίατρος"] }\n\nservices:',
    );
    const m = parseMatrix(text);
    const added = m.cells.filter((c) => c.vertical === 'ktiniatreia');
    expect(added).toHaveLength(6);
    expect(added.every((c) => c.synthesized && c.fit === 'medium' && c.priority === 40)).toBe(true);
    expect(added.map((c) => c.id)).toContain('ktiniatreia-booking');
  });

  it('απορρίπτει διπλά ids και άγνωστους κλάδους', () => {
    const dup = real.replace('  - id: kommotiria-support', '  - id: kommotiria-sales');
    expect(() => parseMatrix(dup)).toThrow(/διπλό/);
    const bad = real.replace('    vertical: estiasi\n    service: sales_agent', '    vertical: nope\n    service: sales_agent');
    expect(() => parseMatrix(bad)).toThrow(/άγνωστο κλάδο/);
  });

  it('η ενημέρωση status/priority κρατά τα σχόλια του αρχείου', () => {
    const repo = makeTempRepo();
    const ps = resolvePaths({ repoRoot: repo, dryRun: false });
    updateMatrixCells(ps, { 'iatreia-support': { status: 'brief_ready', priority: 77 } });
    const after = fs.readFileSync(path.join(repo, 'config', 'matrix.yaml'), 'utf8');
    expect(after).toContain('# Πίνακας εργασιών: κλάδος × υπηρεσία');
    const m = parseMatrix(after);
    expect(m.cells.find((c) => c.id === 'iatreia-support')).toMatchObject({ status: 'brief_ready', priority: 77 });
    expect(m.cells.find((c) => c.id === 'iatreia-sales')?.status).toBe('queued');
  });
});
