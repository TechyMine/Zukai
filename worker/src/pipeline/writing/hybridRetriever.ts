import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentChunk } from '../types.js';

export interface RetrievedChunk {
  id: string;
  ordinal: number;
  heading_path: string[];
  text: string;
  token_count: number;
  similarity: number;
  text_rank: number;
  rrf_score: number;
}

/**
 * Hybrid retrieval client: Calls match_document_chunks RPC via Supabase,
 * with pure memory/lexical fallback if DB RPC is not yet linked.
 */
export async function retrieveHybridChunks(
  supabase: SupabaseClient,
  documentId: string,
  queryText: string,
  allDocumentChunks: DocumentChunk[],
  matchCount: number = 6,
  queryEmbedding?: number[]
): Promise<RetrievedChunk[]> {
  try {
    const { data, error } = await supabase.rpc('match_document_chunks', {
      p_document_id: documentId,
      p_query_text: queryText,
      p_query_embedding: queryEmbedding ? JSON.stringify(queryEmbedding) : null,
      p_match_count: matchCount,
      p_rrf_k: 60,
    });

    if (!error && data && Array.isArray(data) && data.length > 0) {
      return data.map((row: any) => ({
        id: row.id,
        ordinal: row.ordinal,
        heading_path: row.heading_path || [],
        text: row.text,
        token_count: row.token_count || 300,
        similarity: Number(row.similarity || 0),
        text_rank: Number(row.text_rank || 0),
        rrf_score: Number(row.rrf_score || 0),
      }));
    }
  } catch (rpcErr) {
    // Proceed to in-memory fallback
  }

  // In-Memory Fallback: Keyword and heading match
  const queryWords = queryText.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const scored = allDocumentChunks.map((chunk) => {
    let score = 0;
    const lowerText = chunk.text.toLowerCase();
    const lowerHeading = chunk.heading_path.join(' ').toLowerCase();

    for (const word of queryWords) {
      if (lowerHeading.includes(word)) score += 3.0;
      if (lowerText.includes(word)) score += 1.0;
    }

    return {
      id: chunk.id,
      ordinal: chunk.ordinal,
      heading_path: chunk.heading_path,
      text: chunk.text,
      token_count: chunk.token_count,
      similarity: 0,
      text_rank: score,
      rrf_score: score / 100,
    };
  });

  scored.sort((a, b) => b.rrf_score - a.rrf_score);
  return scored.slice(0, matchCount);
}
