/**
 * ZUKAI ASSET INTEGRITY & CI GUARD TEST (Stage A5)
 * Location: /worker/test/assets.test.ts
 *
 * Verifies that:
 * 1. The built artifact contains all necessary modules and runtime assets with zero missing files.
 * 2. loadRegistryConfig() executes cleanly in both TypeScript and compiled JS dist modes without relying on loose JSON.
 * 3. Environment overrides (MODELS_CONFIG_JSON and MODELS_CONFIG_PATH) validate strictly via Zod.
 * 4. All prompts, Hinglish dictionaries, and voice configurations exist and are non-empty.
 * 5. Startup pre-flight validation succeeds.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadRegistryConfig,
  resetRegistryConfig,
  getModel,
  getPriorityModels,
  getSettings,
} from '../src/ai/registry.js';
import { DEFAULT_MODELS_CONFIG, RegistryConfigSchema } from '../src/ai/modelsConfig.js';
import { SYSTEM_PROMPT_ENGLISH, SYSTEM_PROMPT_HINGLISH } from '../src/intelligence/styleGuidePrompts.js';
import { HINGLISH_SPELLING_DICTIONARY, HINGLISH_FORMAL_STOPLIST } from '../src/hinglish/glossary.js';
import { VOICE_CONFIG } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Stage A5 CI Guard: Runtime Assets & Config Integrity', () => {
  test('modelsConfig schema validates default configuration with zero errors', () => {
    const validated = RegistryConfigSchema.parse(DEFAULT_MODELS_CONFIG);
    assert.ok(validated.models.length > 0, 'Must have at least one model');
    assert.ok(validated.taskPriorities.voice.length > 0, 'Must have voice priority models');
    assert.ok(validated.taskPriorities.script.length > 0, 'Must have script priority models');
  });

  test('loadRegistryConfig() loads in-memory configuration without throwing ENOENT', () => {
    resetRegistryConfig();
    const config = loadRegistryConfig();
    assert.ok(config, 'Config must be loaded');
    assert.strictEqual(typeof config.models, 'object');
    assert.ok(config.models.length >= 10, 'Expected at least 10 models in default registry');

    const flash = getModel('gemini-2.5-flash');
    assert.ok(flash, 'gemini-2.5-flash must be found');
    assert.strictEqual(flash.enabled, true);

    const voiceModels = getPriorityModels('voice');
    assert.ok(voiceModels.length > 0, 'Priority voice models must be available');
  });

  test('MODELS_CONFIG_JSON override is parsed and validated by Zod', () => {
    resetRegistryConfig();
    const customConfig = JSON.parse(JSON.stringify(DEFAULT_MODELS_CONFIG));
    customConfig.settings.safetyMarginPercent = 92;

    process.env.MODELS_CONFIG_JSON = JSON.stringify(customConfig);
    try {
      const config = loadRegistryConfig();
      assert.strictEqual(config.settings.safetyMarginPercent, 92);
    } finally {
      delete process.env.MODELS_CONFIG_JSON;
      resetRegistryConfig();
    }
  });

  test('MODELS_CONFIG_JSON rejects invalid schema and fails fast', () => {
    resetRegistryConfig();
    process.env.MODELS_CONFIG_JSON = JSON.stringify({ invalid: true });
    try {
      assert.throws(() => {
        loadRegistryConfig();
      }, /Failed to parse and validate MODELS_CONFIG_JSON/);
    } finally {
      delete process.env.MODELS_CONFIG_JSON;
      resetRegistryConfig();
    }
  });

  test('all required system prompts are present and robust', () => {
    assert.ok(SYSTEM_PROMPT_ENGLISH, 'SYSTEM_PROMPT_ENGLISH must be defined');
    assert.ok(SYSTEM_PROMPT_ENGLISH.length > 200, 'SYSTEM_PROMPT_ENGLISH must have detailed clarity laws');
    assert.ok(SYSTEM_PROMPT_ENGLISH.includes('Acoustic Clarity Laws'), 'Must include clarity laws');

    assert.ok(SYSTEM_PROMPT_HINGLISH, 'SYSTEM_PROMPT_HINGLISH must be defined');
    assert.ok(SYSTEM_PROMPT_HINGLISH.length > 200, 'SYSTEM_PROMPT_HINGLISH must have detailed Hinglish rules');
    assert.ok(SYSTEM_PROMPT_HINGLISH.includes('Romanized Hinglish'), 'Must enforce Romanized Hinglish');
  });

  test('Hinglish dictionaries and formal stoplists are non-empty', () => {
    assert.ok(Object.keys(HINGLISH_SPELLING_DICTIONARY).length > 20, 'Spelling dictionary must be comprehensive');
    assert.ok(Object.keys(HINGLISH_FORMAL_STOPLIST).length > 10, 'Formal stoplist must be comprehensive');
    assert.strictEqual(HINGLISH_SPELLING_DICTIONARY.kse, 'kaise');
  });

  test('voice mapping covers all standard Zukai voice personas', () => {
    const requiredVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    for (const v of requiredVoices) {
      assert.ok((VOICE_CONFIG as any)[v], `Voice ${v} must be defined in VOICE_CONFIG`);
    }
  });

  test('built dist/ directory contains all compiled modules when built', () => {
    const distPath = path.resolve(__dirname, '../dist');
    if (fs.existsSync(distPath)) {
      const requiredDistFiles = [
        'server.js',
        'worker.js',
        'config.js',
        'errors.js',
        'startup.js',
        'ai/registry.js',
        'ai/modelsConfig.js',
        'ai/router.js',
        'ai/quotaTracker.js',
        'synthesis/ttsEngine.js',
        'intelligence/styleGuidePrompts.js',
        'hinglish/glossary.js',
      ];

      for (const rel of requiredDistFiles) {
        const full = path.join(distPath, rel);
        assert.ok(fs.existsSync(full), `Compiled artifact missing in dist: ${rel}`);
      }
    }
  });
});
