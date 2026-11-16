-- ==============================================================================
-- Migration 016: Phase 7D — Durable Pipeline Units, Resumption & Quota Telemetry
-- Project: Zukai Audio Learning App
-- Description: Adds resume_at, waiting_reason, capacity_waits, step_detail, and providers_used
-- ==============================================================================

-- 1. Ensure enum value exists
alter type public.job_status add value if not exists 'waiting_for_capacity';

-- 2. Add Phase 7D state and telemetry columns to audio_jobs
alter table public.audio_jobs
  add column if not exists resume_at timestamptz,
  add column if not exists waiting_reason text,
  add column if not exists capacity_waits int not null default 0,
  add column if not exists step_detail jsonb not null default '{}'::jsonb,
  add column if not exists providers_used jsonb not null default '[]'::jsonb;

-- 3. Composite Index for worker queue & reaper (safe against transactional enum conflicts)
create index if not exists idx_audio_jobs_status_resume 
  on public.audio_jobs(status, resume_at);

-- 4. Safe Realtime publication attachment (idempotent)
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'audio_jobs'
  ) then
    alter publication supabase_realtime add table public.audio_jobs;
  end if;
exception
  when others then null;
end $$;
