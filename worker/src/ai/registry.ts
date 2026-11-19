/**
 * ZUKAI MODEL REGISTRY
 * Location: /worker/src/ai/registry.ts
 * Type-safe interface to the models configuration, dynamic model disabling,
 * and learned quota updates.
 *
 * Built-in typed models configuration ensures zero runtime dependency on external
 * JSON files while maintaining full support for environment overrides
 * (MODELS_CONFIG_JSON or MODELS_CONFIG_PATH) validated via Zod.
 */

import fs from 'node:fs';
import { logger } from '../logger.js';
import type { DiscoveredModelInfo } from './discovery.js';
import {
  DEFAULT_MODELS_CONFIG,
  RegistryConfigSchema,
  type RegistryConfig,
  type ModelDefinition,
  type ModelKind,
  type QualityTier,
  type PipelineTask,
  type ModelLimits,
  type RegistrySettings,
} from './modelsConfig.js';

export type {
  ModelKind,
  QualityTier,
  PipelineTask,
  ModelLimits,
  ModelDefinition,
  RegistryConfig,
  RegistrySettings,
};

let loadedConfig: RegistryConfig | null = null;
const loggedDisabledModels = new Set<string>();

/**
 * Loads and validates the registry configuration.
 * Resolution priority:
 * 1. MODELS_CONFIG_JSON environment variable (JSON string validated by Zod)
 * 2. MODELS_CONFIG_PATH environment variable (File path to JSON validated by Zod)
 * 3. DEFAULT_MODELS_CONFIG built-in TypeScript module (type-safe, bundled with code)
 */
export function loadRegistryConfig(): RegistryConfig {
  if (loadedConfig) return loadedConfig;

  // 1. Check for MODELS_CONFIG_JSON override
  const envJson = process.env.MODELS_CONFIG_JSON;
  if (envJson && envJson.trim().length > 0) {
    try {
      const parsed = JSON.parse(envJson);
      loadedConfig = RegistryConfigSchema.parse(parsed);
      logger.info('[REGISTRY] Loaded and validated models configuration from MODELS_CONFIG_JSON environment variable');
      return loadedConfig;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, '[REGISTRY] Invalid MODELS_CONFIG_JSON override');
      throw new Error(`Failed to parse and validate MODELS_CONFIG_JSON override: ${msg}`);
    }
  }

  // 2. Check for MODELS_CONFIG_PATH override
  const envPath = process.env.MODELS_CONFIG_PATH;
  if (envPath && envPath.trim().length > 0) {
    try {
      if (!fs.existsSync(envPath)) {
        throw new Error(`File not found at specified path: ${envPath}`);
      }
      const raw = fs.readFileSync(envPath, 'utf-8');
      const parsed = JSON.parse(raw);
      loadedConfig = RegistryConfigSchema.parse(parsed);
      logger.info({ path: envPath }, '[REGISTRY] Loaded and validated models configuration from MODELS_CONFIG_PATH');
      return loadedConfig;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ path: envPath, err: msg }, '[REGISTRY] Invalid MODELS_CONFIG_PATH file');
      throw new Error(`Failed to load and validate models config from MODELS_CONFIG_PATH (${envPath}): ${msg}`);
    }
  }

  // 3. Fallback to typed built-in default configuration
  // Deep clone to allow runtime mutability (e.g. learning limits, disabling models)
  loadedConfig = JSON.parse(JSON.stringify(DEFAULT_MODELS_CONFIG)) as RegistryConfig;
  return loadedConfig;
}

/**
 * Resets the in-memory loaded config cache (useful for tests and dynamic reloads).
 */
export function resetRegistryConfig(): void {
  loadedConfig = null;
  loggedDisabledModels.clear();
}

export function getModel(modelId: string): ModelDefinition | undefined {
  const cfg = loadRegistryConfig();
  return cfg.models.find((m) => m.id === modelId);
}

export function getPriorityModels(task: PipelineTask): ModelDefinition[] {
  const cfg = loadRegistryConfig();
  const priorityIds = cfg.taskPriorities[task] || [];
  const modelMap = new Map(cfg.models.map((m) => [m.id, m]));

  const result: ModelDefinition[] = [];
  for (const id of priorityIds) {
    const m = modelMap.get(id);
    if (m && m.enabled) {
      result.push(m);
    }
  }
  return result;
}

export function getAllModels(): ModelDefinition[] {
  const cfg = loadRegistryConfig();
  return cfg.models;
}

export function getSettings(): RegistrySettings {
  const cfg = loadRegistryConfig();
  return cfg.settings;
}

/**
 * Permanently disable a misconfigured model for this process run.
 * Logs ONCE with a clear warning so chunks are not repeatedly stalled.
 */
export function disableModel(modelId: string, reason: string): void {
  const cfg = loadRegistryConfig();
  const model = cfg.models.find((m) => m.id === modelId);
  if (model) {
    model.enabled = false;
    model.disabledReason = reason;
  }

  if (!loggedDisabledModels.has(modelId)) {
    loggedDisabledModels.add(modelId);
    logger.warn({ modelId, reason }, `[REGISTRY] Model ${modelId} misconfigured. Disabled for session.`);
  }
}

/**
 * Dynamically learn the real limit from Google RPC quotaValue
 */
export function updateModelLimit(modelId: string, metric: 'rpm' | 'tpm' | 'rpd', value: number): void {
  const cfg = loadRegistryConfig();
  const model = cfg.models.find((m) => m.id === modelId);
  if (model && value > 0 && model.limits[metric] !== value) {
    logger.info({ modelId, metric, previous: model.limits[metric], learned: value }, '[REGISTRY] Learned real quota limit from Google RPC response');
    model.limits[metric] = value;
  }
}

/**
 * Reconciles static modelsConfig against dynamic discovery from Google AI Studio.
 * Models not present in Google's returned ListModels are marked disabled.
 */
export function reconcileWithDiscovery(discovered: Map<string, DiscoveredModelInfo>): void {
  if (discovered.size === 0) return;
  const cfg = loadRegistryConfig();

  for (const m of cfg.models) {
    if (m.kind === 'cloud-tts') continue; // Skip local/cloud fallback
    if (!discovered.has(m.id)) {
      disableModel(m.id, `Not discovered on project API key via Google AI Studio ListModels`);
    }
  }

  // Also auto-add any discovered TTS models that are not yet in voice priority
  for (const [id, info] of discovered.entries()) {
    if (info.isTts && !cfg.models.some((m) => m.id === id)) {
      cfg.models.push({
        id,
        kind: 'tts',
        enabled: true,
        qualityTier: 'high',
        limits: {
          rpm: 3,
          tpm: 10000,
          rpd: 10,
          maxInputTokens: 5000,
          maxConcurrent: 1,
        },
      });
      cfg.taskPriorities.voice.push(id);
      logger.info({ id, displayName: info.displayName }, '[REGISTRY] Auto-registered newly discovered Google TTS model');
    }
  }
}
