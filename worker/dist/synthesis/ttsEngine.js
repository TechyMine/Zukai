import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { WorkerError, WORKER_ERROR_CODES } from '../errors.js';
import { logger } from '../logger.js';
const execAsync = promisify(exec);
/**
 * Creates synthetic PCM WAV audio buffer with smooth acoustic tone
 * as deterministic test & offline fallback.
 */
function createSyntheticAudioBuffer(durationSeconds) {
    const sampleRate = 22050;
    const numSamples = Math.floor(sampleRate * durationSeconds);
    const dataSize = numSamples * 2;
    const buffer = Buffer.alloc(44 + dataSize);
    // RIFF
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    // fmt
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    // data
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const envelope = Math.min(1, t / 0.3) * Math.min(1, (durationSeconds - t) / 0.3);
        const sample = Math.sin(2 * Math.PI * 220 * t) * 0.15 * envelope;
        const intSample = Math.floor(sample * 32767);
        buffer.writeInt16LE(intSample, 44 + i * 2);
    }
    return buffer;
}
/**
 * Converts raw 16-bit mono PCM buffer to standard RIFF WAV buffer if needed.
 */
export function pcmToWav(pcmBuffer, sampleRate = 24000) {
    if (pcmBuffer.length >= 4 && pcmBuffer.slice(0, 4).toString() === 'RIFF') {
        return pcmBuffer;
    }
    const dataSize = pcmBuffer.length;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(1, 22); // 1 channel (mono)
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28); // Byte rate
    header.writeUInt16LE(2, 32); // Block align
    header.writeUInt16LE(16, 34); // 16 bits
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    return Buffer.concat([header, pcmBuffer]);
}
/**
 * Maps arbitrary or legacy voice names to standard Gemini prebuilt voices.
 */
export function mapToGeminiVoice(voice = '') {
    const v = voice.toLowerCase();
    if (v.includes('female') || v === 'kore' || v === 'shimmer' || v === 'nova')
        return 'Kore';
    if (v.includes('deep') || v === 'fenrir' || v === 'onyx')
        return 'Fenrir';
    if (v === 'charon' || v === 'fable')
        return 'Charon';
    if (v === 'aoede')
        return 'Aoede';
    return 'Puck'; // Default warm conversational narrator
}
/**
 * Calls Gemini neural TTS API to generate raw PCM audio for a text passage.
 */
export async function callGeminiTts(text, voiceName = 'Puck') {
    if (!config.GEMINI_API_KEY || config.GEMINI_API_KEY.length < 10) {
        throw new WorkerError(WORKER_ERROR_CODES.AI_UNAVAILABLE, 'Gemini API key is not configured in worker environment.', false);
    }
    const model = 'gemini-2.5-flash-preview-tts';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.GEMINI_API_KEY}`;
    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(config.TIMEOUT_VOICING_MS || 45000),
            body: JSON.stringify({
                contents: [{ parts: [{ text: `Read aloud: ${text}` }] }],
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName }
                        }
                    }
                }
            })
        });
    }
    catch (netErr) {
        throw new WorkerError(WORKER_ERROR_CODES.AI_UNAVAILABLE, `Gemini TTS network request timed out or failed: ${netErr.message}`, true);
    }
    if (!res.ok) {
        const errText = await res.text();
        if (res.status === 429) {
            throw new WorkerError(WORKER_ERROR_CODES.AI_UNAVAILABLE, 'Gemini Free Tier rate limit exceeded: 10 requests/day limit reached on TTS. Please use a paid Gemini API key or wait for quota reset.', true);
        }
        throw new WorkerError(WORKER_ERROR_CODES.AI_UNAVAILABLE, `Gemini TTS API returned HTTP ${res.status}: ${errText}`, true);
    }
    const json = (await res.json());
    const base64Data = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Data) {
        throw new WorkerError(WORKER_ERROR_CODES.AI_UNAVAILABLE, 'No audio PCM data returned from Gemini TTS engine.', true);
    }
    return Buffer.from(base64Data, 'base64');
}
/**
 * Encodes audio buffer into broadcast-normalized MP3 with -16 LUFS, true peak -1.5 dB,
 * mono CBR 96 kbps (configurable), 24 kHz or 44.1 kHz, and ID3v2 tags using ffmpeg libmp3lame.
 */
export async function normalizeAndEncodeMp3(inputBuffer, options = {}) {
    const bitrateKbps = options.bitrateKbps ?? 96;
    const sampleRate = options.sampleRate ?? 24000;
    const title = (options.title || 'Zukai Audio Explanation').replace(/"/g, '\\"');
    const artist = (options.artist || 'Zukai').replace(/"/g, '\\"');
    const album = (options.album || 'Zukai Audio').replace(/"/g, '\\"');
    const language = options.language || 'eng';
    const wavBuffer = pcmToWav(inputBuffer, sampleRate);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zukai-mp3-'));
    const inputWav = path.join(tmpDir, 'raw.wav');
    const outputMp3 = path.join(tmpDir, 'final.mp3');
    try {
        await fs.writeFile(inputWav, wavBuffer);
        // Loudness normalization to -16 LUFS broadcast standard, true peak -1.5 dB, 96kbps MP3
        const ffmpegCmd = `ffmpeg -y -i "${inputWav}" -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a libmp3lame -b:a ${bitrateKbps}k -ar ${sampleRate} -ac 1 -id3v2_version 3 -metadata title="${title}" -metadata artist="${artist}" -metadata album="${album}" -metadata language="${language}" "${outputMp3}"`;
        await execAsync(ffmpegCmd);
        const mp3Buffer = await fs.readFile(outputMp3);
        // Run ffprobe to get exact duration
        const probeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputMp3}"`;
        const { stdout } = await execAsync(probeCmd);
        const duration = parseFloat(stdout.trim()) || 0;
        return {
            buffer: mp3Buffer,
            durationSeconds: Math.ceil(duration),
            bitrateKbps,
        };
    }
    catch (err) {
        logger.warn({ err }, 'ffmpeg libmp3lame execution unavailable or failed, returning raw PCM buffer');
        return {
            buffer: wavBuffer,
            durationSeconds: Math.max(1, Math.round(wavBuffer.length / (24000 * 2))),
            bitrateKbps,
        };
    }
    finally {
        try {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
        catch { }
    }
}
/**
 * Encodes audio buffer into normalized AAC (.m4a) with -16 LUFS and true peak -1.5 dB using ffmpeg.
 * Kept for legacy/fallback audio track support.
 */
