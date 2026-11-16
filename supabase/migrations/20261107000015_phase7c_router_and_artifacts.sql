-- ==============================================================================
-- Migration 015: Phase 7C — Quota Tracking, Model Registry & Job Artifacts
-- Project: Zukai Audio Learning App
-- Description: Persistent quota sliding windows, circuit breakers, and resumable job artifacts
-- ==============================================================================

-- 0. Extend job_status enum with waiting_for_capacity
alter type public.job_status add value if not exists 'waiting_for_capacity';

-- 1. Model Quotas Table (Service-Role Only)
create table if not exists public.model_quotas (
  model_id text primary key,
  requests_this_minute int not null default 0,
  tokens_this_minute int not null default 0,
  requests_today int not null default 0,
  window_minute_start timestamptz not null default now(),
  window_day_start timestamptz not null default now(),
  cooldown_until timestamptz,
  circuit_breaker_until timestamptz,
  consecutive_failures int not null default 0,
  last_error text,
  last_used_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.model_quotas enable row level security;

-- Only service_role and postgres can read/write model quotas
create policy "Service role has full access to model quotas"
  on public.model_quotas for all
  using (auth.role() = 'service_role' or current_user = 'postgres');

-- 2. Job Artifacts Table (Service-Role Only, Resumable Pipeline)
create table if not exists public.job_artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.audio_jobs(id) on delete cascade,
  step text not null, -- 'extracted_text', 'outline', 'script', 'audio_chunk'
  chunk_index int not null default 0,
  artifact_type text not null, -- 'json', 'text', 'audio_mp3', 'audio_pcm'
  payload jsonb,
  storage_path text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint uq_job_step_chunk unique (job_id, step, chunk_index)
);

create index if not exists idx_job_artifacts_job_step on public.job_artifacts(job_id, step);
alter table public.job_artifacts enable row level security;

create policy "Service role has full access to job artifacts"
  on public.job_artifacts for all
  using (auth.role() = 'service_role' or current_user = 'postgres');

-- 3. Add content_sha256 and waiting_for_capacity support to documents & audio_jobs
alter table public.documents
  add column if not exists content_sha256 text;

create index if not exists idx_documents_sha256_owner on public.documents(owner_id, content_sha256);

alter table public.audio_jobs
  add column if not exists tokens_used jsonb not null default '{}'::jsonb,
  add column if not exists models_used jsonb not null default '[]'::jsonb,
  add column if not exists waiting_until timestamptz;
