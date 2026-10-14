import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DryRunApprovals } from '../src/approvals/dry-run.ts';
import { publishFilesToBranch } from '../src/git.ts';
import { runCellStep } from '../src/runner.ts';
import { parseTask } from '../src/state/task.ts';
import { defaultExec, type Exec } from '../src/util/exec.ts';
import { FixtureWorker } from '../src/workers/fixture.ts';
import { PreparedWorker } from '../src/workers/prepared.ts';
import { makeCtx, REAL_REPO } from './helpers.ts';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function repoWithRemote(): { work: string; remote: string } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'git-'));
  const remote = path.join(base, 'remote.git');
  const work = path.join(base, 'work');
  git(base, 'init', '--bare', '-b', 'main', remote);
  git(base, 'init', '-b', 'main', work);
  git(work, 'config', 'user.email', 't@example.com');
  git(work, 'config', 'user.name', 'test');
  fs.writeFileSync(path.join(work, 'README.md'), 'base\n');
  git(work, 'add', '.');
  git(work, 'commit', '-m', 'base');
  git(work, 'remote', 'add', 'origin', remote);
  git(work, 'push', '-u', 'origin', 'main');
  git(work, 'checkout', '-b', 'factory/state');
  return { work, remote };
}

describe('publishFilesToBranch', () => {
  it('βάζει ΜΟΝΟ τα αρχεία του demo σε commit πάνω στο main, χωρίς να αλλάξει το τρέχον branch', async () => {
    const { work, remote } = repoWithRemote();
    fs.mkdirSync(path.join(work, 'showcase/src/demos/a-b'), { recursive: true });
    fs.writeFileSync(path.join(work, 'showcase/src/demos/a-b/demo.ts'), 'export const demo = 1;\n');
    fs.writeFileSync(path.join(work, 'unrelated.txt'), 'δεν πρέπει να μπει\n');

    const r = await publishFilesToBranch(defaultExec, {
      repoRoot: work,
      branch: 'demo/a-b',
      base: 'main',
      files: ['showcase/src/demos/a-b/demo.ts'],
      message: 'demo: a-b',
    });
    expect(r.pushed).toBe(true);
    expect(git(work, 'branch', '--show-current')).toBe('factory/state');
    expect(git(work, 'status', '--porcelain')).toContain('unrelated.txt'); // working tree ανέγγιχτο
    const files = git(remote, 'ls-tree', '-r', '--name-only', 'demo/a-b').split('\n');
    expect(files.sort()).toEqual(['README.md', 'showcase/src/demos/a-b/demo.ts']);
    expect(git(remote, 'rev-parse', 'demo/a-b^')).toBe(git(remote, 'rev-parse', 'main'));
  });

  it('αρνείται push στο main', async () => {
    const { work } = repoWithRemote();
    await expect(
      publishFilesToBranch(defaultExec, { repoRoot: work, branch: 'main', base: 'main', files: [], message: 'x' }),
    ).rejects.toThrow(/Άρνηση/);
  });
});

