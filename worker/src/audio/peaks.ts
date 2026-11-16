/**
 * Audio Waveform Peaks and SHA-256 Utilities
 * Location: /worker/src/audio/peaks.ts
 *
 * Extracts normalized waveform peaks (200-300 integers 0..255) from audio buffer
 * using ffmpeg PCM decoding, and computes SHA-256 content hashes.
 */

import { spawn } from 'child_process';
import crypto from 'crypto';
import { logger } from '../logger.js';

export interface AudioAnalysisResult {
  sha256: string;
  waveformPeaks: number[];
}

/**
 * Computes SHA-256 hex digest of a buffer.
 */
export function computeBufferSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Decodes an audio buffer (MP3, WAV, etc.) to 16-bit mono PCM at 22,050 Hz using ffmpeg,
 * and buckets the maximum absolute amplitude into `targetBuckets` integers (0..255).
 */
export async function extractWaveformPeaks(
  audioBuffer: Buffer,
  targetBuckets: number = 250
): Promise<number[]> {
  return new Promise((resolve) => {
    try {
      const ffmpeg = spawn('ffmpeg', [
        '-i', 'pipe:0',
        '-ac', '1',
        '-ar', '22050',
        '-f', 's16le',
        'pipe:1',
      ]);

      const chunks: Buffer[] = [];
      let stderrOutput = '';

      ffmpeg.stdout.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      ffmpeg.stderr.on('data', (data) => {
        stderrOutput += data.toString();
      });

      ffmpeg.on('error', (err) => {
        logger.warn({ err: err.message }, '[Peaks] ffmpeg process error, skipping peaks extraction');
        resolve([]);
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          logger.warn({ code, stderr: stderrOutput.slice(-300) }, '[Peaks] ffmpeg exited with non-zero code');
          resolve([]);
          return;
        }

        const pcmBuffer = Buffer.concat(chunks);
        const sampleCount = Math.floor(pcmBuffer.length / 2);

        if (sampleCount === 0) {
          resolve([]);
          return;
        }

        const bucketSize = Math.max(1, Math.floor(sampleCount / targetBuckets));
        const peaks: number[] = [];

        for (let i = 0; i < targetBuckets; i++) {
          const startSample = i * bucketSize;
          const endSample = Math.min(startSample + bucketSize, sampleCount);

          let maxAmp = 0;
          for (let s = startSample; s < endSample; s++) {
            const val = Math.abs(pcmBuffer.readInt16LE(s * 2));
            if (val > maxAmp) {
              maxAmp = val;
            }
          }

          // Scale 0..32767 to 0..255
          const normalized = Math.min(255, Math.round((maxAmp / 32767) * 255));
          peaks.push(normalized);
        }

        resolve(peaks);
      });

      // Write audio buffer to ffmpeg stdin
      ffmpeg.stdin.write(audioBuffer);
      ffmpeg.stdin.end();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: msg }, '[Peaks] Failed to spawn ffmpeg for peaks extraction');
      resolve([]);
    }
  });
}

/**
 * Analyzes an audio buffer, returning sha256 and waveform peaks.
 */
export async function analyzeAudioBuffer(
  audioBuffer: Buffer,
  targetBuckets: number = 250
): Promise<AudioAnalysisResult> {
  const sha256 = computeBufferSha256(audioBuffer);
  const waveformPeaks = await extractWaveformPeaks(audioBuffer, targetBuckets);
  return { sha256, waveformPeaks };
}
