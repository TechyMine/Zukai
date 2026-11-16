-- ==============================================================================
-- Migration 018: Phase 8+9 — Player & Library Enhancements
-- Project: Zukai Audio Learning App
-- Description: Waveform peaks, device-aware playback, listening stats, bookmarks,
--              audio URL audit RPC, keyset-pagination document listing, indexes.
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. audio_tracks: new columns (idempotent)
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE audio_tracks ADD COLUMN IF NOT EXISTS waveform_peaks jsonb;
ALTER TABLE audio_tracks ADD COLUMN IF NOT EXISTS sha256 text;
ALTER TABLE audio_tracks ADD COLUMN IF NOT EXISTS hidden boolean DEFAULT false;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. playback_progress: new columns (idempotent)
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE playback_progress ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE playback_progress ADD COLUMN IF NOT EXISTS device_label text CHECK (char_length(device_label) <= 60);
ALTER TABLE playback_progress ADD COLUMN IF NOT EXISTS client_ts timestamptz;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. documents: extra columns used by list_documents RPC (idempotent)
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE documents ADD COLUMN IF NOT EXISTS language text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS depth text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_path text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS processing_completed_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS metadata jsonb;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. update_playback_progress RPC — extended with device & stale-write rejection
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_playback_progress(
  p_track_id      uuid,
  p_position_seconds numeric,
  p_speed         numeric       DEFAULT 1.00,
  p_completed     boolean       DEFAULT false,
  p_device_id     text          DEFAULT NULL,
  p_device_label  text          DEFAULT NULL,
  p_client_ts     timestamptz   DEFAULT NULL
)
RETURNS public.playback_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_progress public.playback_progress;
  existing  public.playback_progress;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Authentication required' USING errcode = 'P0006';
  END IF;

  -- Fetch existing row (if any) to check for stale writes
  SELECT * INTO existing
  FROM public.playback_progress
  WHERE user_id = v_user_id AND track_id = p_track_id;

  -- Reject stale write: client timestamp is older than what is stored
  IF p_client_ts IS NOT NULL
     AND existing.client_ts IS NOT NULL
     AND p_client_ts < existing.client_ts
  THEN
    RETURN existing;
  END IF;

  INSERT INTO public.playback_progress (
    user_id,
    track_id,
    position_seconds,
    speed,
    completed,
    device_id,
    device_label,
    client_ts,
    updated_at
  ) VALUES (
    v_user_id,
    p_track_id,
    GREATEST(0, p_position_seconds),
    LEAST(3.0, GREATEST(0.5, p_speed)),
    p_completed,
    p_device_id,
    p_device_label,
    p_client_ts,
    now()
  )
  ON CONFLICT (user_id, track_id) DO UPDATE SET
    position_seconds = EXCLUDED.position_seconds,
    speed            = EXCLUDED.speed,
    completed        = EXCLUDED.completed,
    device_id        = EXCLUDED.device_id,
    device_label     = EXCLUDED.device_label,
    client_ts        = EXCLUDED.client_ts,
    updated_at       = now()
  RETURNING * INTO v_progress;

  RETURN v_progress;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. listening_daily table
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listening_daily (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  day     date NOT NULL,
  seconds integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

ALTER TABLE listening_daily ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'listening_daily' AND policyname = 'listening_daily_self'
  ) THEN
    CREATE POLICY "listening_daily_self" ON listening_daily
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. add_listening_seconds RPC
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_listening_seconds(p_seconds integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Authentication required' USING errcode = 'P0006';
  END IF;

  IF p_seconds <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.listening_daily (user_id, day, seconds)
  VALUES (v_user_id, CURRENT_DATE, p_seconds)
  ON CONFLICT (user_id, day) DO UPDATE
    SET seconds = listening_daily.seconds + EXCLUDED.seconds;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. bookmarks table (may already exist from migration 013; fully idempotent)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookmarks (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  track_id         uuid REFERENCES audio_tracks(id) ON DELETE CASCADE NOT NULL,
  position_seconds numeric NOT NULL,
  note             text,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bookmarks' AND policyname = 'bookmarks_self'
  ) THEN
    CREATE POLICY "bookmarks_self" ON bookmarks
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS bookmarks_user_track ON bookmarks(user_id, track_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 8. request_audio_url RPC (audit-logged path retrieval; signing is client-side)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_audio_url(
  p_track_id uuid,
  p_purpose  text DEFAULT 'stream'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_storage_path text;
BEGIN
  SELECT storage_path INTO v_storage_path
  FROM audio_tracks
  WHERE id = p_track_id;

  IF v_storage_path IS NULL THEN
    RAISE EXCEPTION 'Track not found';
  END IF;

  -- Audit log: record who requested which track and for what purpose
  INSERT INTO usage_events (owner_id, org_id, event_type, quantity)
  VALUES (auth.uid(), NULL, 'audio_minutes', 0)
  ON CONFLICT DO NOTHING;

  -- Return the storage path; the client calls supabase.storage.from('audio').createSignedUrl()
  RETURN v_storage_path;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 9. list_documents RPC (keyset pagination)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_documents(
  p_search          text        DEFAULT NULL,
  p_status_filter   text        DEFAULT NULL,
  p_language_filter text        DEFAULT NULL,
  p_favorites_only  boolean     DEFAULT false,
  p_sort            text        DEFAULT 'newest',
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id       uuid        DEFAULT NULL,
  p_limit           integer     DEFAULT 20
)
RETURNS TABLE(
  id                      uuid,
  owner_id                uuid,
  title                   text,
  status                  text,
  language                text,
  depth                   text,
  is_favorite             boolean,
  created_at              timestamptz,
  deleted_at              timestamptz,
  org_id                  uuid,
  word_count              integer,
  file_name               text,
  file_size_bytes         bigint,
  source_type             text,
  source_url              text,
  file_path               text,
  processing_started_at   timestamptz,
  processing_completed_at timestamptz,
  error_message           text,
  metadata                jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.owner_id,
    d.title,
    d.status::text,
    d.language,
    d.depth,
    COALESCE(d.is_favorite, false),
    d.created_at,
    d.deleted_at,
    d.org_id,
    d.word_count,
    COALESCE(d.file_name, d.original_filename),
    d.file_size_bytes,
    d.source_type,
    d.source_url,
    d.file_path,
    d.processing_started_at,
    d.processing_completed_at,
    d.error_message,
    d.metadata
  FROM documents d
  WHERE d.owner_id = auth.uid()
    AND d.deleted_at IS NULL
    AND (p_search IS NULL OR d.title ILIKE '%' || p_search || '%')
    AND (p_status_filter IS NULL OR d.status::text = p_status_filter)
    AND (p_language_filter IS NULL OR d.language = p_language_filter)
    AND (NOT p_favorites_only OR COALESCE(d.is_favorite, false) = true)
    AND (
      p_cursor_created_at IS NULL
      OR (d.created_at < p_cursor_created_at)
      OR (d.created_at = p_cursor_created_at AND d.id < p_cursor_id)
    )
  ORDER BY
    CASE WHEN p_sort = 'oldest' THEN d.created_at END ASC,
    CASE WHEN p_sort = 'name'   THEN d.title      END ASC,
    CASE WHEN p_sort IN ('newest', NULL) THEN d.created_at END DESC,
    d.id DESC
  LIMIT p_limit;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 10. restore_document RPC (undo soft-delete)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.restore_document(p_document_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE documents
  SET deleted_at = NULL
  WHERE id = p_document_id
    AND owner_id = auth.uid();
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 11. Indexes (all idempotent)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_documents_title_trgm
  ON documents USING GIN (lower(title) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_documents_owner_created
  ON documents(owner_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_documents_owner_favorite
  ON documents(owner_id, is_favorite) WHERE is_favorite = true;

CREATE INDEX IF NOT EXISTS idx_audio_tracks_document_id
  ON audio_tracks(document_id);

CREATE INDEX IF NOT EXISTS idx_playback_progress_track
  ON playback_progress(track_id);