describe('builder: έλεγχοι showcase και PR', () => {
  /** Fake exec: npm/npx περνούν (ή αποτυγχάνουν), git πραγματικό, gh καταγράφεται. */
  function fakeExec(failOn?: string): { exec: Exec; calls: string[] } {
    const calls: string[] = [];
    const exec: Exec = async (cmd, args, opts) => {
      calls.push(`${cmd} ${args.join(' ')}`);
      if (cmd === 'git') return defaultExec(cmd, args, opts);
      if (cmd === 'gh' && args[1] === 'list') return { code: 0, stdout: '', stderr: '' };
      if (cmd === 'gh') return { code: 0, stdout: 'https://github.com/o/r/pull/7\n', stderr: '' };
      if (failOn && args.join(' ').includes(failOn)) return { code: 1, stdout: '1 failed', stderr: 'Error: CTA not visible' };
      return { code: 0, stdout: 'ok', stderr: '' };
    };
    return { exec, calls };
  }

  async function toApprovedIdea(ctx: ReturnType<typeof makeCtx>['ctx']) {
    await runCellStep(ctx, 'iatreia-support', 'scout');
    (ctx.approvals as DryRunApprovals).record('iatreia-support', 'idea', 'approved', 'christos');
  }

  it('τρέχει typecheck, lint και Playwright του demo· ανεβάζει branch demo/<slug> και ανοίγει draft PR', async () => {
    const { work } = repoWithRemote();
    for (const d of ['config', 'agents', 'compliance']) fs.cpSync(path.join(REAL_REPO, d), path.join(work, d), { recursive: true });
    fs.mkdirSync(path.join(work, 'showcase', 'node_modules'), { recursive: true });
    const { exec, calls } = fakeExec();
    const { ctx } = makeCtx({ repo: work, dryRun: false, exec, worker: new FixtureWorker(), env: { FACTORY_PUBLISH_BRANCHES: '1' } });
    await toApprovedIdea(ctx);
    const { runSyncApprovals } = await import('../src/runner.ts');
    await runSyncApprovals(ctx);
    const r = await runCellStep(ctx, 'iatreia-support', 'build');
    expect(r.steps[0]).toMatchObject({ ok: true, to: 'demo_ready' });
    expect(calls).toContain('npm run typecheck');
    expect(calls).toContain('npx playwright test e2e/demos/iatreia-support.spec.ts');
    expect(calls.some((c) => c.startsWith('git push --force origin') && c.endsWith(':refs/heads/demo/iatreia-support'))).toBe(true);
    expect(calls.some((c) => c.startsWith('gh pr create') && c.includes('--draft') && c.includes('--base main'))).toBe(true);
    const t = parseTask(fs.readFileSync(path.join(work, 'pipeline/iatreia-support/task.yaml'), 'utf8'));
    expect(t.meta).toMatchObject({ branch: 'demo/iatreia-support', pr_url: 'https://github.com/o/r/pull/7' });
  });

  it('αν αποτύχει το Playwright, το βήμα αποτυγχάνει με το output και ΔΕΝ ανεβαίνει τίποτα', async () => {
    const { work } = repoWithRemote();
    for (const d of ['config', 'agents', 'compliance']) fs.cpSync(path.join(REAL_REPO, d), path.join(work, d), { recursive: true });
    fs.mkdirSync(path.join(work, 'showcase', 'node_modules'), { recursive: true });
    const { exec, calls } = fakeExec('playwright');
    const { ctx } = makeCtx({ repo: work, dryRun: false, exec, worker: new FixtureWorker(), env: { FACTORY_PUBLISH_BRANCHES: '1' } });
    await toApprovedIdea(ctx);
    const { runSyncApprovals } = await import('../src/runner.ts');
    await runSyncApprovals(ctx);
    const r = await runCellStep(ctx, 'iatreia-support', 'build');
    expect(r.steps[0]!.ok).toBe(false);
    expect(r.steps[0]!.note).toMatch(/playwright 390px απέτυχε[\s\S]*CTA not visible/);
    expect(calls.some((c) => c.startsWith('git push'))).toBe(false);
  });
});

describe('PreparedWorker', () => {
  it('περνά όταν τα αρχεία υπάρχουν· αποτυγχάνει όταν λείπουν', async () => {
    const { ctx, repo } = makeCtx({ worker: new PreparedWorker() });
    const r1 = await runCellStep(ctx, 'iatreia-support', 'scout');
    expect(r1.steps[0]!.note).toMatch(/λείπουν αρχεία/);

    const brief = fs.readFileSync(path.join(REAL_REPO, 'orchestrator', 'fixtures', 'scout', 'brief.md'), 'utf8');
    fs.mkdirSync(path.join(repo, 'pipeline', 'iatreia-support'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'pipeline', 'iatreia-support', 'brief.md'), brief);
    const r2 = await runCellStep(ctx, 'iatreia-support', 'scout');
    expect(r2.steps[0]).toMatchObject({ ok: true, to: 'brief_ready' });
    const t = parseTask(fs.readFileSync(path.join(repo, 'pipeline/iatreia-support/task.yaml'), 'utf8'));
    expect(t.history.at(-1)).toMatchObject({ worker: 'prepared', actor: 'agent:scout' });
  });
});
