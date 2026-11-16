/**
 * ZUKAI QUOTA-AWARE MODEL ROUTER
 * Location: /worker/src/ai/router.ts
 * Selects highest-priority enabled model with quota headroom,
 * classifies errors accurately, updates learned limits, and returns typed decisions:
 * ok(model) | wait(until, reason, earliestWaitSeconds) | unavailable(reasons).
 */

import {
  getPriorityModels,
  PipelineTask,
  ModelDefinition,
  disableModel,
  updateModelLimit,
  getAllModels,
} from './registry.js';
import { canAcquire, reserve, release, recordCooldown, getModelStatus } from './quotaTracker.js';
import { classifyGoogleError, getSecondsUntilPacificMidnight, QuotaKind } from './errorClassifier.js';
import { logger } from '../logger.js';
import { WorkerError, WORKER_ERROR_CODES } from '../errors.js';

export type RouterDecision =
  | { type: 'ok'; model: ModelDefinition }
  | { type: 'wait'; until: Date; reason: 'rpm' | 'tpm' | 'rpd'; earliestWaitSeconds: number }
  | { type: 'unavailable'; reasons: string[] };

export class CapacityExhaustedError extends WorkerError {
  public task: string;
  public waitingReason: 'rpm' | 'tpm' | 'rpd';
  public earliestWaitSeconds: number;
  public resumeAt: Date;

  constructor(
    task: string,
    waitingReason: 'rpm' | 'tpm' | 'rpd' = 'rpm',
    earliestWaitSeconds = 60,
    details?: string
  ) {
    // User requirement: cap auto-resume wait time to 60s (1 min), never wait hours
    const cappedWaitSeconds = Math.min(Math.max(earliestWaitSeconds, 15), 60);

    super(
      WORKER_ERROR_CODES.AI_UNAVAILABLE,
      `All AI models for task "${task}" constrained (${waitingReason}). Earliest resume in ${cappedWaitSeconds}s. ${details || ''}`,
      true // retryable
    );
    this.name = 'CapacityExhaustedError';
    this.task = task;
    this.waitingReason = waitingReason;
    this.earliestWaitSeconds = cappedWaitSeconds;
    this.resumeAt = new Date(Date.now() + cappedWaitSeconds * 1000);
  }
}

/**
 * Returns a typed decision on model acquisition:
 * ok(model) | wait(until, reason, kind) | unavailable(reasons)
 */
export function decideModel(
  task: PipelineTask,
  estimatedTokens = 1000
): RouterDecision {
  const models = getPriorityModels(task);

  if (models.length === 0) {
    return {
      type: 'unavailable',
      reasons: [`No enabled models configured for task "${task}"`],
    };
  }

  let minWaitSeconds = Infinity;
  let dominantReason: 'rpm' | 'tpm' | 'rpd' = 'rpm';
  const unavailabilityReasons: string[] = [];

  for (const model of models) {
    const check = canAcquire(model, estimatedTokens);
    if (check.allowed) {
      return { type: 'ok', model };
    }

    // Inspect why it was blocked
    const status = getModelStatus(model.id);
    if (status.cooldownUntil && status.cooldownUntil.getTime() > Date.now()) {
      const waitSec = Math.ceil((status.cooldownUntil.getTime() - Date.now()) / 1000);
      if (waitSec < minWaitSeconds) {
        minWaitSeconds = waitSec;
        if (waitSec > 3600) {
          dominantReason = 'rpd';
        } else {
          dominantReason = 'rpm';
        }
      }
    } else if (check.reason?.includes('Daily')) {
      const waitSec = getSecondsUntilPacificMidnight();
      if (waitSec < minWaitSeconds) {
        minWaitSeconds = waitSec;
        dominantReason = 'rpd';
      }
    } else {
      // Minute window wait
      if (60 < minWaitSeconds) {
        minWaitSeconds = 60;
        dominantReason = 'rpm';
      }
    }

    unavailabilityReasons.push(`${model.id}: ${check.reason || 'Rate limit'}`);
  }

  if (minWaitSeconds !== Infinity && minWaitSeconds > 0) {
    return {
      type: 'wait',
      until: new Date(Date.now() + minWaitSeconds * 1000),
      reason: dominantReason,
      earliestWaitSeconds: minWaitSeconds,
    };
  }

  return {
    type: 'unavailable',
    reasons: unavailabilityReasons,
  };
}

/**
 * Acquires model if available, otherwise throws typed CapacityExhaustedError
 */
