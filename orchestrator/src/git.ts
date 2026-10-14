import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { toPosix } from './util/fs.ts';
import type { Exec } from './util/exec.ts';

export interface PublishBranchInput {
  repoRoot: string;
  /** π.χ. demo/iatreia-support */
  branch: string;
  /** Το branch πάνω στο οποίο χτίζεται το commit (π.χ. main). */
  base: string;
  /** Αρχεία (σχετικά με το repoRoot) που μπαίνουν στο commit. */
  files: string[];
  message: string;
  remote?: string;
}

export interface PublishBranchResult {
  commit: string;
  pushed: boolean;
  baseRef: string;
}

/**
 * Φτιάχνει commit ΜΟΝΟ με τα συγκεκριμένα αρχεία πάνω στο base, χωρίς να αγγίξει το working tree
 * ή το τρέχον branch (προσωρινό index), και το σπρώχνει στο `branch`.
 *
 * Έτσι ο orchestrator συνεχίζει στο δικό του branch, ενώ κάθε demo ανεβαίνει καθαρό, σε δικό του
 * branch `demo/<slug>`, για PR προς το base. Ποτέ push στο base.
 */
export async function publishFilesToBranch(exec: Exec, input: PublishBranchInput): Promise<PublishBranchResult> {
  const remote = input.remote ?? 'origin';
  if (input.branch === input.base || /^(main|master)$/.test(input.branch)) {
    throw new Error(`Άρνηση: δεν κάνουμε push στο ${input.branch}`);
  }
  const git = async (args: string[], env?: NodeJS.ProcessEnv) => {
    const r = await exec('git', args, { cwd: input.repoRoot, env: env ? { ...process.env, ...env } : undefined });
    if (r.code !== 0) throw new Error(`git ${args.slice(0, 2).join(' ')}: ${r.stderr.trim() || r.stdout.trim()}`);
    return r.stdout.trim();
  };

  // base: προτιμάμε το remote, αλλιώς το τοπικό, αλλιώς HEAD (repo χωρίς main ακόμα).
  await exec('git', ['fetch', remote, input.base], { cwd: input.repoRoot });
  let baseRef = '';
  for (const ref of [`${remote}/${input.base}`, input.base, 'HEAD']) {
    const r = await exec('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: input.repoRoot });
    if (r.code === 0) {
      baseRef = r.stdout.trim();
      break;
    }
  }
  if (!baseRef) throw new Error('Δεν βρέθηκε base commit');

  const indexFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'factory-index-')), 'index');
  const env = { GIT_INDEX_FILE: indexFile };
  try {
    await git(['read-tree', baseRef], env);
    for (const rel of input.files) {
      const blob = await git(['hash-object', '-w', '--', rel]);
      await git(['update-index', '--add', '--cacheinfo', `100644,${blob},${toPosix(rel)}`], env);
    }
    const tree = await git(['write-tree'], env);
    const commit = await git(['commit-tree', tree, '-p', baseRef, '-m', input.message]);
    const remotes = await git(['remote']);
    let pushed = false;
    if (remotes.split('\n').includes(remote)) {
      // Το demo/<slug> ανήκει στον orchestrator: ξαναχτίζεται από το base σε κάθε γύρο αλλαγών.
      await git(['push', '--force', remote, `${commit}:refs/heads/${input.branch}`]);
      pushed = true;
    }
    return { commit, pushed, baseRef };
  } finally {
    fs.rmSync(path.dirname(indexFile), { recursive: true, force: true });
  }
}

/** Ανοίγει PR (αν δεν υπάρχει ήδη) με το `gh`. Επιστρέφει το URL. */
export async function ensurePullRequest(
  exec: Exec,
  opts: { repoRoot: string; repo?: string; branch: string; base: string; title: string; body: string },
): Promise<string> {
  const repoArgs = opts.repo ? ['--repo', opts.repo] : [];
  const existing = await exec('gh', ['pr', 'list', ...repoArgs, '--head', opts.branch, '--state', 'open', '--json', 'url', '--jq', '.[0].url'], {
    cwd: opts.repoRoot,
  });
  if (existing.code === 0 && existing.stdout.trim()) return existing.stdout.trim();
  const r = await exec(
    'gh',
    ['pr', 'create', ...repoArgs, '--head', opts.branch, '--base', opts.base, '--title', opts.title, '--body', opts.body, '--draft'],
    { cwd: opts.repoRoot },
  );
  if (r.code !== 0) throw new Error(`gh pr create: ${r.stderr.trim()}`);
  return r.stdout.trim().split('\n').at(-1) ?? '';
}

export function listFilesUnder(root: string, rel: string): string[] {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [toPosix(rel)];
  return fs
    .readdirSync(abs, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => toPosix(path.relative(root, path.join(d.parentPath, d.name))))
    .sort();
}
