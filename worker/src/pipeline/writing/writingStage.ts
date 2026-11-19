import { z } from 'zod';
import type {
  IStage,
  StageContext,
  ReadingStageOutput,
  UnderstandingStageOutput,
  WritingStageOutput,
  ChapterScript,
  ScriptSegment,
  DocumentChunk,
} from '../types.js';
import { WritingStageOutputSchema, ChapterScriptSchema } from '../types.js';
import { retrieveHybridChunks } from './hybridRetriever.js';
import { verifyChapterScript } from './criticVerifier.js';
import { executeWithFallback } from '../../ai/router.js';
import { SYSTEM_PROMPT_ENGLISH, SYSTEM_PROMPT_HINGLISH } from '../../intelligence/styleGuidePrompts.js';
import { wrapUntrustedDocumentText, INJECTION_DEFENSE_DIRECTIVE } from '../understanding/promptDelimiters.js';
import { normalizeHinglishSpelling } from '../../hinglish/glossary.js';

export const WritingStageInputSchema = z.object({
  reading: z.any(),
  understanding: z.any(),
});

export class WritingStage
  implements IStage<{ reading: ReadingStageOutput; understanding: UnderstandingStageOutput }, WritingStageOutput>
{
  readonly name = 'writing' as const;
  readonly version = '2.0.0';
  readonly progressRange: [number, number] = [30, 65];
  readonly inputSchema = WritingStageInputSchema;
  readonly outputSchema = WritingStageOutputSchema;

  async run(
    ctx: StageContext,
    input: { reading: ReadingStageOutput; understanding: UnderstandingStageOutput }
  ): Promise<WritingStageOutput> {
    const startTime = Date.now();
    ctx.logger.info({ jobId: ctx.jobId }, 'Starting Stage 3: Writing');

    const { reading, understanding } = input;
    const chapters = understanding.brief.chapters;
    const totalChapters = chapters.length;
    const writtenChapters: ChapterScript[] = [];

    const isHinglish = ctx.language === 'hinglish';
    const baseSystemPrompt = isHinglish ? SYSTEM_PROMPT_HINGLISH : SYSTEM_PROMPT_ENGLISH;

    for (let i = 0; i < totalChapters; i++) {
      if (await ctx.isCancelled()) throw new Error('JOB_CANCELLED');

      const chapterPlan = chapters[i];
      const chapterNum = i + 1;

      // 1. Resumable check for this chapter unit
      const cachedChapter = await ctx.getArtifact<ChapterScript>(`chapter_script_${chapterNum}`);
      if (cachedChapter && ChapterScriptSchema.safeParse(cachedChapter).success) {
        ctx.logger.info({ jobId: ctx.jobId, chapterNum }, 'Resuming chapter from saved artifact');
        writtenChapters.push(cachedChapter);
        continue;
      }

      // Compute dynamic sub-progress in 30-65% range
      const chapterProgress = Math.round(30 + ((i + 0.5) / totalChapters) * 35);
      await ctx.updateProgress(chapterProgress, `Writing chapter ${chapterNum} of ${totalChapters}: "${chapterPlan.title}"`);

      // 2. Retrieve hybrid evidence chunks for this chapter
      const hybridEvidence = await retrieveHybridChunks(
        ctx.supabase,
        ctx.documentId,
        `${chapterPlan.title} ${chapterPlan.keyIdeas.join(' ')}`,
        reading.chunks,
        6
      );

      // Merge planned source chunks with hybrid evidence chunks
      const evidenceChunkIds = new Set([
        ...chapterPlan.sourceChunkIds,
        ...hybridEvidence.map((h) => h.id),
      ]);
      const chapterSourceChunks: DocumentChunk[] = reading.chunks.filter((c: any) =>
        evidenceChunkIds.has(c.id)
      );

      const sourceContextText = chapterSourceChunks
        .map((c) => `[Source Chunk ID: ${c.id}] (Section: ${c.heading_path.join(' > ')})\n${c.text}`)
        .join('\n\n');

      // 3. Draft Chapter Script with Bounded Revise Loops (Max 2)
      let chapterScript: ChapterScript | null = null;
      let revisionAttempts = 0;
      const maxRevisions = 2;
      let criticFeedback = '';

      while (revisionAttempts <= maxRevisions) {
        if (await ctx.isCancelled()) throw new Error('JOB_CANCELLED');

        const prompt = `${baseSystemPrompt}

CHAPTER SPECIFICATION:
- Chapter Number: ${chapterNum} of ${totalChapters}
- Title: "${chapterPlan.title}"
- Goal: "${chapterPlan.goal}"
- Target Spoken Length: ~${chapterPlan.estimatedMinutes * 150} words (${chapterPlan.estimatedMinutes} minutes)
- Key Ideas to Cover: ${chapterPlan.keyIdeas.join('; ')}
- Mandatory Preserved Facts: ${JSON.stringify(chapterPlan.mustPreserveFacts)}
- Document Glossary Terms: ${JSON.stringify(understanding.brief.glossary)}

SOURCE EVIDENCE (GROUNDING DATA):
${wrapUntrustedDocumentText(sourceContextText)}

${criticFeedback ? `\nPREVIOUS DRAFT REVISION FEEDBACK FROM VERIFIER:\n${criticFeedback}\nPlease resolve all listed verification issues.\n` : ''}

${INJECTION_DEFENSE_DIRECTIVE}

Produce a JSON object adhering to this schema:
{
  "chapterIndex": ${chapterNum},
  "title": "${chapterPlan.title}",
  "segments": [
    {
      "text": string, // natural conversational spoken text (NO markdown bullets, NO "as shown above")
      "type": "hook" | "explain" | "example" | "recap",
      "supports": string[] // matching source chunk IDs e.g. ["${reading.chunks[0]?.id || 'chunk_1'}"]
    }
  ]
}
Respond with raw JSON only.`;

        const { result, modelId, tokensUsed } = await executeWithFallback(
          'script',
          async (model) => {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                  temperature: 0.3,
                  responseMimeType: 'application/json',
                },
              }),
            });

            if (!res.ok) {
              const errText = await res.text();
              throw new Error(`Gemini generateContent error (${res.status}): ${errText.slice(0, 200)}`);
            }

            const data = (await res.json()) as {
              candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
              usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
            };

            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            const tokens =
              (data.usageMetadata?.promptTokenCount || 600) +
              (data.usageMetadata?.candidatesTokenCount || 800);

            return { result: rawText, tokensUsed: tokens };
          },
          1400
        );

        let parsedSegments: ScriptSegment[] = [];
        try {
          const cleanedJson = result.replace(/^```json/i, '').replace(/```$/i, '').trim();
          const parsed = JSON.parse(cleanedJson);
          if (Array.isArray(parsed.segments)) {
            parsedSegments = parsed.segments.map((s: any) => ({
              text: isHinglish ? normalizeHinglishSpelling(String(s.text || '')) : String(s.text || ''),
              type: s.type || 'explain',
              supports: Array.isArray(s.supports) ? s.supports.map(String) : [],
            }));
          }
        } catch (jsonErr) {
          ctx.logger.warn({ jsonErr }, 'Failed to parse chapter JSON segments');
        }

        // Fallback segment generation if parsing failed
        if (parsedSegments.length === 0) {
          parsedSegments = [
            {
              text: `Welcome back. In this chapter, we explore ${chapterPlan.title}. ${chapterPlan.goal}.`,
              type: 'hook',
              supports: chapterPlan.sourceChunkIds,
            },
            {
              text: chapterSourceChunks[0]?.text.slice(0, 600) || chapterPlan.keyIdeas.join('. '),
              type: 'explain',
              supports: chapterPlan.sourceChunkIds,
            },
          ];
        }

        // Run Critic Verifier
        const verification = verifyChapterScript(
          parsedSegments,
          chapterSourceChunks,
          chapterPlan.mustPreserveFacts
        );

        const fullSpokenText = parsedSegments.map((s) => s.text).join(' ');
        const wordCount = fullSpokenText.split(/\s+/).filter(Boolean).length;
        const estimatedSeconds = Math.round((wordCount / 150) * 60);

        chapterScript = {
          chapterIndex: chapterNum,
          title: chapterPlan.title,
          segments: parsedSegments,
          wordCount,
          estimatedSeconds,
          fullSpokenText,
          verificationReport: {
            passed: verification.passed,
            claimSupportRate: verification.claimSupportRate,
            unsupportedClaims: verification.unsupportedClaims,
            preservedFactsChecked: verification.preservedFactsChecked,
            revisionsCount: revisionAttempts,
          },
        };

        if (verification.passed || revisionAttempts === maxRevisions) {
          break;
        }

        revisionAttempts++;
        criticFeedback = verification.reasons.concat(verification.unsupportedClaims).join('\n');
      }

      if (!chapterScript) {
        throw new Error(`Failed to generate chapter script for chapter ${chapterNum}`);
      }

      // Persist chapter unit artifact
      await ctx.saveArtifact(`chapter_script_${chapterNum}`, chapterScript);
      writtenChapters.push(chapterScript);
    }

    // 4. Editor Pass: Whole-piece hook and recap
    const overallHook = `Welcome to this audio deep dive on "${input.reading.report.title}". Today, we will break down the essential concepts across ${totalChapters} chapters, starting with ${chapters[0]?.title}.`;
    const overallRecap = `That concludes our examination of "${input.reading.report.title}". We explored key milestones across all ${totalChapters} chapters, highlighting the core principles and practical implications.`;

    const totalWords = writtenChapters.reduce((acc, c) => acc + c.wordCount, 0);

    const output: WritingStageOutput = {
      chapters: writtenChapters,
      totalWords,
      overallHook,
      overallRecap,
    };

    // Save final writing artifact
    await ctx.saveArtifact('writing_output', output);

    const durationMs = Date.now() - startTime;
    await ctx.recordEvent({
      event_type: 'stage.completed',
      stage: 'writing',
      duration_ms: durationMs,
      metadata: {
        totalChapters,
        totalWords,
        claimSupportRates: writtenChapters.map((c) => c.verificationReport.claimSupportRate),
      },
    });

    await ctx.updateProgress(65, `Writing complete: ${totalChapters} chapters scripted (${totalWords} words verified)`);

    return output;
  }

  async validate(output: WritingStageOutput): Promise<boolean> {
    const parse = this.outputSchema.safeParse(output);
    return parse.success && output.chapters.length > 0 && output.totalWords > 50;
  }
}
