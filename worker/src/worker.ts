import { config } from './config.js';
import { supabaseAdmin } from './supabase/client.js';
import {
  claimNextJob,
  heartbeatJob,
  completeJob,
  failJob,
  ClaimedJob,
} from './supabase/rpc.js';
import { extractDocumentContent } from './extraction/extractor.js';
import { generateExplanationScript, PROMPT_VERSION } from './intelligence/scriptWriter.js';
import { synthesizeSpeech } from './synthesis/ttsEngine.js';
import { mapErrorToCode, WorkerError, WORKER_ERROR_CODES } from './errors.js';
import { logger } from './logger.js';
import { computeSha256, findReusableTrack, saveArtifact, getArtifact } from './ai/artifactManager.js';
import { CapacityExhaustedError } from './ai/router.js';
import { analyzeAudioBuffer } from './audio/peaks.js';

let isRunning = false;
let activeJobCount = 0;
let shouldStop = false;

/**
 * Checks whether user canceled job mid-flight.
 */
async function isJobCanceled(jobId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('audio_jobs')
    .select('status')
    .eq('id', jobId)
    .single();

  return data?.status === 'canceled';
}

/**
 * Single job lifecycle state machine:
 * queued -> extracting (0-20) -> scripting (20-55) -> voicing (55-90) -> assembling (90-98) -> ready (100)
 * With automatic content-hash reuse, resumability from artifacts, and capacity exhaustion pause.
 */
