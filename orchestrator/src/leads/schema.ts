/**
 * Το schema της βάσης leads για SQLite (dry-run / τοπικά). Αντιστοιχεί 1:1 σε πίνακες και στήλες
 * με το supabase/migrations/20261014000001_leads.sql (το ελέγχει test). Διαφορές μόνο στους τύπους:
 * uuid/jsonb/timestamptz → TEXT, boolean → INTEGER.
 */
export const SQLITE_SCHEMA = `
create table if not exists businesses (
  id text primary key,
  afm text unique,
  gemi text unique,
  name text not null,
  name_norm text not null,
  vertical text,
  kad text not null default '[]',
  city text,
  address text,
  website text,
  domain text,
  phone_e164 text,
  rating real,
  reviews_count integer,
  signals text not null default '{}',
  sources text not null default '{}',
  converted integer not null default 0,
  last_contacted_at text,
  anonymized_at text,
  created_at text not null,
  updated_at text not null
);
create index if not exists businesses_domain_idx on businesses (domain);
create index if not exists businesses_phone_idx on businesses (phone_e164);
create index if not exists businesses_vertical_idx on businesses (vertical);

create table if not exists contacts (
  id text primary key,
  business_id text not null references businesses (id) on delete cascade,
  kind text not null check (kind in ('email', 'phone', 'form')),
  value text not null,
  value_norm text not null,
  source text not null,
  collected_at text not null,
  unique (kind, value_norm)
);
create index if not exists contacts_business_idx on contacts (business_id);

create table if not exists cell_leads (
  cell_id text not null,
  business_id text not null references businesses (id) on delete cascade,
  score integer not null,
  reasons text not null default '[]',
  added_at text not null,
  primary key (cell_id, business_id)
);
create index if not exists cell_leads_score_idx on cell_leads (cell_id, score desc);

create table if not exists campaigns (
  id text primary key,
  cell_id text not null,
  channel text not null,
  status text not null default 'draft',
  stats text not null default '{}',
  approved_by text,
  approved_at text,
  created_at text not null
);

create table if not exists campaign_members (
  campaign_id text not null references campaigns (id) on delete cascade,
  business_id text not null references businesses (id) on delete cascade,
  contact_id text references contacts (id) on delete cascade,
  variant text,
  status text not null default 'pending',
  primary key (campaign_id, business_id)
);

create table if not exists events (
  id text primary key,
  campaign_id text references campaigns (id) on delete set null,
  business_id text references businesses (id) on delete cascade,
  contact_id text references contacts (id) on delete cascade,
  type text not null,
  occurred_at text not null,
  meta text not null default '{}',
  created_at text not null
);
create index if not exists events_campaign_idx on events (campaign_id, type);

create table if not exists suppression (
  id text primary key,
  kind text not null check (kind in ('email', 'domain', 'phone', 'afm', 'hash')),
  value text not null,
  reason text not null,
  created_at text not null,
  unique (kind, value)
);

create table if not exists consents (
  id text primary key,
  email text not null,
  source text not null,
  consent_text text not null,
  consented_at text not null,
  withdrawn_at text
);
create index if not exists consents_email_idx on consents (email);

create table if not exists gdpr_requests (
  id text primary key,
  type text not null check (type in ('erase', 'export')),
  subject_hash text not null,
  created_at text not null
);

create table if not exists lead_cursors (
  key text primary key,
  cursor text,
  exhausted integer not null default 0,
  updated_at text not null
);

create table if not exists api_cache (
  key text primary key,
  response text not null,
  fetched_at text not null
);

create table if not exists lead_daily (
  day text primary key,
  imported integer not null default 0
);
`;

/** Πίνακες και στήλες από ένα CREATE TABLE script (για τον έλεγχο ισοδυναμίας με το migration). */
export function tablesAndColumns(sql: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const re = /create table if not exists (\w+) \(([\s\S]*?)\n\);/g;
  for (const m of sql.matchAll(re)) {
    const cols = m[2]!
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[a-z_]+\s/.test(l) && !/^(primary|unique|check|foreign)\b/.test(l))
      .map((l) => l.split(/\s+/)[0]!);
    out[m[1]!] = cols.sort();
  }
  return out;
}
