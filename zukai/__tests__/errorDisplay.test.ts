import {
  getFriendlyJobErrorMessage,
  containsInternalLeak,
  formatSupportReference,
  getFailedStageIndex,
  FRIENDLY_JOB_ERRORS,
} from '../src/lib/jobErrors';

describe('Job Error Sanitization and Display (Stage A6)', () => {
  describe('containsInternalLeak detection', () => {
    it('detects production error path "/app/dist/ai/modelsConfig.json"', () => {
      const msg = 'Failed to load modelsConfig.json at /app/dist/ai/modelsConfig.json: ENOENT: no such file or directory';
      expect(containsInternalLeak(msg)).toBe(true);
    });

    it('detects Windows file paths', () => {
      const msg = 'Error opening C:\\Users\\Dell\\zukai\\worker\\dist\\ai\\registry.js';
      expect(containsInternalLeak(msg)).toBe(true);
    });

    it('detects stack traces with at Module...', () => {
      const msg = 'Error at Module.loadRegistryConfig (/app/dist/ai/registry.js:25:15)';
      expect(containsInternalLeak(msg)).toBe(true);
    });

    it('returns false for clean user-friendly messages', () => {
      expect(containsInternalLeak('The AI explanation engine is experiencing high demand.')).toBe(false);
      expect(containsInternalLeak('This document is encrypted or password-protected.')).toBe(false);
    });
  });

  describe('getFriendlyJobErrorMessage', () => {
    it('resolves CONFIG_ERROR to safe friendly message', () => {
      const resolved = getFriendlyJobErrorMessage('CONFIG_ERROR');
      expect(resolved).toBe('We hit a problem on our side. We are on it. Please retry in a few minutes.');
    });

    it('resolves INTERNAL_ERROR to safe friendly message', () => {
      const resolved = getFriendlyJobErrorMessage('INTERNAL_ERROR');
      expect(resolved).toBe('We hit a problem on our side. We are on it. Please retry in a few minutes.');
    });

    it('NEVER renders a message containing a file path, even if passed as rawMessage', () => {
      const leakedMessage = 'Failed to load modelsConfig.json at /app/dist/ai/modelsConfig.json: ENOENT';
      const resolved = getFriendlyJobErrorMessage('CONFIG_ERROR', leakedMessage);

      // Must be friendly
      expect(resolved).toBe(FRIENDLY_JOB_ERRORS.CONFIG_ERROR);
      // Must not contain any path elements
      expect(resolved).not.toContain('/app');
      expect(resolved).not.toContain('dist');
      expect(resolved).not.toContain('.json');
      expect(resolved).not.toContain('ENOENT');
    });

    it('NEVER renders stack traces even if error code is unknown', () => {
      const leakedMessage = 'ReferenceError: window is not defined at /app/dist/server.js:12:4';
      const resolved = getFriendlyJobErrorMessage('UNKNOWN_CODE', leakedMessage);

      expect(resolved).toBe('We hit a problem on our side. We are on it. Please retry in a few minutes.');
      expect(resolved).not.toContain('window');
      expect(resolved).not.toContain('/app');
      expect(resolved).not.toContain('server.js');
    });
  });

  describe('formatSupportReference', () => {
    it('formats first 8 characters in uppercase', () => {
      expect(formatSupportReference('a306624c-4889-4d7e-831a-17d2bf5c2205')).toBe('A306624C');
      expect(formatSupportReference('7a628a38-1f2b-49ed-9f9a-68d5af6b7761')).toBe('7A628A38');
    });

    it('handles empty or missing jobId gracefully', () => {
      expect(formatSupportReference(null)).toBe('SUPPORT');
      expect(formatSupportReference(undefined)).toBe('SUPPORT');
    });
  });

  describe('getFailedStageIndex', () => {
    it('identifies Reading stage for extraction / scan errors', () => {
      expect(getFailedStageIndex(10, 'Extracting text', 'SCANNED_NO_TEXT')).toBe(0);
      expect(getFailedStageIndex(5, 'Downloading document', 'UNSUPPORTED_FILE')).toBe(0);
    });

    it('identifies Understanding stage for outline errors', () => {
      expect(getFailedStageIndex(30, 'Analyzing core ideas & key concepts', '')).toBe(1);
    });

    it('identifies Writing stage for scripting errors', () => {
      expect(getFailedStageIndex(50, 'Drafting conversational explanation', '')).toBe(2);
    });

    it('identifies Recording stage for voicing / TTS errors', () => {
      expect(getFailedStageIndex(75, 'Synthesizing voice narration', 'TTS_FAILED')).toBe(3);
    });

    it('identifies Final Touches stage for assembly errors', () => {
      expect(getFailedStageIndex(95, 'Mastering MP3 & loudness leveling', 'ASSEMBLY_FAILED')).toBe(4);
    });
  });
});
