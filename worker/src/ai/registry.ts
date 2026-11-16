/**
 * ZUKAI MODEL REGISTRY
 * Location: /worker/src/ai/registry.ts
 * Type-safe interface to the editable models configuration.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  };
}

let loadedConfig: RegistryConfig | null = null;

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