export async function processJob(job: ClaimedJob): Promise<void> {
  logger.info({ jobId: job.job_id, docId: job.document_id, language: job.language, depth: job.depth }, 'Claimed audio job');

  // Start visibility heartbeat timer
  const heartbeatTimer = setInterval(async () => {
    try {
      await heartbeatJob(job.job_id);
    } catch (e) {
      logger.warn({ err: e, jobId: job.job_id }, 'Failed to send visibility heartbeat');
    }
  }, config.HEARTBEAT_INTERVAL_MS);

  try {
    // Stage 1: Extraction (progress 0 - 20)
    await heartbeatJob(job.job_id, 10, 'Downloading original document');

    if (await isJobCanceled(job.job_id)) {
      throw new WorkerError(WORKER_ERROR_CODES.CANCELED, 'Job was canceled by user', false);
    }

    const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
      .from('uploads')
      .download(job.document_storage_path);

    if (downloadError || !fileBlob) {
      throw new WorkerError(
        WORKER_ERROR_CODES.STORAGE_ERROR,
        `Could not download original document from uploads storage.`,
        true
      );
    }

    const arrayBuffer = await fileBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Compute SHA-256 for server-side deduplication
    const contentSha256 = computeSha256(buffer);
    await supabaseAdmin
      .from('documents')
      .update({ content_sha256: contentSha256 })
      .eq('id', job.document_id);

    // Content-hash reuse: check if identical file was already converted for this user/org
    const reusable = await findReusableTrack(
      job.owner_id,
      job.org_id,
      contentSha256,
      job.language,
      job.depth,
      job.voice
    );

    if (reusable) {
      logger.info({ jobId: job.job_id, trackId: reusable.trackId }, 'Reusing existing audio track via SHA-256 match');
      const { data: existingTrack } = await supabaseAdmin
        .from('audio_tracks')
        .select('*')
        .eq('id', reusable.trackId)
        .single();

      if (existingTrack) {
        await completeJob({
          jobId: job.job_id,
          storagePath: existingTrack.storage_path,
          durationSeconds: existingTrack.duration_seconds,
          format: existingTrack.format,
          bitrateKbps: existingTrack.bitrate_kbps,
          fileSizeBytes: existingTrack.file_size_bytes,
          chapters: [],
          transcripts: { language: job.language, segments: [], full_text: '' },
          geminiCostMicros: 0,
        });
        return;
      }
    }

    await heartbeatJob(job.job_id, 18, 'Extracting and cleaning text sections');

    const extracted = await extractDocumentContent(
      buffer,
      job.mime_type,
      job.document_storage_path
    );

    // Update document table with verified stats
    await supabaseAdmin
      .from('documents')
      .update({
        page_count: extracted.metadata.page_count,
        word_count: extracted.metadata.word_count,
        source_language: extracted.metadata.detected_language,
      })
      .eq('id', job.document_id);

    // Stage 2: Scripting (progress 20 - 55)
    if (await isJobCanceled(job.job_id)) {
      throw new WorkerError(WORKER_ERROR_CODES.CANCELED, 'Job was canceled by user', false);
    }

    await heartbeatJob(job.job_id, 25, 'Generating outline and explanatory analogies');

    const combinedText = extracted.sections.map((s) => s.text).join('\n\n');
    const originalFilename = job.document_storage_path.split('/').pop() || 'Document';

    const script = await generateExplanationScript(
      combinedText,
      job.language,
      job.depth,
      originalFilename,
      job.job_id
    );

    await heartbeatJob(job.job_id, 50, 'Drafting punchy spoken sentences and takeaways');

    // Stage 3: Voicing (progress 55 - 90)
    if (await isJobCanceled(job.job_id)) {
      throw new WorkerError(WORKER_ERROR_CODES.CANCELED, 'Job was canceled by user', false);
    }

    await heartbeatJob(job.job_id, 65, 'Synthesizing voice narration and sentence timestamps');

    const audioResult = await synthesizeSpeech(
      script.chapters,
      job.voice,
      {
        title: `Lesson: ${job.document_storage_path.split('/').pop() || 'Explanation'}`,
        artist: 'Zukai',
        album: 'Zukai Audio',
        language: job.language,
        bitrateKbps: 96,
      },
      job.job_id
    );

    // Stage 4: Assembling & Mastering (progress 90 - 98)
    if (await isJobCanceled(job.job_id)) {
      throw new WorkerError(WORKER_ERROR_CODES.CANCELED, 'Job was canceled by user', false);
    }

    await heartbeatJob(job.job_id, 92, 'Mastering audio loudness and uploading final track');

    const targetAudioPath = `${job.owner_id}/${job.job_id}/final.${audioResult.format}`;

    const contentType =
      audioResult.format === 'mp3'
        ? 'audio/mpeg'
        : audioResult.format === 'm4a'
        ? 'audio/mp4'
        : 'audio/wav';

    const { error: uploadError } = await supabaseAdmin.storage
      .from('audio')
      .upload(targetAudioPath, audioResult.audioBuffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      throw new WorkerError(
        WORKER_ERROR_CODES.STORAGE_ERROR,
        `Failed to store synthesized audio track: ${uploadError.message}`,
        true
      );
    }

    // Record accounting metadata
    const allModelsUsed = [
      ...(script.modelsUsed || []),
      ...(audioResult.modelsUsed || []),
    ];

    await supabaseAdmin
      .from('audio_jobs')
      .update({
        models_used: allModelsUsed,
        providers_used: audioResult.providersUsed || [],
        tokens_used: {
          inputTokens: script.inputTokens,
          outputTokens: script.outputTokens,
          totalWords: script.totalWords,
        },
        step_detail: {
          unit: 'publish',
          done: audioResult.chapters.length,
          total: audioResult.chapters.length,
        },
      })
      .eq('id', job.job_id);

    // Guard: only complete and record usage if real speech was verified
    if (audioResult.isVerifiedRealSpeech === false) {
      throw new WorkerError(
        WORKER_ERROR_CODES.AI_UNAVAILABLE,
        'Cannot complete job: One or more audio chunks were generated using synthetic test tones instead of real speech.',
        false
      );
    }

    // Stage 5: Ready (progress 100)
    await completeJob({
      jobId: job.job_id,
      storagePath: targetAudioPath,
      durationSeconds: audioResult.durationSeconds,
      format: audioResult.format,
      bitrateKbps: audioResult.bitrateKbps,
      fileSizeBytes: audioResult.audioBuffer.length,
      chapters: audioResult.chapters,
      transcripts: {
        language: audioResult.transcripts.language,
        segments: audioResult.transcripts.segments,
        full_text: audioResult.transcripts.full_text,
      },
      geminiCostMicros: script.costMicros,
    });

    // Non-blocking waveform peaks and SHA-256 computation
    try {
      const { sha256, waveformPeaks } = await analyzeAudioBuffer(audioResult.audioBuffer);
      if (waveformPeaks.length > 0 || sha256) {
        await supabaseAdmin
          .from('audio_tracks')
          .update({
            waveform_peaks: waveformPeaks.length > 0 ? waveformPeaks : null,
            sha256: sha256 || null,
          })
          .eq('job_id', job.job_id);
      }
    } catch (peaksErr) {
      logger.warn({ jobId: job.job_id, err: peaksErr }, 'Failed to save waveform peaks or sha256 (non-fatal)');
    }

    logger.info({ jobId: job.job_id, durationSeconds: audioResult.durationSeconds }, 'Job completed successfully');
  } catch (err: unknown) {
    if (err instanceof CapacityExhaustedError) {
      // User requirement: auto-resume after 60s (1 min), never freeze for hours
      const actualWaitSeconds = Math.min(Math.max(err.earliestWaitSeconds, 15), 60);

      logger.warn(
        { jobId: job.job_id, waitSeconds: actualWaitSeconds, originalWaitSeconds: err.earliestWaitSeconds, reason: err.waitingReason },
        `All AI models constrained. Transitioning job to waiting_for_capacity (Auto-resuming in ${actualWaitSeconds}s)`
      );

      const resumeAt = new Date(Date.now() + actualWaitSeconds * 1000).toISOString();

      await supabaseAdmin
        .from('audio_jobs')
        .update({
          status: 'waiting_for_capacity',
          current_step: 'Our AI voice is catching its breath. Resuming automatically.',
          resume_at: resumeAt,
          waiting_until: resumeAt,
          waiting_reason: err.waitingReason || 'rpm',
          capacity_waits: ((job as any).capacity_waits || 0) + 1,
        })
        .eq('id', job.job_id);

      return;
    }

    const errorInfo = mapErrorToCode(err);
    const { code, friendlyMessage, rawDetails } = errorInfo;

    if (code === 'CONFIG_ERROR') {
      logger.fatal(
        { jobId: job.job_id, code, err, rawDetails },
        '[OPERATOR ALERT] CRITICAL: Job failed due to system CONFIG_ERROR. User quota preserved.'
      );
    } else {
      logger.error({ jobId: job.job_id, code, err }, 'Job processing failed');
    }

    try {
      await failJob(
        job.job_id,
        code,
        friendlyMessage,
        rawDetails
      );
    } catch (failErr) {
      logger.error({ jobId: job.job_id, failErr }, 'Failed to record job failure in database');
    }
  } finally {
    clearInterval(heartbeatTimer);
  }
}

