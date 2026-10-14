import type { CellDef, ChannelsConfig } from '../config.ts';
import { cellLabel } from '../config.ts';
import type { FactoryContext } from '../context.ts';
import type { LeadStore } from '../leads/store.ts';
import { renderCall, renderDraft, renderEmail, type LeadView, type RenderContext, type RenderedMessage } from './render.ts';
import type { CampaignTemplates } from './template.ts';

export interface BuiltCampaign {
  id: string;
  cellId: string;
  channel: string;
  members: string[];
  messages: RenderedMessage[];
  skippedSuppressed: number;
  skippedNoContact: number;
}

/** Στοιχεία αποστολέα. Σε dry-run τα {{TODO}} γίνονται «DRY-RUN …» ώστε να ελέγχεται η ροή. */
export function senderFor(ctx: FactoryContext): ChannelsConfig['sender'] {
  const s = ctx.config.channels.sender;
  if (!ctx.ps.dryRun) return s;
  const fake: Record<string, string> = {
    website: 'https://dry-run.example',
    address: 'DRY-RUN διεύθυνση',
    unsubscribe_url: 'https://dry-run.example/unsubscribe',
    booking_url: 'https://dry-run.example/xartis-ai',
    demo_base_url: 'https://dry-run.example',
  };
  const out = { ...s } as Record<string, unknown>;
  for (const [k, v] of Object.entries(s)) if (typeof v === 'string' && v.includes('{{')) out[k] = fake[k] ?? 'DRY-RUN';
  return out as ChannelsConfig['sender'];
}

export function campaignId(cellId: string, channel: string, now: Date): string {
  return `${cellId}--${channel}--${now.toISOString().slice(0, 10).replace(/-/g, '')}`;
}

async function leadView(store: LeadStore, businessId: string): Promise<LeadView | null> {
  const business = await store.getBusiness(businessId);
  if (!business) return null;
  const contacts = await store.contactsOf(businessId);
  const email = contacts.find((c) => c.kind === 'email');
  const phone = contacts.find((c) => c.kind === 'phone');
  const form = contacts.find((c) => c.kind === 'form');
  return {
    businessId,
    contactId: email?.id ?? phone?.id ?? form?.id ?? null,
    email: email?.value_norm ?? null,
    phone: phone?.value_norm ?? null,
    formUrl: form?.value_norm ?? null,
    business,
  };
}

/**
 * Φτιάχνει μία καμπάνια ανά κανάλι για το οποίο υπάρχει template: διαλέγει τα καλύτερα leads του κελιού
 * που έχουν το σωστό στοιχείο επικοινωνίας, ελέγχει suppression (2ο από τα 3 σημεία), καταγράφει τα
 * μέλη στη βάση και αποδίδει όλα τα μηνύματα (για το QA). Ξαναχτίζεται ολόκληρη σε κάθε γύρο.
 */
export async function buildCampaigns(
  ctx: FactoryContext,
  cell: CellDef,
  store: LeadStore,
  templates: CampaignTemplates,
): Promise<BuiltCampaign[]> {
  const v = ctx.config.matrix.verticals.find((x) => x.id === cell.vertical);
  const s = ctx.config.matrix.services.find((x) => x.id === cell.service);
  const sender = senderFor(ctx);
  const max = ctx.config.volume.campaigns.max_leads_per_campaign;
  const draftsMax = Math.max(1, ctx.config.volume.campaigns.manual_drafts_per_day * 5);
  const now = ctx.now();

  const plans: Array<{ channel: string; need: 'email' | 'phone' | 'any'; limit: number; render: (rc: RenderContext, l: LeadView) => RenderedMessage[] }> = [];
  if (templates.email) plans.push({ channel: templates.email.channel, need: 'email', limit: max, render: (rc, l) => renderEmail(templates.email!, rc, l) });
  if (templates.call) plans.push({ channel: 'phone_b2b', need: 'phone', limit: max, render: (rc, l) => [renderCall(templates.call!, rc, l)] });
  if (templates.dm) plans.push({ channel: 'social_dm', need: 'any', limit: draftsMax, render: (rc, l) => [renderDraft(templates.dm!, rc, l)] });
  if (templates.partners) plans.push({ channel: 'partners', need: 'any', limit: Math.min(draftsMax, 20), render: (rc, l) => [renderDraft(templates.partners!, rc, l)] });

  const out: BuiltCampaign[] = [];
  for (const plan of plans) {
    const id = campaignId(cell.id, plan.channel, now);
    const rc: RenderContext = {
      campaignId: id,
      cellId: cell.id,
      channel: plan.channel,
      siteUrl: sender.demo_base_url,
      sender,
      verticalName: v?.name ?? cell.vertical,
      serviceName: s?.name ?? cell.service,
    };
    const built: BuiltCampaign = { id, cellId: cell.id, channel: plan.channel, members: [], messages: [], skippedSuppressed: 0, skippedNoContact: 0 };
    const views: LeadView[] = [];
    // Λίγο παραπάνω από το όριο, για όσους θα κοπούν από suppression.
    const pool = await store.topLeadsWithContact(cell.id, plan.need, Math.ceil(plan.limit * 1.2) + 10);
    for (const { business_id } of pool) {
      if (views.length >= plan.limit) break;
      const l = await leadView(store, business_id);
      if (!l) continue;
      const has = plan.need === 'email' ? l.email : plan.need === 'phone' ? l.phone : l.email ?? l.formUrl ?? l.phone;
      if (!has) {
        built.skippedNoContact++;
        continue;
      }
      const reason = await store.suppressedReason({ emails: l.email ? [l.email] : [], domain: l.business.domain, phone: l.phone, afm: l.business.afm });
      if (reason) {
        built.skippedSuppressed++;
        continue;
      }
      views.push(l);
    }
    await store.db.transaction(async () => {
      await store.db.run(
        `insert into campaigns (id, cell_id, channel, status, stats, created_at) values (?, ?, ?, 'draft', ?, ?)
         on conflict (id) do update set status = 'draft', stats = excluded.stats, approved_by = null, approved_at = null`,
        [id, cell.id, plan.channel, { label: cellLabel(ctx.config.matrix, cell) }, now.toISOString()],
      );
      await store.db.run('delete from campaign_members where campaign_id = ?', [id]);
      for (const l of views) {
        await store.db.run('insert into campaign_members (campaign_id, business_id, contact_id, status) values (?, ?, ?, ?)', [id, l.businessId, l.contactId, 'pending']);
      }
    });
    for (const l of views) {
      built.members.push(l.businessId);
      built.messages.push(...plan.render(rc, l));
    }
    out.push(built);
  }
  return out;
}
