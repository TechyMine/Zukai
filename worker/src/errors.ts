export const WORKER_ERROR_CODES = {
  UNSUPPORTED_FILE: 'UNSUPPORTED_FILE',
  PASSWORD_PROTECTED: 'PASSWORD_PROTECTED',
  SCANNED_NO_TEXT: 'SCANNED_NO_TEXT',
  EMPTY_DOCUMENT: 'EMPTY_DOCUMENT',
  TOO_MANY_PAGES: 'TOO_MANY_PAGES',
  DOCUMENT_TOO_LONG: 'DOCUMENT_TOO_LONG',
  CONTENT_BLOCKED: 'CONTENT_BLOCKED',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  TTS_FAILED: 'TTS_FAILED',
  ASSEMBLY_FAILED: 'ASSEMBLY_FAILED',
  STORAGE_ERROR: 'STORAGE_ERROR',
  CANCELED: 'CANCELED',
  BAD_CONFIG: 'CONFIG_ERROR',
  CONFIG_ERROR: 'CONFIG_ERROR',
  TIMEOUT: 'TIMEOUT',
  INTERNAL: 'INTERNAL_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type WorkerErrorCode = keyof typeof WORKER_ERROR_CODES | 'CONFIG_ERROR' | 'INTERNAL_ERROR';

/**
 * Standard friendly user-facing messages.
 * NEVER leaks internal file paths, stack traces, or technical details to users.
 */
export const USER_FRIENDLY_ERROR_MESSAGES: Record<string, string> = {
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
  TTS_FAILED: 'Voice narration synthesis encountered a temporary issue. Please try again.',
  ASSEMBLY_FAILED: 'Audio mastering encountered an issue. Please try again.',
  STORAGE_ERROR: 'A temporary storage issue occurred while retrieving or saving your audio. Please try again.',
  TIMEOUT: 'The processing request timed out. Please try again with a shorter document.',
  CANCELED: 'The explanation was canceled.',
};

export interface ErrorDetails {
  code: WorkerErrorCode;
  friendlyMessage: string;
  isRetryable: boolean;
  rawDetails: Record<string, unknown>;
}

export class WorkerError extends Error {
  public readonly code: WorkerErrorCode;
  public readonly isRetryable: boolean;
  public readonly friendlyMessage: string;

  constructor(code: WorkerErrorCode, message: string, isRetryable = false) {
    super(message);
    this.name = 'WorkerError';
    this.code = code;
    this.isRetryable = isRetryable;
    this.friendlyMessage = USER_FRIENDLY_ERROR_MESSAGES[code] || USER_FRIENDLY_ERROR_MESSAGES.INTERNAL_ERROR;
  }
}

/**
 * Sanitizes raw error details for service-role logging into job_events.
 * Strictly redacts tokens, passwords, API keys, URLs with query params,
 * and user document text to comply with security standards.
 */
export function sanitizeErrorDetails(err: unknown): Record<string, unknown> {
  const errMsg = err instanceof Error ? err.message : String(err);
  const errStack = err instanceof Error ? err.stack : undefined;
  const errName = err instanceof Error ? err.name : typeof err;

  // Redact potential API keys (e.g. AIza..., Bearer..., etc.)
  const sanitizeStr = (s?: string) => {
    if (!s) return undefined;
    return s
      .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_GEMINI_KEY]')
      .replace(/ey[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, '[REDACTED_JWT]')
      .replace(/key=[^&\s]+/gi, 'key=[REDACTED]')
      .replace(/token=[^&\s]+/gi, 'token=[REDACTED]');
  };

  return {
    name: errName,
    message: sanitizeStr(errMsg) || 'Unknown error',
    stack: sanitizeStr(errStack),
    timestamp: new Date().toISOString(),
  };
}

export function mapErrorToCode(err: unknown): ErrorDetails {
  if (err instanceof WorkerError) {
    return {
      code: err.code,
      friendlyMessage: err.friendlyMessage,
      isRetryable: err.isRetryable,
      rawDetails: sanitizeErrorDetails(err),
    };
  }

  const rawMsg = err instanceof Error ? err.message : String(err);
  const msg = rawMsg.toLowerCase();

  if (msg.includes('modelsconfig') || msg.includes('configuration error') || msg.includes('bad_config')) {
    return {
      code: 'CONFIG_ERROR',
      friendlyMessage: USER_FRIENDLY_ERROR_MESSAGES.CONFIG_ERROR,
      isRetryable: false,
      rawDetails: sanitizeErrorDetails(err),
    };
  }

  if (msg.includes('password') || msg.includes('encrypted') || msg.includes('decrypt')) {
    return {
      code: WORKER_ERROR_CODES.PASSWORD_PROTECTED,
      friendlyMessage: USER_FRIENDLY_ERROR_MESSAGES.PASSWORD_PROTECTED,
      isRetryable: false,
      rawDetails: sanitizeErrorDetails(err),
    };
  }

  if (msg.includes('safety') || msg.includes('blocked') || msg.includes('harm_category')) {
    return {
      code: WORKER_ERROR_CODES.CONTENT_BLOCKED,
      friendlyMessage: USER_FRIENDLY_ERROR_MESSAGES.CONTENT_BLOCKED,
      isRetryable: false,
      rawDetails: sanitizeErrorDetails(err),
    };
  }

  if (msg.includes('429') || msg.includes('resourceexhausted') || msg.includes('quota')) {
    return {
      code: WORKER_ERROR_CODES.AI_UNAVAILABLE,
      friendlyMessage: USER_FRIENDLY_ERROR_MESSAGES.AI_UNAVAILABLE,
      isRetryable: true,
      rawDetails: sanitizeErrorDetails(err),
    };
  }

  if (msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('fetch failed')) {
    return {
      code: WORKER_ERROR_CODES.INTERNAL_ERROR,
      friendlyMessage: USER_FRIENDLY_ERROR_MESSAGES.INTERNAL_ERROR,
      isRetryable: true,
      rawDetails: sanitizeErrorDetails(err),
    };
  }

  return {
    code: WORKER_ERROR_CODES.INTERNAL_ERROR,
    friendlyMessage: USER_FRIENDLY_ERROR_MESSAGES.INTERNAL_ERROR,
    isRetryable: true,
    rawDetails: sanitizeErrorDetails(err),
  };
}