export function acquireModel(
  task: PipelineTask,
  estimatedTokens = 1000
): { model: ModelDefinition; earliestWaitSeconds: number } {
  const decision = decideModel(task, estimatedTokens);

  if (decision.type === 'ok') {
    reserve(decision.model.id, estimatedTokens);
    return { model: decision.model, earliestWaitSeconds: 0 };
  }

  if (decision.type === 'wait') {
    throw new CapacityExhaustedError(
      task,
      decision.reason,
      decision.earliestWaitSeconds,
      `Earliest model available at ${decision.until.toISOString()}`
    );
  }

  throw new WorkerError(
    WORKER_ERROR_CODES.BAD_CONFIG,
    `Configuration error: all candidate models for task "${task}" are permanently disabled or misconfigured. Reasons: ${decision.reasons.join('; ')}`,
    false
  );
}

/**
 * Executes an operation with automatic fallback through the priority model list.
 * Classifies errors into misconfigured, quota, or transient:
 * - misconfigured: disables model immediately and advances to next
 * - quota: records exact server retryDelay cooldown, updates learned limit, advances to next
 * - transient: advances to next
 */
export async function executeWithFallback<T>(
  task: PipelineTask,
  operation: (model: ModelDefinition) => Promise<{ result: T; tokensUsed?: number }>,
  estimatedTokens = 1000
): Promise<{ result: T; modelId: string; tokensUsed: number }> {
  const models = getPriorityModels(task);
  const failureLog: Array<{ modelId: string; error: string; type: string }> = [];

  let earliestQuotaWaitSeconds = Infinity;
  let dominantQuotaReason: 'rpm' | 'tpm' | 'rpd' = 'rpm';

  for (const model of models) {
    const check = canAcquire(model, estimatedTokens);
    if (!check.allowed) {
      continue;
    }

    reserve(model.id, estimatedTokens);
    const start = Date.now();

    try {
      const { result, tokensUsed = estimatedTokens } = await operation(model);
      await release(model.id, tokensUsed, true);
      logger.info(
        { task, modelId: model.id, latencyMs: Date.now() - start, tokensUsed },
        'Task completed successfully'
      );
      return { result, modelId: model.id, tokensUsed };
    } catch (rawErr: any) {
      await release(model.id, 0, false, rawErr);

      const classified = classifyGoogleError(rawErr);
      failureLog.push({
        modelId: model.id,
        error: rawErr.message || String(rawErr),
        type: classified.type,
      });

      if (classified.type === 'misconfigured') {
        // Disable misconfigured model so future chunks skip it immediately without log spam
        disableModel(model.id, classified.reason);
        logger.warn(
          { task, failedModel: model.id, reason: classified.reason },
          'Model misconfigured or unsupported. Disabling model for session.'
        );
        continue;
      }

      if (classified.type === 'quota') {
        // Learn and record real quota limit if provided
        if (classified.quotaValue && classified.quotaKind) {
          if (classified.quotaKind === 'rpd') {
            updateModelLimit(model.id, 'rpd', classified.quotaValue);
          } else if (classified.quotaKind === 'rpm') {
            updateModelLimit(model.id, 'rpm', classified.quotaValue);
          } else if (classified.quotaKind === 'tpm') {
            updateModelLimit(model.id, 'tpm', classified.quotaValue);
          }
        }

        const cooldownSec = classified.retryDelaySeconds || 60;
        recordCooldown(model.id, cooldownSec, classified.reason);

        if (cooldownSec < earliestQuotaWaitSeconds) {
          earliestQuotaWaitSeconds = cooldownSec;
          dominantQuotaReason = (classified.quotaKind === 'rpd' || cooldownSec > 3600) ? 'rpd' : 'rpm';
        }

        logger.warn(
          { task, failedModel: model.id, cooldownSec, quotaKind: classified.quotaKind },
          'Model entered quota cooldown, falling back to next available model'
        );
        continue;
      }

      // Transient or unknown
      logger.warn(
        { task, failedModel: model.id, err: rawErr?.message },
        'Model failed with transient error, attempting next fallback'
      );
    }
  }

  // All models were exhausted or failed
  // Check if failure was due to all models being misconfigured
  const nonMisconfigured = failureLog.filter((f) => f.type !== 'misconfigured');
  if (nonMisconfigured.length === 0 && failureLog.length > 0) {
    throw new WorkerError(
      WORKER_ERROR_CODES.BAD_CONFIG,
      `All candidate models for task "${task}" are misconfigured: ${failureLog.map((f) => `${f.modelId}: ${f.error}`).join(' | ')}`,
      false
    );
  }

  const waitTime = earliestQuotaWaitSeconds !== Infinity ? earliestQuotaWaitSeconds : 60;
  const summary = failureLog.map((f) => `${f.modelId}: ${f.error}`).join(' | ');

  throw new CapacityExhaustedError(task, dominantQuotaReason, waitTime, summary);
}
