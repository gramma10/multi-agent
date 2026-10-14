import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

/**
 * Τα templates που γράφει ο Outreach agent στο pipeline/<id>/campaign/ (agents/outreach.md).
 * Ο agent δεν βλέπει ποτέ τα δεδομένα των leads: γράφει κανόνες, και ο κώδικας γεμίζει τα κενά.
 */

const VariantSchema = z.object({
  when: z.string().min(1), // «default» ή συνθήκη, π.χ. signals.has_online_booking == false
  opener: z.string().min(1),
});

const EmailStepSchema = z.object({
  day: z.number().int().min(0),
  angle: z.string(),
  subject: z.string().min(1),
  variants: z.array(VariantSchema).min(1),
  body: z.string().min(1),
  cta: z.string().min(1),
});

export const EmailTemplateSchema = z.object({
  channel: z.enum(['email_gr', 'email_intl']),
  steps: z.array(EmailStepSchema).min(1).max(5),
});
export type EmailTemplate = z.infer<typeof EmailTemplateSchema>;

export const CallTemplateSchema = z.object({
  channel: z.literal('phone_b2b'),
  opening: z.array(VariantSchema).min(1),
  questions: z.array(z.string()).min(1).max(5),
  objections: z.array(z.object({ objection: z.string(), answer: z.string() })).min(1),
  close: z.string().min(1),
});
export type CallTemplate = z.infer<typeof CallTemplateSchema>;

export const DraftTemplateSchema = z.object({
  channel: z.enum(['social_dm', 'partners']),
  variants: z.array(VariantSchema).min(1),
  body: z.string().min(1),
  cta: z.string().min(1),
});
export type DraftTemplate = z.infer<typeof DraftTemplateSchema>;

export interface CampaignTemplates {
  email?: EmailTemplate;
  call?: CallTemplate;
  dm?: DraftTemplate;
  partners?: DraftTemplate;
}

export const TEMPLATE_FILES = { email: 'email.yaml', call: 'call.yaml', dm: 'dm.yaml', partners: 'partners.yaml' } as const;

/** Φορτώνει και ελέγχει τα templates. Επιστρέφει και τα προβλήματα (για feedback στον agent). */
export function loadTemplates(dir: string): { templates: CampaignTemplates; problems: string[] } {
  const templates: CampaignTemplates = {};
  const problems: string[] = [];
  const schemas = { email: EmailTemplateSchema, call: CallTemplateSchema, dm: DraftTemplateSchema, partners: DraftTemplateSchema };
  for (const [key, file] of Object.entries(TEMPLATE_FILES) as Array<[keyof CampaignTemplates, string]>) {
    const f = path.join(dir, file);
    if (!fs.existsSync(f)) continue;
    try {
      const r = schemas[key].safeParse(parse(fs.readFileSync(f, 'utf8')));
      if (r.success) (templates as Record<string, unknown>)[key] = r.data;
      else problems.push(`${file}: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    } catch (err) {
      problems.push(`${file}: δεν διαβάζεται (${(err as Error).message})`);
    }
  }
  if (!templates.email && !templates.call) problems.push('χρειάζεται τουλάχιστον email.yaml ή call.yaml');
  for (const [key, t] of Object.entries(templates)) {
    const variants = key === 'email' ? (t as EmailTemplate).steps.flatMap((s) => s.variants) : key === 'call' ? (t as CallTemplate).opening : (t as DraftTemplate).variants;
    if (!variants.some((v) => v.when.trim() === 'default')) problems.push(`${TEMPLATE_FILES[key as keyof CampaignTemplates]}: κάθε σύνολο variants χρειάζεται και «default» εκδοχή`);
    if (key === 'email') {
      for (const s of (t as EmailTemplate).steps) {
        if (!s.variants.some((v) => v.when.trim() === 'default')) problems.push(`email.yaml: το άγγιγμα ημέρας ${s.day} δεν έχει «default»`);
      }
    }
  }
  return { templates, problems };
}
