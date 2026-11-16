import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  canAcquire,
  reserve,
  release,
  recordCooldown,
  getOrCreateState,
  getPacificDayStart,
} from '../src/ai/quotaTracker.js';
import { acquireModel, executeWithFallback, CapacityExhaustedError } from '../src/ai/router.js';
import { getPriorityModels, getModel, loadRegistryConfig } from '../src/ai/registry.js';
import { calculateWordErrorRate } from '../src/ai/liveAudioProvider.js';
import { computeSha256 } from '../src/ai/artifactManager.js';

describe('Quota-Aware Model Registry & Tracking', () => {
  test('Pacific day start resolves to 08:00 UTC (00:00 PST)', () => {
    const fixedDate = new Date('2026-11-15T12:00:00.000Z');
    const dayStart = getPacificDayStart(fixedDate);
    const startObj = new Date(dayStart);
    assert.strictEqual(startObj.getUTCHours(), 8);
    assert.strictEqual(startObj.getUTCMinutes(), 0);
    assert.strictEqual(startObj.getUTCDate(), 15);
  });

  test('canAcquire allows request within RPM and TPM limits', () => {
    const model = getModel('gemini-3.5-flash-lite');
    assert.ok(model, 'gemini-3.5-flash-lite should exist in registry');
    const check = canAcquire(model, 1000);
    assert.strictEqual(check.allowed, true);
  });

  test('recordCooldown puts model into cooldown and blocks acquire', () => {
    const modelId = 'gemini-test-cooldown';
    const fakeModel = {
      id: modelId,
      kind: 'text' as const,
      enabled: true,
      qualityTier: 'high' as const,
      limits: { rpm: 10, tpm: 100000, rpd: 100, maxInputTokens: 30000, maxConcurrent: 2 },
    };

    recordCooldown(modelId, 30, 'Simulated 429');
    const check = canAcquire(fakeModel);
    assert.strictEqual(check.allowed, false);
    assert.ok(check.reason?.includes('cooldown'));
  });
});

describe('Multi-Model Fallback Router', () => {
  test('executes operation with primary model when available', async () => {
    const res = await executeWithFallback('script', async (model) => {
      return { result: `Executed on ${model.id}`, tokensUsed: 500 };
    });

    assert.ok(res.result.includes('Executed on'));
    assert.strictEqual(typeof res.modelId, 'string');
    assert.strictEqual(res.tokensUsed, 500);
  });

  test('automatically falls back to next priority model on 429 quota error', async () => {
    let callCount = 0;
    const modelsAttempted: string[] = [];

    const res = await executeWithFallback('script', async (model) => {
      callCount++;
      modelsAttempted.push(model.id);
      if (callCount === 1) {
        throw new Error('429 Resource has been exhausted (rate limit)');
      }
      return { result: 'Fallback Success', tokensUsed: 800 };
    });

    assert.strictEqual(res.result, 'Fallback Success');
    assert.strictEqual(callCount, 2);
    assert.notStrictEqual(modelsAttempted[0], modelsAttempted[1]);
  });

  test('throws CapacityExhaustedError when all candidate models fail with quota limits', async () => {
    await assert.rejects(
      async () => {
        await executeWithFallback('voice', async (model) => {
          throw new Error('429 RESOURCE_EXHAUSTED quota exceeded');
        });
      },
      (err: any) => {
        assert.ok(err instanceof CapacityExhaustedError);
        assert.strictEqual(err.task, 'voice');
        assert.ok(err.earliestWaitSeconds > 0);
        return true;
      }
    );
  });
});

describe('Verbatim Guard & Content Hashing', () => {
  test('calculateWordErrorRate computes 0.0 for identical sentences', () => {
    const ref = 'The quick brown fox jumps over the lazy dog.';
    const hyp = 'The quick brown fox jumps over the lazy dog.';
    const wer = calculateWordErrorRate(ref, hyp);
    assert.strictEqual(wer, 0.0);
  });

  test('calculateWordErrorRate detects subtle omissions and substitutions', () => {
    const ref = 'Artificial intelligence enables autonomous problem solving';
    const hyp = 'Artificial machine enables autonomous problem solving'; // 1 substitution out of 6 words
    const wer = calculateWordErrorRate(ref, hyp);
    assert.ok(wer > 0 && wer < 0.20, `WER was ${wer}`);
  });

  test('calculateWordErrorRate handles case and punctuation insensitivity', () => {
    const ref = 'Hello, World! How are you doing today?';
    const hyp = 'hello world how are you doing today';
    const wer = calculateWordErrorRate(ref, hyp);
    assert.strictEqual(wer, 0.0);
  });

  test('computeSha256 produces deterministic 64-character hex hash', () => {
    const buf = Buffer.from('Zukai deterministic content hashing test');
    const hash1 = computeSha256(buf);
    const hash2 = computeSha256(buf);

    assert.strictEqual(hash1.length, 64);
    assert.strictEqual(hash1, hash2);
  });
});
