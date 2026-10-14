import fs from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import { p, type FactoryPaths } from './paths.ts';

// ---------- matrix.yaml ----------

export const FitSchema = z.enum(['high', 'medium', 'low']);
export type Fit = z.infer<typeof FitSchema>;

const VerticalSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  kad: z.array(z.string()).default([]),
  places: z.array(z.string()).default([]),
});
export type Vertical = z.infer<typeof VerticalSchema>;

const ServiceSchema = z.object({
  id: z.string(),
  short: z.string().regex(/^[a-z0-9]+$/),
  name: z.string(),
});
export type Service = z.infer<typeof ServiceSchema>;

const CellSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  vertical: z.string(),
  service: z.string(),
  priority: z.number().int().min(0).max(100),
  status: z.string().default('queued'),
  fit: FitSchema,
  notes: z.string().default(''),
});
export type CellDef = z.infer<typeof CellSchema> & { synthesized?: boolean };

const MatrixSchema = z.object({
  verticals: z.array(VerticalSchema).min(1),
  services: z.array(ServiceSchema).min(1),
  cells: z.array(CellSchema).default([]),
});

export interface Matrix {
  verticals: Vertical[];
  services: Service[];
  cells: CellDef[];
}

export const DEFAULT_SYNTH_FIT: Fit = 'medium';
export const DEFAULT_SYNTH_PRIORITY = 40;

export function parseMatrix(text: string): Matrix {
  const raw = MatrixSchema.parse(parse(text));
  const verticalIds = new Set(raw.verticals.map((v) => v.id));
  const serviceIds = new Set(raw.services.map((s) => s.id));
  const seen = new Set<string>();
  for (const c of raw.cells) {
    if (seen.has(c.id)) throw new Error(`matrix.yaml: διπλό id κελιού «${c.id}»`);
    seen.add(c.id);
    if (!verticalIds.has(c.vertical)) throw new Error(`matrix.yaml: το κελί ${c.id} έχει άγνωστο κλάδο «${c.vertical}»`);
    if (!serviceIds.has(c.service)) throw new Error(`matrix.yaml: το κελί ${c.id} έχει άγνωστη υπηρεσία «${c.service}»`);
  }
  // Νέος κλάδος = μία γραμμή (D004): όσοι κλάδοι δεν έχουν κελιά παίρνουν αυτόματα ένα ανά υπηρεσία.
  const cells: CellDef[] = [...raw.cells];
  for (const v of raw.verticals) {
    if (raw.cells.some((c) => c.vertical === v.id)) continue;
    for (const s of raw.services) {
      cells.push({
        id: `${v.id}-${s.short}`,
        vertical: v.id,
        service: s.id,
        priority: DEFAULT_SYNTH_PRIORITY,
        status: 'queued',
        fit: DEFAULT_SYNTH_FIT,
        notes: '',
        synthesized: true,
      });
    }
  }
  return { verticals: raw.verticals, services: raw.services, cells };
}

// ---------- volume.yaml ----------

const VolumeSchema = z.object({
  briefs_per_night: z.number().int().min(0).default(3),
  demos_per_night: z.number().int().min(0).default(2),
  content_packs_per_night: z.number().int().min(0).default(2),
  max_pending_reviews: z.number().int().min(1).default(8),
  max_step_attempts: z.number().int().min(1).default(3),
  leads_per_day: z.number().int().min(0).default(1000),
  lead_batch_size: z.number().int().min(1).default(200),
  leads_retention_months: z.number().int().min(1).default(12),
  campaigns: z
    .object({
      max_active: z.number().int().min(0).default(5),
      max_leads_per_campaign: z.number().int().min(1).default(1000),
      manual_drafts_per_day: z.number().int().min(0).default(20),
      sample_size_for_review: z.number().int().min(1).default(25),
      min_qa_pass_rate: z.number().min(0).max(1).default(0.95),
      max_qa_rounds: z.number().int().min(1).default(2),
    })
    .prefault({}),
  email: z
    .object({
      inboxes: z.number().int().min(0).default(0),
      per_inbox_daily_limit: z.number().int().min(0).default(40),
      ramp_up_weeks: z.number().int().min(0).default(3),
      warmup_started_at: z.string().nullable().default(null),
    })
    .prefault({}),
  calls: z.object({ call_list_per_day: z.number().int().min(0).default(60) }).prefault({}),
  guards: z
    .object({
      max_bounce_rate: z.number().min(0).max(1).default(0.03),
      max_spam_rate: z.number().min(0).max(1).default(0.001),
      min_contacts_before_judging: z.number().int().min(0).default(200),
      min_sent_before_freeze: z.number().int().min(1).default(50),
      max_priority_change_per_week: z.number().int().min(0).default(15),
    })
    .prefault({}),
});
export type Volume = z.infer<typeof VolumeSchema>;

