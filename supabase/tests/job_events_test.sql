begin;
select plan(7);

-- 1. Verify job_events table exists
select has_table('public', 'job_events', 'Table public.job_events exists');

-- 2. Verify RLS is enabled on job_events
select table_privs_are(
  'public', 'job_events', 'anon', ARRAY[]::text[],
  'anon role has NO privileges on job_events'
);

select table_privs_are(
  'public', 'job_events', 'authenticated', ARRAY[]::text[],
  'authenticated role has NO privileges on job_events'
);

-- 3. Verify service_role has access
select has_table_privilege('service_role', 'public.job_events', 'SELECT', 'service_role can select job_events');
select has_table_privilege('service_role', 'public.job_events', 'INSERT', 'service_role can insert job_events');

-- 4. Verify columns in job_events
select columns_are('public', 'job_events', ARRAY[
  'id',
  'job_id',
  'event_type',
  'stage',
  'error_code',
  'error_details',
  'created_at'
], 'job_events has all expected diagnostic columns');

-- 5. Verify fail_job function signature exists
select has_function('public', 'fail_job', ARRAY['uuid', 'text', 'text', 'jsonb'], 'fail_job accepts p_error_details');

select * from finish();
rollback;
