import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DryRunApprovals } from '../src/approvals/dry-run.ts';
import { findBanned, findClientClaims, findUnsourcedNumbers, loadBannedPhrases, parseBannedPhrases } from '../src/qa/brand.ts';
import { lintContentPack, lintVerticalIntro } from '../src/qa/content-lint.ts';
import { runNight } from '../src/runner.ts';
import { parseTask } from '../src/state/task.ts';
import { makeCtx, REAL_REPO } from './helpers.ts';

const banned = loadBannedPhrases(REAL_REPO);

describe('μαύρη λίστα του brand', () => {
  it('διαβάζεται από το config/brand.md', () => {
    expect(banned).toContain('ψηφιακός μετασχηματισμός');
    expect(banned).toContain('game-changer');
    expect(banned).toContain('συνέργειες');
    expect(banned).toContain('εγγυημένα αποτελέσματα'); // χωρίς το σχόλιο σε παρένθεση
    expect(parseBannedPhrases('# x')).toEqual([]);
  });

  it('πιάνει φράσεις με ή χωρίς τόνους και κεφαλαία', () => {
    expect(findBanned('Ο ΨΗΦΙΑΚΟΣ μετασχηματισμός της επιχείρησής σου', banned)).toEqual(['ψηφιακός μετασχηματισμός']);
    expect(findBanned('Ένα πραγματικό game-changer!', banned)).toEqual(['game-changer']);
    expect(findBanned('Σου γλιτώνει ώρες κάθε εβδομάδα.', banned)).toEqual([]);
  });

  it('πιάνει φράσεις που υπονοούν πελάτες ή αποτελέσματα', () => {
    expect(findClientClaims('Οι πελάτες μας είναι ευχαριστημένοι')).toHaveLength(1);
    expect(findClientClaims('Φτιάξαμε για το ιατρείο του κ. Χ ένα σύστημα')).toHaveLength(1);
    expect(findClientClaims('Φτιάξαμε για το demo ένα φανταστικό ιατρείο')).toHaveLength(0);
    expect(findClientClaims('Φτιάξαμε ένα demo')).toHaveLength(0);
    expect(findClientClaims('Μας εμπιστεύονται 50 επιχειρήσεις')).toHaveLength(1);
  });

  it('πιάνει νούμερα χωρίς πηγή, αφήνει όσα έχουν πηγή ή TODO', () => {
    expect(findUnsourcedNumbers('Μειώνει τα no-show κατά 40%')).toHaveLength(1);
    expect(findUnsourcedNumbers('3x περισσότερες κρατήσεις')).toHaveLength(1);
    expect(findUnsourcedNumbers('+50 επιχειρήσεις')).toHaveLength(1);
    expect(findUnsourcedNumbers('no-show 10–30% ([πηγή](https://example.com))')).toHaveLength(0);
    expect(findUnsourcedNumbers('μείωση {{TODO: πραγματικό νούμερο}}%')).toHaveLength(0);
    expect(findUnsourcedNumbers('Κλήση 30 λεπτών, 166 ή 112, pilot 2–4 εβδομάδων')).toHaveLength(0);
  });
});

describe('content pack', () => {
  it('τα 3 πραγματικά content packs και οι εισαγωγές κλάδων περνούν', () => {
    for (const id of ['kommotiria-booking', 'iatreia-support', 'xenodocheia-sales']) {
      expect(lintContentPack(path.join(REAL_REPO, 'pipeline', id, 'content'), banned), id).toEqual([]);
    }
    for (const v of ['kommotiria', 'iatreia', 'xenodocheia']) {
      expect(lintVerticalIntro(path.join(REAL_REPO, 'pipeline', '_verticals', v, 'intro.md'), banned), v).toEqual([]);
    }
  });

  it('απορρίπτει pack με ελλείψεις και παραβιάσεις', () => {
    const { repo } = makeCtx();
    const dir = path.join(repo, 'pack');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'page.md'), '---\ntitle: x\n---\n## Το πρόβλημα\nΟι πελάτες μας κερδίζουν 30% περισσότερο. Ψηφιακός μετασχηματισμός!\n');
    fs.writeFileSync(path.join(dir, 'reel.md'), '### Reel 1: x\nχωρίς hook\n');
    fs.writeFileSync(path.join(dir, 'linkedin.md'), 'x'.repeat(1400));
    fs.writeFileSync(path.join(dir, 'seo-section.md'), 'λίγες λέξεις');
    const p = lintContentPack(dir, banned);
    const has = (re: RegExp) => expect(p.some((x) => re.test(x)), re.source).toBe(true);
    has(/λείπει το frontmatter «description»/);
    has(/λείπει η ενότητα «Πώς δουλεύει»/);
    has(/πελάτη\/αποτέλεσμα/);
    has(/νούμερο χωρίς πηγή «30%»/);
    has(/ψηφιακός μετασχηματισμός/);
    has(/χρειάζονται 2–3 scripts/);
    has(/δεν έχει Hook/);
    has(/λείπει το loom.md/);
    has(/1400 χαρακτήρες/);
    has(/λείπει το \{\{demo_url\}\}/);
    has(/seo-section.md: 2 λέξεις/);
  });
});

