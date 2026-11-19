begin;
select plan(12);

-- 1. Verify vector extension exists
select has_extension('vector', 'Extension vector is installed');

-- 2. Verify tables exist
select has_table('public', 'document_sections', 'Table public.document_sections exists');
select has_table('public', 'document_chunks', 'Table public.document_chunks exists');

-- 3. Verify RLS is enabled on document_sections and document_chunks
select table_privs_are(
  'public', 'document_sections', 'anon', ARRAY[]::text[],
  'anon role has NO privileges on document_sections'
);

select table_privs_are(
  'public', 'document_chunks', 'anon', ARRAY[]::text[],
  'anon role has NO privileges on document_chunks'
);

-- 4. Verify authenticated has SELECT only
select table_privs_are(
  'public', 'document_sections', 'authenticated', ARRAY['SELECT']::text[],
  'authenticated role has SELECT only on document_sections'
);

select table_privs_are(
  'public', 'document_chunks', 'authenticated', ARRAY['SELECT']::text[],
  'authenticated role has SELECT only on document_chunks'
);

-- 5. Verify service_role privileges
select has_table_privilege('service_role', 'public.document_chunks', 'SELECT', 'service_role can select document_chunks');
select has_table_privilege('service_role', 'public.document_chunks', 'INSERT', 'service_role can insert document_chunks');

-- 6. Verify columns in document_chunks
select columns_are('public', 'document_chunks', ARRAY[
  'id',
  'document_id',
  'owner_id',
  'org_id',
  'ordinal',
  'parent_section_id',
  'heading_path',
  'page_start',
  'page_end',
  'text',
  'token_count',
  'content_hash',
  'embedding',
  'tsv',
  'created_at'
], 'document_chunks has all expected schema columns including embedding and tsv');

-- 7. Verify match_document_chunks function exists
select has_function('public', 'match_document_chunks', ARRAY['uuid', 'text', 'USER-DEFINED', 'integer', 'integer'], 'match_document_chunks function exists');

-- 8. Verify fail_job function signature exists with p_failed_stage
select has_function('public', 'fail_job', ARRAY['uuid', 'text', 'text', 'jsonb', 'text'], 'fail_job accepts p_failed_stage');

select * from finish();
rollback;
