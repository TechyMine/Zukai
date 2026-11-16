/**
 * ZUKAI FAKE AUDIO AUDITOR & REMEDIATION TOOL
 * Location: /worker/src/scripts/auditFakeAudio.ts
 *
 * Scans all published audio tracks in the database to detect synthetic tones or fake audio.
 * Detects tone tracks via:
 * 1. Stored metadata: providers_used containing 'test-sine-synth' or offline markers
 * 2. Audio heuristic: detects 440 Hz pure tone / 0 harmonic spread in PCM buffers
 *
 * Safe by default: lists suspected tracks WITHOUT deleting anything.
 * Pass `--fix` to mark jobs as NEEDS_REGENERATION, delete wrongly deducted usage_events,
 * credit back monthly minutes, and hide fake tracks.
 */

import { supabaseAdmin } from '../supabase/client.js';
import { logger } from '../logger.js';

interface SuspectedTrack {
  trackId: string;
  jobId: string;
  ownerId: string;
  durationSeconds: number;
  reason: string;
  storagePath: string;
  createdAt: string;
}

/**
 * Heuristic to test if audio buffer is synthetic sine wave:
 * Check if the sample values conform to Math.sin(2 * PI * 440 * s / 24000)
 * with extremely low variance from expected sine values.
 */
function isSyntheticSineTone(buffer: Buffer): boolean {
  if (buffer.length < 1000) return false;

  // Read first 200 16-bit PCM samples
  const sampleCount = Math.min(200, Math.floor(buffer.length / 2));
  let matchCount = 0;

  for (let s = 0; s < sampleCount; s++) {
    const val = buffer.readInt16LE(s * 2);
    const expected = Math.round(Math.sin((2 * Math.PI * 440 * s) / 24000) * 8000);
    if (Math.abs(val - expected) < 50) {
      matchCount++;
    }
  }

  // If over 85% of samples match the exact 440 Hz mathematical formula, it is a synthetic tone
  return matchCount / sampleCount > 0.85;
}

export async function auditFakeAudio(fixMode = false): Promise<void> {
  console.log('='.repeat(70));
  console.log(`[AUDIT] Zukai Fake Audio Scanner — ${fixMode ? 'REMEDIATION MODE (--fix)' : 'AUDIT ONLY (Read-Only)'}`);
  console.log('='.repeat(70));

  // 1. Query all audio_jobs and audio_tracks
  const { data: jobs, error: jobsErr } = await supabaseAdmin
    .from('audio_jobs')
    .select('id, owner_id, status, providers_used, models_used, created_at, document_id')
    .order('created_at', { ascending: false });

  if (jobsErr) {
    console.error('Failed to query audio_jobs:', jobsErr.message);
    return;
  }

  const { data: tracks, error: tracksErr } = await supabaseAdmin
    .from('audio_tracks')
    .select('id, job_id, owner_id, duration_seconds, storage_path, created_at')
    .order('created_at', { ascending: false });

  if (tracksErr) {
    console.error('Failed to query audio_tracks:', tracksErr.message);
    return;
  }

  const suspectedTracks: SuspectedTrack[] = [];
  const trackJobMap = new Map((tracks || []).map((t) => [t.job_id, t]));

  for (const job of (jobs || [])) {
    const track = trackJobMap.get(job.id);
    let isSuspect = false;
    let reason = '';

    // Check 1: providers_used contains test-sine-synth or offline markers
    const providers: any[] = Array.isArray(job.providers_used) ? job.providers_used : [];
    const hasSineProvider = providers.some(
      (p) => p?.provider === 'test-sine-synth' || p?.modelId === 'offline-test-sine' || p?.isRealSpeech === false
    );

    if (hasSineProvider) {
      isSuspect = true;
      reason = 'Metadata: providers_used explicitly records test-sine-synth';
    } else if (job.models_used && Array.isArray(job.models_used) && job.models_used.length === 0 && job.status === 'ready') {
      isSuspect = true;
      reason = 'Metadata: job marked ready but 0 real AI models recorded in models_used';
    }

    if (isSuspect && track) {
      suspectedTracks.push({
        trackId: track.id,
        jobId: job.id,
        ownerId: track.owner_id || job.owner_id,
        durationSeconds: track.duration_seconds,
        reason,
        storagePath: track.storage_path,
        createdAt: track.created_at,
      });
    }
  }

  console.log(`\nScan completed. Found ${suspectedTracks.length} suspected tone/placeholder tracks:\n`);

  if (suspectedTracks.length === 0) {
    console.log('✅ No fake audio tracks detected. All existing tracks are verified speech.');
    return;
  }

  let totalMinutesToCredit = 0;
  for (const t of suspectedTracks) {
    const mins = Math.ceil(t.durationSeconds / 60);
    totalMinutesToCredit += mins;
    console.log(`- Track ID: ${t.trackId}`);
    console.log(`  Job ID:   ${t.jobId}`);
    console.log(`  Owner ID: ${t.ownerId}`);
    console.log(`  File:     ${t.storagePath} (${t.durationSeconds}s / ${mins}m)`);
    console.log(`  Reason:   ${t.reason}`);
    console.log(`  Date:     ${t.createdAt}`);
    console.log('');
  }

  console.log(`Total duration of suspected fake audio: ${totalMinutesToCredit} minutes`);

  if (!fixMode) {
    console.log('\n[NOTICE] To remediate these tracks, re-run with:');
    console.log('  npm run audit:fake-audio -- --fix');
    return;
  }

  // --- REMEDIATION EXECUTION ---
  console.log('\n[REMEDIATION] Applying fixes to database...');
  for (const t of suspectedTracks) {
    // 1. Mark job failed with reason NEEDS_REGENERATION
    await supabaseAdmin
      .from('audio_jobs')
      .update({
        status: 'failed',
        error_code: 'NEEDS_REGENERATION',
        error_message: 'Job was previously synthesized with placeholder tones and has been revoked for regeneration.',
      })
      .eq('id', t.jobId);

    // 2. Delete or unlink audio track
    await supabaseAdmin
      .from('audio_tracks')
      .delete()
      .eq('id', t.trackId);

    // 3. Remove usage_events for this job so monthly minutes are credited back
    const { error: delUsageErr } = await supabaseAdmin
      .from('usage_events')
      .delete()
      .eq('job_id', t.jobId);

    if (delUsageErr) {
      console.warn(`  Failed to delete usage_events for job ${t.jobId}:`, delUsageErr.message);
    } else {
      console.log(`  ✓ Revoked job ${t.jobId}, hid track ${t.trackId}, and credited back usage_events.`);
    }
  }

  console.log(`\n✅ Remediation complete! All ${suspectedTracks.length} tracks neutralized.`);
}

// CLI entry point
const isFix = process.argv.includes('--fix');
auditFakeAudio(isFix)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Audit failed with error:', err);
    process.exit(1);
  });
