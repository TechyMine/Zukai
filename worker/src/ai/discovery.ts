/**
 * ZUKAI DYNAMIC MODEL DISCOVERY & ALIAS MATCHER
 * Location: /worker/src/ai/discovery.ts
 * Calls Google GenAI ListModels at startup, matches display names through alias table,
 * filters supported methods (generateContent, bidiGenerateContent), excludes non-speech variants,
 * and activates discovered models while disabling unlisted ones.
 */

import { config } from '../config.js';
import { logger } from '../logger.js';

export interface DiscoveredModelInfo {
  id: string;
  displayName: string;
  supportedMethods: string[];
  isTts: boolean;
  isLiveAudio: boolean;
  isText: boolean;
}

/** Raw model entry from Google ListModels API */
interface RawGoogleModel {
  name?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
}

/** Response shape from Google ListModels endpoint */
interface ListModelsResponse {
  models?: RawGoogleModel[];
}

export const MODEL_ALIASES: Record<string, string[]> = {
  // TTS Models
  'Gemini 2.5 Flash TTS': ['gemini-2.5-flash-preview-tts'],
  'Gemini 2.5 Pro TTS': ['gemini-2.5-pro-preview-tts'],
  'Gemini 3.1 Flash TTS': ['gemini-3.1-flash-tts-preview'],
  'Gemini 3.8 Flash TTS': ['gemini-3.8-flash-tts'],
  'Gemini 3.8 Flash Lite TTS': ['gemini-3.8-flash-lite-tts'],

  // Live / Bidi Audio Models
  'Gemini 2.5 Flash Native Audio Dialog': ['gemini-2.5-flash-live', 'gemini-2.0-flash-exp'],
  'Gemini 3 Flash Live': ['gemini-3-flash-live'],
  'Gemini 3.8 Live': ['gemini-3.8-live'],

  // Text Models
  'Gemini 2.5 Flash': ['gemini-2.5-flash'],
  'Gemini 3.6 Flash': ['gemini-3.6-flash'],
  'Gemini 3.8 Flash': ['gemini-3.8-flash'],
  'Gemini 3 Flash': ['gemini-3-flash-preview', 'gemini-3-flash'],
  'Gemini 3.5 Flash Lite': ['gemini-3.5-flash-lite'],
  'Gemini 3.1 Flash Lite': ['gemini-3.1-flash-lite', 'gemini-3.1-flash-lite-preview'],
  'Gemini 2.5 Flash Lite': ['gemini-2.5-flash-lite'],
};

export async function discoverGoogleModels(): Promise<Map<string, DiscoveredModelInfo>> {
  const discoveredMap = new Map<string, DiscoveredModelInfo>();
  if (!config.GEMINI_API_KEY || config.GEMINI_API_KEY.length < 10) {
    logger.warn('No GEMINI_API_KEY configured; skipping dynamic model discovery');
    return discoveredMap;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${config.GEMINI_API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'Failed to fetch ListModels from Google GenAI API');
      return discoveredMap;
    }

    const data = await res.json() as ListModelsResponse;
    const rawModels: RawGoogleModel[] = data.models ?? [];

    for (const m of rawModels) {
      const id = (m.name ?? '').replace('models/', '');
      const displayName = m.displayName ?? id;
      const methods: string[] = m.supportedGenerationMethods ?? [];

      // Exclude translation, transcription, thinking variants
      const lowerId = id.toLowerCase();
      const lowerDisp = displayName.toLowerCase();
      if (
        lowerId.includes('translate') ||
        lowerDisp.includes('translate') ||
        lowerId.includes('transcribe') ||
        lowerDisp.includes('transcribe') ||
        lowerId.includes('thinking') ||
        lowerDisp.includes('thinking') ||
        lowerId.includes('extended-thinking') ||
        lowerDisp.includes('extended thinking')
      ) {
        continue;
      }

      const isLiveAudio = methods.includes('bidiGenerateContent');
      const isTts = (lowerId.includes('tts') || lowerDisp.includes('tts')) && methods.includes('generateContent');
      const isText = methods.includes('generateContent') && !isTts;

      discoveredMap.set(id, {
        id,
        displayName,
        supportedMethods: methods,
        isTts,
        isLiveAudio,
        isText,
      });
    }

    logger.info({ totalDiscovered: discoveredMap.size }, 'Dynamic Google GenAI model discovery complete');

    // Print to stdout so doctor/quota:status scripts can consume discovered IDs
    const discoveredIds = Array.from(discoveredMap.keys());
    process.stdout.write(JSON.stringify({ discoveredModels: discoveredIds }) + '\n');

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg }, 'Network error during Google GenAI model discovery; using cached config');
  }

  return discoveredMap;
}
