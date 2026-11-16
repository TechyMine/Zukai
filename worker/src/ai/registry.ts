/**
 * ZUKAI MODEL REGISTRY
 * Location: /worker/src/ai/registry.ts
 * Type-safe interface to the editable models configuration,
 * dynamic model disabling for misconfigured models, and learned quota updates.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../logger.js';
import type { DiscoveredModelInfo } from './discovery.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type ModelKind = 'text' | 'tts' | 'live-audio' | 'cloud-tts';
export type QualityTier = 'high' | 'medium' | 'fallback';
export type PipelineTask = 'outline' | 'script' | 'voice';

export interface ModelLimits {
  rpm: number;
  tpm: number;
  rpd: number;
  maxInputTokens: number;
  maxConcurrent: number;
}

export interface ModelDefinition {
  id: string;
  kind: ModelKind;
  enabled: boolean;
  qualityTier: QualityTier;
  limits: ModelLimits;
  disabledReason?: string;
}

export interface RegistryConfig {
  models: ModelDefinition[];
  taskPriorities: Record<PipelineTask, string[]>;
  settings: {
    dailyResetTimeUtc: string;
    circuitBreakerFailureThreshold: number;
    circuitBreakerCooldownSeconds: number;
    defaultCooldownOn429Seconds: number;
    maxCapacityWaitHours: number;
    verbatimWerThreshold: number;
    safetyMarginPercent: number;
    rpdBudgetPath: string;
    liveApiWsEndpoint: string;
  };
}

let loadedConfig: RegistryConfig | null = null;
const loggedDisabledModels = new Set<string>();

export function loadRegistryConfig(): RegistryConfig {
  if (loadedConfig) return loadedConfig;

  const configPath = path.resolve(__dirname, 'modelsConfig.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    loadedConfig = JSON.parse(raw) as RegistryConfig;
    return loadedConfig;
  } catch (err: any) {
    throw new Error(`Failed to load modelsConfig.json at ${configPath}: ${err.message}`);
  }
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

export function getSettings() {
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
