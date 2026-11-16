/**
 * ZUKAI WAVEFORM PEAKS & SHA-256 BACKFILL TOOL
 * Location: /worker/src/scripts/backfillWaveformPeaks.ts
 *
 * Idempotently scans existing audio_tracks where waveform_peaks or sha256 is missing,
 * downloads the audio from Supabase Storage, calculates peaks & hash, and updates the DB.
 *
 * Run with: npm run backfill:peaks
 */

import { supabaseAdmin } from '../supabase/client.js';
import { logger } from '../logger.js';
import { analyzeAudioBuffer } from '../audio/peaks.js';

interface TrackToBackfill {
  id: string;
  storage_path: string;
  duration_seconds: number;
}

const CONCURRENCY = 2;
const DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processTrack(track: TrackToBackfill): Promise<boolean> {
  try {
    logger.info({ trackId: track.id, storagePath: track.storage_path }, '[Backfill] Downloading audio track...');

    const { data, error } = await supabaseAdmin.storage
      .from('audio')
      .download(track.storage_path);

    if (error || !data) {
      logger.error({ trackId: track.id, err: error?.message }, '[Backfill] Failed to download audio from storage');
      return false;
    }

    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      logger.warn({ trackId: track.id }, '[Backfill] Downloaded audio buffer is empty');
      return false;
    }

    const { sha256, waveformPeaks } = await analyzeAudioBuffer(buffer, 250);

    const { error: updateErr } = await supabaseAdmin
      .from('audio_tracks')
      .update({
        waveform_peaks: waveformPeaks.length > 0 ? waveformPeaks : null,
        sha256: sha256 || null,
      })
      .eq('id', track.id);

    if (updateErr) {
      logger.error({ trackId: track.id, err: updateErr.message }, '[Backfill] Failed to update track record');
      return false;
    }

    logger.info(
      { trackId: track.id, peakCount: waveformPeaks.length, sha256Prefix: sha256.slice(0, 8) },
      '[Backfill] Successfully backfilled track'
    );
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ trackId: track.id, err: msg }, '[Backfill] Error processing track');
    return false;
  }
}

async function main() {
  logger.info('[Backfill] Starting waveform peaks and SHA-256 backfill scan...');

  // Query tracks missing waveform_peaks or sha256
  const { data: tracks, error } = await supabaseAdmin
    .from('audio_tracks')
    .select('id, storage_path, duration_seconds')
    .or('waveform_peaks.is.null,sha256.is.null');

  if (error) {
    logger.error({ err: error.message }, '[Backfill] Failed to query audio_tracks');
    process.exit(1);
  }

  const list: TrackToBackfill[] = tracks || [];
  logger.info({ count: list.length }, '[Backfill] Found tracks needing backfill');

  if (list.length === 0) {
    logger.info('[Backfill] All tracks already have waveform_peaks and sha256. Nothing to do.');
    process.exit(0);
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const chunk = list.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map((t) => processTrack(t)));

    results.forEach((ok) => {
      if (ok) successCount++;
      else failCount++;
    });

    if (i + CONCURRENCY < list.length) {
      await sleep(DELAY_MS);
    }
  }

  logger.info(
    { total: list.length, succeeded: successCount, failed: failCount },
    '[Backfill] Completed backfill process'
  );
}

main().catch((err) => {
  logger.error({ err }, '[Backfill] Fatal error');
  process.exit(1);
});
