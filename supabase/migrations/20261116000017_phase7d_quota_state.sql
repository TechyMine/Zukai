-- ============================================================
-- Migration: 20261116000017_phase7d_quota_state
-- Adds persisted quota model state and job_artifacts tables.
-- ============================================================

-- quota_model_state: global persisted quota counters (service-role write only)
create table if not exists public.quota_model_state (
  model_id text primary key,
  requests_today int not null default 0,
  tokens_today bigint not null default 0,
  requests_this_minute int not null default 0,
  tokens_this_minute bigint not null default 0,
  cooldown_until timestamptz,
  circuit_breaker_until timestamptz,
  consecutive_failures int not null default 0,
  window_minute_start timestamptz not null default now(),
  window_day_start timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quota_model_state enable row level security;

drop policy if exists "Service role only" on public.quota_model_state;
create policy "Service role only" on public.quota_model_state using (false);

-- job_artifacts: persisted pipeline unit results
create table if not exists public.job_artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.audio_jobs(id) on delete cascade,
  unit_key text not null,
  storage_path text,
  payload jsonb,
  created_at timestamptz not null default now(),
  unique(job_id, unit_key)
);

alter table public.job_artifacts enable row level security;

drop policy if exists "Users read own" on public.job_artifacts;
create policy "Users read own" on public.job_artifacts for select using (
  job_id in (select id from public.audio_jobs where owner_id = auth.uid())
);

drop policy if exists "Service role write" on public.job_artifacts;
create policy "Service role write" on public.job_artifacts for all using (false);
