import type { FactoryConfig } from '../config.ts';
import type { FactoryPaths } from '../paths.ts';
import { p } from '../paths.ts';
import { checkSendingDomains, readSendingDomains, type TxtResolver } from './dns.ts';
import { channelLegal, readLegalStatus } from './legal-status.ts';

/**
 * Πόσα μηνύματα email επιτρέπονται σήμερα: inboxes × per_inbox_daily_limit, με ramp-up μετά το
 * warmup (εβδομάδα 1: 1/3, εβδομάδα 2: 2/3 …, μετά πλήρες). 0 inboxes = 0.
 */
export function emailDailyLimit(v: FactoryConfig['volume']['email'], now: Date): number {
  if (v.inboxes <= 0) return 0;
  const full = v.inboxes * v.per_inbox_daily_limit;
  if (!v.warmup_started_at || v.ramp_up_weeks <= 0) return full;
  const weeks = Math.floor((now.getTime() - new Date(v.warmup_started_at).getTime()) / (7 * 86_400_000));
  if (weeks < 0) return 0;
  if (weeks >= v.ramp_up_weeks) return full;
  return Math.floor((full * (weeks + 1)) / v.ramp_up_weeks);
}

export interface GateInput {
  ps: FactoryPaths;
  config: FactoryConfig;
  channel: string;
  campaignStatus: string;
  now: Date;
  txt?: TxtResolver;
  /** Πότε φορτώθηκε τελευταία το μητρώο αντιρρήσεων (άρθρο 11) για κλήσεις. */
  objectionRegistryAt?: string | null;
}

export interface GateResult {
  allowed: boolean;
  /** Πόσα μέλη επιτρέπεται να βγουν σε αυτό το batch. */
  batchLimit: number;
  reasons: string[];
}

/**
 * Το compliance gate πριν από ΚΑΘΕ export. Όλοι οι λόγοι μαζεύονται (όχι μόνο ο πρώτος), ώστε οι
 * ιδρυτές να βλέπουν όλη τη λίστα του τι λείπει.
 */
export async function complianceGate(g: GateInput): Promise<GateResult> {
  const reasons: string[] = [];
  const ch = g.config.channels.channels.find((c) => c.id === g.channel);
  if (!ch) return { allowed: false, batchLimit: 0, reasons: [`άγνωστο κανάλι ${g.channel}`] };

  if (g.campaignStatus === 'frozen') reasons.push('η καμπάνια έχει παγώσει (αυτόματη προστασία)· ξεπαγώνει μόνο άνθρωπος');
  else if (!['approved', 'exported'].includes(g.campaignStatus)) reasons.push(`η καμπάνια δεν έχει εγκριθεί στο Gate 4 (status: ${g.campaignStatus})`);

  const legal = channelLegal(g.channel, g.config.channels, readLegalStatus(p.legalStatus(g.ps)));
  if (!legal.ok) reasons.push(legal.reason);

  let batchLimit = 0;
  if (ch.kind === 'email_sequence') {
    batchLimit = emailDailyLimit(g.config.volume.email, g.now);
    if (batchLimit === 0) reasons.push('email.inboxes = 0 στο config/volume.yaml (inboxes χωρίς warmup) ή το warmup δεν έχει ξεκινήσει');
    const domains = readSendingDomains(p.config(g.ps, 'sending-domains.yaml'));
    if (!domains) reasons.push('λείπει το config/sending-domains.yaml (βλ. compliance/DELIVERABILITY.md)');
    else reasons.push(...(await checkSendingDomains(domains, g.txt)));
  } else if (ch.kind === 'call_list') {
    batchLimit = g.config.volume.calls.call_list_per_day;
    if (ch.requires.includes('objection_registry_check')) {
      const at = g.objectionRegistryAt ? new Date(g.objectionRegistryAt) : null;
      if (!at || g.now.getTime() - at.getTime() > 30 * 86_400_000) {
        reasons.push('το μητρώο αντιρρήσεων (άρθρο 11 ν.3471/2006) δεν έχει φορτωθεί τις τελευταίες 30 ημέρες (`factory -- import-objection-registry <αρχείο>`)');
      }
    }
  } else if (ch.kind === 'manual_drafts') {
    batchLimit = g.config.volume.campaigns.manual_drafts_per_day;
  } else {
    reasons.push(`το κανάλι ${g.channel} δεν έχει export`);
  }
  return { allowed: reasons.length === 0, batchLimit, reasons };
}
