/**
 * ZUKAI PLAYBACK API REPOSITORY
 * Location: /zukai/src/features/playback/api/playbackApi.ts
 * Description: Data access layer for cross-device playback progress tracking,
 *              bookmarks, listening metrics, and signed audio streaming paths.
 */

import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database';

export type PlaybackProgressRow = Database['public']['Tables']['playback_progress']['Row'];
export type BookmarkRow = Database['public']['Tables']['bookmarks']['Row'];
export type ListeningDailyRow = Database['public']['Tables']['listening_daily']['Row'];

export interface UpdatePlaybackParams {
  trackId: string;
  positionSeconds: number;
  speed?: number;
  completed?: boolean;
  deviceId?: string | null;
  deviceLabel?: string | null;
  clientTs?: string | null;
}

export async function updatePlaybackProgress(params: UpdatePlaybackParams): Promise<PlaybackProgressRow> {
  const { data, error } = await supabase.rpc('update_playback_progress', {
    p_track_id: params.trackId,
    p_position_seconds: params.positionSeconds,
    p_speed: params.speed ?? 1.0,
    p_completed: params.completed ?? false,
    p_device_id: params.deviceId ?? null,
    p_device_label: params.deviceLabel ?? null,
    p_client_ts: params.clientTs ?? null,
  });

  if (error) throw error;
  return data;
}

export async function fetchPlaybackProgress(trackId: string): Promise<PlaybackProgressRow | null> {
  const { data, error } = await supabase
    .from('playback_progress')
    .select('*')
    .eq('track_id', trackId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Audit-logged RPC request for audio storage path
 */
export async function requestAudioUrl(trackId: string, purpose: string = 'stream'): Promise<string> {
  const { data, error } = await supabase.rpc('request_audio_url', {
    p_track_id: trackId,
    p_purpose: purpose,
  });

  if (error) throw error;
  return data;
}

/**
 * Increment daily listening duration in seconds
 */
export async function addListeningSeconds(seconds: number, day?: string): Promise<void> {
  if (seconds <= 0) return;
  const { error } = await supabase.rpc('add_listening_seconds', {
    p_seconds: seconds,
    p_day: day,
  });

  if (error) throw error;
}

/**
 * Creates a bookmark for an audio track at the specified position
 */
export async function createBookmark(
  trackId: string,
  positionSeconds: number,
  note?: string
): Promise<BookmarkRow> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('bookmarks')
    .insert({
      user_id: user.user.id,
      track_id: trackId,
      position_seconds: positionSeconds,
      note: note ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Fetches all bookmarks for a track
 */
export async function fetchBookmarks(trackId: string): Promise<BookmarkRow[]> {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('track_id', trackId)
    .order('position_seconds', { ascending: true });

  if (error) throw error;
  return data ?? [];
}
