/**
 * ZUKAI ARTIFACT MANAGER & CONTENT DEDUPLICATION
 * Location: /worker/src/ai/artifactManager.ts
 * Manages resumable pipeline intermediate artifacts and SHA-256 track deduplication.
 */

import crypto from 'node:crypto';
import { supabaseWorker } from '../supabase/client.js';
import { logger } from '../logger.js';

export function computeSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Checks if the SAME user or organization already synthesized an audio explanation
 * with the exact same file content hash, language, depth, and voice.
 */
export async function findReusableTrack(
  ownerId: string,
  orgId: string | null,
  contentSha256: string,
  language: string,
  depth: string,
  voice: string
): Promise<{ trackId: string; documentTitle: string } | null> {
  try {
    // 1. Find documents with matching hash owned by this user/org
    let query = supabaseWorker
      .from('documents')
      .select('id, title, audio_tracks!inner(id, duration_seconds, format, storage_path, audio_jobs!inner(language, depth, voice, status))')
      .eq('owner_id', ownerId)
      .eq('content_sha256', contentSha256);

    if (orgId) {
      query = query.eq('org_id', orgId);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) return null;

    for (const doc of data) {
      const tracks: any[] = (doc as any).audio_tracks || [];
      for (const t of tracks) {
        const job = t.audio_jobs;
        if (
          job &&
          job.status === 'ready' &&
          job.language === language &&
          job.depth === depth &&
          job.voice === voice
        ) {
          logger.info({ ownerId, contentSha256, trackId: t.id }, 'Found reusable audio track via SHA-256');
          return { trackId: t.id, documentTitle: doc.title };
        }
      }
    }

    return null;
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'Error checking content hash deduplication');
    return null;
  }
}

/**
 * Saves an intermediate step artifact (e.g. outline, chapter script, chunk audio)
 */
export async function saveArtifact(
  jobId: string,
  step: 'extracted_text' | 'outline' | 'script' | 'audio_chunk',
  chunkIndex: number,
  artifactType: 'json' | 'text' | 'audio_mp3' | 'audio_pcm',
  payload: any,
  meta: Record<string, any> = {}
): Promise<void> {
  try {
    await supabaseWorker.from('job_artifacts').upsert(
      {
        job_id: jobId,
        step,
        chunk_index: chunkIndex,
        artifact_type: artifactType,
        payload: artifactType === 'json' ? payload : null,
        meta: { ...meta, savedAt: new Date().toISOString() },
      },
      { onConflict: 'job_id,step,chunk_index' }
    );
  } catch (err: any) {
    logger.warn({ jobId, step, chunkIndex, err: err?.message }, 'Failed to persist job artifact');
  }
}

/**
 * Retrieves a saved intermediate artifact
 */
export async function getArtifact(
  jobId: string,
  step: string,
  chunkIndex = 0
): Promise<any | null> {
  try {
    const { data, error } = await supabaseWorker
      .from('job_artifacts')
      .select('*')
      .eq('job_id', jobId)
      .eq('step', step)
      .eq('chunk_index', chunkIndex)
      .maybeSingle();

    if (error || !data) return null;
    return data.payload;
  } catch {
    return null;
  }
}

/**
 * Retrieves list of completed chunk indexes for a given job step
 */
export async function getCompletedChunkIndexes(jobId: string, step: string): Promise<number[]> {
  try {
    const { data, error } = await supabaseWorker
      .from('job_artifacts')
      .select('chunk_index')
      .eq('job_id', jobId)
      .eq('step', step);

    if (error || !data) return [];
    return data.map((d: { chunk_index: number }) => d.chunk_index);
  } catch {
    return [];
  }
}