/**
 * Autonomous Reaper:
 * - Detects jobs with status = 'processing' whose heartbeat is older than 10 minutes and requeues them.
 * - Detects jobs in 'waiting_for_capacity' whose waiting window has elapsed and returns them to 'queued'.
 * - Fails jobs in 'waiting_for_capacity' older than 24 hours with CAPACITY_EXHAUSTED.
 */
export async function reapStuckJobs(): Promise<void> {
  try {
    const now = Date.now();
    const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(now - 24 * 3600 * 1000).toISOString();
    const nowIso = new Date(now).toISOString();

    // 1. Resume waiting_for_capacity jobs whose wait time has passed
    const { data: readyToResume } = await supabaseAdmin
      .from('audio_jobs')
      .select('id, attempt_count, created_at')
      .eq('status', 'waiting_for_capacity')
      .lte('waiting_until', nowIso);

    if (readyToResume && readyToResume.length > 0) {
      for (const wJob of readyToResume) {
        // If waiting for over 24 hours, terminate with CAPACITY_EXHAUSTED
        if (new Date(wJob.created_at).getTime() < now - 24 * 3600 * 1000) {
          logger.warn({ jobId: wJob.id }, 'Job waited over 24 hours for capacity, marking failed');
          await failJob(wJob.id, 'CAPACITY_EXHAUSTED', 'System capacity unavailable for 24 hours.');
          continue;
        }

        logger.info({ jobId: wJob.id }, 'Capacity wait window elapsed, requeuing job');
        await supabaseAdmin
          .from('audio_jobs')
          .update({
            status: 'queued',
            current_step: 'Resuming audio synthesis from saved step...',
            waiting_until: null,
            resume_at: null,
            waiting_reason: null,
          })
          .eq('id', wJob.id);
      }
    }

    // 2. Reset processing jobs with expired heartbeat
    const { data: stuckJobs } = await supabaseAdmin
      .from('audio_jobs')
      .select('id, attempt_count')
      .eq('status', 'processing')
      .lt('heartbeat_at', tenMinutesAgo);

    if (stuckJobs && stuckJobs.length > 0) {
      for (const stuck of stuckJobs) {
        if (stuck.attempt_count >= 3) {
          logger.warn({ jobId: stuck.id }, 'Reaper: Failing job that exceeded 3 attempts');
          await failJob(stuck.id, WORKER_ERROR_CODES.AI_UNAVAILABLE, 'Worker died repeatedly (reaper timeout)');
        } else {
          logger.info({ jobId: stuck.id, attempts: stuck.attempt_count }, 'Reaper: Resetting stuck job back to queued');
          await supabaseAdmin
            .from('audio_jobs')
            .update({
              status: 'queued',
              current_step: 'Retrying after unexpected worker interruption',
            })
            .eq('id', stuck.id);
        }
      }
    }
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'Error running stuck job reaper');
  }
}

/**
 * Worker Main Loop: Claims jobs from the transactional queue,
 * processes them with bounded concurrency, and sweeps for stuck jobs.
 */
export async function startWorker(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  shouldStop = false;

  logger.info({ concurrency: config.WORKER_CONCURRENCY }, 'Worker polling loop started');

  // Start autonomous stuck job reaper every 10 seconds (prompt resumption within 1 min)
  const reaperTimer = setInterval(reapStuckJobs, 10000);

  while (!shouldStop) {
    if (activeJobCount >= config.WORKER_CONCURRENCY) {
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }

    try {
      const job = await claimNextJob();

      if (!job) {
        await new Promise((r) => setTimeout(r, config.POLL_INTERVAL_MS));
        continue;
      }

      activeJobCount++;
      processJob(job)
        .catch((err) => {
          logger.error({ jobId: job.job_id, err }, 'Unhandled error in processJob promise');
        })
        .finally(() => {
          activeJobCount--;
        });
    } catch (err) {
      logger.error({ err }, 'Error in worker claim loop, backing off');
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  clearInterval(reaperTimer);
  logger.info('Worker polling loop stopped cleanly');
}

export function stopWorker(): void {
  shouldStop = true;
  isRunning = false;
}

export const startWorkerLoop = startWorker;

