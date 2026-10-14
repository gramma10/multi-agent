import fs from 'node:fs';
import path from 'node:path';
import type { FactoryContext } from '../context.ts';
import { complianceGate, type GateResult } from '../compliance/gate.ts';
import type { TxtResolver } from '../compliance/dns.ts';
import type { LeadStore } from '../leads/store.ts';
import { senderFor } from './build.ts';
import { renderCall, renderDraft, renderEmail, unsubscribeToken, type LeadView, type RenderContext } from './render.ts';
import { loadTemplates } from './template.ts';

export type EmailTool = 'instantly' | 'smartlead' | 'lemlist';

/**
 * Το export ΔΕΝ στέλνει τίποτα. Γράφει ένα αρχείο για το εργαλείο αποστολής (ή λίστα κλήσεων, ή
 * πρόχειρα), στο exports/ που δεν μπαίνει ποτέ στο git. Ο orchestrator δεν κρατά διαπιστευτήρια αποστολής.
 */

function csv(rows: Array<Record<string, string>>, headers: string[]): string {
  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h] ?? '')).join(','))].join('\n') + '\n';
}

const EMAIL_HEADERS: Record<EmailTool, { email: string; first: string; last: string; company: string; website: string; city?: string }> = {
  instantly: { email: 'email', first: 'first_name', last: 'last_name', company: 'company_name', website: 'website' },
  smartlead: { email: 'email', first: 'first_name', last: 'last_name', company: 'company_name', website: 'website', city: 'location' },
  lemlist: { email: 'email', first: 'firstName', last: 'lastName', company: 'companyName', website: 'website' },
};

export interface ExportResult {
  campaignId: string;
  gate: GateResult;
  file: string | null;
  rows: number;
  skippedSuppressed: number;
  remaining: number;
}