export async function normalizeAndEncodeAac(inputWavBuffer, bitrateKbps = 128) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zukai-audio-'));
    const inputWav = path.join(tmpDir, 'raw.wav');
    const outputM4a = path.join(tmpDir, 'final.m4a');
    try {
        await fs.writeFile(inputWav, inputWavBuffer);
        // Loudness normalization to -16 LUFS broadcast standard, true peak -1.5 dB, 128kbps AAC
        const ffmpegCmd = `ffmpeg -y -i "${inputWav}" -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a aac -b:a ${bitrateKbps}k "${outputM4a}"`;
        await execAsync(ffmpegCmd);
        const m4aBuffer = await fs.readFile(outputM4a);
        // Run ffprobe to get exact duration
        const probeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputM4a}"`;
        const { stdout } = await execAsync(probeCmd);
        const duration = parseFloat(stdout.trim()) || 0;
        return {
            buffer: m4aBuffer,
            durationSeconds: Math.ceil(duration),
            bitrateKbps,
        };
    }
    catch (err) {
        logger.warn({ err }, 'ffmpeg execution unavailable or failed, returning raw PCM buffer');
        return {
            buffer: inputWavBuffer,
            durationSeconds: Math.max(1, Math.round(inputWavBuffer.length / (22050 * 2))),
            bitrateKbps,
        };
    }
    finally {
        try {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
        catch {
            // ignore tmp cleanup error
        }
    }
}
/**
 * Synthesizes audio and computes precise sentence-level karaoke timestamps.
 * Uses Gemini neural TTS (gemini-2.5-flash-preview-tts) when API key is available,
 * with acoustic envelope fallback for offline testing.
 */
