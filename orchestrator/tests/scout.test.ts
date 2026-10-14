import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkBrief } from '../src/steps/scout.ts';
import { FIXTURES_DIR } from '../src/workers/fixture.ts';

const good = fs.readFileSync(path.join(FIXTURES_DIR, 'scout', 'brief.md'), 'utf8');

describe('έλεγχος brief.md', () => {
  it('το fixture περνά', () => {
    expect(checkBrief(good)).toEqual({ problems: [], score: 7, sources: 3 });
  });

  it('λιγότερες από 3 πηγές', () => {
    const bad = good.replace(/^3\. .*$/m, '');
    expect(checkBrief(bad).problems).toContain('χρειάζονται 3–5 πηγές με URL, βρέθηκαν 2');
  });

  it('χωρίς βαθμολογία X/10', () => {
    expect(checkBrief(good.replace('7/10', 'επτά')).problems).toContain('η βαθμολογία πρέπει να είναι στη μορφή «X/10»');
  });

  it('ενότητα εκτός σειράς ή που λείπει', () => {
    const swapped = good.replace('## Ποιος πονάει', '## TMP').replace('## Το πρόβλημα', '## Ποιος πονάει').replace('## TMP', '## Το πρόβλημα');
    expect(checkBrief(swapped).problems.some((p) => p.includes('εκτός σειράς'))).toBe(true);
    expect(checkBrief(good.replace('## Υποθέσεις', '')).problems).toContain('λείπει η ενότητα «Υποθέσεις»');
  });
});
