/**
 * Google GenAI & RPC Error Classifier
 * Parses structured google.rpc.RetryInfo, QuotaFailure, HTTP status codes,
 * and classifies errors into quota, transient, misconfigured, or content_blocked.
 */

export type QuotaKind = 'rpm' | 'tpm' | 'rpd' | 'unknown_quota';

export type ErrorClassificationType = 
  | 'quota'
  | 'transient'
  | 'misconfigured'
  | 'content_blocked'
  | 'unknown';

export interface ClassifiedError {
  type: ErrorClassificationType;
  quotaKind?: QuotaKind;
  retryDelaySeconds?: number;
  quotaMetric?: string;
  quotaValue?: number;
  quotaId?: string;
  reason: string;
  isMisconfigured: boolean;
  canRetryLater: boolean;
}

/**
 * Parse duration strings like "55164s", "55164.21s", or numbers
 */
function parseDurationToSeconds(val: any): number | undefined {
  if (typeof val === 'number') return Math.max(0, Math.round(val));
  if (typeof val === 'string') {
    const match = val.match(/^([0-9]+(?:\.[0-9]+)?)s?$/i);
    if (match) return Math.max(0, Math.round(parseFloat(match[1])));
  }
  return undefined;
}

/**
 * Fallback regex parsing on human-readable error messages:
 * e.g. "retry in 15h19m", "retry in 45s", "Resource has been exhausted (rate limit)..."
 */
function parseMessageRetryHint(message: string): number | undefined {
  // Check hours + minutes: "retry in 15h19m" or "retry in 15h 19m"
  const hmMatch = message.match(/retry in\s+([0-9]+)h\s*([0-9]+)m/i);
  if (hmMatch) {
    const hours = parseInt(hmMatch[1], 10);
    const mins = parseInt(hmMatch[2], 10);
    return hours * 3600 + mins * 60;
  }

  // Check hours only: "retry in 2h"
  const hMatch = message.match(/retry in\s+([0-9]+)h/i);
  if (hMatch) {
    return parseInt(hMatch[1], 10) * 3600;
  }

  // Check minutes only: "retry in 15m"
  const mMatch = message.match(/retry in\s+([0-9]+)m/i);
  if (mMatch) {
    return parseInt(mMatch[1], 10) * 60;
  }

  // Check seconds: "retry in 45s" or "retry in 45 seconds"
  const sMatch = message.match(/retry in\s+([0-9]+)(?:\s*s|\s*seconds)/i);
  if (sMatch) {
    return parseInt(sMatch[1], 10);
  }

  return undefined;
}

/**
 * Classify a Google RPC / REST / Network error into a structured ClassifiedError
 */