// ---------- channels.yaml ----------

export const LegalStatusSchema = z.enum(['pending', 'approved', 'blocked']);
export type LegalStatus = z.infer<typeof LegalStatusSchema>;

const ChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  legal_status: LegalStatusSchema,
  kind: z.enum(['none', 'call_list', 'email_sequence', 'manual_drafts']),
  language: z.string().optional(),
  volume: z.string().optional(),
  requires: z.array(z.string()).default([]),
  notes: z.string().default(''),
});
export type Channel = z.infer<typeof ChannelSchema>;

const ChannelsSchema = z.object({
  channels: z.array(ChannelSchema),
  sender: z.object({
    company: z.string(),
    people: z.array(z.string()),
    website: z.string(),
    address: z.string(),
    unsubscribe_url: z.string(),
    booking_url: z.string(),
    demo_base_url: z.string().default('{{TODO: demo_base_url}}'),
  }),
});
export type ChannelsConfig = z.infer<typeof ChannelsSchema>;

// ---------- workers.yaml ----------

export const AGENT_NAMES = ['scout', 'builder', 'content', 'outreach', 'qa', 'tracker'] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

const WorkerRefSchema = z.object({ worker: z.string(), model: z.string().nullable().default(null) });
export type WorkerRef = z.infer<typeof WorkerRefSchema>;

const WorkersSchema = z.object({
  workers: z.record(
    z.string(),
    z.object({
      command: z.string(),
      secret_env: z.string().optional(),
      default_cooldown_minutes: z.number().int().min(1).default(300),
      extra_args: z.array(z.string()).default([]),
    }),
  ),
  agents: z.record(
    z.enum(AGENT_NAMES),
    z.object({
      primary: WorkerRefSchema,
      fallback: WorkerRefSchema.nullable().optional(),
      timeout_minutes: z.number().min(1).default(20),
    }),
  ),
});
export type WorkersConfig = z.infer<typeof WorkersSchema>;

// ---------- gates.yaml ----------

export const GATE_IDS = ['idea', 'demo', 'publish', 'campaign'] as const;
export type GateId = (typeof GATE_IDS)[number];

const GatesSchema = z.object({
  approvers: z.array(z.string()).default([]),
  labels: z.object({
    approved: z.string().default('approved'),
    changes: z.string().default('changes'),
    rejected: z.string().default('rejected'),
    gate: z.string().default('gate'),
  }),
  gates: z.record(
    z.enum(GATE_IDS),
    z.object({
      number: z.number().int(),
      title: z.string(),
      waiting_state: z.string(),
      checklist: z.array(z.string()).default([]),
    }),
  ),
});
export type GatesConfig = z.infer<typeof GatesSchema>;

// ---------- όλα μαζί ----------

export interface FactoryConfig {
  matrix: Matrix;
  volume: Volume;
  channels: ChannelsConfig;
  workers: WorkersConfig;
  gates: GatesConfig;
}

function readYaml(file: string): unknown {
  return parse(fs.readFileSync(file, 'utf8'));
}

export function loadConfig(ps: FactoryPaths): FactoryConfig {
  const wrap = <T>(file: string, fn: () => T): T => {
    try {
      return fn();
    } catch (err) {
      throw new Error(`Σφάλμα στο ${file}: ${(err as Error).message}`, { cause: err });
    }
  };
  return {
    matrix: wrap('matrix.yaml', () => parseMatrix(fs.readFileSync(p.matrix(ps), 'utf8'))),
    volume: wrap('volume.yaml', () => VolumeSchema.parse(readYaml(p.config(ps, 'volume.yaml')))),
    channels: wrap('channels.yaml', () => ChannelsSchema.parse(readYaml(p.config(ps, 'channels.yaml')))),
    workers: wrap('workers.yaml', () => WorkersSchema.parse(readYaml(p.config(ps, 'workers.yaml')))),
    gates: wrap('gates.yaml', () => GatesSchema.parse(readYaml(p.config(ps, 'gates.yaml')))),
  };
}

/** Πραγματικοί approvers: χωρίς τα placeholders {{TODO}}. */
export function realApprovers(gates: GatesConfig): string[] {
  return gates.approvers.filter((a) => a.trim() !== '' && !a.includes('{{'));
}

export function cellLabel(matrix: Matrix, cell: CellDef): string {
  const v = matrix.verticals.find((x) => x.id === cell.vertical);
  const s = matrix.services.find((x) => x.id === cell.service);
  return `${v?.name ?? cell.vertical} × ${s?.name ?? cell.service}`;
}
