import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Logger } from 'pino';

// ============================================================================
// Core Stage & Pipeline Identifiers
// ============================================================================

export const PipelineStageNames = [
  'reading',
  'understanding',
  'writing',
  'recording',
  'final_touches',
] as const;

export type PipelineStageName = (typeof PipelineStageNames)[number];

export const STAGE_PROGRESS_RANGES: Record<PipelineStageName, [number, number]> = {
  reading: [0, 15],
  understanding: [15, 30],
  writing: [30, 65],
  recording: [65, 92],
  final_touches: [92, 100],
};

// ============================================================================
// Stage Context & Interfaces
// ============================================================================

export interface JobEventRecord {
  event_type: string;
  stage?: PipelineStageName | string;
  unit?: string;
  error_code?: string;
  error_details?: Record<string, unknown>;
  model?: string;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  duration_ms?: number;
  metadata?: Record<string, unknown>;
}

export interface StageContext {
  readonly jobId: string;
  readonly documentId: string;
  readonly ownerId: string;
  readonly orgId?: string;
  readonly language: 'en' | 'hi' | 'hinglish';
  readonly depth: 'quick' | 'standard' | 'deep';
  readonly voiceId: string;
  readonly pipelineVersion: string;
  readonly promptVersion: string;
  readonly signal: AbortSignal;
  readonly supabase: SupabaseClient;
  readonly logger: Logger;

  updateProgress: (percent: number, stepDetail?: string) => Promise<void>;
  recordEvent: (event: JobEventRecord) => Promise<void>;
  getArtifact: <T>(step: string, chunkIndex?: number) => Promise<T | null>;
  saveArtifact: <T>(
    step: string,
    payload: T,
    chunkIndex?: number,
    meta?: Record<string, unknown>,
    storagePath?: string
  ) => Promise<void>;
  isCancelled: () => Promise<boolean>;
}

export interface IStage<TInput = any, TOutput = any> {
  readonly name: PipelineStageName;
  readonly version: string;
  readonly progressRange: [number, number];
  readonly inputSchema: z.ZodType<any, any, any>;
  readonly outputSchema: z.ZodType<any, any, any>;

  run(ctx: StageContext, input: TInput): Promise<TOutput>;
  validate(output: TOutput): Promise<boolean>;
}

export interface AgentBudget {
  maxRequests: number;
  maxTokens: number;
  maxCostUsd: number;
  timeoutMs: number;
}

export interface IAgent<TTaskInput = any, TTaskResult = any> {
  readonly role: string;
  readonly modelTask: 'outline' | 'script' | 'voice' | 'embedding';
  readonly budget: AgentBudget;
  readonly inputSchema: z.ZodType<any, any, any>;
  readonly outputSchema: z.ZodType<any, any, any>;

  execute(ctx: StageContext, input: TTaskInput): Promise<TTaskResult>;
}

// ============================================================================
// Stage 1: READING Models & Schemas
// ============================================================================

export const BlockTypeSchema = z.enum(['paragraph', 'heading', 'list', 'table', 'code', 'quote']);
export type BlockType = z.infer<typeof BlockTypeSchema>;

export const NormalizedBlockSchema = z.object({
  id: z.string(),
  type: BlockTypeSchema,
  text: z.string(),
  page: z.number().optional(),
});
export type NormalizedBlock = z.infer<typeof NormalizedBlockSchema>;

export const NormalizedSectionSchema = z.object({
  id: z.string(),
  ordinal: z.number(),
  heading: z.string(),
  heading_path: z.array(z.string()),
  page_start: z.number().optional(),
  page_end: z.number().optional(),
  blocks: z.array(NormalizedBlockSchema),
  text: z.string(),
  token_count: z.number(),
});
export type NormalizedSection = z.infer<typeof NormalizedSectionSchema>;

export const QualityScoreSchema = z.object({
  textDensity: z.number(),
  garbageCharRatio: z.number(),
  repeatedLineRatio: z.number(),
  languageConfidence: z.number(),
  structureScore: z.number(),
  overall: z.number(),
  passed: z.boolean(),
});
export type QualityScore = z.infer<typeof QualityScoreSchema>;

export const ReadingReportSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  detectedLanguage: z.string(),
  pageCount: z.number(),
  wordCount: z.number(),
  tokenCount: z.number(),
  sectionCount: z.number(),
  chunkCount: z.number(),
  qualityScore: QualityScoreSchema,
  modeChosen: z.enum(['rag', 'direct_context']),
  warnings: z.array(z.string()),
  createdAt: z.string(),
});
export type ReadingReport = z.infer<typeof ReadingReportSchema>;

export const DocumentChunkSchema = z.object({
  id: z.string(),
  document_id: z.string(),
  ordinal: z.number(),
  parent_section_id: z.string().optional(),
  heading_path: z.array(z.string()),
  page_start: z.number().optional(),
  page_end: z.number().optional(),
  text: z.string(),
  token_count: z.number(),
  content_hash: z.string(),
  embedding: z.array(z.number()).optional(),
});
export type DocumentChunk = z.infer<typeof DocumentChunkSchema>;

export const ReadingStageOutputSchema = z.object({
  report: ReadingReportSchema,
  sections: z.array(NormalizedSectionSchema),
  chunks: z.array(DocumentChunkSchema),
});
export type ReadingStageOutput = z.infer<typeof ReadingStageOutputSchema>;

// ============================================================================
// Stage 2: UNDERSTANDING Models & Schemas (Document Brief)
// ============================================================================

