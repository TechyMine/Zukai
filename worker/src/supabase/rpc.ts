import { supabaseAdmin } from './client.js';
import { ProviderChunkInfo } from '../synthesis/ttsEngine.js';

export interface ClaimedJob {
  job_id: string;
  document_id: string;
  owner_id: string;
  org_id: string | null;
  language: 'english' | 'hinglish';
  depth: 'quick' | 'standard' | 'deep';
  voice: string;
  attempt_count: number;
  document_storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  /**
   * Resumable state: e.g. { unit: 'voice', done: 4, total: 11 }
   */
  step_detail?: Record<string, unknown> | null;
  /**
   * Number of times this job has paused for capacity.
   */
  capacity_waits?: number;
  /**
   * ISO timestamp after which a waiting_for_capacity job may be re-claimed.
   */
  resume_at?: string | null;
}

export interface ChapterInput {
  title: string;
  start_seconds: number;
  end_seconds: number;
  position: number;
  summary?: string;
}

export interface TranscriptSentence {
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface CompleteJobParams {
  jobId: string;
  storagePath: string;
  durationSeconds: number;
  format: string;
  bitrateKbps: number;
  fileSizeBytes: number;
  chapters: ChapterInput[];
  transcripts: {
    raw_text?: string;
    full_text?: string;
    segments: TranscriptSentence[];
    language?: string;
  };
  inputTokens?: number;
  outputTokens?: number;
  ttsCharacters?: number;
  costMicros?: number;
  geminiCostMicros?: number;
}

export async function claimNextJob(vtSeconds = 600): Promise<ClaimedJob | null> {
  const { data, error } = await supabaseAdmin.rpc('claim_next_job', {
    p_vt_seconds: vtSeconds,
  });

  if (error) {
    throw new Error(`claimNextJob RPC error: ${error.message} (${error.code})`);
  }

  return (data as ClaimedJob) ?? null;
}

export async function heartbeatJob(
  jobId: string,
  progress?: number,
  currentStep?: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('heartbeat_job', {
    p_job_id: jobId,
    p_progress: progress ?? null,
    p_current_step: currentStep ?? null,
  });

  if (error) {
    throw new Error(`heartbeatJob RPC error: ${error.message} (${error.code})`);
  }

  return Boolean(data);
}

export async function completeJob(params: CompleteJobParams): Promise<unknown> {
  const { data, error } = await supabaseAdmin.rpc('complete_job', {
    p_job_id: params.jobId,
    p_storage_path: params.storagePath,
    p_duration_seconds: params.durationSeconds,
    p_format: params.format,
    p_bitrate_kbps: params.bitrateKbps,
    p_file_size_bytes: params.fileSizeBytes,
    p_chapters: params.chapters as unknown,
    p_transcripts: params.transcripts as unknown,
    p_input_tokens: params.inputTokens ?? 0,
    p_output_tokens: params.outputTokens ?? 0,
    p_tts_characters: params.ttsCharacters ?? 0,
    p_cost_micros: params.costMicros ?? params.geminiCostMicros ?? 0,
  });

  if (error) {
    throw new Error(`completeJob RPC error: ${error.message} (${error.code})`);
  }

  return data;
}

export async function failJob(
  jobId: string,
  errorCode: string,
  errorMessage: string,
  errorDetails: Record<string, unknown> = {},
  failedStage: string | null = null
): Promise<unknown> {
  const { data, error } = await supabaseAdmin.rpc('fail_job', {
    p_job_id: jobId,
    p_error_code: errorCode,
    p_error_message: errorMessage,
    p_error_details: errorDetails as unknown,
    p_failed_stage: failedStage,
  });

  if (error) {
    throw new Error(`failJob RPC error: ${error.message} (${error.code})`);
  }

  return data;
}

/**
 * Marks a job as waiting_for_capacity with a typed resume timestamp.
 */
export async function markJobWaitingForCapacity(
  jobId: string,
  resumeAt: Date,
  reason: string
): Promise<void> {
  const resumeAtIso = resumeAt.toISOString();
  const { error } = await supabaseAdmin
    .from('audio_jobs')
    .update({
      status: 'waiting_for_capacity',
      current_step: 'Our AI voice is catching its breath. Resuming automatically.',
      resume_at: resumeAtIso,
      waiting_until: resumeAtIso,
      waiting_reason: reason,
    })
    .eq('id', jobId);

  if (error) {
    throw new Error(`markJobWaitingForCapacity error: ${error.message}`);
  }
}

/**
 * Persists the resumable pipeline unit progress into audio_jobs.step_detail.
 */
export async function updateJobStepDetail(
  jobId: string,
  detail: Record<string, unknown>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('audio_jobs')
    .update({ step_detail: detail })
    .eq('id', jobId);

  if (error) {
    throw new Error(`updateJobStepDetail error: ${error.message}`);
  }
}

/**
 * Persists providers_used (which models synthesized which chunks) into audio_jobs.
 */
export async function updateJobProvidersUsed(
  jobId: string,
  providers: ProviderChunkInfo[]
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('audio_jobs')
    .update({ providers_used: providers as unknown })
    .eq('id', jobId);

  if (error) {
    throw new Error(`updateJobProvidersUsed error: ${error.message}`);
  }
}
