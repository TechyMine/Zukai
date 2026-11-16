import fs from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
dotenv.config();
const execAsync = promisify(exec);
async function run() {
    const key = process.env.GEMINI_API_KEY || '';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${key}`;
    console.log('1. Requesting TTS from Gemini API (gemini-2.5-flash-preview-tts)...');
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: 'Welcome to Zukai. We turn your complex documents into simple, conversational audio explanations in English or Hinglish.' }] }],
            generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Puck' }
                    }
                }
            }
        })
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini TTS API error HTTP ${res.status}: ${errText}`);
    }
    const json = (await res.json());
    const base64Data = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Data) {
        throw new Error('No audio data in Gemini response');
    }
    const pcmBuffer = Buffer.from(base64Data, 'base64');
    fs.mkdirSync('samples', { recursive: true });
    fs.writeFileSync('samples/test_gemini.pcm', pcmBuffer);
    console.log('2. Raw PCM received from Gemini! Bytes:', pcmBuffer.length);
    console.log('3. Encoding to broadcast MP3 with ffmpeg libmp3lame (-16 LUFS, 96 kbps, ID3 tags)...');
    const cmd = `ffmpeg -y -f s16le -ar 24000 -ac 1 -i samples/test_gemini.pcm -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a libmp3lame -b:a 96k -ar 24000 -ac 1 -id3v2_version 3 -metadata title="Zukai Voice Sample" -metadata artist="Zukai" -metadata album="Zukai Audio" samples/gemini_speech.mp3`;
    await execAsync(cmd);
    console.log('4. MP3 encoded successfully!');
    const { stdout: probe } = await execAsync('ffprobe -v error -show_entries format=format_name,duration,bit_rate:stream=codec_name,sample_rate,channels "samples/gemini_speech.mp3"');
    console.log('5. ffprobe verification:');
    console.log(probe);
    const stats = fs.statSync('samples/gemini_speech.mp3');
    console.log('File size:', stats.size, 'bytes');
}
run().catch(console.error);
