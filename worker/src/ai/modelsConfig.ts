import { z } from 'zod';

export const ModelKindSchema = z.enum(['text', 'tts', 'live-audio', 'cloud-tts']);
export const QualityTierSchema = z.enum(['high', 'medium', 'fallback']);
export const PipelineTaskSchema = z.enum(['outline', 'script', 'voice']);

export const ModelLimitsSchema = z.object({
  rpm: z.number().positive(),
  tpm: z.number().positive(),
  rpd: z.number().positive(),
  maxInputTokens: z.number().positive(),
  maxConcurrent: z.number().positive(),
});

export const ModelDefinitionSchema = z.object({
  id: z.string().min(1),
  kind: ModelKindSchema,
  enabled: z.boolean(),
  qualityTier: QualityTierSchema,
  limits: ModelLimitsSchema,
  disabledReason: z.string().optional(),
});

export const TaskPrioritiesSchema = z.object({
  outline: z.array(z.string()),
  script: z.array(z.string()),
  voice: z.array(z.string()),
});

export const RegistrySettingsSchema = z.object({
  dailyResetTimeUtc: z.string().default('08:00'),
  circuitBreakerFailureThreshold: z.number().default(3),
  circuitBreakerCooldownSeconds: z.number().default(180),
  defaultCooldownOn429Seconds: z.number().default(60),
  maxCapacityWaitHours: z.number().default(24),
  verbatimWerThreshold: z.number().default(0.08),
  safetyMarginPercent: z.number().default(85),
  rpdBudgetPath: z.string().default('/tmp/zukai_rpd_budget.json'),
  liveApiWsEndpoint: z.string().url().default('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'),
});

export const RegistryConfigSchema = z.object({
  models: z.array(ModelDefinitionSchema),
  taskPriorities: TaskPrioritiesSchema,
  settings: RegistrySettingsSchema,
});

export type ModelKind = z.infer<typeof ModelKindSchema>;
export type QualityTier = z.infer<typeof QualityTierSchema>;
export type PipelineTask = z.infer<typeof PipelineTaskSchema>;
export type ModelLimits = z.infer<typeof ModelLimitsSchema>;
export type ModelDefinition = z.infer<typeof ModelDefinitionSchema>;
export type RegistryConfig = z.infer<typeof RegistryConfigSchema>;
export type RegistrySettings = z.infer<typeof RegistrySettingsSchema>;

export const DEFAULT_MODELS_CONFIG: RegistryConfig = {
  models: [
    {
      id: 'gemini-2.5-flash',
      kind: 'text',
      enabled: true,
      qualityTier: 'high',
      limits: {
        rpm: 5,
        tpm: 250000,
        rpd: 20,
        maxInputTokens: 1000000,
        maxConcurrent: 2,
      },
    },
    {
      id: 'gemini-3.6-flash',
      kind: 'text',
      enabled: true,
      qualityTier: 'high',
      limits: {
        rpm: 5,
        tpm: 250000,
        rpd: 20,
        maxInputTokens: 1000000,
        maxConcurrent: 2,
      },
    },
    {
      id: 'gemini-3.8-flash',
      kind: 'text',
      enabled: true,
      qualityTier: 'high',
      limits: {
        rpm: 5,
        tpm: 250000,
        rpd: 20,
        maxInputTokens: 1000000,
        maxConcurrent: 2,
      },
    },
    {
      id: 'gemini-3-flash',
      kind: 'text',
      enabled: true,
      qualityTier: 'high',
      limits: {
        rpm: 5,
        tpm: 250000,
        rpd: 20,
        maxInputTokens: 1000000,
        maxConcurrent: 2,
      },
    },
    {
      id: 'gemini-3.5-flash-lite',
      kind: 'text',
      enabled: true,
      qualityTier: 'medium',
      limits: {
        rpm: 15,
        tpm: 250000,
        rpd: 500,
        maxInputTokens: 1000000,
        maxConcurrent: 4,
      },
    },
    {
      id: 'gemini-3.1-flash-lite',
      kind: 'text',
      enabled: true,
      qualityTier: 'medium',
      limits: {
        rpm: 15,
        tpm: 250000,
        rpd: 500,
        maxInputTokens: 1000000,
        maxConcurrent: 4,
      },
    },
    {
      id: 'gemini-2.5-flash-lite',
      kind: 'text',
      enabled: true,
      qualityTier: 'medium',
      limits: {
        rpm: 10,
        tpm: 250000,
        rpd: 20,
        maxInputTokens: 1000000,
        maxConcurrent: 3,
      },
    },
    {
      id: 'gemini-1.5-flash',
      kind: 'text',
      enabled: true,
      qualityTier: 'fallback',
      limits: {
        rpm: 15,
        tpm: 1000000,
        rpd: 1500,
        maxInputTokens: 1000000,
        maxConcurrent: 3,
      },
    },
    {
      id: 'gemini-2.5-flash-preview-tts',
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
    },
    {
      id: 'gemini-3.1-flash-tts-preview',
      kind: 'tts',
      enabled: true,
      qualityTier: 'high',
      limits: {
        rpm: 3,
        tpm: 10000,
        rpd: 100,
        maxInputTokens: 5000,
        maxConcurrent: 1,
      },
    },
    {
      id: 'gemini-3.8-flash-tts',
      kind: 'tts',
      enabled: true,
      qualityTier: 'high',
      limits: {
        rpm: 3,
        tpm: 10000,
        rpd: 100,
        maxInputTokens: 5000,
        maxConcurrent: 1,
      },
    },
    {
      id: 'gemini-3.8-flash-lite-tts',
      kind: 'tts',
      enabled: true,
      qualityTier: 'medium',
      limits: {
        rpm: 5,
        tpm: 10000,
        rpd: 200,
        maxInputTokens: 5000,
        maxConcurrent: 1,
      },
    },
    {
      id: 'gemini-3.8-live',
      kind: 'live-audio',
      enabled: true,
      qualityTier: 'high',
      limits: {
        rpm: 30,
        tpm: 65000,
        rpd: 500,
        maxInputTokens: 20000,
        maxConcurrent: 1,
      },
    },
    {
      id: 'google-cloud-tts',
      kind: 'cloud-tts',
      enabled: false,
      qualityTier: 'fallback',
      limits: {
        rpm: 300,
        tpm: 1000000,
        rpd: 100000,
        maxInputTokens: 5000,
        maxConcurrent: 5,
      },
    },
  ],
  taskPriorities: {
    outline: [
      'gemini-2.5-flash',
      'gemini-3.6-flash',
      'gemini-3.8-flash',
      'gemini-3-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-1.5-flash',
    ],
    script: [
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash',
      'gemini-3.6-flash',
      'gemini-3.8-flash',
      'gemini-3-flash',
      'gemini-2.5-flash-lite',
      'gemini-1.5-flash',
    ],
    voice: [
      'gemini-2.5-flash-preview-tts',
      'gemini-3.1-flash-tts-preview',
      'gemini-3.8-flash-tts',
      'gemini-3.8-flash-lite-tts',
      'gemini-3.8-live',
      'google-cloud-tts',
    ],
  },
  settings: {
    dailyResetTimeUtc: '08:00',
    circuitBreakerFailureThreshold: 3,
    circuitBreakerCooldownSeconds: 180,
    defaultCooldownOn429Seconds: 60,
    maxCapacityWaitHours: 24,
    verbatimWerThreshold: 0.08,
    safetyMarginPercent: 85,
    rpdBudgetPath: '/tmp/zukai_rpd_budget.json',
    liveApiWsEndpoint:
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent',
  },
};
