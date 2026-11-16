import { describe, it } from 'node:test';
import assert from 'node:assert';
import { classifyGoogleError, getSecondsUntilPacificMidnight } from '../src/ai/errorClassifier.js';

describe('Google RPC & Error Classifier', () => {
  it('correctly parses structured RetryInfo (55164s) and QuotaFailure (quotaValue 10) into RPD', () => {
    const errorFixture = {
      message: 'Quota exceeded for quota metric GenerateRequestsPerDayPerProjectPerModel-FreeTier',
      status: 429,
      errorDetails: [
        {
          '@type': 'type.googleapis.com/google.rpc.RetryInfo',
          retryDelay: '55164s',
        },
        {
          '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [
            {
              quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
              quotaMetric: 'generativelanguage.googleapis.com/generate_requests_per_day',
              quotaValue: 10,
            },
          ],
        },
      ],
    };

    const classified = classifyGoogleError(errorFixture);
    assert.strictEqual(classified.type, 'quota');
    assert.strictEqual(classified.quotaKind, 'rpd');
    assert.strictEqual(classified.quotaValue, 10);
    assert.strictEqual(classified.isMisconfigured, false);
    // Cooldown must be at least 55164s
    assert.ok(classified.retryDelaySeconds && classified.retryDelaySeconds >= 55164);
  });

  it('correctly parses fallback human-readable retry text (retry in 15h19m)', () => {
    const errorFixture = new Error('Resource has been exhausted (rate limit). Please retry in 15h19m.');
    (errorFixture as any).status = 429;

    const classified = classifyGoogleError(errorFixture);
    assert.strictEqual(classified.type, 'quota');
    assert.strictEqual(classified.quotaKind, 'rpd');
    assert.ok(classified.retryDelaySeconds && classified.retryDelaySeconds >= 15 * 3600 + 19 * 60);
  });

  it('correctly classifies HTTP 404 as misconfigured and disables model', () => {
    const errorFixture = new Error('models/gemini-2.5-flash-live is not found for API version v1beta');
    (errorFixture as any).status = 404;

    const classified = classifyGoogleError(errorFixture);
    assert.strictEqual(classified.type, 'misconfigured');
    assert.strictEqual(classified.isMisconfigured, true);
    assert.strictEqual(classified.canRetryLater, false);
  });

  it('correctly classifies HTTP 400 WebSocket error as misconfigured', () => {
    const errorFixture = new Error('Model gemini-3.8-live only supports real-time bidirectional streaming via WebSocket (bidiGenerateContent)');
    (errorFixture as any).status = 400;

    const classified = classifyGoogleError(errorFixture);
    assert.strictEqual(classified.type, 'misconfigured');
    assert.strictEqual(classified.isMisconfigured, true);
    assert.strictEqual(classified.canRetryLater, false);
  });

  it('correctly classifies network fetch failed as transient', () => {
    const errorFixture = new Error('fetch failed: ECONNRESET');

    const classified = classifyGoogleError(errorFixture);
    assert.strictEqual(classified.type, 'transient');
    assert.strictEqual(classified.isMisconfigured, false);
    assert.strictEqual(classified.canRetryLater, true);
  });

  it('correctly classifies safety block as content_blocked', () => {
    const errorFixture = new Error('Response was blocked due to SAFETY filters: HARM_CATEGORY_DANGEROUS_CONTENT');

    const classified = classifyGoogleError(errorFixture);
    assert.strictEqual(classified.type, 'content_blocked');
    assert.strictEqual(classified.canRetryLater, false);
  });
});
