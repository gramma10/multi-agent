import fs from 'node:fs';
import { promises as dns } from 'node:dns';
import { parse } from 'yaml';
import { z } from 'zod';

const SendingDomainsSchema = z.object({
  main_domain: z.string(),
  domains: z.array(z.object({ domain: z.string(), dkim_selector: z.string(), inboxes: z.array(z.string()).default([]) })).min(1),
});
export type SendingDomains = z.infer<typeof SendingDomainsSchema>;

export function readSendingDomains(file: string): SendingDomains | null {
  if (!fs.existsSync(file)) return null;
  return SendingDomainsSchema.parse(parse(fs.readFileSync(file, 'utf8')));
}

/** Injectable για tests. Επιστρέφει τα TXT records ως strings (ή [] αν δεν υπάρχουν). */
export type TxtResolver = (name: string) => Promise<string[]>;

export const systemTxt: TxtResolver = async (name) => {
  try {
    return (await dns.resolveTxt(name)).map((chunks) => chunks.join(''));
  } catch {
    return [];
  }
};

const FREE = /(^|\.)(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|otenet)\./i;

/** SPF, DKIM, DMARC για κάθε sending domain, και ότι δεν είναι το κύριο domain ή δωρεάν πάροχος. */
export async function checkSendingDomains(cfg: SendingDomains, txt: TxtResolver = systemTxt): Promise<string[]> {
  const problems: string[] = [];
  for (const d of cfg.domains) {
    const name = d.domain.toLowerCase();
    const main = cfg.main_domain.toLowerCase();
    // Ούτε το κύριο domain ούτε υποτομείς του: η φήμη του μοιράζεται.
    if (name === main || name.endsWith(`.${main}`)) {
      problems.push(`${name}: ποτέ αποστολή από το κύριο domain (ή υποτομέα του)`);
      continue;
    }
    if (FREE.test(`${name}.`)) {
      problems.push(`${name}: ποτέ αποστολή από δωρεάν πάροχο`);
      continue;
    }
    const spf = await txt(name);
    if (!spf.some((r) => r.toLowerCase().startsWith('v=spf1'))) problems.push(`${name}: λείπει SPF (TXT v=spf1)`);
    const dkim = await txt(`${d.dkim_selector}._domainkey.${name}`);
    if (!dkim.some((r) => /v=dkim1|k=rsa|p=/i.test(r))) problems.push(`${name}: λείπει DKIM στο ${d.dkim_selector}._domainkey`);
    const dmarc = await txt(`_dmarc.${name}`);
    if (!dmarc.some((r) => r.toUpperCase().startsWith('V=DMARC1'))) problems.push(`${name}: λείπει DMARC (TXT v=DMARC1 στο _dmarc)`);
  }
  return problems;
}