export function classifyGoogleError(err: any): ClassifiedError {
  const message = (err?.message || String(err) || '').trim();
  const status = err?.status || err?.statusCode || err?.response?.status;
  
  // Check for HTTP 404 (Model not found / Invalid path)
  if (status === 404 || message.includes('404') || message.includes('models/') && message.includes('not found')) {
    return {
      type: 'misconfigured',
      reason: `Model not found or unsupported endpoint (404): ${message}`,
      isMisconfigured: true,
      canRetryLater: false,
    };
  }

  // Check for HTTP 400 Bad Request with unsupported WebSocket / method
  if (
    status === 400 && (
      message.includes('bidiGenerateContent') ||
      message.includes('WebSocket') ||
      message.includes('not supported') ||
      message.includes('Unsupported method') ||
      message.includes('API version')
    )
  ) {
    return {
      type: 'misconfigured',
      reason: `Unsupported method or endpoint configuration (400): ${message}`,
      isMisconfigured: true,
      canRetryLater: false,
    };
  }

  // Check for Content Blocked / Safety
  if (
    message.includes('SAFETY') ||
    message.includes('BLOCKED') ||
    message.includes('RECITATION') ||
    message.includes('HARM_CATEGORY')
  ) {
    return {
      type: 'content_blocked',
      reason: `Content blocked by Google safety filters: ${message}`,
      isMisconfigured: false,
      canRetryLater: false,
    };
  }

  // Check for Transient 5xx / Network / Timeout errors
  const isNetwork = 
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    message.includes('fetch failed') ||
    message.includes('ETIMEDOUT') ||
    message.includes('ECONNRESET') ||
    message.includes('network timeout') ||
    message.includes('timed out');

  if (isNetwork && !message.includes('429') && !message.includes('RESOURCE_EXHAUSTED')) {
    return {
      type: 'transient',
      reason: `Transient network or upstream 5xx error: ${message}`,
      isMisconfigured: false,
      canRetryLater: true,
      retryDelaySeconds: 5 + Math.round(Math.random() * 5),
    };
  }

  // Check for 429 Quota / Resource Exhausted
  const isQuota =
    status === 429 ||
    message.includes('429') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('Quota exceeded') ||
    message.includes('rate limit');

  if (isQuota) {
    let retryDelaySeconds: number | undefined;
    let quotaId: string | undefined;
    let quotaMetric: string | undefined;
    let quotaValue: number | undefined;

    // 1. Inspect error.errorDetails or error.details (standard Google RPC array)
    const details = err?.errorDetails || err?.details || err?.response?.data?.error?.details || [];
    if (Array.isArray(details)) {
      for (const d of details) {
        // RetryInfo
        if (d?.['@type']?.includes('RetryInfo') || d?.type?.includes('RetryInfo')) {
          const delay = parseDurationToSeconds(d.retryDelay);
          if (delay !== undefined) {
            retryDelaySeconds = delay;
          }
        }
        // QuotaFailure
        if (d?.['@type']?.includes('QuotaFailure') || d?.type?.includes('QuotaFailure')) {
          const violations = d.violations || [];
          if (violations.length > 0) {
            const v = violations[0];
            quotaId = v.quotaId || v.description;
            quotaMetric = v.quotaMetric;
            if (v.quotaValue !== undefined) {
              const numVal = parseInt(String(v.quotaValue), 10);
              if (!isNaN(numVal)) quotaValue = numVal;
            }
          }
        }
      }
    }

    // Fallback: parse retry hint from message text if no structured RetryInfo
    if (retryDelaySeconds === undefined) {
      retryDelaySeconds = parseMessageRetryHint(message);
    }

    // Determine Quota Kind
    let quotaKind: QuotaKind = 'unknown_quota';
    const checkTarget = `${quotaId || ''} ${message}`.toLowerCase();

    if (checkTarget.includes('perday') || checkTarget.includes('daily') || checkTarget.includes('requestsperday')) {
      quotaKind = 'rpd';
    } else if (
      checkTarget.includes('token') ||
      checkTarget.includes('inputtoken') ||
      checkTarget.includes('tokensperminute')
    ) {
      quotaKind = 'tpm';
    } else if (
      checkTarget.includes('perminute') ||
      checkTarget.includes('requestsperminute') ||
      checkTarget.includes('rpm')
    ) {
      quotaKind = 'rpm';
    } else if (retryDelaySeconds && retryDelaySeconds > 3600) {
      // Long retry delay implies daily exhaustion
      quotaKind = 'rpd';
    }

    // Compute appropriate cooldown:
    // If server gave retryDelay, add small jitter (2-5s)
    let finalCooldown = 60;
    if (retryDelaySeconds !== undefined && retryDelaySeconds > 0) {
      finalCooldown = retryDelaySeconds + Math.round(Math.random() * 5);
    } else if (quotaKind === 'rpd') {
      // If daily with no explicit hint, calculate seconds until Pacific midnight
      finalCooldown = getSecondsUntilPacificMidnight();
    } else {
      // Minute window with no hint defaults to 60s + jitter
      finalCooldown = 60 + Math.round(Math.random() * 5);
    }

    return {
      type: 'quota',
      quotaKind,
      retryDelaySeconds: finalCooldown,
      quotaMetric,
      quotaValue,
      quotaId,
      reason: `Google API Quota limit (${quotaKind}): ${message}`,
      isMisconfigured: false,
      canRetryLater: true,
    };
  }

  // Catch-all unknown
  return {
    type: 'unknown',
    reason: message,
    isMisconfigured: false,
    canRetryLater: false,
  };
}

/**
 * Calculates seconds until 00:00 PST / 08:00 UTC (Google API daily quota reset)
 */
export function getSecondsUntilPacificMidnight(): number {
  const now = new Date();
  const resetUtc = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    8, 0, 0, 0
  ));
  
  if (now.getTime() >= resetUtc.getTime()) {
    resetUtc.setUTCDate(resetUtc.getUTCDate() + 1);
  }

  const diffSec = Math.max(60, Math.round((resetUtc.getTime() - now.getTime()) / 1000));
  return diffSec;
}
