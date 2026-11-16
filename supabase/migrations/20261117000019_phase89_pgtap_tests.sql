-- ==============================================================================
-- Migration 019: Phase 8+9 pgTAP Tests
-- Project: Zukai Audio Learning App
-- Description: Verifies Phase 8+9 schema additions — columns, tables, functions, RLS.
-- Run with: pg_prove or SELECT * FROM pgtap.run_tests();
-- ==============================================================================

BEGIN;

SELECT plan(30);

-- ─── audio_tracks columns ────────────────────────────────────────────────────

SELECT has_column(
  'public', 'audio_tracks', 'waveform_peaks',
  'audio_tracks should have waveform_peaks column'
);

SELECT col_type_is(
  'public', 'audio_tracks', 'waveform_peaks', 'jsonb',
  'audio_tracks.waveform_peaks should be jsonb'
);

SELECT has_column(
  'public', 'audio_tracks', 'sha256',
  'audio_tracks should have sha256 column'
);

SELECT col_type_is(
  'public', 'audio_tracks', 'sha256', 'text',
  'audio_tracks.sha256 should be text'
);

SELECT has_column(
  'public', 'audio_tracks', 'hidden',
  'audio_tracks should have hidden column'
);

SELECT col_type_is(
  'public', 'audio_tracks', 'hidden', 'boolean',
  'audio_tracks.hidden should be boolean'
);

-- ─── playback_progress columns ───────────────────────────────────────────────

SELECT has_column(
  'public', 'playback_progress', 'device_id',
  'playback_progress should have device_id column'
);

SELECT has_column(
  'public', 'playback_progress', 'device_label',
  'playback_progress should have device_label column'
);

SELECT has_column(
  'public', 'playback_progress', 'client_ts',
  'playback_progress should have client_ts column'
);

SELECT col_type_is(
  'public', 'playback_progress', 'client_ts', 'timestamp with time zone',
  'playback_progress.client_ts should be timestamptz'
);

-- ─── bookmarks table ─────────────────────────────────────────────────────────

SELECT has_table(
  'public', 'bookmarks',
  'bookmarks table should exist'
);

SELECT has_column(
  'public', 'bookmarks', 'id',
  'bookmarks should have id column'
);

SELECT has_column(
  'public', 'bookmarks', 'user_id',
  'bookmarks should have user_id column'
);

SELECT has_column(
  'public', 'bookmarks', 'track_id',
  'bookmarks should have track_id column'
);

SELECT has_column(
  'public', 'bookmarks', 'position_seconds',
  'bookmarks should have position_seconds column'
);

SELECT has_column(
  'public', 'bookmarks', 'note',
  'bookmarks should have note column'
);

-- ─── listening_daily table ───────────────────────────────────────────────────

SELECT has_table(
  'public', 'listening_daily',
  'listening_daily table should exist'
);

SELECT has_column(
  'public', 'listening_daily', 'user_id',
  'listening_daily should have user_id column'
);

SELECT has_column(
  'public', 'listening_daily', 'day',
  'listening_daily should have day column'
);

SELECT has_column(
  'public', 'listening_daily', 'seconds',
  'listening_daily should have seconds column'
);

-- ─── Functions exist ─────────────────────────────────────────────────────────

SELECT has_function(
  'public', 'add_listening_seconds', ARRAY['integer'],
  'add_listening_seconds(integer) function should exist'
);

SELECT has_function(
  'public', 'list_documents',
  ARRAY['text','text','text','boolean','text','timestamp with time zone','uuid','integer'],
  'list_documents RPC should exist'
);

SELECT has_function(
  'public', 'restore_document', ARRAY['uuid'],
  'restore_document(uuid) function should exist'
);

SELECT has_function(
  'public', 'request_audio_url', ARRAY['uuid','text'],
  'request_audio_url(uuid, text) function should exist'
);

SELECT has_function(
  'public', 'update_playback_progress',
  ARRAY['uuid','numeric','numeric','boolean','text','text','timestamp with time zone'],
  'update_playback_progress with device params should exist'
);

-- ─── RLS enabled ─────────────────────────────────────────────────────────────

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'bookmarks';

SELECT ok(
  (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bookmarks'),
  'RLS should be enabled on bookmarks'
);

SELECT ok(
  (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'listening_daily'),
  'RLS should be enabled on listening_daily'
);

-- ─── Policy existence ────────────────────────────────────────────────────────

SELECT has_policy(
  'public', 'bookmarks', 'bookmarks_self',
  'bookmarks_self RLS policy should exist on bookmarks'
);

SELECT has_policy(
  'public', 'listening_daily', 'listening_daily_self',
  'listening_daily_self RLS policy should exist on listening_daily'
);

SELECT * FROM finish();

ROLLBACK;
