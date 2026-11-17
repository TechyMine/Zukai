/**
 * ZUKAI IN-APP DIAGNOSTICS LOGGER
 * Location: /zukai/src/lib/diagnosticsLogger.ts
 *
 * Implements a memory-capped ring buffer (500 entries) for collecting diagnostic
 * traces and logs across worker calls, audio playback, and sync operations,
 * formatted for user-facing bug reports and export.
 */

const MAX_BUFFER_ENTRIES = 500;

export interface DiagnosticEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  tag: string;
  message: string;
  meta?: unknown;
}

const ringBuffer: DiagnosticEntry[] = [];

function record(level: DiagnosticEntry['level'], tag: string, message: string, meta?: unknown) {
  const entry: DiagnosticEntry = {
    timestamp: new Date().toISOString(),
    level,
    tag,
    message,
    meta,
  };

  ringBuffer.push(entry);
  if (ringBuffer.length > MAX_BUFFER_ENTRIES) {
    ringBuffer.shift();
  }
}

export const diag = {
  info: (tag: string, message: string, meta?: unknown) => record('INFO', tag, message, meta),
  warn: (tag: string, message: string, meta?: unknown) => record('WARN', tag, message, meta),
  error: (tag: string, message: string, meta?: unknown) => record('ERROR', tag, message, meta),

  getEntries: (): DiagnosticEntry[] => [...ringBuffer],

  exportAsString: (): string => {
    return ringBuffer
      .map((e) => {
        const metaStr = e.meta ? ` | ${JSON.stringify(e.meta)}` : '';
        return `[${e.timestamp}] [${e.level}] [${e.tag}] ${e.message}${metaStr}`;
      })
      .join('\n');
  },

  clear: () => {
    ringBuffer.length = 0;
  },
};