export async function synthesizeSpeech(chapters, voice = 'alloy', meta = {}) {
    const geminiVoice = mapToGeminiVoice(voice);
    const sampleRate = 24000;
    const bytesPerSec = sampleRate * 2; // 16-bit mono
    const pcmBuffers = [];
    const processedChapters = [];
    const allSegments = [];
    const rawTextParts = [];
    let currentTimeMs = 0;
    let usedNeuralTts = false;
    // Try real neural TTS if Gemini API key is configured
    if (config.GEMINI_API_KEY && config.GEMINI_API_KEY.length > 10) {
        try {
            logger.info({ voice: geminiVoice, chapterCount: chapters.length }, 'Synthesizing voice narration with Gemini Neural TTS');
            for (let cIdx = 0; cIdx < chapters.length; cIdx++) {
                const ch = chapters[cIdx];
                const chapterStartSec = Math.floor(currentTimeMs / 1000);
                // Call Gemini TTS for this chapter's text
                const chapterPcm = await callGeminiTts(ch.text, geminiVoice);
                pcmBuffers.push(chapterPcm);
                const chapterDurationMs = Math.round((chapterPcm.length / bytesPerSec) * 1000);
                const rawSentences = ch.text.match(/[^.!?]+[.!?]+/g) || [ch.text];
                const totalWords = ch.text.split(/\s+/).filter(Boolean).length || 1;
                let sentenceOffsetMs = currentTimeMs;
                for (const rawSen of rawSentences) {
                    const sentenceText = rawSen.trim();
                    if (!sentenceText)
                        continue;
                    const words = sentenceText.split(/\s+/).filter(Boolean);
                    const sentenceDurationMs = Math.max(800, Math.round((words.length / totalWords) * chapterDurationMs));
                    allSegments.push({
                        start_ms: sentenceOffsetMs,
                        end_ms: sentenceOffsetMs + sentenceDurationMs,
                        text: sentenceText,
                    });
                    rawTextParts.push(sentenceText);
                    sentenceOffsetMs += sentenceDurationMs;
                }
                currentTimeMs += chapterDurationMs;
                const chapterEndSec = Math.ceil(currentTimeMs / 1000);
                processedChapters.push({
                    position: cIdx + 1,
                    title: ch.title,
                    summary: ch.summary,
                    start_seconds: chapterStartSec,
                    end_seconds: Math.max(chapterStartSec + 1, chapterEndSec),
                });
                // Add 500ms chapter transition silence
                if (cIdx < chapters.length - 1) {
                    const silenceBytes = Math.round(0.5 * bytesPerSec);
                    pcmBuffers.push(Buffer.alloc(silenceBytes));
                    currentTimeMs += 500;
                }
            }
            usedNeuralTts = true;
        }
        catch (err) {
            if (process.env.NODE_ENV === 'test' || !config.GEMINI_API_KEY) {
                logger.warn({ err: err.message }, 'Using deterministic test synthesis fallback in test/offline environment');
                pcmBuffers.length = 0;
                processedChapters.length = 0;
                allSegments.length = 0;
                rawTextParts.length = 0;
                currentTimeMs = 0;
            }
            else {
                throw err;
            }
        }
    }
    // Fallback to deterministic audio if offline or testing
    if (!usedNeuralTts) {
        const wordsPerMinute = 150;
        const msPerWord = (60 / wordsPerMinute) * 1000;
        for (let cIdx = 0; cIdx < chapters.length; cIdx++) {
            const ch = chapters[cIdx];
            const chapterStartSec = Math.floor(currentTimeMs / 1000);
            const rawSentences = ch.text.match(/[^.!?]+[.!?]+/g) || [ch.text];
            for (const rawSen of rawSentences) {
                const sentenceText = rawSen.trim();
                if (!sentenceText)
                    continue;
                const words = sentenceText.split(/\s+/).filter(Boolean);
                const sentenceDurationMs = Math.max(1200, Math.floor(words.length * msPerWord));
                const startMs = currentTimeMs;
                const endMs = startMs + sentenceDurationMs;
                allSegments.push({
                    start_ms: startMs,
                    end_ms: endMs,
                    text: sentenceText,
                });
                rawTextParts.push(sentenceText);
                currentTimeMs = endMs + 300;
            }
            const chapterEndSec = Math.floor(currentTimeMs / 1000);
            processedChapters.push({
                position: cIdx + 1,
                title: ch.title,
                summary: ch.summary,
                start_seconds: chapterStartSec,
                end_seconds: Math.max(chapterStartSec + 1, chapterEndSec),
            });
            currentTimeMs += 700;
        }
        const totalDurationSeconds = Math.max(1, Math.ceil(currentTimeMs / 1000));
        pcmBuffers.push(createSyntheticAudioBuffer(totalDurationSeconds));
    }
    const combinedAudio = Buffer.concat(pcmBuffers);
    // Normalize loudness and convert to MP3 with -16 LUFS, CBR 96 kbps, and ID3v2 tags
    const { buffer: finalBuffer, durationSeconds: accurateDuration, bitrateKbps } = await normalizeAndEncodeMp3(combinedAudio, {
        bitrateKbps: meta.bitrateKbps ?? 96,
        sampleRate: 24000,
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        language: meta.language,
    });
    const isMp3 = (finalBuffer.length >= 3 && finalBuffer[0] === 0x49 && finalBuffer[1] === 0x44 && finalBuffer[2] === 0x33) ||
        (finalBuffer.length >= 2 && finalBuffer[0] === 0xff && (finalBuffer[1] & 0xe0) === 0xe0);
    return {
        audioBuffer: finalBuffer,
        durationSeconds: accurateDuration || Math.ceil(currentTimeMs / 1000),
        format: isMp3 ? 'mp3' : 'wav',
        bitrateKbps,
        fileSizeBytes: finalBuffer.length,
        chapters: processedChapters,
        transcripts: {
            raw_text: rawTextParts.join(' '),
            segments: allSegments,
        },
    };
}
