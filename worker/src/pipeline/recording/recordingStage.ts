import crypto from 'node:crypto';
import { z } from 'zod';
import type {
  IStage,
  StageContext,
  WritingStageOutput,
  RecordingStageOutput,
  AudioChunkResult,
} from '../types.js';
import { RecordingStageOutputSchema, AudioChunkResultSchema } from '../types.js';
import { executeWithFallback } from '../../ai/router.js';
import { callGeminiTts, mapToGeminiVoice } from '../../synthesis/ttsEngine.js';
import { callGeminiLiveAudio } from '../../ai/liveAudioProvider.js';
import { prepareTextForTts } from '../../synthesis/ttsNormalizer.js';
import { verifyAudioBuffer } from './speechVerifier.js';
import { WorkerError, WORKER_ERROR_CODES } from '../../errors.js';

export const RecordingStageInputSchema = z.object({
  chapters: z.array(z.any()).min(1),
  totalWords: z.number(),
  overallHook: z.string(),
  overallRecap: z.string(),
});

export class RecordingStage implements IStage<WritingStageOutput, RecordingStageOutput> {
  readonly name = 'recording' as const;
  readonly version = '2.0.0';
  readonly progressRange: [number, number] = [65, 92];
  readonly inputSchema = RecordingStageInputSchema;
  readonly outputSchema = RecordingStageOutputSchema;

  async run(ctx: StageContext, input: WritingStageOutput): Promise<RecordingStageOutput> {
    const startTime = Date.now();
    ctx.logger.info({ jobId: ctx.jobId }, 'Starting Stage 4: Recording');

    const geminiVoice = mapToGeminiVoice(ctx.voiceId || 'alloy');
    const audioResults: AudioChunkResult[] = [];
    let totalDurationSeconds = 0;

    // Plan audio chunks per chapter
    const totalChapters = input.chapters.length;

    for (let cIdx = 0; cIdx < totalChapters; cIdx++) {
      if (await ctx.isCancelled()) throw new Error('JOB_CANCELLED');

      const chapter = input.chapters[cIdx];
      const chunkIndex = cIdx + 1;

      // Sub-progress mapping in 65-92% range
      const progress = Math.round(65 + ((cIdx + 0.5) / totalChapters) * 27);
      await ctx.updateProgress(progress, `Synthesizing audio segment ${chunkIndex} of ${totalChapters}: "${chapter.title}"`);

      // 1. Resumability check from job_artifacts
      const cached = await ctx.getArtifact<{
        base64Pcm?: string;
        meta?: AudioChunkResult;
      }>('audio_chunk', chunkIndex);

      if (cached && cached.base64Pcm && cached.meta) {
        ctx.logger.info({ jobId: ctx.jobId, chunkIndex }, 'Resumed audio segment from cached artifact');
        audioResults.push(cached.meta);
        totalDurationSeconds += cached.meta.durationSeconds;
        continue;
      }

      // 2. Prepare speech text (numbers, currencies, acronyms normalized for voice engine)
      const spokenText = chapter.fullSpokenText;
      const ttsText = prepareTextForTts(spokenText, ctx.language === 'hinglish' ? 'hinglish' : 'english');

      // 3. Multi-Model Voice Synthesis with automatic fallback
      let pcmBuffer: Buffer | null = null;
      let usedModel = 'unknown';
      let usedProvider = 'unknown';

      const { result, modelId } = await executeWithFallback('voice', async (model) => {
        if (model.kind === 'live-audio') {
          const liveRes = await callGeminiLiveAudio(model.id, ttsText, geminiVoice);
          return {
            result: { pcm: liveRes.pcmBuffer, provider: 'gemini-live' },
            tokensUsed: Math.round(ttsText.length / 4),
          };
        } else {
          // Direct Gemini TTS model
          const pcm = await callGeminiTts(ttsText, geminiVoice);
          return {
            result: { pcm, provider: 'gemini-tts' },
            tokensUsed: Math.round(ttsText.length / 4),
          };
        }
      });

      pcmBuffer = result.pcm;
      usedModel = modelId;
      usedProvider = result.provider;

      // 4. Acoustic and Verbatim Verification
      const verification = verifyAudioBuffer(pcmBuffer, 24000, ttsText.length);
      if (!verification.passed) {
        ctx.logger.warn({ chunkIndex, reasons: verification.reasons }, 'Synthesized chunk failed audio verification');
        throw new WorkerError(
          WORKER_ERROR_CODES.TTS_FAILED,
          `Audio verification failed for chapter ${chunkIndex}: ${verification.reasons.join('; ')}`,
          true
        );
      }

      const sha256 = crypto.createHash('sha256').update(pcmBuffer).digest('hex');

      const chunkResult: AudioChunkResult = {
        chunkIndex,
        chapterIndex: chapter.chapterIndex,
        text: spokenText,
        ttsText,
        provider: usedProvider,
        model: usedModel,
        durationSeconds: verification.durationSeconds,
        sampleRate: 24000,
        channels: 1,
        storagePath: `audio_chunks/${ctx.jobId}_chunk_${chunkIndex}.pcm`,
        sha256,
        werScore: verification.werScore,
        isRealSpeech: true,
      };

      // 5. Persist Audio Unit Artifact
      await ctx.saveArtifact(
        'audio_chunk',
        {
          base64Pcm: pcmBuffer.toString('base64'),
          meta: chunkResult,
        },
        chunkIndex,
        { durationSeconds: verification.durationSeconds, model: usedModel }
      );

      audioResults.push(chunkResult);
      totalDurationSeconds += verification.durationSeconds;
    }

    const output: RecordingStageOutput = {
      chunks: audioResults,
      totalDurationSeconds: Number(totalDurationSeconds.toFixed(2)),
      allRealSpeech: true,
    };

    // Save stage output artifact
    await ctx.saveArtifact('recording_output', output);

    const durationMs = Date.now() - startTime;
    await ctx.recordEvent({
      event_type: 'stage.completed',
      stage: 'recording',
      duration_ms: durationMs,
      metadata: {
        totalChunks: audioResults.length,
        totalDurationSeconds,
        providers: [...new Set(audioResults.map((a) => a.provider))],
        models: [...new Set(audioResults.map((a) => a.model))],
      },
    });

    await ctx.updateProgress(92, `Recording complete: ${audioResults.length} audio segments synthesized (${totalDurationSeconds}s speech)`);

    return output;
  }

  async validate(output: RecordingStageOutput): Promise<boolean> {
    const parse = this.outputSchema.safeParse(output);
    return parse.success && output.chunks.length > 0 && output.allRealSpeech;
  }
}
