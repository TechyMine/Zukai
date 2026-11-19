/**
 * ZUKAI WORKER STARTUP VALIDATOR & SYSTEM HEALTH
 * Location: /worker/src/startup.ts
 *
 * Implements "Fail Fast and Visibly":
 * Validates ALL configs, prompts, dictionaries, voices, and required external binaries
 * (ffmpeg, ffprobe, libmp3lame) at process start BEFORE accepting work.
 * If anything is missing or invalid, logs one clear structured error and exits non-zero.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config, VOICE_CONFIG } from './config.js';
import { loadRegistryConfig } from './ai/registry.js';
import { SYSTEM_PROMPT_ENGLISH, SYSTEM_PROMPT_HINGLISH } from './intelligence/styleGuidePrompts.js';
import { HINGLISH_SPELLING_DICTIONARY, HINGLISH_FORMAL_STOPLIST } from './hinglish/glossary.js';
import { supabaseAdmin } from './supabase/client.js';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  diagnostics: {
    ffmpegVersion?: string;
    ffprobeVersion?: string;
    libmp3lameSupported: boolean;
    modelsConfigured: number;
    databaseConnected: boolean;
    queueAccessible: boolean;
  };
}

let startupValidationPassed = false;
let lastValidationResult: ValidationResult | null = null;

export function isSystemReady(): boolean {
  return startupValidationPassed;
}

export function getLastValidationResult(): ValidationResult | null {
  return lastValidationResult;
}

/**
 * Validates external binaries (ffmpeg, ffprobe, libmp3lame)
 */
async function validateBinaries(): Promise<{
  errors: string[];
  ffmpegVersion?: string;
  ffprobeVersion?: string;
  libmp3lameSupported: boolean;
}> {
  const errors: string[] = [];
  let ffmpegVersion: string | undefined;
  let ffprobeVersion: string | undefined;
  let libmp3lameSupported = false;

  // 1. Check ffmpeg
  const ffmpegBin = config.FFMPEG_PATH || 'ffmpeg';
  try {
    const { stdout } = await execFileAsync(ffmpegBin, ['-version']);
    const firstLine = stdout.split('\n')[0] || '';
    ffmpegVersion = firstLine.trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`ffmpeg binary check failed (${ffmpegBin}): ${msg}`);
  }

  // 2. Check ffprobe
  const ffprobeBin = config.FFPROBE_PATH || 'ffprobe';
  try {
    const { stdout } = await execFileAsync(ffprobeBin, ['-version']);
    const firstLine = stdout.split('\n')[0] || '';
    ffprobeVersion = firstLine.trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`ffprobe binary check failed (${ffprobeBin}): ${msg}`);
  }

  // 3. Check libmp3lame encoder support
  if (!errors.some((e) => e.includes('ffmpeg binary check failed'))) {
    try {
      const { stdout } = await execFileAsync(ffmpegBin, ['-encoders']);
      if (stdout.includes('libmp3lame')) {
        libmp3lameSupported = true;
      } else {
        errors.push(`ffmpeg is installed but lacks 'libmp3lame' encoder support for MP3 synthesis.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to verify ffmpeg encoders: ${msg}`);
    }
  }

  return { errors, ffmpegVersion, ffprobeVersion, libmp3lameSupported };
}

/**
 * Validates database and queue connectivity
 */
async function validateSupabase(): Promise<{
  errors: string[];
  databaseConnected: boolean;
  queueAccessible: boolean;
}> {
  const errors: string[] = [];
  let databaseConnected = false;
  let queueAccessible = false;

  // Check plans table query
  try {
    const { error } = await supabaseAdmin.from('plans').select('tier').limit(1);
    if (error) {
      errors.push(`Supabase database connection failed: ${error.message} (${error.code})`);
    } else {
      databaseConnected = true;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Supabase client error: ${msg}`);
  }

  // Check audio_jobs / queue table query
  try {
    const { error } = await supabaseAdmin.from('audio_jobs').select('id').limit(1);
    if (error) {
      errors.push(`Supabase audio_jobs queue access failed: ${error.message} (${error.code})`);
    } else {
      queueAccessible = true;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Supabase queue query error: ${msg}`);
  }

  return { errors, databaseConnected, queueAccessible };
}

/**
 * Validates all prompts, dictionaries, voices, and model configurations
 */