export async function exportCampaign(
  ctx: FactoryContext,
  store: LeadStore,
  campaignId: string,
  opts: { tool?: EmailTool; txt?: TxtResolver } = {},
): Promise<ExportResult> {
  const c = await store.db.get<{ id: string; cell_id: string; channel: string; status: string }>('select id, cell_id, channel, status from campaigns where id = ?', [campaignId]);
  if (!c) throw new Error(`Άγνωστη καμπάνια «${campaignId}»`);
  const registry = await store.getCursor('objection_registry');
  const reg = await store.db.get<{ updated_at: string }>('select updated_at from lead_cursors where key = ?', ['objection_registry']);
  const gate = await complianceGate({
    ps: ctx.ps,
    config: ctx.config,
    channel: c.channel,
    campaignStatus: c.status,
    now: ctx.now(),
    txt: opts.txt,
    objectionRegistryAt: registry.cursor ? reg?.updated_at ?? null : null,
  });
  const pending = async () => Number((await store.db.get<{ n: number }>("select count(*) as n from campaign_members where campaign_id = ? and status = 'qa_passed'", [c.id]))!.n);
  if (!gate.allowed) return { campaignId, gate, file: null, rows: 0, skippedSuppressed: 0, remaining: await pending() };

  const cell = ctx.config.matrix.cells.find((x) => x.id === c.cell_id);
  if (!cell) throw new Error(`Το κελί ${c.cell_id} δεν υπάρχει πια στο matrix.yaml`);
  const { templates, problems } = loadTemplates(path.join(ctx.ps.stateRoot, 'pipeline', cell.id, 'campaign'));
  if (problems.length) throw new Error(`Templates με προβλήματα: ${problems.join('; ')}`);
  const sender = senderFor(ctx);
  const v = ctx.config.matrix.verticals.find((x) => x.id === cell.vertical);
  const s = ctx.config.matrix.services.find((x) => x.id === cell.service);
  const rc: RenderContext = {
    campaignId: c.id,
    cellId: cell.id,
    channel: c.channel,
    siteUrl: sender.demo_base_url,
    sender,
    verticalName: v?.name ?? cell.vertical,
    serviceName: s?.name ?? cell.service,
  };

  const members = await store.db.all<{ business_id: string }>(
    "select business_id from campaign_members where campaign_id = ? and status = 'qa_passed' order by business_id",
    [c.id],
  );
  const rows: Array<Record<string, string>> = [];
  const drafts: string[] = [];
  let skippedSuppressed = 0;
  const exported: string[] = [];
  for (const { business_id } of members) {
    if (exported.length >= gate.batchLimit) break;
    const b = await store.getBusiness(business_id);
    if (!b) continue;
    const contacts = await store.contactsOf(business_id);
    const lead: LeadView = {
      businessId: business_id,
      contactId: null,
      email: contacts.find((x) => x.kind === 'email')?.value_norm ?? null,
      phone: contacts.find((x) => x.kind === 'phone')?.value_norm ?? null,
      formUrl: contacts.find((x) => x.kind === 'form')?.value_norm ?? null,
      business: b,
    };
    // 3ο σημείο ελέγχου suppression: ακριβώς πριν γραφτεί το αρχείο.
    if (await store.suppressedReason({ emails: lead.email ? [lead.email] : [], domain: b.domain, phone: lead.phone, afm: b.afm })) {
      skippedSuppressed++;
      await store.db.run("update campaign_members set status = 'suppressed' where campaign_id = ? and business_id = ?", [c.id, business_id]);
      continue;
    }
    if (c.channel.startsWith('email') && templates.email) {
      const tool = opts.tool ?? 'instantly';
      const h = EMAIL_HEADERS[tool];
      const msgs = renderEmail(templates.email, rc, lead);
      const row: Record<string, string> = {
        [h.email]: lead.email ?? '',
        [h.first]: '',
        [h.last]: '',
        [h.company]: b.name,
        [h.website]: b.website ?? '',
        ...(h.city ? { [h.city]: b.city ?? '' } : {}),
        demo_url: msgs[0]?.parts.demoUrl ?? '',
        unsubscribe_url: `${sender.unsubscribe_url}${sender.unsubscribe_url.includes('?') ? '&' : '?'}t=${unsubscribeToken(c.id, lead.email ?? '')}`,
      };
      msgs.forEach((m, i) => {
        row[`subject_${i + 1}`] = m.subject ?? '';
        row[`body_${i + 1}`] = m.body;
        row[`send_day_${i + 1}`] = String(templates.email!.steps[i]!.day);
      });
      rows.push(row);
    } else if (c.channel === 'phone_b2b' && templates.call) {
      const m = renderCall(templates.call, rc, lead);
      const cl = await store.db.get<{ score: number; reasons: string }>('select score, reasons from cell_leads where cell_id = ? and business_id = ?', [cell.id, business_id]);
      rows.push({ company_name: b.name, phone: lead.phone ?? '', city: b.city ?? '', score: String(cl?.score ?? ''), reasons: String(cl?.reasons ?? ''), script: m.body });
    } else if (templates.dm || templates.partners) {
      const t = c.channel === 'partners' ? templates.partners : templates.dm;
      if (!t) continue;
      const m = renderDraft(t, rc, lead);
      drafts.push(`## ${b.name}${b.city ? ` · ${b.city}` : ''}\n\n${lead.formUrl ? `Φόρμα: ${lead.formUrl}\n\n` : ''}${b.website ? `Site: ${b.website}\n\n` : ''}\`\`\`\n${m.body}\n\`\`\`\n`);
    } else {
      continue;
    }
    exported.push(business_id);
  }

  if (exported.length === 0) return { campaignId, gate, file: null, rows: 0, skippedSuppressed, remaining: await pending() };

  const dir = path.join(ctx.ps.stateRoot, 'exports', c.id);
  fs.mkdirSync(dir, { recursive: true });
  const n = fs.readdirSync(dir).length + 1;
  const stamp = ctx.now().toISOString().slice(0, 10);
  let file: string;
  if (c.channel.startsWith('email')) {
    file = path.join(dir, `${stamp}-batch-${n}-${opts.tool ?? 'instantly'}.csv`);
    const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    fs.writeFileSync(file, csv(rows, headers));
  } else if (c.channel === 'phone_b2b') {
    file = path.join(dir, `${stamp}-batch-${n}-calls.csv`);
    fs.writeFileSync(file, csv(rows, ['company_name', 'phone', 'city', 'score', 'reasons', 'script']));
  } else {
    file = path.join(dir, `${stamp}-batch-${n}-drafts.md`);
    fs.writeFileSync(
      file,
      `# Πρόχειρα για ΧΕΙΡΟΚΙΝΗΤΗ αποστολή: ${c.id}\n\n> Τα στέλνει άνθρωπος, ένα-ένα. Ποτέ αυτοματοποίηση σε Instagram/LinkedIn.\n\n${drafts.join('\n')}`,
    );
  }
  await store.db.transaction(async () => {
    for (const id of exported) await store.db.run("update campaign_members set status = 'exported' where campaign_id = ? and business_id = ?", [c.id, id]);
    await store.db.run("update campaigns set status = 'exported' where id = ?", [c.id]);
  });
  return { campaignId, gate, file, rows: exported.length, skippedSuppressed, remaining: await pending() };
}