describe('ροή μέχρι τη δημοσίευση (dry-run)', () => {
  it('idea → demo → content → Gate 3 → published.json, και η showcase παίρνει το περιεχόμενο', async () => {
    const { ctx, repo } = makeCtx();
    const approvals = ctx.approvals as DryRunApprovals;
    const id = 'kommotiria-booking';
    const read = () => parseTask(fs.readFileSync(path.join(repo, 'pipeline', id, 'task.yaml'), 'utf8'));
    const published = () => JSON.parse(fs.readFileSync(path.join(repo, 'showcase/content/published.json'), 'utf8')) as string[];

    await runNight(ctx);
    approvals.record(id, 'idea', 'approved', 'christos');
    await runNight(ctx);
    expect(read().state).toBe('demo_ready');
    approvals.record(id, 'demo', 'approved', 'panagiotis');
    await runNight(ctx);
    expect(read().state).toBe('content_ready');

    // Πριν το Gate 3: περιεχόμενο ως πρόχειρο στη showcase, ΟΧΙ δημοσιευμένο.
    expect(fs.existsSync(path.join(repo, 'showcase/content/demos', `${id}.md`))).toBe(true);
    expect(fs.existsSync(path.join(repo, 'showcase/content/seo/kommotiria', `${id}.md`))).toBe(true);
    expect(fs.existsSync(path.join(repo, 'showcase/content/seo/kommotiria/_intro.md'))).toBe(true);
    expect(fs.existsSync(path.join(repo, 'showcase/content/published.json'))).toBe(false);

    approvals.record(id, 'publish', 'approved', 'christos');
    await runNight(ctx);
    // Την ίδια νύχτα ξεκινά και η προμήθεια leads, οπότε το κελί μπορεί να έχει προχωρήσει ήδη.
    expect(['published', 'lead_sourcing', 'leads_ready']).toContain(read().state);
    expect(published()).toEqual([id]);
    expect(read().history.find((h) => h.to === 'published')?.actor).toBe('human:christos');
  });

  it('το content που δεν περνά τον έλεγχο δεν φτάνει ποτέ στο Gate 3', async () => {
    const { FixtureWorker } = await import('../src/workers/fixture.ts');
    const fixture = new FixtureWorker();
    const sloppy = {
      name: 'sloppy',
      async run(i: Parameters<typeof fixture.run>[0]) {
        if (i.agent !== 'content') return fixture.run(i);
        for (const o of i.outputs ?? []) {
          fs.mkdirSync(path.dirname(path.join(i.cwd, o)), { recursive: true });
          fs.writeFileSync(path.join(i.cwd, o), 'Οι πελάτες μας κερδίζουν 300% περισσότερα.');
        }
        return { exitReason: 'ok' as const, output: 'ok', usage: null, durationMs: 1 };
      },
    };
    const { ctx, repo } = makeCtx({ worker: sloppy });
    const approvals = ctx.approvals as DryRunApprovals;
    const id = 'kommotiria-booking';
    await runNight(ctx);
    approvals.record(id, 'idea', 'approved', 'christos');
    await runNight(ctx);
    approvals.record(id, 'demo', 'approved', 'christos');
    const r = await runNight(ctx);
    const step = r.steps.find((s) => s.cell === id && s.step === 'content')!;
    expect(step.ok).toBe(false);
    expect(step.note).toMatch(/πελάτη\/αποτέλεσμα/);
    expect(parseTask(fs.readFileSync(path.join(repo, 'pipeline', id, 'task.yaml'), 'utf8')).state).toBe('content_writing');
    expect(fs.existsSync(path.join(repo, 'showcase/content/demos', `${id}.md`))).toBe(false);
  });
});
