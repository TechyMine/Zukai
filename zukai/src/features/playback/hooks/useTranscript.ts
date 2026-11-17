/**
 * ZUKAI TRANSCRIPT HOOK & BINARY SEARCH
 * Location: /zukai/src/features/playback/hooks/useTranscript.ts
 *
 * Provides O(log n) binary search lookup for active karaoke sentence indexing
 * and memoized transcript parsing.
 */

import { useMemo } from 'react';
import { TranscriptRow } from '@/features/tracks/api/tracksApi';

export interface TranscriptSegment {
  index: number;
  text: string;
  start_seconds: number;
  end_seconds: number;
}

/**
 * Parses raw JSONB transcript segments into a clean typed array.
 */
export function parseTranscriptSegments(transcript: TranscriptRow | null): TranscriptSegment[] {
  if (!transcript || !transcript.segments) {
    return [];
  }

  const raw = transcript.segments;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((item: any, idx: number) => ({
    index: idx,
    text: String(item.text ?? item.content ?? ''),
    start_seconds: Number(item.start_seconds ?? item.start ?? 0),
    end_seconds: Number(item.end_seconds ?? item.end ?? 0),
  }));
}

/**
 * Binary search to find the active sentence index given a playback position in seconds.
 * Returns the highest index where start_seconds <= positionSec.
 * Runs in O(log n) time instead of O(n) linear scans.
 */
export function findActiveSentenceIndex(
  segments: TranscriptSegment[],
  positionSec: number
): number {
  if (segments.length === 0) return 0;
  if (positionSec < segments[0].start_seconds) return 0;

  let low = 0;
  let high = segments.length - 1;
  let result = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (segments[mid].start_seconds <= positionSec) {
      result = mid;
      low = mid + 1; // Look for a later segment that also starts before or at positionSec
    } else {
      high = mid - 1;
    }
  }

  return result;
}

/**
 * Custom React hook for consuming parsed transcript segments.
 */
export function useTranscriptSegments(transcript: TranscriptRow | null): TranscriptSegment[] {
  return useMemo(() => parseTranscriptSegments(transcript), [transcript]);
}
