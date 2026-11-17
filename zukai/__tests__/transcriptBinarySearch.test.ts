/**
 * Test: Transcript Binary Search
 * Location: /zukai/__tests__/transcriptBinarySearch.test.ts
 */

import {
  findActiveSentenceIndex,
  parseTranscriptSegments,
  type TranscriptSegment,
} from '../src/features/playback/hooks/useTranscript';

describe('Transcript Binary Search', () => {
  const mockSegments: TranscriptSegment[] = [
    { index: 0, text: 'First sentence introduction.', start_seconds: 0.0, end_seconds: 4.5 },
    { index: 1, text: 'Second sentence explaining the core concept.', start_seconds: 4.5, end_seconds: 10.0 },
    { index: 2, text: 'Third sentence giving an intuitive example.', start_seconds: 10.0, end_seconds: 18.2 },
    { index: 3, text: 'Fourth sentence summarizing key takeaways.', start_seconds: 18.2, end_seconds: 25.0 },
  ];

  it('handles empty segments list gracefully by returning index 0', () => {
    expect(findActiveSentenceIndex([], 5.0)).toBe(0);
  });

  it('returns index 0 when position is before or at the start of the first segment', () => {
    expect(findActiveSentenceIndex(mockSegments, -1.0)).toBe(0);
    expect(findActiveSentenceIndex(mockSegments, 0.0)).toBe(0);
    expect(findActiveSentenceIndex(mockSegments, 2.0)).toBe(0);
  });

  it('correctly finds the active segment in the middle of playback', () => {
    expect(findActiveSentenceIndex(mockSegments, 4.5)).toBe(1);
    expect(findActiveSentenceIndex(mockSegments, 7.8)).toBe(1);
    expect(findActiveSentenceIndex(mockSegments, 10.0)).toBe(2);
    expect(findActiveSentenceIndex(mockSegments, 14.5)).toBe(2);
  });

  it('returns the final segment when position is beyond the last start_seconds', () => {
    expect(findActiveSentenceIndex(mockSegments, 18.2)).toBe(3);
    expect(findActiveSentenceIndex(mockSegments, 22.0)).toBe(3);
    expect(findActiveSentenceIndex(mockSegments, 30.0)).toBe(3);
  });

  it('parses raw database transcript rows correctly', () => {
    const rawTranscript = {
      id: 't-1',
      track_id: 'tr-1',
      full_text: 'Hello world. Welcome to Zukai.',
      language: 'english' as const,
      created_at: new Date().toISOString(),
      segments: [
        { text: 'Hello world.', start_seconds: 0, end_seconds: 2 },
        { text: 'Welcome to Zukai.', start_seconds: 2, end_seconds: 5 },
      ],
    };

    const parsed = parseTranscriptSegments(rawTranscript);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].text).toBe('Hello world.');
    expect(parsed[1].start_seconds).toBe(2);
  });
});
