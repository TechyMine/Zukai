/**
 * ZUKAI QUOTA TRACKER
 * Location: /worker/src/ai/quotaTracker.ts
 * Manages sliding-window request/token consumption, daily limits with Pacific midnight resets,
 * cooldowns from 429 responses, and circuit-breakers.
 */

import { supabaseWorker } from '../supabase/client.js';
import { getModel, getAllModels, getSettings, ModelDefinition } from './registry.js';
import { logger } from '../logger.js';

export interface ModelUsageState {
  modelId: string;
  requestsThisMinute: number;
  tokensThisMinute: number;
  requestsToday: number;
  windowMinuteStart: number;
  windowDayStart: number;
  cooldownUntil: number | null;
  circuitBreakerUntil: number | null;
  consecutiveFailures: number;
  activeRequests: number;
  lastError: string | null;
}

const memoryStates = new Map<string, ModelUsageState>();

/**
 * Calculates start of the current Pacific Day (08:00 UTC = 00:00 PST)
 */
export function getPacificDayStart(now = new Date()): number {
  const d = new Date(now);
  d.setUTCHours(8, 0, 0, 0);
  if (now.getTime() < d.getTime()) {
    // If before 08:00 UTC today, the current Pacific day started at 08:00 UTC yesterday
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.getTime();
}

/**
 * Gets or initializes in-memory state for a model
 */
export function getOrCreateState(modelId: string): ModelUsageState {
  let state = memoryStates.get(modelId);
  const now = Date.now();
  const dayStart = getPacificDayStart();

  if (!state) {
    state = {
      modelId,
      requestsThisMinute: 0,
      tokensThisMinute: 0,
      requestsToday: 0,
      windowMinuteStart: now,
      windowDayStart: dayStart,
      cooldownUntil: null,
      circuitBreakerUntil: null,
      consecutiveFailures: 0,
      activeRequests: 0,
      lastError: null,
    };
    memoryStates.set(modelId, state);
  }

  // Check 1-minute window slide
  if (now - state.windowMinuteStart >= 60000) {
    state.requestsThisMinute = 0;
    state.tokensThisMinute = 0;
    state.windowMinuteStart = now;
  }

  // Check Pacific daily reset
  if (state.windowDayStart < dayStart) {
    state.requestsToday = 0;
    state.windowDayStart = dayStart;
  }

  return state;
}

/**
 * Checks if a model currently has headroom for a task
 */
export function canAcquire(
  model: ModelDefinition,
  estimatedTokens = 1000
): { allowed: boolean; reason?: string } {
  if (!model.enabled) {
    return { allowed: false, reason: 'Model disabled in config' };
  }

  const state = getOrCreateState(model.id);
  const now = Date.now();

  // 1. Check active cooldown
  if (state.cooldownUntil && state.cooldownUntil > now) {
    const sec = Math.ceil((state.cooldownUntil - now) / 1000);
    return { allowed: false, reason: `In cooldown for ${sec}s (${state.lastError || 'Rate limit'})` };
  }

  // 2. Check circuit breaker
  if (state.circuitBreakerUntil && state.circuitBreakerUntil > now) {
    const sec = Math.ceil((state.circuitBreakerUntil - now) / 1000);
    return { allowed: false, reason: `Circuit breaker tripped for ${sec}s` };
  }

  // 3. Check concurrency
  if (state.activeRequests >= model.limits.maxConcurrent) {
    return { allowed: false, reason: `Max concurrent requests reached (${state.activeRequests}/${model.limits.maxConcurrent})` };
  }

  // 4. Check Requests Per Minute (RPM)
  if (state.requestsThisMinute >= model.limits.rpm) {
    return { allowed: false, reason: `RPM limit reached (${state.requestsThisMinute}/${model.limits.rpm})` };
  }

  // 5. Check Tokens Per Minute (TPM)
  if (state.tokensThisMinute + estimatedTokens > model.limits.tpm) {
    return { allowed: false, reason: `TPM limit reached (${state.tokensThisMinute + estimatedTokens}/${model.limits.tpm})` };
  }

  // 6. Check Requests Per Day (RPD)
  if (state.requestsToday >= model.limits.rpd) {
    return { allowed: false, reason: `Daily RPD limit reached (${state.requestsToday}/${model.limits.rpd})` };
  }

  return { allowed: true };
}

/**
 * Reserves an in-flight request slot
 */
export function reserve(modelId: string, estimatedTokens = 1000): void {
  const state = getOrCreateState(modelId);
  state.activeRequests += 1;
  state.requestsThisMinute += 1;
  state.tokensThisMinute += estimatedTokens;
  state.requestsToday += 1;
}

/**
 * Releases reservation and updates tracking on completion
 */
export async function release(
  modelId: string,
  actualTokens: number,
  isSuccess: boolean,
  error?: any
): Promise<void> {
  const state = getOrCreateState(modelId);
  const settings = getSettings();
  const now = Date.now();

  state.activeRequests = Math.max(0, state.activeRequests - 1);

  if (isSuccess) {
    state.consecutiveFailures = 0;
    state.lastError = null;
    state.tokensThisMinute = Math.max(state.tokensThisMinute, state.tokensThisMinute - 1000 + actualTokens);
  } else {
    state.consecutiveFailures += 1;
    state.lastError = error?.message || 'Request failed';

    // Trip circuit breaker if consecutive failures exceed threshold
    if (state.consecutiveFailures >= settings.circuitBreakerFailureThreshold) {
      state.circuitBreakerUntil = now + settings.circuitBreakerCooldownSeconds * 1000;
      logger.warn(
        { modelId, consecutiveFailures: state.consecutiveFailures },
        'Circuit breaker tripped on model'
      );
    }
  }

  // Sync to database asynchronously if supabase client is available
  syncToDatabase(state).catch((err) => {
    logger.warn({ modelId, err: err?.message }, 'Failed to sync model quota to Supabase');
  });
}

/**
 * Puts a model in cooldown when a 429 or explicit rate limit error occurs
 */
export function recordCooldown(modelId: string, retryAfterSeconds?: number, errorMessage?: string): void {
  const state = getOrCreateState(modelId);
  const settings = getSettings();
  const cooldownSec = retryAfterSeconds || settings.defaultCooldownOn429Seconds;

  state.cooldownUntil = Date.now() + cooldownSec * 1000;
  state.lastError = errorMessage || 'HTTP 429 Rate Limit Exceeded';

  logger.warn(
    { modelId, cooldownSec, error: state.lastError },
    `Model entered quota cooldown for ${cooldownSec}s`
  );

  syncToDatabase(state).catch(() => {});
}

async function syncToDatabase(state: ModelUsageState): Promise<void> {
  try {
    await supabaseWorker.from('model_quotas').upsert({
      model_id: state.modelId,
      requests_this_minute: state.requestsThisMinute,
      tokens_this_minute: state.tokensThisMinute,
      requests_today: state.requestsToday,
      window_minute_start: new Date(state.windowMinuteStart).toISOString(),
      window_day_start: new Date(state.windowDayStart).toISOString(),
      cooldown_until: state.cooldownUntil ? new Date(state.cooldownUntil).toISOString() : null,
      circuit_breaker_until: state.circuitBreakerUntil ? new Date(state.circuitBreakerUntil).toISOString() : null,
      consecutive_failures: state.consecutiveFailures,
      last_error: state.lastError,
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    // Non-blocking
  }
}

/**
 * Returns comprehensive status across all models for CLI reporting
 */
export function getUsageStatus() {
  const models = getAllModels();
  const now = Date.now();
  const nextReset = new Date(getPacificDayStart() + 24 * 3600 * 1000).toISOString();

  return models.map((m) => {
    const s = getOrCreateState(m.id);
    const inCooldown = s.cooldownUntil && s.cooldownUntil > now;
    const inCircuitBreaker = s.circuitBreakerUntil && s.circuitBreakerUntil > now;

    return {
      modelId: m.id,
      kind: m.kind,
      enabled: m.enabled,
      rpmUsed: `${s.requestsThisMinute}/${m.limits.rpm}`,
      tpmUsed: `${s.tokensThisMinute}/${m.limits.tpm}`,
      rpdUsed: `${s.requestsToday}/${m.limits.rpd}`,
      activeConcurrent: s.activeRequests,
      status: inCooldown
        ? `COOLDOWN (${Math.ceil((s.cooldownUntil! - now) / 1000)}s)`
        : inCircuitBreaker
        ? `CIRCUIT_BREAKER (${Math.ceil((s.circuitBreakerUntil! - now) / 1000)}s)`
        : m.enabled
        ? 'READY'
        : 'DISABLED',
      nextDailyReset: nextReset,
    };
  });
}
