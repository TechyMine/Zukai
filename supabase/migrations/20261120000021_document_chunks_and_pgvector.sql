-- ==============================================================================
-- Migration 021: Document Chunks, Sections, pgvector & Hybrid Retrieval
-- Project: Zukai Audio Learning App (Stage B: Sequential Agentic Pipeline with RAG)
-- Description: pgvector extension, document_sections, document_chunks with HNSW
--              and GIN indexes, RLS, tenant isolation, and match_document_chunks (RRF).
-- ==============================================================================

-- 1. Enable pgvector extension
create extension if not exists vector;

-- 2. Extend audio_jobs with pipeline metadata
alter table public.audio_jobs
  add column if not exists failed_stage text,
  add column if not exists pipeline_version text not null default 'v1',
  add column if not exists prompt_version text not null default 'v1';

-- 3. Extend job_events with telemetry and span attributes
alter table public.job_events
  add column if not exists unit text,
  add column if not exists model text,
  add column if not exists tokens_in int,
  add column if not exists tokens_out int,
  add column if not exists cost_usd numeric(10, 6),
  add column if not exists duration_ms int,
  add column if not exists metadata jsonb default '{}'::jsonb;

-- 4. Document Sections Table (Small-to-Big Context Parent)
create table if not exists public.document_sections (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  ordinal int not null,
  heading text not null,
  heading_path text[] not null default '{}',
  page_start int,
  page_end int,
  text text not null,
  token_count int not null default 0,
  created_at timestamptz not null default now(),
  constraint uq_document_sections_doc_ord unique (document_id, ordinal)
);

create index if not exists idx_document_sections_doc_ord
  on public.document_sections (document_id, ordinal);
create index if not exists idx_document_sections_owner
  on public.document_sections (owner_id);

-- 5. Document Chunks Table (RAG Store with Vector + Full-Text Search)
create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  ordinal int not null,
  parent_section_id uuid references public.document_sections(id) on delete set null,
  heading_path text[] not null default '{}',
  page_start int,
  page_end int,
  text text not null,
  token_count int not null default 0,
  content_hash text not null,
  embedding vector(768),
  tsv tsvector generated always as (to_tsvector('english', text)) stored,
  created_at timestamptz not null default now(),
  constraint uq_document_chunks_doc_ord unique (document_id, ordinal)
);

-- Indexes for Chunks
create index if not exists idx_document_chunks_embedding
  on public.document_chunks using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create index if not exists idx_document_chunks_tsv
  on public.document_chunks using gin (tsv);

create index if not exists idx_document_chunks_doc_ord
  on public.document_chunks (document_id, ordinal);

create index if not exists idx_document_chunks_hash
  on public.document_chunks (content_hash);

create index if not exists idx_document_chunks_owner
  on public.document_chunks (owner_id);

-- 6. Row Level Security & Explicit Permissions
alter table public.document_sections enable row level security;
alter table public.document_chunks enable row level security;

-- Revoke all from anon
revoke all on public.document_sections from anon;
revoke all on public.document_chunks from anon;

-- Revoke all from authenticated, then grant SELECT only
revoke all on public.document_sections from authenticated;
revoke all on public.document_chunks from authenticated;
grant select on public.document_sections to authenticated;
grant select on public.document_chunks to authenticated;

-- Service role and postgres have full access
grant all on public.document_sections to service_role;
grant all on public.document_chunks to service_role;
grant all on public.document_sections to postgres;
grant all on public.document_chunks to postgres;

-- Policies for document_sections
create policy "Users can view own or org document sections"
  on public.document_sections
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or (org_id is not null and private.is_org_member(org_id))
  );

-- Policies for document_chunks
create policy "Users can view own or org document chunks"
  on public.document_chunks
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or (org_id is not null and private.is_org_member(org_id))
  );