export const MustPreserveFactSchema = z.object({
  fact: z.string(),
  category: z.enum(['number', 'date', 'formula', 'named_entity', 'definition']),
  source_chunk_ids: z.array(z.string()),
  required: z.boolean().default(true),
});
export type MustPreserveFact = z.infer<typeof MustPreserveFactSchema>;

export const GlossaryTermSchema = z.object({
  term: z.string(),
  phonetic_spelling: z.string().optional(),
  definition: z.string(),
  category: z.enum(['technical', 'foreign', 'acronym', 'proper_noun']),
});
export type GlossaryTerm = z.infer<typeof GlossaryTermSchema>;

export const ChapterPlanSchema = z.object({
  index: z.number(),
  title: z.string(),
  goal: z.string(),
  estimatedMinutes: z.number(),
  sourceChunkIds: z.array(z.string()),
  keyIdeas: z.array(z.string()),
  mustPreserveFacts: z.array(MustPreserveFactSchema),
});
export type ChapterPlan = z.infer<typeof ChapterPlanSchema>;

export const DocumentBriefSchema = z.object({
  documentType: z.string(),
  audience: z.string(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  thesis: z.string(),
  totalEstimatedMinutes: z.number(),
  chapters: z.array(ChapterPlanSchema).min(1),
  keyConcepts: z.array(z.string()),
  glossary: z.array(GlossaryTermSchema),
  mustPreserveFacts: z.array(MustPreserveFactSchema),
  analogyDomains: z.array(z.string()),
  risks: z.array(z.string()),
  coverageCheck: z.object({
    allSectionsCovered: z.boolean(),
    skippedSections: z.array(z.object({ sectionOrdinal: z.number(), reason: z.string() })),
  }),
});
export type DocumentBrief = z.infer<typeof DocumentBriefSchema>;

export const UnderstandingStageOutputSchema = z.object({
  brief: DocumentBriefSchema,
});
export type UnderstandingStageOutput = z.infer<typeof UnderstandingStageOutputSchema>;

// ============================================================================
// Stage 3: WRITING Models & Schemas
// ============================================================================

export const ScriptSegmentSchema = z.object({
  text: z.string(),
  type: z.enum(['hook', 'explain', 'example', 'recap']),
  supports: z.array(z.string()), // Internal chunk IDs for evidence verification
});
export type ScriptSegment = z.infer<typeof ScriptSegmentSchema>;

export const ChapterScriptSchema = z.object({
  chapterIndex: z.number(),
  title: z.string(),
  segments: z.array(ScriptSegmentSchema).min(1),
  wordCount: z.number(),
  estimatedSeconds: z.number(),
  fullSpokenText: z.string(),
  verificationReport: z.object({
    passed: z.boolean(),
    claimSupportRate: z.number(),
    unsupportedClaims: z.array(z.string()),
    preservedFactsChecked: z.number(),
    revisionsCount: z.number(),
  }),
});
export type ChapterScript = z.infer<typeof ChapterScriptSchema>;

export const WritingStageOutputSchema = z.object({
  chapters: z.array(ChapterScriptSchema).min(1),
  totalWords: z.number(),
  overallHook: z.string(),
  overallRecap: z.string(),
});
export type WritingStageOutput = z.infer<typeof WritingStageOutputSchema>;

// ============================================================================
// Stage 4: RECORDING Models & Schemas
// ============================================================================

export const AudioChunkResultSchema = z.object({
  chunkIndex: z.number(),
  chapterIndex: z.number(),
  text: z.string(),
  ttsText: z.string(),
  provider: z.string(),
  model: z.string(),
  durationSeconds: z.number(),
  sampleRate: z.number(),
  channels: z.number(),
  storagePath: z.string(),
  sha256: z.string(),
  werScore: z.number().default(0),
  isRealSpeech: z.boolean(),
});
export type AudioChunkResult = z.infer<typeof AudioChunkResultSchema>;

export const RecordingStageOutputSchema = z.object({
  chunks: z.array(AudioChunkResultSchema).min(1),
  totalDurationSeconds: z.number(),
  allRealSpeech: z.boolean(),
});
export type RecordingStageOutput = z.infer<typeof RecordingStageOutputSchema>;

// ============================================================================
// Stage 5: FINAL TOUCHES Models & Schemas
// ============================================================================

export const ChapterTimingSchema = z.object({
  chapterIndex: z.number(),
  title: z.string(),
  startTime: z.number(),
  endTime: z.number(),
});
export type ChapterTiming = z.infer<typeof ChapterTimingSchema>;

export const TranscriptLineSchema = z.object({
  startSeconds: z.number(),
  endSeconds: z.number(),
  text: z.string(),
  chapterIndex: z.number(),
});
export type TranscriptLine = z.infer<typeof TranscriptLineSchema>;

export const FinalTouchesOutputSchema = z.object({
  trackId: z.string(),
  storagePath: z.string(),
  publicUrl: z.string().optional(),
  durationSeconds: z.number(),
  fileSizeBytes: z.number(),
  format: z.literal('mp3'),
  bitrateKbps: z.literal(96),
  lufs: z.number(),
  truePeakDb: z.number(),
  waveformPeaks: z.array(z.number()),
  chapters: z.array(ChapterTimingSchema),
  transcriptLineCount: z.number(),
  sha256: z.string(),
});
export type FinalTouchesOutput = z.infer<typeof FinalTouchesOutputSchema>;
