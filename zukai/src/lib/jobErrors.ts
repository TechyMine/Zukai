/**
 * ZUKAI JOB ERROR MAPPER & PATH SANITIZER
 * Location: /zukai/src/lib/jobErrors.ts
 *
 * Implements Stage A6 User Protection:
 * - Shows friendly text by error_code ONLY (strictly ignores raw server free-text messages)
 * - Guarantees that internal file paths or stack traces are NEVER displayed to users
 * - Provides short, copyable support references
 * - Identifies the exact failed stage in the 5-step pipeline
 */

export const FRIENDLY_JOB_ERRORS: Record<string, string> = {
  CONFIG_ERROR: 'We hit a problem on our side. We are on it. Please retry in a few minutes.',
  INTERNAL_ERROR: 'We hit a problem on our side. We are on it. Please retry in a few minutes.',
  INTERNAL: 'We hit a problem on our side. We are on it. Please retry in a few minutes.',
  BAD_CONFIG: 'We hit a problem on our side. We are on it. Please retry in a few minutes.',
  PASSWORD_PROTECTED: 'This document is encrypted or password-protected. Please remove the password and try again.',
  CONTENT_BLOCKED: 'Processing could not proceed due to automated content and safety review.',
  AI_UNAVAILABLE: 'The AI explanation engine is experiencing high demand. Please try again in a moment.',
  SCANNED_NO_TEXT: 'No readable text was found in this document. Please ensure it is not an unreadable scan.',
  EMPTY_DOCUMENT: 'The uploaded document contains no text.',
  UNSUPPORTED_FILE: 'This file format is not supported. Please upload a PDF, DOCX, PPTX, or TXT document.',
  TOO_MANY_PAGES: 'The document exceeds the page limit for your plan.',
  DOCUMENT_TOO_LONG: 'The document exceeds the word limit for your plan.',
  TTS_FAILED: 'Voice narration encountered a temporary issue. Please try again.',
  ASSEMBLY_FAILED: 'Audio mastering encountered an issue. Please try again.',
  STORAGE_ERROR: 'A temporary storage issue occurred while processing your audio. Please try again.',
  TIMEOUT: 'The processing request timed out. Please try again with a shorter document.',
  CANCELED: 'The explanation was canceled.',
};

export const DEFAULT_FRIENDLY_ERROR =
  'We hit a problem on our side. We are on it. Please retry in a few minutes.';

/**
 * Checks if a string contains internal filesystem paths, stack frames, or source files.
 */
export function containsInternalLeak(text: string | null | undefined): boolean {
  if (!text) return false;
  // Match Unix paths (/app/dist...), Windows paths (C:\...), source files (.js, .ts, .json), or stack traces (at Module...)
  return (
    /[\\/](app|dist|src|node_modules|Users)[\\/]/.test(text) ||
    /\.(json|js|ts|mjs|cjs)\b/.test(text) ||
    /\b(at\s+[a-zA-Z0-9_.]+\s+\()/.test(text) ||
    /ENOENT|EACCES|EPERM/.test(text)
  );
}

/**
 * Resolves a safe, friendly user-facing message from error_code.
 * If rawMessage is passed, it is strictly validated; if it contains any internal path leak,
 * it is discarded and replaced with the safe friendly error.
 */
export function getFriendlyJobErrorMessage(
  errorCode?: string | null,
  rawMessage?: string | null
): string {
  if (errorCode && FRIENDLY_JOB_ERRORS[errorCode]) {
    return FRIENDLY_JOB_ERRORS[errorCode];
  }

  // If rawMessage was provided but contains internal paths or errors, NEVER show it
  if (rawMessage && !containsInternalLeak(rawMessage) && rawMessage.length < 120) {
    return rawMessage;
  }

  return DEFAULT_FRIENDLY_ERROR;
}

/**
 * Formats the short support reference code (first 8 characters of the job ID).
 * e.g. "a306624c" -> "A306624C"
 */
export function formatSupportReference(jobId?: string | null): string {
  if (!jobId) return 'SUPPORT';
  return jobId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
}

/**
 * Determines which stage (0 to 4) failed in the 5-step pipeline:
 * 0: reading
 * 1: understanding
 * 2: writing
 * 3: recording
 * 4: final_touches
 */
export function getFailedStageIndex(
  progress = 0,
  currentStep = '',
  errorCode = ''
): number {
  const stepLower = currentStep.toLowerCase();
  const codeLower = errorCode.toLowerCase();

  if (
    codeLower.includes('scanned') ||
    codeLower.includes('password') ||
    codeLower.includes('unsupported') ||
    codeLower.includes('empty') ||
    stepLower.includes('extract') ||
    stepLower.includes('download') ||
    stepLower.includes('read')
  ) {
    return 0; // Reading
  }

  if (stepLower.includes('outline') || stepLower.includes('concept') || stepLower.includes('understand')) {
    return 1; // Understanding
  }

  if (stepLower.includes('script') || stepLower.includes('analog') || stepLower.includes('draft')) {
    return 2; // Writing
  }

  if (codeLower.includes('tts') || stepLower.includes('voice') || stepLower.includes('synthesiz') || stepLower.includes('record')) {
    return 3; // Recording
  }

  if (codeLower.includes('assembly') || stepLower.includes('master') || stepLower.includes('upload') || stepLower.includes('final')) {
    return 4; // Final Touches
  }

  // Fallback by progress percentage
  if (progress < 20) return 0;
  if (progress < 40) return 1;
  if (progress < 65) return 2;
  if (progress < 90) return 3;
  return 4;
}
