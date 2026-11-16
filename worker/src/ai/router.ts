/**
 * ZUKAI QUOTA-AWARE MODEL ROUTER
 * Location: /worker/src/ai/router.ts
 * Selects highest-priority enabled model with quota headroom,
 * handles automatic fallback across models, and detects capacity exhaustion.
 */

import { getPriorityModels, PipelineTask, ModelDefinition } from './registry.js';
import { canAcquire, reserve, release, recordCooldown } from './quotaTracker.js';
import { logger } from '../logger.js';
import { WorkerError, WORKER_ERROR_CODES } from '../errors.js';

export class CapacityExhaustedError extends WorkerError {
  public task: string;
  public earliestResetSeconds: number;
  public earliestWaitSeconds: number;

  constructor(task: string, earliestResetSeconds = 60, details?: string) {
    super(
      WORKER_ERROR_CODES.AI_UNAVAILABLE,
      `All AI models for task "${task}" are currently exhausted. ${details || ''}`,
      true // retryable
    );
    this.name = 'CapacityExhaustedError';
    this.task = task;
    this.earliestResetSeconds = earliestResetSeconds;
    this.earliestWaitSeconds = earliestResetSeconds;
  }
}

/**
 * Parses HTTP 429 response or Gemini quota error message for retry-after hints
 */
export function extractRetryAfter(err: any): number {
  if (err?.response?.headers) {
    const header = err.response.headers.get?.('retry-after') || err.response.headers['retry-after'];
    if (header) {
      const parsed = parseInt(header, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  }

  const msg = err?.message || String(err);
  const match = msg.match(/retry in ([0-9]+)s/i) || msg.match(/wait ([0-9]+) seconds/i);
  if (match) {
    return parseInt(match[1], 10);
  }

  return 60; // Default 60-second cooldown
}

/**
 * Checks whether an error is a quota / 429 error
 */
export function isQuotaError(err: any): boolean {
  if (!err) return false;
  const status = err.status || err.statusCode || err.code;
  if (status === 429 || status === 'RESOURCE_EXHAUSTED') return true;

  const msg = (err.message || String(err)).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('resource_exhausted') ||
    msg.includes('free_tier_requests')
  );
}

/**
 * Acquires the best available model for a task, or returns null if all are exhausted
 */
export function acquireModel(
  task: PipelineTask,
  estimatedTokens = 1000
): { model: ModelDefinition | null; earliestWaitSeconds: number } {
  const models = getPriorityModels(task);
  let minWait = 60;

  for (const model of models) {
    const check = canAcquire(model, estimatedTokens);
    if (check.allowed) {
      reserve(model.id, estimatedTokens);
      logger.info({ task, modelId: model.id }, 'Model acquired by router');
      return { model, earliestWaitSeconds: 0 };
    }
  }

  logger.warn({ task, totalChecked: models.length }, 'All priority models for task are currently constrained');
  return { model: null, earliestWaitSeconds: minWait };
}

/**
 * Executes an operation with automatic fallback through the priority model list
 */
export async function executeWithFallback<T>(
  task: PipelineTask,
  operation: (model: ModelDefinition) => Promise<{ result: T; tokensUsed?: number }>,
  estimatedTokens = 1000
): Promise<{ result: T; modelId: string; tokensUsed: number }> {
  const models = getPriorityModels(task);
  const errors: Array<{ modelId: string; error: string }> = [];

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
    } catch (err: any) {
      const isQuota = isQuotaError(err);
      if (isQuota) {
        const retryAfter = extractRetryAfter(err);
        recordCooldown(model.id, retryAfter, err.message);
      }
      await release(model.id, 0, false, err);

      errors.push({ modelId: model.id, error: err.message || String(err) });
      logger.warn(
        { task, failedModel: model.id, error: err.message, isQuota },
        'Model failed, attempting next available fallback'
      );
    }
  }

  // If we reach here, all models in priority order failed or were unavailable
  const summary = errors.map((e) => `${e.modelId}: ${e.error}`).join(' | ');
  throw new CapacityExhaustedError(task, 60, summary);
}