function validateAssets(): { errors: string[]; modelsCount: number } {
  const errors: string[] = [];
  let modelsCount = 0;

  // 1. Models config
  try {
    const registryConfig = loadRegistryConfig();
    modelsCount = registryConfig.models.length;
    if (modelsCount === 0) {
      errors.push('No models configured in registry.');
    }
    const hasEnabledVoice = registryConfig.models.some((m) => m.kind === 'tts' && m.enabled);
    if (!hasEnabledVoice) {
      errors.push('No enabled TTS models configured in registry.');
    }
    const hasEnabledText = registryConfig.models.some((m) => m.kind === 'text' && m.enabled);
    if (!hasEnabledText) {
      errors.push('No enabled text models configured in registry.');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Registry modelsConfig validation failed: ${msg}`);
  }

  // 2. Prompts
  if (!SYSTEM_PROMPT_ENGLISH || SYSTEM_PROMPT_ENGLISH.length < 50) {
    errors.push('SYSTEM_PROMPT_ENGLISH is missing or empty.');
  }
  if (!SYSTEM_PROMPT_HINGLISH || SYSTEM_PROMPT_HINGLISH.length < 50) {
    errors.push('SYSTEM_PROMPT_HINGLISH is missing or empty.');
  }

  // 3. Hinglish dictionaries
  if (!HINGLISH_SPELLING_DICTIONARY || Object.keys(HINGLISH_SPELLING_DICTIONARY).length === 0) {
    errors.push('HINGLISH_SPELLING_DICTIONARY is missing or empty.');
  }
  if (!HINGLISH_FORMAL_STOPLIST || Object.keys(HINGLISH_FORMAL_STOPLIST).length === 0) {
    errors.push('HINGLISH_FORMAL_STOPLIST is missing or empty.');
  }

  // 4. Voice mappings
  if (!VOICE_CONFIG || Object.keys(VOICE_CONFIG).length === 0) {
    errors.push('VOICE_CONFIG is missing or empty.');
  }

  return { errors, modelsCount };
}

/**
 * Runs full pre-flight startup validation.
 * If exitOnError is true, logs one clear error and terminates with code 1.
 */
export async function runStartupValidation(exitOnError = true): Promise<ValidationResult> {
  logger.info('[STARTUP] Initiating comprehensive pre-flight validation...');

  const allErrors: string[] = [];
  const warnings: string[] = [];

  // Check GEMINI_API_KEY
  if (!config.GEMINI_API_KEY || config.GEMINI_API_KEY.length < 10) {
    warnings.push('GEMINI_API_KEY is not configured or too short. AI synthesis calls will fail until set.');
  }

  // 1. Assets and configs
  const assetValidation = validateAssets();
  allErrors.push(...assetValidation.errors);

  // 2. Binaries
  const binaryValidation = await validateBinaries();
  allErrors.push(...binaryValidation.errors);

  // 3. Supabase & Queue connectivity
  const dbValidation = await validateSupabase();
  allErrors.push(...dbValidation.errors);

  const isValid = allErrors.length === 0;
  startupValidationPassed = isValid;

  lastValidationResult = {
    valid: isValid,
    errors: allErrors,
    warnings,
    diagnostics: {
      ffmpegVersion: binaryValidation.ffmpegVersion,
      ffprobeVersion: binaryValidation.ffprobeVersion,
      libmp3lameSupported: binaryValidation.libmp3lameSupported,
      modelsConfigured: assetValidation.modelsCount,
      databaseConnected: dbValidation.databaseConnected,
      queueAccessible: dbValidation.queueAccessible,
    },
  };

  if (!isValid) {
    logger.fatal(
      {
        errors: allErrors,
        diagnostics: lastValidationResult.diagnostics,
      },
      '[STARTUP FATAL] Pre-flight validation failed. Cannot start worker with invalid or missing dependencies.'
    );

    if (exitOnError) {
      console.error('\n======================================================');
      console.error('FATAL: ZUKAI WORKER PRE-FLIGHT VALIDATION FAILED');
      console.error('======================================================');
      allErrors.forEach((err, idx) => {
        console.error(`  [${idx + 1}] ${err}`);
      });
      console.error('======================================================\n');
      process.exit(1);
    }
  } else {
    logger.info(
      {
        diagnostics: lastValidationResult.diagnostics,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
      '[STARTUP] Pre-flight validation passed successfully. Worker is ready.'
    );
  }

  return lastValidationResult;
}
