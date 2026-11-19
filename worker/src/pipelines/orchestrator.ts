import type { SupabaseClient } from '@supabase/supabase-js';
import type { Logger } from 'pino';
import { pipelineRegistry } from './registry.js';
import type { StageContext, JobEventRecord, PipelineStageName } from './types.js';
import { failJob } from '../supabase/rpc.js';
import { mapErrorToCode, WorkerError, WORKER_ERROR_CODES } from '../errors.js';
import { CapacityExhaustedError } from '../ai/router.js';

export interface OrchestratorRunOptions {
  jobId: string;
  documentId: string;
  ownerId: string;
  orgId?: string;
  documentBuffer: Buffer;
  language: 'en' | 'hi' | 'hinglish';
  depth: 'quick' | 'standard' | 'deep';
  voiceId: string;
  pipelineVersion?: string;
  promptVersion?: string;
  supabase: SupabaseClient;
  logger: Logger;
  fromStage?: PipelineStageName;
}

export class DurableOrchestrator {
  /**
   * Executes the 5-stage sequential pipeline with durable Postgres state.
   */
  public static async executeJob(options: OrchestratorRunOptions): Promise<void> {
    const {
      jobId,
      documentId,
      ownerId,
      orgId,
      documentBuffer,
      language,
      depth,
      voiceId,
      pipelineVersion = 'v2',
      promptVersion = 'v2.0-agentic-rag',
      supabase,
      logger,
      fromStage,
    } = options;

    const pipeline = pipelineRegistry.get('standard-audio', pipelineVersion);
    if (!pipeline) {
      throw new Error(`Pipeline standard-audio:${pipelineVersion} not found in registry`);
    }

    const abortController = new AbortController();

    // Construct StageContext
    const ctx: StageContext = {
      jobId,
      documentId,
      ownerId,
      orgId,
      language,
      depth,
      voiceId,
      pipelineVersion,
      promptVersion,
      signal: abortController.signal,
      supabase,
      logger,

      updateProgress: async (percent: number, stepDetail?: string) => {
        logger.info({ jobId, percent, stepDetail }, 'Pipeline progress update');
        try {
          await supabase
            .from('audio_jobs')
            .update({
              progress: percent,
              current_step: stepDetail || 'Processing',
              updated_at: new Date().toISOString(),
            })
            .eq('id', jobId);
        } catch (upErr) {
          logger.warn({ jobId, upErr }, 'Failed to update job progress in DB');
        }
      },

      recordEvent: async (event: JobEventRecord) => {
        try {
          await supabase.from('job_events').insert({
            job_id: jobId,
            event_type: event.event_type,
            stage: event.stage || null,
            unit: event.unit || null,
            error_code: event.error_code || null,
            error_details: event.error_details || {},
            model: event.model || null,
            tokens_in: event.tokens_in || null,
            tokens_out: event.tokens_out || null,
            cost_usd: event.cost_usd || null,
            duration_ms: event.duration_ms || null,
            metadata: event.metadata || {},
          });
        } catch (evtErr) {
          logger.warn({ jobId, evtErr }, 'Failed to insert job_event record (non-fatal)');
        }
      },

      getArtifact: async <T>(step: string, chunkIndex: number = 0): Promise<T | null> => {
        try {
          const { data } = await supabase
            .from('job_artifacts')
            .select('payload')
            .eq('job_id', jobId)
            .eq('step', step)
            .eq('chunk_index', chunkIndex)
            .single();

          if (data && data.payload) {
            return data.payload as T;
          }
        } catch {
          // No artifact found or error
        }
        return null;
      },

      saveArtifact: async <T>(
        step: string,
        payload: T,
        chunkIndex: number = 0,
        meta: Record<string, unknown> = {},
        storagePath?: string
      ): Promise<void> => {
        try {
          await supabase.from('job_artifacts').upsert(
            {
              job_id: jobId,
              step,
              chunk_index: chunkIndex,
              artifact_type: typeof payload === 'object' ? 'json' : 'text',
              payload: payload as any,
              storage_path: storagePath || null,
              meta: meta || {},
            },
            { onConflict: 'job_id,step,chunk_index' }
          );
        } catch (saveErr) {
          logger.warn({ jobId, step, chunkIndex, saveErr }, 'Failed to save job artifact');
        }
      },

      isCancelled: async (): Promise<boolean> => {
        try {
          const { data } = await supabase
            .from('audio_jobs')
            .select('status')
            .eq('id', jobId)
            .single();
          return data?.status === 'canceled' || data?.status === 'failed';
        } catch {
          return false;
        }
      },
    };

    // Determine starting stage index (if resuming or replaying from stage)
    const stageNames: PipelineStageName[] = [
      'reading',
      'understanding',
      'writing',
      'recording',
      'final_touches',
    ];

    let startIdx = 0;
    if (fromStage) {
      const foundIdx = stageNames.indexOf(fromStage);
      if (foundIdx !== -1) startIdx = foundIdx;
    }

    let readingOutput: any = null;
    let understandingOutput: any = null;
    let writingOutput: any = null;
    let recordingOutput: any = null;

    // Load persisted outputs for earlier stages if starting past stage 0
    if (startIdx > 0) {
      readingOutput = await ctx.getArtifact('reading_output') || {
        report: await ctx.getArtifact('reading_report'),
        sections: await ctx.getArtifact('reading_sections') || [],
        chunks: await ctx.getArtifact('reading_chunks') || [],
      };
    }
    if (startIdx > 1) {
      understandingOutput = await ctx.getArtifact('understanding_output') || {
        brief: await ctx.getArtifact('document_brief'),
      };
    }
    if (startIdx > 2) {
      writingOutput = await ctx.getArtifact('writing_output');
    }
    if (startIdx > 3) {
      recordingOutput = await ctx.getArtifact('recording_output');
    }

    let currentExecutingStage: PipelineStageName = stageNames[startIdx];

    try {
      // 1. Stage 1: READING (0 - 15%)
      if (startIdx <= 0) {
        currentExecutingStage = 'reading';
        await ctx.recordEvent({ event_type: 'stage.started', stage: 'reading' });
        const readingStage = pipeline.stages[0];
        readingOutput = await readingStage.run(ctx, documentBuffer);
        await ctx.saveArtifact('reading_output', readingOutput);
      }

      // 2. Stage 2: UNDERSTANDING (15 - 30%)
      if (startIdx <= 1) {
        currentExecutingStage = 'understanding';
        await ctx.recordEvent({ event_type: 'stage.started', stage: 'understanding' });
        const understandingStage = pipeline.stages[1];
        understandingOutput = await understandingStage.run(ctx, readingOutput);
        await ctx.saveArtifact('understanding_output', understandingOutput);
      }

      // 3. Stage 3: WRITING (30 - 65%)
      if (startIdx <= 2) {
        currentExecutingStage = 'writing';
        await ctx.recordEvent({ event_type: 'stage.started', stage: 'writing' });
        const writingStage = pipeline.stages[2];
        writingOutput = await writingStage.run(ctx, {
          reading: readingOutput,
          understanding: understandingOutput,
        });
        await ctx.saveArtifact('writing_output', writingOutput);
      }

      // 4. Stage 4: RECORDING (65 - 92%)
      if (startIdx <= 3) {
        currentExecutingStage = 'recording';
        await ctx.recordEvent({ event_type: 'stage.started', stage: 'recording' });
        const recordingStage = pipeline.stages[3];
        recordingOutput = await recordingStage.run(ctx, writingOutput);
        await ctx.saveArtifact('recording_output', recordingOutput);
      }

      // 5. Stage 5: FINAL TOUCHES (92 - 100%)
      if (startIdx <= 4) {
        currentExecutingStage = 'final_touches';
        await ctx.recordEvent({ event_type: 'stage.started', stage: 'final_touches' });
        const finalTouchesStage = pipeline.stages[4];
        await finalTouchesStage.run(ctx, {
          writing: writingOutput,
          recording: recordingOutput,
        });
      }

      logger.info({ jobId }, 'Pipeline V2 completed all 5 stages successfully');
    } catch (err: unknown) {
      if (err instanceof CapacityExhaustedError) {
        // Paused for capacity - let worker handle pause/auto-resume without setting failed_stage
        throw err;
      }

      const errorInfo = mapErrorToCode(err);
      logger.error(
        { jobId, stage: currentExecutingStage, code: errorInfo.code, err },
        'Pipeline execution failed at stage'
      );

      // Record failure with failed_stage
      try {
        await failJob(
          jobId,
          errorInfo.code,
          errorInfo.friendlyMessage,
          errorInfo.rawDetails,
          currentExecutingStage
        );
      } catch (failErr) {
        logger.error({ jobId, failErr }, 'Failed to record failed_job in DB');
      }

      throw err;
    }
  }
}
