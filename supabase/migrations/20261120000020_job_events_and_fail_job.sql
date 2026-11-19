-- Migration: 20261120000020_job_events_and_fail_job.sql
-- Description: Create service-role-only job_events table and upgrade fail_job RPC for CONFIG_ERROR handling

-- 1. Create job_events table
create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.audio_jobs(id) on delete cascade,
  event_type text not null,
  stage text,
  error_code text,
  error_details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Index for querying events by job_id and created_at
create index if not exists idx_job_events_job_created
  on public.job_events (job_id, created_at desc);

-- 2. Strict Row Level Security: Service-role only, NO client access
alter table public.job_events enable row level security;

revoke all on public.job_events from anon;
revoke all on public.job_events from authenticated;
grant all on public.job_events to service_role;
grant select, insert, update, delete on public.job_events to postgres;

comment on table public.job_events is 'Service-role-only diagnostic timeline of internal errors and execution traces. Zero client access.';

-- 3. Upgrade fail_job RPC to accept sanitized details, record job_events, and handle CONFIG_ERROR safely
create or replace function public.fail_job(
  p_job_id uuid,
  p_error_code text,
  p_error_message text,
  p_error_details jsonb default '{}'::jsonb
)
returns public.audio_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.audio_jobs;
begin
  if auth.role() != 'service_role' and current_user != 'postgres' then
    raise exception 'ACCESS_DENIED: Service role execution required' using errcode = 'P0012';
  end if;

  select * into v_job from public.audio_jobs where id = p_job_id;
  if not found then
    raise exception 'JOB_NOT_FOUND: Audio job does not exist' using errcode = 'P0014';
  end if;

  -- 1. Record diagnostic event in service-role-only job_events table
  insert into public.job_events (
    job_id,
    event_type,
    stage,
    error_code,
    error_details,
    created_at
  ) values (
    p_job_id,
    'job.failed',
    coalesce(v_job.current_step, 'unknown'),
    p_error_code,
    coalesce(p_error_details, '{}'::jsonb),
    now()
  );

  -- 2. Handle CONFIG_ERROR specifically:
  -- Must NOT consume user quota, must NOT count toward user failure attempts,
  -- and raises high-severity audit alert for operators.
  if p_error_code = 'CONFIG_ERROR' then
    update public.audio_jobs
    set status = 'failed',
        error_code = p_error_code,
        error_message = p_error_message,
        current_step = 'Paused due to system configuration issue. Operator notified.',
        finished_at = now(),
        updated_at = now()
    where id = p_job_id
    returning * into v_job;

    perform private.write_audit_log(
      v_job.owner_id,
      v_job.org_id,
      'job.config_error_alert',
      'audio_job',
      p_job_id::text,
      jsonb_build_object(
        'severity', 'CRITICAL',
        'error_code', p_error_code,
        'message', 'System configuration error encountered. Attempt count preserved.'
      )
    );

    return v_job;
  end if;

  -- 3. Standard error handling for retryable vs terminal errors
  if v_job.attempt_count < 3 then
    -- Transient retry: re-queue with backoff step note
    update public.audio_jobs
    set status = 'queued',
        error_code = p_error_code,
        error_message = p_error_message,
        current_step = 'Retrying after transient glitch (attempt ' || v_job.attempt_count || '/3)',
        updated_at = now()
    where id = p_job_id
    returning * into v_job;
  else
    -- Terminal failure
    update public.audio_jobs
    set status = 'failed',
        error_code = p_error_code,
        error_message = p_error_message,
        current_step = 'Failed permanently after 3 attempts',
        finished_at = now(),
        updated_at = now()
    where id = p_job_id
    returning * into v_job;

    -- Audit log failure
    perform private.write_audit_log(
      v_job.owner_id,
      v_job.org_id,
      'job.failed',
      'audio_job',
      p_job_id::text,
      jsonb_build_object('error_code', p_error_code, 'error_message', p_error_message)
    );
  end if;

  return v_job;
end;
$$;
