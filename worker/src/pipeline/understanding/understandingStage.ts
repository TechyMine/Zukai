import { z } from 'zod';
import type {
  IStage,
  StageContext,
  ReadingStageOutput,
  UnderstandingStageOutput,
  DocumentBrief,
  ChapterPlan,
  MustPreserveFact,
  GlossaryTerm,
} from '../types.js';
import { UnderstandingStageOutputSchema, DocumentBriefSchema } from '../types.js';
import { executeWithFallback } from '../../ai/router.js';
import { WorkerError, WORKER_ERROR_CODES } from '../../errors.js';
import {
  wrapUntrustedDocumentText,
  INJECTION_DEFENSE_DIRECTIVE,
} from './promptDelimiters.js';

export const UnderstandingStageInputSchema = z.object({
  report: z.any(),
  sections: z.array(z.any()),
  chunks: z.array(z.any()),
});

export class UnderstandingStage implements IStage<ReadingStageOutput, UnderstandingStageOutput> {
  readonly name = 'understanding' as const;
  readonly version = '2.0.0';
  readonly progressRange: [number, number] = [15, 30];
  readonly inputSchema = UnderstandingStageInputSchema;
  readonly outputSchema = UnderstandingStageOutputSchema;

  async run(ctx: StageContext, input: ReadingStageOutput): Promise<UnderstandingStageOutput> {
    const startTime = Date.now();
    ctx.logger.info({ jobId: ctx.jobId }, 'Starting Stage 2: Understanding');

    // Check if brief already exists as a resumable artifact
    const cachedBrief = await ctx.getArtifact<DocumentBrief>('document_brief');
    if (cachedBrief && DocumentBriefSchema.safeParse(cachedBrief).success) {
      ctx.logger.info({ jobId: ctx.jobId }, 'Resuming from existing document_brief artifact');
      await ctx.updateProgress(30, 'Document brief loaded from cache');
      return { brief: cachedBrief };
    }

    await ctx.updateProgress(18, 'Analyzing document concepts and target audience');

    // 1. Prepare section outline & key facts
    const sectionSummaries = input.sections.map((s: any) => ({
      ordinal: s.ordinal,
      heading: s.heading,
      tokenCount: s.token_count,
      snippet: s.text.slice(0, 300).replace(/\s+/g, ' '),
    }));

    // Target chapter count and minutes by depth
    const depthConfig = {
      quick: { targetChapters: 3, targetMinutes: 6 },
      standard: { targetChapters: 5, targetMinutes: 15 },
      deep: { targetChapters: 7, targetMinutes: 30 },
    }[ctx.depth as 'quick' | 'standard' | 'deep'] || { targetChapters: 4, targetMinutes: 12 };

    // Extract deterministic numbers, dates, and capitalized terms from chunks for must-preserve facts
    const extractedFacts: MustPreserveFact[] = [];
    const factTracker = new Set<string>();

    for (const chunk of input.chunks.slice(0, 50)) {
      // Find numbers (percentages, currency, metrics)
      const numMatches = chunk.text.match(/\b(?:\$|₹|€)?\d+(?:\.\d+)?%?(?:\s+(?:million|billion|trillion|crore|lakh|users|kg|MB|GB|ms|seconds|years))?\b/gi) || [];
      for (const m of numMatches) {
        const trimmed = m.trim();
        if (trimmed.length > 1 && !/^\d$/.test(trimmed) && !factTracker.has(trimmed.toLowerCase())) {
          factTracker.add(trimmed.toLowerCase());
          extractedFacts.push({
            fact: trimmed,
            category: 'number',
            source_chunk_ids: [chunk.id],
            required: true,
          });
          if (extractedFacts.length >= 15) break;
        }
      }
      if (extractedFacts.length >= 15) break;
    }

    // 2. Formulate Prompt for Gemini Analyst & Curriculum Planner
    const prompt = `You are the Lead Analyst and Audio Curriculum Architect for Zukai.
Your goal is to transform the provided document into a structured, validated Audio Document Brief.

TARGET CONFIGURATION:
- Language: ${ctx.language.toUpperCase()}
- Explanation Depth: ${ctx.depth.toUpperCase()}
- Target Spoken Duration: ${depthConfig.targetMinutes} minutes total
- Recommended Chapters: ${depthConfig.targetChapters} chapters

DOCUMENT METRICS:
- Title: "${input.report.title}"
- Total Sections: ${input.sections.length}
- Total Chunks: ${input.chunks.length}
- Word Count: ${input.report.wordCount} words

SECTIONS OVERVIEW:
${JSON.stringify(sectionSummaries, null, 2)}

SOURCE CHUNK SAMPLES:
${input.chunks.slice(0, 8).map((c: any) => `[Chunk ${c.id}] (Section: ${c.heading_path.join(' > ')})\n${c.text.slice(0, 250)}...`).join('\n\n')}

${INJECTION_DEFENSE_DIRECTIVE}

Produce a complete JSON object adhering strictly to this schema:
{
  "documentType": string, // e.g. "Technical Research Paper", "Quarterly Report", "Lecture Notes"
  "audience": string, // e.g. "Software Engineers", "Business Executives", "Students"
  "difficulty": "beginner" | "intermediate" | "advanced",
  "thesis": string, // One clear summary sentence capturing the core premise
  "totalEstimatedMinutes": number, // Around ${depthConfig.targetMinutes}
  "chapters": [
    {
      "index": number, // 1-based
      "title": string,
      "goal": string,
      "estimatedMinutes": number,
      "sourceChunkIds": string[], // Choose from provided chunk IDs
      "keyIdeas": string[],
      "mustPreserveFacts": [
        { "fact": string, "category": "number" | "date" | "formula" | "named_entity" | "definition", "source_chunk_ids": string[] }
      ]
    }
  ],
  "keyConcepts": string[],
  "glossary": [
    { "term": string, "phonetic_spelling": string, "definition": string, "category": "technical" | "foreign" | "acronym" | "proper_noun" }
  ],
  "mustPreserveFacts": [
    { "fact": string, "category": "number" | "date" | "formula" | "named_entity" | "definition", "source_chunk_ids": string[] }
  ],
  "analogyDomains": string[], // 2-3 relatable everyday domains for analogies
  "risks": string[], // potential pitfalls (dense math, ambiguous terms)
  "coverageCheck": {
    "allSectionsCovered": boolean,
    "skippedSections": [{ "sectionOrdinal": number, "reason": string }]
  }
}
Respond with raw JSON only. No markdown formatting, no code fences.`;

    await ctx.updateProgress(22, 'Synthesizing chapter plan and technical glossary');

    // 3. Execute with repair loops (max 2 repairs)
    let brief: DocumentBrief;
    let attempts = 0;
    const maxRepairs = 2;
    let currentPrompt = prompt;

    while (true) {
      if (await ctx.isCancelled()) throw new Error('JOB_CANCELLED');

      const { result, modelId, tokensUsed } = await executeWithFallback(
        'outline',
        async (model) => {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${process.env.GEMINI_API_KEY}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: currentPrompt }] }],
              generationConfig: {
                temperature: 0.2,
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
          const tokens = (data.usageMetadata?.promptTokenCount || 500) + (data.usageMetadata?.candidatesTokenCount || 500);

          return { result: rawText, tokensUsed: tokens };
        },
        1200
      );

      try {
        const cleanedJson = result.replace(/^```json/i, '').replace(/```$/i, '').trim();
        const parsed = JSON.parse(cleanedJson);
        const validated = DocumentBriefSchema.parse(parsed);

        brief = validated;
        break;
      } catch (err: unknown) {
        attempts++;
        if (attempts > maxRepairs) {
          // Graceful fallback: construct deterministic brief from extracted sections
          ctx.logger.warn({ err }, 'Brief validation failed after max repairs. Using deterministic structured brief fallback.');
          brief = {
            documentType: 'General Document',
            audience: 'General Audience',
            difficulty: 'intermediate',
            thesis: `Spoken analysis of ${input.report.title}.`,
            totalEstimatedMinutes: depthConfig.targetMinutes,
            chapters: input.sections.slice(0, depthConfig.targetChapters).map((s: any, idx: number) => ({
              index: idx + 1,
              title: s.heading || `Chapter ${idx + 1}`,
              goal: `Explain ${s.heading}`,
              estimatedMinutes: Math.round(depthConfig.targetMinutes / depthConfig.targetChapters),
              sourceChunkIds: input.chunks.filter((c: any) => c.heading_path.includes(s.heading)).map((c: any) => c.id),
              keyIdeas: [s.heading],
              mustPreserveFacts: extractedFacts.slice(idx * 2, (idx + 1) * 2),
            })),
            keyConcepts: input.sections.map((s: any) => s.heading),
            glossary: [],
            mustPreserveFacts: extractedFacts,
            analogyDomains: ['Technology', 'Architecture', 'Daily Life'],
            risks: [],
            coverageCheck: { allSectionsCovered: true, skippedSections: [] },
          };
          break;
        }

        currentPrompt = `${prompt}\n\nPREVIOUS OUTPUT FAILED VALIDATION:\n${err instanceof Error ? err.message : String(err)}\nPlease fix the JSON formatting to match DocumentBriefSchema exactly.`;
      }
    }

    // 4. Save artifact
    await ctx.saveArtifact('document_brief', brief);

    const durationMs = Date.now() - startTime;
    await ctx.recordEvent({
      event_type: 'stage.completed',
      stage: 'understanding',
      duration_ms: durationMs,
      metadata: {
        chaptersCount: brief.chapters.length,
        totalMinutes: brief.totalEstimatedMinutes,
        factsPreserved: brief.mustPreserveFacts.length,
        glossaryCount: brief.glossary.length,
      },
    });

    await ctx.updateProgress(30, `Understanding complete: ${brief.chapters.length} chapters structured (${brief.totalEstimatedMinutes} mins)`);

    return { brief };
  }

  async validate(output: UnderstandingStageOutput): Promise<boolean> {
    const parse = this.outputSchema.safeParse(output);
    return parse.success && output.brief.chapters.length > 0;
  }
}
