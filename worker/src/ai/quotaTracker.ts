/**
 * ZUKAI QUOTA TRACKER
 * Location: /worker/src/ai/quotaTracker.ts
 * Manages sliding-window request/token consumption, daily limits with Pacific midnight resets,
 * cooldowns from 429 responses, circuit-breakers, token-bucket safety margin pacing,
 * per-model semaphores, and daily RPD budget reservation.
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
  /** Reserved RPD slots that have not been confirmed (pre-flight reservation) */
  rpdReserved: number;
}

/** Simple in-process semaphore for per-model concurrency limiting */
class Semaphore {
  private permits: number;
  private readonly queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.permits++;
    }
  }
}

const memoryStates = new Map<string, ModelUsageState>();
const semaphores = new Map<string, Semaphore>();

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
 * Gets or initializes the per-model semaphore based on maxConcurrent setting
 */
function getOrCreateSemaphore(model: ModelDefinition): Semaphore {
  let sem = semaphores.get(model.id);
  if (!sem) {
    sem = new Semaphore(model.limits.maxConcurrent);
    semaphores.set(model.id, sem);
  }
  return sem;
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
      rpdReserved: 0,
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
    state.rpdReserved = 0;
    state.windowDayStart = dayStart;
  }

  return state;
}

/**
 * Checks if a model currently has headroom for a task.
 * Applies safetyMarginPercent to RPM/TPM limits (token bucket pacing).
 */
export function canAcquire(
  model: ModelDefinition,
  estimatedTokens = 1000
): { allowed: boolean; reason?: string } {
  if (!model.enabled) {
    return { allowed: false, reason: 'Model disabled in config' };
  }

  const state = getOrCreateState(model.id);
  const settings = getSettings();
  const now = Date.now();
  const safetyFactor = (settings.safetyMarginPercent ?? 100) / 100;

  // 1. Check active cooldown
  if (state.cooldownUntil && state.cooldownUntil > now) {
    const sec = Math.ceil((state.cooldownUntil - now) / 1000);
    return { allowed: false, reason: `In cooldown for ${sec}s (${state.lastError ?? 'Rate limit'})` };
  }

  // 2. Check circuit breaker
  if (state.circuitBreakerUntil && state.circuitBreakerUntil > now) {
    const sec = Math.ceil((state.circuitBreakerUntil - now) / 1000);
    return { allowed: false, reason: `Circuit breaker tripped for ${sec}s` };
  }

  // 3. Check concurrency (also enforced by semaphore, but guard here for fast-path)
  if (state.activeRequests >= model.limits.maxConcurrent) {
    return { allowed: false, reason: `Max concurrent requests reached (${state.activeRequests}/${model.limits.maxConcurrent})` };
  }

  // 4. Check Requests Per Minute (RPM) with safety margin
  const rpmLimit = Math.floor(model.limits.rpm * safetyFactor);
  if (state.requestsThisMinute >= rpmLimit) {
    return { allowed: false, reason: `RPM safety limit reached (${state.requestsThisMinute}/${rpmLimit}, margin=${settings.safetyMarginPercent ?? 100}%)` };
  }

  // 5. Check Tokens Per Minute (TPM) with safety margin
  const tpmLimit = Math.floor(model.limits.tpm * safetyFactor);
  if (state.tokensThisMinute + estimatedTokens > tpmLimit) {
    return { allowed: false, reason: `TPM safety limit reached (${state.tokensThisMinute + estimatedTokens}/${tpmLimit}, margin=${settings.safetyMarginPercent ?? 100}%)` };
  }

  // 6. Check Requests Per Day (RPD) — include pre-flight reservations
  const rpdUsed = state.requestsToday + state.rpdReserved;
  if (rpdUsed >= model.limits.rpd) {
    return { allowed: false, reason: `Daily RPD limit reached (${rpdUsed}/${model.limits.rpd})` };
  }

  return { allowed: true };
}

/**
 * Reserves an in-flight request slot (and acquires the per-model semaphore).
 * Returns a release function to call when done.
 */
