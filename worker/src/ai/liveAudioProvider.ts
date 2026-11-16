/**
 * ZUKAI LIVE AUDIO PROVIDER & VERBATIM GUARD
 * Location: /worker/src/ai/liveAudioProvider.ts
 * Uses Gemini Live / Audio Dialog models as high-volume fallback for TTS narration
 * with strict verbatim verification (Word Error Rate <= 8%).
 */

import { config } from '../config.js';
import { logger } from '../logger.js';
import { WorkerError, WORKER_ERROR_CODES } from '../errors.js';
import { pcmToWav } from '../synthesis/ttsEngine.js';

export interface LiveAudioResult {
  pcmBuffer: Buffer;
  wavBuffer: Buffer;
  transcription?: string;
  wer: number;
  durationSeconds: number;
}

/**
 * Normalizes text for verbatim word comparison
 */
function normalizeTextForWer(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Computes Levenshtein-based Word Error Rate (WER) between reference and hypothesis
 */
export function calculateWordErrorRate(reference: string, hypothesis: string): number {
  const r = normalizeTextForWer(reference);
  const h = normalizeTextForWer(hypothesis);

  if (r.length === 0) return h.length === 0 ? 0 : 1;
  if (h.length === 0) return 1;

  const dp: number[][] = Array.from({ length: r.length + 1 }, () =>
    new Array(h.length + 1).fill(0)
  );

  for (let i = 0; i <= r.length; i++) dp[i][0] = i;
  for (let j = 0; j <= h.length; j++) dp[0][j] = j;

  for (let i = 1; i <= r.length; i++) {
    for (let j = 1; j <= h.length; j++) {
      if (r[i - 1] === h[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }

  return dp[r.length][h.length] / r.length;
}

/**
 * Calls Gemini with AUDIO response modality using the Live Audio / Dialog model family
 */
export async function callGeminiLiveAudio(
  modelId: string,
  text: string,
  voiceName: string,
  strictRetry = false
): Promise<LiveAudioResult> {
  const systemPrompt = strictRetry
    ? 'CRITICAL SYSTEM INSTRUCTION: You are a strict text-to-speech synthesizer. Output audio ONLY. Read the following text VERBATIM without adding, omitting, explaining, or repeating any words.'
    : 'You are a text-to-speech reader. Read the provided text exactly, word for word, in a calm friendly teaching voice. Do not add, skip, summarize or comment. Output audio only.';

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${config.GEMINI_API_KEY}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `Read aloud: ${text}` }],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voiceName || 'Puck',
          },
        },
      },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) {
      throw new WorkerError(
        WORKER_ERROR_CODES.AI_UNAVAILABLE,
        `Live Audio model ${modelId} rate limited: ${errText}`,
        true
      );
    }
    throw new WorkerError(
      WORKER_ERROR_CODES.AI_UNAVAILABLE,
      `Live Audio model ${modelId} HTTP ${res.status}: ${errText}`,
      true
    );
  }

  const json: any = await res.json();
  const part = json?.candidates?.[0]?.content?.parts?.[0];

  if (!part?.inlineData?.data) {
    throw new WorkerError(
      WORKER_ERROR_CODES.AI_UNAVAILABLE,
      `Live Audio model ${modelId} returned no audio data`,
      true
    );
  }

  const pcmBuffer = Buffer.from(part.inlineData.data, 'base64');
  const wavBuffer = pcmToWav(pcmBuffer, 24000, 1, 16);

  // Compute duration (24000 samples/sec, 16-bit = 2 bytes/sample)
  const durationSeconds = pcmBuffer.length / (24000 * 2);

  // Extract transcription if model provided one
  const transcriptionPart = json?.candidates?.[0]?.content?.parts?.find((p: any) => p.text);
  const transcription = transcriptionPart?.text || '';

  // Verbatim guard
  let wer = 0;
  if (transcription) {
    wer = calculateWordErrorRate(text, transcription);
    logger.info({ modelId, wer: wer.toFixed(3), durationSeconds }, 'Verbatim guard evaluated');

    if (wer > 0.08 && !strictRetry) {
      logger.warn({ modelId, wer: wer.toFixed(3) }, 'Verbatim guard failed, retrying with strict instruction');
      return callGeminiLiveAudio(modelId, text, voiceName, true);
    }
  }

  return {
    pcmBuffer,
    wavBuffer,
    transcription,
    wer,
    durationSeconds,
  };
}
