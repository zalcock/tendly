ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_started_at timestamptz, ADD COLUMN IF NOT EXISTS last_digest_at timestamptz;
