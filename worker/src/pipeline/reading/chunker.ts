import crypto from 'node:crypto';
import type { NormalizedSection, DocumentChunk } from '../types.js';

export interface ChunkerOptions {
  targetTokens?: number; // default ~380
  minTokens?: number; // default ~250
  maxTokens?: number; // default ~500
  overlapPercent?: number; // default 0.12 (12%)
}

/**
 * Approximate token count helper (1 word ~ 1.33 tokens for English / technical text).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.33);
}

/**
 * Splits text into sentences cleanly, preserving terminal punctuation.
 */
export function splitIntoSentences(text: string): string[] {
  if (!text) return [];
  // Split on punctuation followed by whitespace or line break
  const rawSentences = text.split(/(?<=[.?!])\s+/);
  return rawSentences.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Computes deterministic SHA-256 hex hash for chunk text.
 */
export function computeContentHash(text: string): string {
  return crypto.createHash('sha256').update(text.trim(), 'utf8').digest('hex');
}

/**
 * Structure-aware, small-to-big chunker.
 * Partitions section text into 300-500 token chunks with 10-15% sentence-level overlap.
 */
export function chunkSections(
  sections: NormalizedSection[],
  documentId: string,
  options: ChunkerOptions = {}
): DocumentChunk[] {
  const targetTokens = options.targetTokens || 380;
  const maxTokens = options.maxTokens || 500;
  const overlapPercent = options.overlapPercent ?? 0.12;

  const chunks: DocumentChunk[] = [];
  let chunkOrdinal = 1;

  for (const section of sections) {
    const sentences = splitIntoSentences(section.text);
    if (sentences.length === 0) continue;

    let currentSentences: string[] = [];
    let currentTokens = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceTokens = estimateTokens(sentence);

      // If adding this sentence exceeds maxTokens and we already have sentences, emit a chunk
      if (currentTokens + sentenceTokens > maxTokens && currentSentences.length > 0) {
        const chunkText = currentSentences.join(' ');
        chunks.push({
          id: `${documentId}_chunk_${chunkOrdinal}`,
          document_id: documentId,
          ordinal: chunkOrdinal++,
          parent_section_id: section.id,
          heading_path: section.heading_path,
          page_start: section.page_start,
          page_end: section.page_end,
          text: chunkText,
          token_count: estimateTokens(chunkText),
          content_hash: computeContentHash(chunkText),
        });

        // Compute overlap sentences for small-to-big continuity
        const targetOverlapTokens = Math.floor(targetTokens * overlapPercent);
        let overlapTokens = 0;
        const overlapSentences: string[] = [];

        for (let j = currentSentences.length - 1; j >= 0; j--) {
          const sTokens = estimateTokens(currentSentences[j]);
          if (overlapTokens + sTokens <= targetOverlapTokens) {
            overlapSentences.unshift(currentSentences[j]);
            overlapTokens += sTokens;
          } else {
            break;
          }
        }

        currentSentences = [...overlapSentences];
        currentTokens = overlapTokens;
      }

      currentSentences.push(sentence);
      currentTokens += sentenceTokens;
    }

    // Flush any remaining sentences in section
    if (currentSentences.length > 0) {
      const chunkText = currentSentences.join(' ');
      chunks.push({
        id: `${documentId}_chunk_${chunkOrdinal}`,
        document_id: documentId,
        ordinal: chunkOrdinal++,
        parent_section_id: section.id,
        heading_path: section.heading_path,
        page_start: section.page_start,
        page_end: section.page_end,
        text: chunkText,
        token_count: estimateTokens(chunkText),
        content_hash: computeContentHash(chunkText),
      });
    }
  }

  return chunks;
}
