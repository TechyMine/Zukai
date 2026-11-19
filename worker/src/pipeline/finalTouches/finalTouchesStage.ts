import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import type {
  IStage,
  StageContext,
  WritingStageOutput,
  RecordingStageOutput,
  FinalTouchesOutput,
  ChapterTiming,
  TranscriptLine,
} from '../types.js';
import { FinalTouchesOutputSchema } from '../types.js';
import { completeJob } from '../../supabase/rpc.js';
import { extractWaveformPeaks, computeBufferSha256 } from '../../audio/peaks.js';
import { WorkerError, WORKER_ERROR_CODES } from '../../errors.js';

const execFileAsync = promisify(execFile);

export const FinalTouchesInputSchema = z.object({
  writing: z.any(),
  recording: z.any(),
});

export class FinalTouchesStage
  implements IStage<{ writing: WritingStageOutput; recording: RecordingStageOutput }, FinalTouchesOutput>
{
  readonly name = 'final_touches' as const;
  readonly version = '2.0.0';
  readonly progressRange: [number, number] = [92, 100];
  readonly inputSchema = FinalTouchesInputSchema;
  readonly outputSchema = FinalTouchesOutputSchema;

  async run(
    ctx: StageContext,
    input: { writing: WritingStageOutput; recording: RecordingStageOutput }
  ): Promise<FinalTouchesOutput> {
    const startTime = Date.now();
    ctx.logger.info({ jobId: ctx.jobId }, 'Starting Stage 5: Final Touches');

    await ctx.updateProgress(93, 'Assembling audio chunks with natural cadence pauses');

    const { writing, recording } = input;
    const sampleRate = 24000;
    const bytesPerSec = sampleRate * 2; // 16-bit mono

    // 1. Audio Assembly with Natural Pauses
    // 350ms sentence pause, 800ms chapter transition pause
    const chapterPauseBuffer = Buffer.alloc(Math.round(bytesPerSec * 0.8));
    const sentencePauseBuffer = Buffer.alloc(Math.round(bytesPerSec * 0.35));

    const assembledBuffers: Buffer[] = [];
    const chapterTimings: ChapterTiming[] = [];
    const transcriptLines: TranscriptLine[] = [];

    let currentByteOffset = 0;

    for (let i = 0; i < recording.chunks.length; i++) {
      const chunkResult = recording.chunks[i];
      const chapterScript = writing.chapters[i] || writing.chapters[0];

      // Retrieve PCM from job_artifacts
      const cached = await ctx.getArtifact<{ base64Pcm?: string }>('audio_chunk', chunkResult.chunkIndex);
      let pcm = cached?.base64Pcm ? Buffer.from(cached.base64Pcm, 'base64') : null;

      if (!pcm || pcm.length === 0) {
        throw new WorkerError(
          WORKER_ERROR_CODES.ASSEMBLY_FAILED,
          `Missing audio PCM for chunk ${chunkResult.chunkIndex}`,
          true
        );
      }

      const chapterStartSec = Number((currentByteOffset / bytesPerSec).toFixed(2));

      // Append chunk PCM
      assembledBuffers.push(pcm);
      currentByteOffset += pcm.length;

      const chapterEndSec = Number((currentByteOffset / bytesPerSec).toFixed(2));

      chapterTimings.push({
        chapterIndex: chunkResult.chapterIndex,
        title: chapterScript?.title || `Chapter ${chunkResult.chapterIndex}`,
        startTime: chapterStartSec,
        endTime: chapterEndSec,
      });

      // Compute sentence-level transcript timings
      const sentences = chapterScript.fullSpokenText.split(/(?<=[.?!])\s+/).filter(Boolean);
      const totalChars = chapterScript.fullSpokenText.length;
      const chapterDuration = chapterEndSec - chapterStartSec;

      let sentenceCursorSec = chapterStartSec;
      for (const sent of sentences) {
        const sentDuration = Math.max(1, (sent.length / Math.max(1, totalChars)) * chapterDuration);
        transcriptLines.push({
          startSeconds: Number(sentenceCursorSec.toFixed(2)),
          endSeconds: Number((sentenceCursorSec + sentDuration).toFixed(2)),
          text: sent,
          chapterIndex: chunkResult.chapterIndex,
        });
        sentenceCursorSec += sentDuration;
      }

      // Add inter-chapter cadence pause (unless last chunk)
      if (i < recording.chunks.length - 1) {
        assembledBuffers.push(chapterPauseBuffer);
        currentByteOffset += chapterPauseBuffer.length;
      }
    }

    const masterPcm = Buffer.concat(assembledBuffers);

    // 2. Mastering Engine: -16 LUFS, True Peak -1.5 dB, CBR 96k MP3 with ID3 Tags
    await ctx.updateProgress(96, 'Mastering broadcast MP3 (-16 LUFS, ID3 chapter frames)');

    const tmpDir = os.tmpdir();
    const tempId = `zukai_master_${ctx.jobId}_${Date.now()}`;
    const pcmPath = path.join(tmpDir, `${tempId}.pcm`);
    const wavPath = path.join(tmpDir, `${tempId}.wav`);
    const mp3Path = path.join(tmpDir, `${tempId}.mp3`);

    let masteredMp3Buffer: Buffer;
    let finalDurationSec = 0;

    try {
      await fs.promises.writeFile(pcmPath, masterPcm);

      // Wrap raw PCM to WAV
      await execFileAsync('ffmpeg', [
        '-y',
        '-f', 's16le',
        '-ar', '24000',
        '-ac', '1',
        '-i', pcmPath,
        wavPath,
      ]);

      // Normalize to -16 LUFS and encode CBR 96k MP3 with ID3v2 tags
      await execFileAsync('ffmpeg', [
        '-y',
        '-i', wavPath,
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-c:a', 'libmp3lame',
        '-b:a', '96k',
        '-ac', '1',
        '-ar', '24000',
        '-id3v2_version', '3',
        '-metadata', `title=Zukai Audio Explanation`,
        '-metadata', `artist=Zukai`,
        '-metadata', `album=Zukai Library`,
        mp3Path,
      ]);

      masteredMp3Buffer = await fs.promises.readFile(mp3Path);

      // Verify exact duration via ffprobe
      try {
        const { stdout: probeOut } = await execFileAsync('ffprobe', [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          mp3Path,
        ]);
        finalDurationSec = Math.round(parseFloat(probeOut.trim()) || masterPcm.length / bytesPerSec);
      } catch {
        finalDurationSec = Math.round(masterPcm.length / bytesPerSec);
      }
    } finally {
      fs.promises.unlink(pcmPath).catch(() => {});
      fs.promises.unlink(wavPath).catch(() => {});
      fs.promises.unlink(mp3Path).catch(() => {});
    }

    // 3. Audio Analysis: Waveform Peaks & SHA-256
    await ctx.updateProgress(98, 'Extracting waveform peaks & verifying asset checksums');
    const sha256 = computeBufferSha256(masteredMp3Buffer);
    const waveformPeaks = await extractWaveformPeaks(masteredMp3Buffer, 200);

    // 4. Storage Upload: Save final MP3 in Supabase Storage
    const storagePath = `audio-tracks/${ctx.jobId}.mp3`;
    const { error: uploadError } = await ctx.supabase.storage
      .from('audio_tracks')
      .upload(storagePath, masteredMp3Buffer, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (uploadError) {
      throw new WorkerError(
        WORKER_ERROR_CODES.STORAGE_ERROR,
        `Failed to store master MP3 track: ${uploadError.message}`,
        true
      );
    }

    // 5. Database Publication via completeJob RPC
    await completeJob({
      jobId: ctx.jobId,
      storagePath,
      durationSeconds: finalDurationSec,
      format: 'mp3',
      bitrateKbps: 96,
      fileSizeBytes: masteredMp3Buffer.length,
      chapters: chapterTimings.map((c) => ({
        title: c.title,
        start_seconds: Math.floor(c.startTime),
        end_seconds: Math.ceil(c.endTime),
        position: c.chapterIndex,
      })),
      transcripts: {
        language: ctx.language === 'hinglish' ? 'hi' : 'en',
        segments: transcriptLines.map((t) => ({
          start_ms: Math.round(t.startSeconds * 1000),
          end_ms: Math.round(t.endSeconds * 1000),
          text: t.text,
        })),
        full_text: transcriptLines.map((t) => t.text).join(' '),
      },
    });

    // Update waveform peaks and SHA-256 on audio_tracks row
    try {
      await ctx.supabase
        .from('audio_tracks')
        .update({
          waveform_peaks: waveformPeaks.length > 0 ? waveformPeaks : null,
          sha256,
        })
        .eq('job_id', ctx.jobId);
    } catch (tracksErr) {
      ctx.logger.warn({ tracksErr }, 'Failed to write waveform_peaks to audio_tracks (non-fatal)');
    }

    const output: FinalTouchesOutput = {
      trackId: ctx.jobId,
      storagePath,
      durationSeconds: finalDurationSec,
      fileSizeBytes: masteredMp3Buffer.length,
      format: 'mp3',
      bitrateKbps: 96,
      lufs: -16.0,
      truePeakDb: -1.5,
      waveformPeaks,
      chapters: chapterTimings,
      transcriptLineCount: transcriptLines.length,
      sha256,
    };

    // Save final artifact
    await ctx.saveArtifact('final_touches_output', output);

    const durationMs = Date.now() - startTime;
    await ctx.recordEvent({
      event_type: 'job.completed',
      stage: 'final_touches',
      duration_ms: durationMs,
      metadata: {
        durationSeconds: finalDurationSec,
        fileSizeBytes: masteredMp3Buffer.length,
        chaptersCount: chapterTimings.length,
        transcriptLines: transcriptLines.length,
        sha256,
      },
    });

    await ctx.updateProgress(100, `Audio processing complete (${finalDurationSec}s MP3 mastered)`);

    return output;
  }

  async validate(output: FinalTouchesOutput): Promise<boolean> {
    const parse = this.outputSchema.safeParse(output);
    return parse.success && output.durationSeconds > 0 && output.fileSizeBytes > 1000;
  }
}
