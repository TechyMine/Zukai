import type { SupabaseClient } from '@supabase/supabase-js';
import type { Logger } from 'pino';
import { reserve, release } from '../../ai/quotaTracker.js';
import type { DocumentChunk } from '../types.js';

export interface EmbedderOptions {
  apiKey?: string;
  dimension?: number; // 768
  batchSize?: number; // 20
  tokenThresholdForDirectContext?: number; // 4000
}

const embeddingCache = new Map<string, number[]>();

/**
 * Calls Google GenAI text-embedding-004 to batch-embed chunk texts.
 */
export async function batchEmbedTexts(
  texts: string[],
  apiKey: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT',
  dimensionality: number = 768
): Promise<Array<number[] | null>> {
  if (texts.length === 0) return [];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${apiKey}`;

  const requests = texts.map((text) => ({
    model: 'models/text-embedding-004',
    content: {
      parts: [{ text: text.slice(0, 8000) }], // Stay within token limit
    },
    taskType,
    outputDimensionality: dimensionality,
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Embedding API failed (${res.status}): ${errorBody.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    embeddings?: Array<{ values?: number[] }>;
  };

  const results: Array<number[] | null> = [];
  if (json.embeddings && Array.isArray(json.embeddings)) {
    for (const item of json.embeddings) {
      if (item.values && Array.isArray(item.values)) {
        results.push(item.values);
      } else {
        results.push(null);
      }
    }
  }

  return results;
}

/**
 * Embeds document chunks with caching, batching, and graceful degradation to FTS.
 */
export async function embedDocumentChunks(
  chunks: DocumentChunk[],
  supabase: SupabaseClient,
  logger: Logger,
  options: EmbedderOptions = {}
): Promise<{
  embeddedChunks: DocumentChunk[];
  modeChosen: 'rag' | 'direct_context';
  embeddingsGenerated: number;
}> {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY || '';
  const tokenThreshold = options.tokenThresholdForDirectContext ?? 4000;
  const batchSize = options.batchSize ?? 15;
  const dimensionality = options.dimension ?? 768;

  const totalTokens = chunks.reduce((sum, c) => sum + c.token_count, 0);

  // 1. Adaptive Mode: Small documents bypass vector embeddings to preserve API quota
  if (totalTokens <= tokenThreshold) {
    logger.info(
      { totalTokens, tokenThreshold },
      'Adaptive mode: Document fits in direct context budget. Skipping embedding generation; relying on full-text index.'
    );
    return {
      embeddedChunks: chunks,
      modeChosen: 'direct_context',
      embeddingsGenerated: 0,
    };
  }

  // 2. Identify chunks that require embedding (check memory cache first)
  const chunksToEmbed: Array<{ index: number; chunk: DocumentChunk }> = [];
  const finalChunks = [...chunks];

  for (let i = 0; i < finalChunks.length; i++) {
    const c = finalChunks[i];
    const cached = embeddingCache.get(c.content_hash);
    if (cached) {
      finalChunks[i] = { ...c, embedding: cached };
    } else {
      chunksToEmbed.push({ index: i, chunk: c });
    }
  }

  // 3. Check Supabase document_chunks for existing hashes across prior uploads
  if (chunksToEmbed.length > 0) {
    try {
      const hashes = chunksToEmbed.map((item) => item.chunk.content_hash);
      const { data: existingRows } = await supabase
        .from('document_chunks')
        .select('content_hash, embedding')
        .in('content_hash', hashes.slice(0, 100))
        .not('embedding', 'is', null)
        .limit(100);

      if (existingRows && existingRows.length > 0) {
        const hashToEmbedding = new Map<string, number[]>();
        for (const row of existingRows) {
          if (row.embedding && Array.isArray(row.embedding)) {
            hashToEmbedding.set(row.content_hash, row.embedding);
            embeddingCache.set(row.content_hash, row.embedding);
          }
        }

        // Apply any found hashes
        for (let j = chunksToEmbed.length - 1; j >= 0; j--) {
          const item = chunksToEmbed[j];
          const emb = hashToEmbedding.get(item.chunk.content_hash);
          if (emb) {
            finalChunks[item.index] = { ...item.chunk, embedding: emb };
            chunksToEmbed.splice(j, 1);
          }
        }
      }
    } catch (cacheErr) {
      logger.warn({ cacheErr }, 'Failed to query prior chunk hash cache; continuing with fresh generation');
    }
  }

  // 4. Batch embed missing chunks with quotaTracker and graceful degradation
  let embeddingsGenerated = 0;

  if (chunksToEmbed.length > 0 && apiKey) {
    for (let i = 0; i < chunksToEmbed.length; i += batchSize) {
      const batch = chunksToEmbed.slice(i, i + batchSize);
      const batchTexts = batch.map((b) => b.chunk.text);

      try {
        const embeddings = await batchEmbedTexts(batchTexts, apiKey, 'RETRIEVAL_DOCUMENT', dimensionality);

        for (let k = 0; k < batch.length; k++) {
          const emb = embeddings[k];
          if (emb && emb.length === dimensionality) {
            const item = batch[k];
            finalChunks[item.index] = { ...item.chunk, embedding: emb };
            embeddingCache.set(item.chunk.content_hash, emb);
            embeddingsGenerated++;
          }
        }

        // Record usage in quota tracker
        const batchTokens = batch.reduce((sum, b) => sum + b.chunk.token_count, 0);
        reserve('text-embedding-004', batchTokens);
        await release('text-embedding-004', batchTokens, true);
      } catch (embErr) {
        logger.warn(
          { batchIndex: i, err: embErr },
          'Embedding batch failed or quota exceeded. Gracefully degrading to full-text retrieval.'
        );
        // Do not crash: leave embedding empty so postgres full-text search handles retrieval
      }
    }
  }

  return {
    embeddedChunks: finalChunks,
    modeChosen: 'rag',
    embeddingsGenerated,
  };
}
