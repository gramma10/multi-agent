import fs from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import { p, type FactoryPaths } from '../paths.ts';

export type SourceName = 'gemi' | 'places' | 'website';

/** Μια εγγραφή όπως έρχεται από μια πηγή, πριν από κανονικοποίηση/dedupe. */
export interface RawLead {
  source: SourceName;
  /** Αναγνωριστικό στην πηγή (place id, αριθμός ΓΕΜΗ) για cache/trace. */
  sourceId: string;
  name: string;
  afm?: string | null;
  gemi?: string | null;
  kad?: string[];
  city?: string | null;
  address?: string | null;
  website?: string | null;
  /** Τηλέφωνο όπως το δηλώνει η πηγή ως τηλέφωνο ΤΗΣ ΕΠΙΧΕΙΡΗΣΗΣ. */
  phone?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  /** Ο κλάδος του κελιού για το οποίο βρέθηκε. */
  vertical: string;
}

export interface WebsiteInfo {
  emails: string[];
  phones: string[];
  formUrl: string | null;
  signals: {
    has_online_booking: boolean;
    has_chat: boolean;
    has_viber: boolean;
    has_whatsapp: boolean;
    last_updated_year: number | null;
  };
  pagesFetched: number;
  blockedByRobots: boolean;
}

const LeadsConfigSchema = z.object({
  cities: z.array(z.string()).min(1),
  sources: z.object({
    places: z.object({
      endpoint: z.string(),
      field_mask: z.string(),
      page_size: z.number().int().min(1).max(20),
      max_pages_per_query: z.number().int().min(1),
      requests_per_minute: z.number().min(1),
      secret_env: z.string(),
    }),
    gemi: z.object({
      endpoint: z.string(),
      activity_param: z.string(),
      offset_param: z.string(),
      size_param: z.string(),
      page_size: z.number().int().min(1),
      requests_per_minute: z.number().min(1),
      secret_env: z.string(),
    }),
    website: z.object({
      user_agent: z.string(),
      max_pages_per_site: z.number().int().min(1),
      timeout_seconds: z.number().min(1),
      max_bytes: z.number().int().min(1000),
    }),
  }),
  role_email_prefixes: z.array(z.string()),
  signals: z.object({
    online_booking: z.array(z.string()),
    chat: z.array(z.string()),
    viber: z.array(z.string()),
    whatsapp: z.array(z.string()),
  }),
});
export type LeadsConfig = z.infer<typeof LeadsConfigSchema>;

export function loadLeadsConfig(ps: FactoryPaths): LeadsConfig {
  return LeadsConfigSchema.parse(parse(fs.readFileSync(p.config(ps, 'leads.yaml'), 'utf8')));
}
