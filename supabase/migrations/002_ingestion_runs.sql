-- Ingestion runs audit table
create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.opportunity_sources(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'STARTED' check (status in ('STARTED','SUCCESS','FAILED')),
  total_found integer,
  inserted integer,
  skipped integer,
  error_json jsonb,
  created_at timestamptz not null default now()
);

create index idx_ingestion_runs_started_at on public.ingestion_runs(started_at desc);
