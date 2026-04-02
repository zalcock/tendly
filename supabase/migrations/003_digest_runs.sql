-- Create digest_runs table to audit daily digest executions

create table if not exists public.digest_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text,
  total_users int default 0,
  emails_sent int default 0,
  error_json jsonb
);

-- simple index
create index if not exists idx_digest_runs_started_at on public.digest_runs (started_at desc);
