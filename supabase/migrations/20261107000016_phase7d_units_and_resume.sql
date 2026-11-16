-- ==============================================================================
-- Migration 016: Phase 7D — Durable Pipeline Units, Resumption & Quota Telemetry
-- Project: Zukai Audio Learning App
-- Description: Adds resume_at, waiting_reason, capacity_waits, step_detail, and providers_used
-- ==============================================================================

alter table public.audio_jobs
  add column if not exists resume_at timestamptz,
  add column if not exists waiting_reason text,
  add column if not exists capacity_waits int not null default 0,
  add column if not exists step_detail jsonb not null default '{}'::jsonb,
  add column if not exists providers_used jsonb not null default '[]'::jsonb;

-- Index for the reaper and worker scheduler to find eligible waiting jobs efficiently
create index if not exists idx_audio_jobs_waiting_resume 
  on public.audio_jobs(status, resume_at) 
  where status = 'waiting_for_capacity';

-- Ensure real-time publication includes the new columns
alter publication supabase_realtime add table public.audio_jobs;