-- 7. Hybrid Retrieval RPC: Reciprocal Rank Fusion (RRF)
create or replace function public.match_document_chunks(
  p_document_id uuid,
  p_query_text text default '',
  p_query_embedding vector(768) default null,
  p_match_count int default 6,
  p_rrf_k int default 60
)
returns table (
  id uuid,
  ordinal int,
  parent_section_id uuid,
  heading_path text[],
  page_start int,
  page_end int,
  text text,
  token_count int,
  similarity float8,
  text_rank float8,
  rrf_score float8
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_org_id uuid;
  v_current_user uuid;
begin
  -- 1. Tenant verification: Ensure document exists and check ownership
  select owner_id, org_id into v_owner_id, v_org_id
  from public.documents
  where id = p_document_id and deleted_at is null;

  if not found then
    raise exception 'DOCUMENT_NOT_FOUND: Document does not exist or has been deleted' using errcode = 'P0002';
  end if;

  -- 2. Check authorization if called by an authenticated user
  v_current_user := auth.uid();
  if auth.role() = 'authenticated' and v_current_user is not null then
    if v_owner_id != v_current_user and (v_org_id is null or not private.is_org_member(v_org_id)) then
      raise exception 'ACCESS_DENIED: Caller does not have permission to view chunks for this document' using errcode = '42501';
    end if;
  end if;

  -- 3. Hybrid RRF Retrieval
  return query
  with vector_matches as (
    select
      c.id,
      row_number() over (order by (c.embedding <=> p_query_embedding) asc) as v_rank,
      case
        when p_query_embedding is not null and c.embedding is not null
        then (1.0 - (c.embedding <=> p_query_embedding))
        else 0.0
      end as v_sim
    from public.document_chunks c
    where c.document_id = p_document_id
      and (p_query_embedding is null or c.embedding is not null)
    order by (c.embedding <=> p_query_embedding) asc
    limit (p_match_count * 3)
  ),
  text_matches as (
    select
      c.id,
      row_number() over (order by ts_rank_cd(c.tsv, plainto_tsquery('english', coalesce(p_query_text, ''))) desc) as t_rank,
      ts_rank_cd(c.tsv, plainto_tsquery('english', coalesce(p_query_text, ''))) as t_score
    from public.document_chunks c
    where c.document_id = p_document_id
      and (
        p_query_text is null
        or trim(p_query_text) = ''
        or c.tsv @@ plainto_tsquery('english', p_query_text)
      )
    order by ts_rank_cd(c.tsv, plainto_tsquery('english', coalesce(p_query_text, ''))) desc
    limit (p_match_count * 3)
  ),
  combined as (
    select
      coalesce(v.id, t.id) as chunk_id,
      coalesce(v.v_sim, 0.0)::float8 as sim,
      coalesce(t.t_score, 0.0)::float8 as trank,
      (
        coalesce(1.0 / (p_rrf_k + v.v_rank), 0.0) +
        coalesce(1.0 / (p_rrf_k + t.t_rank), 0.0)
      )::float8 as rrf
    from vector_matches v
    full outer join text_matches t on v.id = t.id
  )
  select
    c.id,
    c.ordinal,
    c.parent_section_id,
    c.heading_path,
    c.page_start,
    c.page_end,
    c.text,
    c.token_count,
    comb.sim as similarity,
    comb.trank as text_rank,
    comb.rrf as rrf_score
  from combined comb
  join public.document_chunks c on c.id = comb.chunk_id
  order by comb.rrf desc
  limit p_match_count;
end;
$$;

grant execute on function public.match_document_chunks to authenticated;
grant execute on function public.match_document_chunks to service_role;

-- 8. Upgrade fail_job to support failed_stage
create or replace function public.fail_job(
  p_job_id uuid,
  p_error_code text,
  p_error_message text,
  p_error_details jsonb default '{}'::jsonb,
  p_failed_stage text default null
)
returns public.audio_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.audio_jobs;
  v_stage text;
begin
  if auth.role() != 'service_role' and current_user != 'postgres' then
    raise exception 'ACCESS_DENIED: Service role execution required' using errcode = 'P0012';
  end if;

  select * into v_job from public.audio_jobs where id = p_job_id;
  if not found then
    raise exception 'JOB_NOT_FOUND: Audio job does not exist' using errcode = 'P0014';
  end if;

  v_stage := coalesce(p_failed_stage, v_job.current_step, 'unknown');

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
    v_stage,
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
        failed_stage = v_stage,
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
        'failed_stage', v_stage,
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
        failed_stage = v_stage,
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
        failed_stage = v_stage,
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
      jsonb_build_object('error_code', p_error_code, 'failed_stage', v_stage, 'error_message', p_error_message)
    );
  end if;

  return v_job;
end;
$$;
