import { z } from 'zod';
import type { IStage, StageContext, ReadingStageOutput, ReadingReport } from '../types.js';
import { ReadingStageOutputSchema } from '../types.js';
import { extractStructureAware } from './structureExtractor.js';
import { chunkSections } from './chunker.js';
import { embedDocumentChunks } from './embedder.js';

export const ReadingStageInputSchema = z.instanceof(Buffer);

export class ReadingStage implements IStage<Buffer, ReadingStageOutput> {
  readonly name = 'reading' as const;
  readonly version = '2.0.0';
  readonly progressRange: [number, number] = [0, 15];
  readonly inputSchema = ReadingStageInputSchema;
  readonly outputSchema = ReadingStageOutputSchema;

  async run(ctx: StageContext, input: Buffer): Promise<ReadingStageOutput> {
    const startTime = Date.now();
    ctx.logger.info({ jobId: ctx.jobId, documentId: ctx.documentId }, 'Starting Stage 1: Reading');

    // 1. Structure-aware extraction
    await ctx.updateProgress(2, 'Extracting document structure & metadata');
    const extraction = await extractStructureAware(input, `doc_${ctx.documentId}`);

    // Check cancellation
    if (await ctx.isCancelled()) {
      throw new Error('JOB_CANCELLED');
    }

    // 2. Small-to-big semantic chunking
    await ctx.updateProgress(6, `Partitioning ${extraction.sections.length} sections into semantic chunks`);
    const chunks = chunkSections(extraction.sections, ctx.documentId);

    // 3. Embedding and Indexing
    await ctx.updateProgress(10, 'Indexing document chunks in hybrid RAG store');
    const { embeddedChunks, modeChosen, embeddingsGenerated } = await embedDocumentChunks(
      chunks,
      ctx.supabase,
      ctx.logger
    );

    // 4. Persist sections to Supabase document_sections
    try {
      const sectionRows = extraction.sections.map((s) => ({
        id: s.id.startsWith('sec_') ? undefined : s.id, // allow auto-generated UUID if needed
        document_id: ctx.documentId,
        owner_id: ctx.ownerId,
        org_id: ctx.orgId || null,
        ordinal: s.ordinal,
        heading: s.heading,
        heading_path: s.heading_path,
        page_start: s.page_start || null,
        page_end: s.page_end || null,
        text: s.text,
        token_count: s.token_count,
      }));

      await ctx.supabase
        .from('document_sections')
        .upsert(sectionRows, { onConflict: 'document_id,ordinal' });
    } catch (secErr) {
      ctx.logger.warn({ secErr }, 'Failed to write document_sections to DB; proceeding with memory cache');
    }

    // 5. Persist chunks to Supabase document_chunks
    try {
      const chunkRows = embeddedChunks.map((c) => ({
        document_id: ctx.documentId,
        owner_id: ctx.ownerId,
        org_id: ctx.orgId || null,
        ordinal: c.ordinal,
        heading_path: c.heading_path,
        page_start: c.page_start || null,
        page_end: c.page_end || null,
        text: c.text,
        token_count: c.token_count,
        content_hash: c.content_hash,
        embedding: c.embedding ? JSON.stringify(c.embedding) : null,
      }));

      await ctx.supabase
        .from('document_chunks')
        .upsert(chunkRows, { onConflict: 'document_id,ordinal' });
    } catch (chunkDbErr) {
      ctx.logger.warn({ chunkDbErr }, 'Failed to write document_chunks to DB; proceeding with memory cache');
    }

    // 6. Build Reading Report Artifact
    const totalTokens = chunks.reduce((acc, c) => acc + c.token_count, 0);
    const report: ReadingReport = {
      documentId: ctx.documentId,
      title: extraction.title,
      detectedLanguage: extraction.detectedLanguage,
      pageCount: extraction.pageCount,
      wordCount: extraction.wordCount,
      tokenCount: totalTokens,
      sectionCount: extraction.sections.length,
      chunkCount: chunks.length,
      qualityScore: extraction.qualityScore,
      modeChosen,
      warnings: extraction.warnings,
      createdAt: new Date().toISOString(),
    };

    // Save artifact in job_artifacts
    await ctx.saveArtifact('reading_report', report);
    await ctx.saveArtifact('reading_sections', extraction.sections);
    await ctx.saveArtifact('reading_chunks', embeddedChunks);

    const durationMs = Date.now() - startTime;
    await ctx.recordEvent({
      event_type: 'stage.completed',
      stage: 'reading',
      duration_ms: durationMs,
      metadata: {
        pageCount: extraction.pageCount,
        wordCount: extraction.wordCount,
        chunkCount: chunks.length,
        qualityScore: extraction.qualityScore.overall,
        modeChosen,
        embeddingsGenerated,
      },
    });

    await ctx.updateProgress(15, `Reading complete: ${chunks.length} chunks indexed (${modeChosen.toUpperCase()} mode)`);

    return {
      report,
      sections: extraction.sections,
      chunks: embeddedChunks,
    };
  }

  async validate(output: ReadingStageOutput): Promise<boolean> {
    const parse = this.outputSchema.safeParse(output);
    return parse.success && output.chunks.length > 0 && output.report.qualityScore.passed;
  }
}
