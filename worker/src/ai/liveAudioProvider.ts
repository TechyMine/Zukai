/**
 * ZUKAI LIVE AUDIO PROVIDER & VERBATIM GUARD
 * Location: /worker/src/ai/liveAudioProvider.ts
 * Uses Gemini Live / Audio Dialog models via WebSocket bidiGenerateContent streaming
 * with fallback to REST audio generation and strict verbatim verification (Word Error Rate <= 8%).
 */

import { config } from '../config.js';
import { logger } from '../logger.js';
import { WorkerError, WORKER_ERROR_CODES } from '../errors.js';
import { pcmToWav } from '../synthesis/ttsEngine.js';
import { classifyGoogleError } from './errorClassifier.js';

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
 * Calls Gemini Live API using official WebSocket bidiGenerateContent protocol
 */
async function callGeminiLiveWebSocket(
  modelId: string,
  text: string,
  voiceName: string,
  systemPrompt: string
): Promise<{ pcmBuffer: Buffer; transcription: string }> {
  const WebSocketCtor = (globalThis as any).WebSocket;
  if (!WebSocketCtor) {
    throw new WorkerError(
      WORKER_ERROR_CODES.INTERNAL_ERROR,
      'WebSocket is not available in current Node runtime',
      false
    );
  }

  const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${config.GEMINI_API_KEY}`;
  
  return new Promise((resolve, reject) => {
    let ws: any = null;
    const pcmChunks: Buffer[] = [];
    let transcription = '';
    let isFinished = false;

    const timeoutTimer = setTimeout(() => {
      cleanup();
      reject(new WorkerError(WORKER_ERROR_CODES.TIMEOUT, `Live API WebSocket timed out for model ${modelId}`, true));
    }, 45000);

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      if (ws) {
        try { ws.close(); } catch {}
      }
    };

    try {
      ws = new WebSocketCtor(wsUrl);
    } catch (err: any) {
      cleanup();
      return reject(err);
    }

    ws.onopen = () => {
      // Send setup frame
      const setupMsg = {
        setup: {
          model: `models/${modelId}`,
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
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
        },
      };
      ws.send(JSON.stringify(setupMsg));
    };

    ws.onmessage = async (event: any) => {
      try {
        let raw: string;
        if (typeof event.data === 'string') {
          raw = event.data;
        } else if (event.data instanceof Blob || typeof event.data?.text === 'function') {
          raw = await event.data.text();
        } else if (Buffer.isBuffer(event.data)) {
          raw = event.data.toString('utf-8');
        } else if (event.data instanceof ArrayBuffer) {
          raw = Buffer.from(event.data).toString('utf-8');
        } else {
          raw = String(event.data);
        }
        const msg = JSON.parse(raw);

        // When setup completes, send client content
        if (msg.setupComplete) {
          const clientMsg = {
            clientContent: {
              turns: [
                {
                  role: 'user',
                  parts: [{ text: `Read aloud: ${text}` }],
                },
              ],
              turnComplete: true,
            },
          };
          ws.send(JSON.stringify(clientMsg));
          return;
        }

        // Handle model response parts
        const parts = msg.serverContent?.modelTurn?.parts || [];
        for (const p of parts) {
          if (p.inlineData?.data) {
            pcmChunks.push(Buffer.from(p.inlineData.data, 'base64'));
          }
          if (p.text) {
            transcription += p.text;
          }
        }

        if (msg.serverContent?.turnComplete) {
          isFinished = true;
          cleanup();
          const pcmBuffer = Buffer.concat(pcmChunks);
          if (pcmBuffer.length === 0) {
            reject(new WorkerError(WORKER_ERROR_CODES.AI_UNAVAILABLE, `Live API model ${modelId} returned 0 audio bytes`, true));
          } else {
            resolve({ pcmBuffer, transcription });
          }
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    ws.onerror = (err: any) => {
      cleanup();
      reject(new WorkerError(WORKER_ERROR_CODES.AI_UNAVAILABLE, `Live API WebSocket error (${modelId}): ${err?.message || err}`, true));
    };

    ws.onclose = (event: any) => {
      cleanup();
      if (!isFinished) {
        const classified = classifyGoogleError(new Error(`WebSocket closed with code ${event.code}: ${event.reason || 'abnormal closure'}`));
        reject(new WorkerError(
          classified.isMisconfigured ? WORKER_ERROR_CODES.BAD_CONFIG : WORKER_ERROR_CODES.AI_UNAVAILABLE,
          `Live WebSocket closed prematurely: code ${event.code} (${event.reason || 'no reason'})`,
          !classified.isMisconfigured
        ));
      }
    };
  });
}

/**
 * Calls Gemini REST audio generation fallback
 */
async function callGeminiRestAudio(
  modelId: string,
  text: string,
  voiceName: string,
  systemPrompt: string
): Promise<{ pcmBuffer: Buffer; transcription: string }> {
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
    const classified = classifyGoogleError({ status: res.status, message: errText });
    throw new WorkerError(
      classified.isMisconfigured ? WORKER_ERROR_CODES.BAD_CONFIG : WORKER_ERROR_CODES.AI_UNAVAILABLE,
      `Live Audio model ${modelId} HTTP ${res.status}: ${errText}`,
      classified.canRetryLater
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
  const transcriptionPart = json?.candidates?.[0]?.content?.parts?.find((p: any) => p.text);
  const transcription = transcriptionPart?.text || '';

  return { pcmBuffer, transcription };
}

/**
 * Main Live Audio Synthesis with WebSocket primary and REST secondary fallback
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

  let audioOutput: { pcmBuffer: Buffer; transcription: string };

  try {
    audioOutput = await callGeminiLiveWebSocket(modelId, text, voiceName, systemPrompt);
  } catch (wsErr: any) {
    // If WebSocket failed due to network / unhandled method, try REST audio endpoint
    logger.warn({ modelId, err: wsErr?.message }, 'WebSocket Live connection failed, trying REST audio fallback');
    audioOutput = await callGeminiRestAudio(modelId, text, voiceName, systemPrompt);
  }

  const { pcmBuffer, transcription } = audioOutput;
  const wavBuffer = pcmToWav(pcmBuffer, 24000, 1, 16);
  const durationSeconds = pcmBuffer.length / (24000 * 2);

  // Verbatim guard evaluation
  let wer = 0;
  if (transcription) {
    wer = calculateWordErrorRate(text, transcription);
    logger.info({ modelId, wer: wer.toFixed(3), durationSeconds }, 'Verbatim guard evaluated');

    if (wer > 0.08 && !strictRetry) {
      logger.warn({ modelId, wer: wer.toFixed(3) }, 'Verbatim guard failed (>8% WER), retrying with strict instruction');
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
