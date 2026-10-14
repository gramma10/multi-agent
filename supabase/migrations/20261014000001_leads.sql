-- Auragram Showcase Factory: leads, καμπάνιες, events, suppression, συγκαταθέσεις.
--
-- Κανόνες:
--  * ΜΟΝΟ εταιρικά στοιχεία επικοινωνίας, το καθένα με source και collected_at.
--  * Row Level Security ενεργό σε ΟΛΟΥΣ τους πίνακες, χωρίς policies: ο anon/authenticated ρόλος
--    δεν βλέπει τίποτα. Ο orchestrator μπαίνει με το service role (ή απευθείας σύνδεση DB),
--    που παρακάμπτει το RLS. Το service key ζει μόνο σε GitHub secrets.
--  * Το αντίστοιχο schema για SQLite (dry-run) είναι στο orchestrator/src/leads/schema.ts.
--    Αν αλλάξεις κάτι εδώ, άλλαξέ το και εκεί (το ελέγχει test).

create extension if not exists pgcrypto;

create table if not exists businesses (
  id              uuid primary key default gen_random_uuid(),
  afm             text unique,
  gemi            text unique,
  name            text not null,
  name_norm       text not null,
  vertical        text,
  kad             jsonb not null default '[]',
  city            text,
  address         text,
  website         text,
  domain          text,
  phone_e164      text,
  rating          numeric,
  reviews_count   integer,
  signals         jsonb not null default '{}',
  sources         jsonb not null default '{}',   -- { πεδίο: { source, collected_at } }
  converted       boolean not null default false,
  last_contacted_at timestamptz,
  anonymized_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists businesses_domain_idx on businesses (domain);
create index if not exists businesses_phone_idx on businesses (phone_e164);
create index if not exists businesses_vertical_idx on businesses (vertical);

create table if not exists contacts (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses (id) on delete cascade,
  kind          text not null check (kind in ('email', 'phone', 'form')),
  value         text not null,
  value_norm    text not null,
  source        text not null,
  collected_at  timestamptz not null,
  unique (kind, value_norm)
);
create index if not exists contacts_business_idx on contacts (business_id);

-- Σε ποια κελιά ανήκει ένα lead και με τι βαθμό (για τις καμπάνιες).
create table if not exists cell_leads (
  cell_id      text not null,
  business_id  uuid not null references businesses (id) on delete cascade,
  score        integer not null,
  reasons      jsonb not null default '[]',
  added_at     timestamptz not null default now(),
  primary key (cell_id, business_id)
);
create index if not exists cell_leads_score_idx on cell_leads (cell_id, score desc);

create table if not exists campaigns (
  id           text primary key,
  cell_id      text not null,
  channel      text not null,
  status       text not null default 'draft'
               check (status in ('draft', 'qa', 'ready', 'approved', 'exported', 'frozen', 'done')),
  stats        jsonb not null default '{}',
  approved_by  text,
  approved_at  timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists campaign_members (
  campaign_id  text not null references campaigns (id) on delete cascade,
  business_id  uuid not null references businesses (id) on delete cascade,
  contact_id   uuid references contacts (id) on delete cascade,
  variant      text,
  status       text not null default 'pending',
  primary key (campaign_id, business_id)
);

create table if not exists events (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  text references campaigns (id) on delete set null,
  business_id  uuid references businesses (id) on delete cascade,
  contact_id   uuid references contacts (id) on delete cascade,
  type         text not null check (type in ('sent', 'bounce', 'open', 'reply_positive', 'reply_negative', 'reply_other',
                                             'unsubscribe', 'spam', 'call_booked', 'pilot')),
  occurred_at  timestamptz not null,
  meta         jsonb not null default '{}',
  created_at   timestamptz not null default now()
);
create index if not exists events_campaign_idx on events (campaign_id, type);

-- Suppression: ισχύει για όλα τα κανάλια, για πάντα. kind 'hash' = SHA-256 μετά από gdpr-erase.
create table if not exists suppression (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('email', 'domain', 'phone', 'afm', 'hash')),
  value       text not null,
  reason      text not null,
  created_at  timestamptz not null default now(),
  unique (kind, value)
);

-- Συγκαταθέσεις από lead magnets (inbound): πότε, πού, με ποιο κείμενο.
create table if not exists consents (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  source         text not null,
  consent_text   text not null,
  consented_at   timestamptz not null,
  withdrawn_at   timestamptz
);
create index if not exists consents_email_idx on consents (email);

create table if not exists gdpr_requests (
  id            uuid primary key default gen_random_uuid(),
  type          text not null check (type in ('erase', 'export')),
  subject_hash  text not null,
  created_at    timestamptz not null default now()
);

-- Από πού συνεχίζει κάθε πηγή (resume) και cache απαντήσεων API (quotas).
create table if not exists lead_cursors (
  key         text primary key,
  cursor      text,
  exhausted   boolean not null default false,
  updated_at  timestamptz not null default now()
);

create table if not exists api_cache (
  key         text primary key,
  response    jsonb not null,
  fetched_at  timestamptz not null default now()
);

create table if not exists lead_daily (
  day        date primary key,
  imported   integer not null default 0
);

-- RLS παντού, χωρίς policies.
alter table businesses       enable row level security;
alter table contacts         enable row level security;
alter table cell_leads       enable row level security;
alter table campaigns        enable row level security;
alter table campaign_members enable row level security;
alter table events           enable row level security;
alter table suppression      enable row level security;
alter table consents         enable row level security;
alter table gdpr_requests    enable row level security;
alter table lead_cursors     enable row level security;
alter table api_cache        enable row level security;
alter table lead_daily       enable row level security;
