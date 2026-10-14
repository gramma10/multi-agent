import { execFile } from 'node:child_process';
import type { GateId, GatesConfig } from '../config.ts';
import { realApprovers } from '../config.ts';
import type { GateDecision } from '../state/machine.ts';
import type { Task } from '../state/task.ts';
import type { ApprovalsAdapter, Decision, GateRequest, OpenedGate } from './types.ts';

/** Τρέχει `gh` και επιστρέφει stdout. Injectable για tests. */
export type GhExec = (args: string[]) => Promise<string>;

export const defaultGhExec: GhExec = (args) =>
  new Promise((resolve, reject) => {
    execFile('gh', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`gh ${args.slice(0, 2).join(' ')}: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });

interface IssueEvent {
  event: string;
  created_at: string;
  actor?: { login: string; type?: string } | null;
  label?: { name: string } | null;
}

interface IssueComment {
  body: string;
  created_at: string;
  user?: { login: string; type?: string } | null;
}

/**
 * Εγκρίσεις μέσω GitHub Issues (δουλεύει από κινητό).
 *
 * Ασφάλεια (D007): ένα label μετράει μόνο αν το έβαλε λογαριασμός από τη λίστα approvers
 * και ΔΕΝ είναι bot. Αυτό ελέγχεται από τα events του issue, όχι από τα τρέχοντα labels,
 * γιατί το token του orchestrator μπορεί τεχνικά να βάλει labels.
 */
export class GitHubApprovals implements ApprovalsAdapter {
  readonly kind = 'github' as const;

  constructor(
    private readonly repo: string,
    private readonly gates: GatesConfig,
    private readonly gh: GhExec = defaultGhExec,
  ) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`Μη έγκυρο repo «${repo}» (θέλει owner/name)`);
  }

  private labelToDecision(name: string): GateDecision | null {
    const l = this.gates.labels;
    if (name === l.approved) return 'approved';
    if (name === l.changes) return 'changes';
    if (name === l.rejected) return 'rejected';
    return null;
  }

  async ensureLabels(): Promise<void> {
    const l = this.gates.labels;
    const want: Array<[string, string, string]> = [
      [l.gate, '6c8ebf', 'Περιμένει απόφαση ιδρυτή'],
      [l.approved, '2da44e', 'Εγκρίνεται: προχωρά'],
      [l.changes, 'd79b00', 'Αλλαγές: γράψε σχόλιο'],
      [l.rejected, 'b85450', 'Απορρίπτεται'],
      ['alert', 'b60205', 'Αυτόματη προστασία'],
    ];
    for (const [name, color, desc] of want) {
      await this.gh(['label', 'create', name, '--repo', this.repo, '--color', color, '--description', desc, '--force']);
    }
  }

  async openGate(req: GateRequest): Promise<OpenedGate> {
    const out = await this.gh([
      'issue',
      'create',
      '--repo',
      this.repo,
      '--title',
      req.title,
      '--body',
      req.body,
      '--label',
      this.gates.labels.gate,
    ]);
    const url = out.trim().split('\n').at(-1) ?? '';
    const m = /\/issues\/(\d+)/.exec(url);
    if (!m) throw new Error(`Δεν βρέθηκε αριθμός issue στο output του gh: ${out}`);
    return { ref: m[1]!, url };
  }

  async readDecision(task: Task, gate: GateId): Promise<Decision | null> {
    const ref = task.gates[gate]?.ref;
    if (!ref || !/^\d+$/.test(ref)) return null;
    const approvers = new Set(realApprovers(this.gates).map((a) => a.toLowerCase()));
    if (approvers.size === 0) return null; // χωρίς approvers κανείς δεν περνά gate

    const events = JSON.parse(
      await this.gh(['api', `repos/${this.repo}/issues/${ref}/events?per_page=100`]),
    ) as IssueEvent[];
    const isHuman = (a: { login: string; type?: string } | null | undefined) =>
      !!a && a.type !== 'Bot' && !a.login.endsWith('[bot]') && approvers.has(a.login.toLowerCase());

    const labeled = events
      .filter((e) => e.event === 'labeled' && e.label && this.labelToDecision(e.label.name) && isHuman(e.actor))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const last = labeled.at(-1);
    if (!last) return null;
    // Αν ο ίδιος άνθρωπος αφαίρεσε μετά το label, δεν μετράει.
    const removedAfter = events.some(
      (e) => e.event === 'unlabeled' && e.label?.name === last.label!.name && e.created_at > last.created_at,
    );
    if (removedAfter) return null;

    const comments = JSON.parse(
      await this.gh(['api', `repos/${this.repo}/issues/${ref}/comments?per_page=100`]),
    ) as IssueComment[];
    const opened = task.gates[gate]?.opened_at ?? '';
    const humanComments = comments
      .filter((c) => isHuman(c.user) && c.created_at >= opened)
      .map((c) => c.body.trim())
      .filter(Boolean);

    return {
      decision: this.labelToDecision(last.label!.name)!,
      by: last.actor!.login,
      at: last.created_at,
      comments: humanComments,
    };
  }

  async closeGate(task: Task, gate: GateId, d: Decision): Promise<void> {
    const ref = task.gates[gate]?.ref;
    if (!ref || !/^\d+$/.test(ref)) return;
    const text = {
      approved: `Εγκρίθηκε από @${d.by}. Το κελί προχωρά.`,
      changes: `Αλλαγές από @${d.by}. Τα σχόλια πήγαν στον agent ως feedback.`,
      rejected: `Απορρίφθηκε από @${d.by}. Το κελί πήγε στο αρχείο.`,
    }[d.decision];
    await this.gh(['issue', 'close', ref, '--repo', this.repo, '--comment', text]);
  }

  async openAlert(title: string, body: string): Promise<OpenedGate> {
    const out = await this.gh(['issue', 'create', '--repo', this.repo, '--title', title, '--body', body, '--label', 'alert']);
    const url = out.trim().split('\n').at(-1) ?? '';
    const m = /\/issues\/(\d+)/.exec(url);
    return { ref: m?.[1] ?? '', url };
  }
}
