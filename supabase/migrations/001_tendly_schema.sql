-- Enable UUID generation
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- USERS (managed by Supabase Auth, extend with profiles)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null,
  role text not null default 'OWNER'
    check (role in ('OWNER','MEMBER','CONSULTANT')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- COMPANIES
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  legal_name text,
  duns_or_uei text,
  sam_registered boolean not null default false,
  sam_expiration_date date,
  naics_codes text[] not null default '{}',
  size_standard text not null default 'SMALL',
  socio_economic_certs text[] not null default '{}',
  target_geographies text[] not null default '{}',
  capability_keywords text[] not null default '{}',
  past_performance_tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- OPPORTUNITY SOURCES
create table public.opportunity_sources (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('SAM','STATE','LOCAL')),
  name text not null,
  base_url text not null,
  api_endpoint text,
  created_at timestamptz not null default now()
);

-- Insert SAM.gov as default source
insert into public.opportunity_sources (type, name, base_url, api_endpoint)
values ('SAM', 'SAM.gov', 'https://sam.gov',
  'https://api.sam.gov/prod/opportunities/v2/search');

-- OPPORTUNITIES
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  external_id text not null,
  source_id uuid references public.opportunity_sources(id),
  title text not null,
  agency text not null,
  sub_agency text,
  naics_code text,
  procurement_method text,
  set_aside text,
  place_of_performance text,
  value_min numeric,
  value_max numeric,
  contract_type text,
  synopsis text not null default '',
  summary_generated text,
  risk_notes_generated text,
  posted_at timestamptz,
  updated_at_source timestamptz,
  questions_due_at timestamptz,
  pre_bid_conf_at timestamptz,
  proposals_due_at timestamptz,
  sam_or_source_url text not null,
  submission_portal_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(external_id, source_id)
);

-- OPPORTUNITY DOCUMENTS
create table public.opportunity_documents (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  name text not null,
  url text not null,
  type text,
  created_at timestamptz not null default now()
);

-- MATCH SCORES
create table public.match_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  reasons_json jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique(company_id, opportunity_id)
);

-- BIDS
create table public.bids (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  stage text not null default 'DISCOVERING'
    check (stage in ('DISCOVERING','CONSIDERING','IN_PROGRESS','SUBMITTED','WON','LOST')),
  owner_id uuid references public.profiles(id),
  expected_value numeric,
  probability numeric check (probability between 0 and 1),
  notes text,
  submitted_at timestamptz,
  decision_at timestamptz,
  won boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- COMPANY DOCUMENTS
create table public.company_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  type text not null
    check (type in ('CAPABILITY_STATEMENT','CERTIFICATION',
                    'PAST_PERFORMANCE','SAM_PROOF','OTHER')),
  file_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  tags text[] not null default '{}',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- BID TASKS
create table public.bid_tasks (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid references public.bids(id) on delete cascade,
  description text not null,
  type text not null check (type in ('DOCUMENT','TEXT','CHECK')),
  linked_document_id uuid references public.company_documents(id),
  status text not null default 'NOT_STARTED'
    check (status in ('NOT_STARTED','IN_PROGRESS','COMPLETE')),
  due_date timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- NOTIFICATIONS
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  type text not null
    check (type in ('NEW_HIGH_FIT','DEADLINE_REMINDER','RFP_AMENDMENT')),
  data_json jsonb not null default '{}',
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- INDEXES
create index idx_opportunities_proposals_due on public.opportunities(proposals_due_at);
create index idx_match_scores_company on public.match_scores(company_id, score desc);
create index idx_bids_company_stage on public.bids(company_id, stage);
create index idx_companies_naics on public.companies using gin(naics_codes);
create index idx_companies_keywords on public.companies using gin(capability_keywords);
create index idx_notifications_user on public.notifications(user_id, sent_at);

-- ROW LEVEL SECURITY
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.bids enable row level security;
alter table public.company_documents enable row level security;
alter table public.bid_tasks enable row level security;
alter table public.match_scores enable row level security;
alter table public.notifications enable row level security;

-- RLS POLICIES
create policy "Users can read own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can read own company"
  on public.companies for select using (auth.uid() = owner_id);

create policy "Users can insert own company"
  on public.companies for insert with check (auth.uid() = owner_id);

create policy "Users can update own company"
  on public.companies for update using (auth.uid() = owner_id);

create policy "Users can manage own bids"
  on public.bids for all using (
    company_id in (
      select id from public.companies where owner_id = auth.uid()
    )
  );

create policy "Opportunities are public"
  on public.opportunities for select using (true);

create policy "Match scores readable by company owner"
  on public.match_scores for select using (
    company_id in (
      select id from public.companies where owner_id = auth.uid()
    )
  );