export function reserve(modelId: string, estimatedTokens = 1000): void {
  const model = getModel(modelId);
  if (model) {
    const sem = getOrCreateSemaphore(model);
    // Acquire semaphore asynchronously — fire-and-forget for compatibility;
    // the canAcquire check on activeRequests provides the synchronous guard.
    sem.acquire().catch(() => { /* semaphore acquire error — not expected */ });
  }

  const state = getOrCreateState(modelId);
  state.activeRequests += 1;
  state.requestsThisMinute += 1;
  state.tokensThisMinute += estimatedTokens;
  state.requestsToday += 1;
}

/**
 * Pre-flight RPD reservation: decrements RPD budget before the call.
 * Call reserveRpd() before attempting the model; call releaseRpd() if the
 * call never starts (pre-model failure). Normal completions are accounted
 * for by reserve() → requestsToday.
 */
export function reserveRpd(modelId: string): boolean {
  const model = getModel(modelId);
  if (!model) return false;

  const state = getOrCreateState(modelId);
  const rpdUsed = state.requestsToday + state.rpdReserved;
  if (rpdUsed >= model.limits.rpd) {
    return false;
  }
  state.rpdReserved += 1;
  return true;
}

/**
 * Releases a pre-flight RPD reservation when the call did not proceed.
 */
export function releaseRpd(modelId: string): void {
  const state = getOrCreateState(modelId);
  state.rpdReserved = Math.max(0, state.rpdReserved - 1);
}

/**
 * Releases reservation and updates tracking on completion
 */
export async function release(
  modelId: string,
  actualTokens: number,
  isSuccess: boolean,
  error?: unknown
): Promise<void> {
  const state = getOrCreateState(modelId);
  const settings = getSettings();
  const now = Date.now();

  state.activeRequests = Math.max(0, state.activeRequests - 1);

  // Release the semaphore
  const model = getModel(modelId);
  if (model) {
    const sem = getOrCreateSemaphore(model);
    sem.release();
  }

  if (isSuccess) {
    state.consecutiveFailures = 0;
    state.lastError = null;
    // Correct token estimate to actual
    state.tokensThisMinute = Math.max(0, state.tokensThisMinute - 1000 + actualTokens);
  } else {
    const errMsg = error instanceof Error ? error.message : String(error ?? 'Request failed');
    state.consecutiveFailures += 1;
    state.lastError = errMsg;

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
  syncToDatabase(state).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ modelId, err: msg }, 'Failed to sync model quota to Supabase');
  });
}

/**
 * Puts a model in cooldown when a 429 or explicit rate limit error occurs
 */
export function recordCooldown(modelId: string, retryAfterSeconds?: number, errorMessage?: string): void {
  const state = getOrCreateState(modelId);
  const settings = getSettings();
  const cooldownSec = retryAfterSeconds ?? settings.defaultCooldownOn429Seconds;

  state.cooldownUntil = Date.now() + cooldownSec * 1000;
  state.lastError = errorMessage ?? 'HTTP 429 Rate Limit Exceeded';

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
  } catch {
    // Non-blocking
  }
}

/**
 * Gets the current status of a specific model for the router
 */
export function getModelStatus(modelId: string): {
  cooldownUntil: Date | null;
  circuitBreakerUntil: Date | null;
  requestsThisMinute: number;
  tokensThisMinute: number;
  requestsToday: number;
} {
  const s = getOrCreateState(modelId);
  return {
    cooldownUntil: s.cooldownUntil ? new Date(s.cooldownUntil) : null,
    circuitBreakerUntil: s.circuitBreakerUntil ? new Date(s.circuitBreakerUntil) : null,
    requestsThisMinute: s.requestsThisMinute,
    tokensThisMinute: s.tokensThisMinute,
    requestsToday: s.requestsToday,
  };
}

/**
 * Resets quota tracking state for tests or admin reset
 */
export function resetModelQuota(modelId: string): void {
  const s = getOrCreateState(modelId);
  s.requestsThisMinute = 0;
  s.tokensThisMinute = 0;
  s.requestsToday = 0;
  s.rpdReserved = 0;
  s.cooldownUntil = null;
  s.circuitBreakerUntil = null;
  s.consecutiveFailures = 0;
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
