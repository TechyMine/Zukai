/**
 * ZUKAI WORKER DOCTOR (Diagnostic Suite)
 * Verifies all external and internal dependencies required for full end-to-end audio pipeline.
 */
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config();
const execAsync = promisify(exec);
const results = [];
function record(name, passed, details) {
    const status = passed ? 'PASS' : 'FAIL';
    results.push({ name, status, details });
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} [${status}] ${name}: ${details}`);
}
async function runDoctor() {
    console.log('\n========================================');
    console.log('       ZUKAI WORKER DOCTOR SUITE        ');
    console.log('========================================\n');
    // 1. Env vars
    const hasUrl = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_URL.startsWith('http'));
    const hasKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.length > 20);
    const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10);
    record('Environment Variables', hasUrl && hasKey && hasGemini, `SUPABASE_URL: ${hasUrl ? 'OK' : 'MISSING'}, SERVICE_ROLE_KEY: ${hasKey ? 'OK' : 'MISSING'}, GEMINI_API_KEY: ${hasGemini ? 'OK' : 'MISSING'}`);
    // 2. ffmpeg with libmp3lame
    try {
        const { stdout } = await execAsync('ffmpeg -version');
        const hasLame = stdout.includes('libmp3lame') || stdout.includes('--enable-libmp3lame');
        record('ffmpeg & libmp3lame', hasLame, hasLame ? 'ffmpeg installed with libmp3lame codec support' : 'ffmpeg found but libmp3lame missing');
    }
    catch (err) {
        record('ffmpeg & libmp3lame', false, `ffmpeg execution failed: ${err.message}`);
    }
    // 3. ffprobe
    try {
        const { stdout } = await execAsync('ffprobe -version');
        const firstLine = stdout.split('\n')[0] || 'ffprobe present';
        record('ffprobe', true, firstLine.trim());
    }
    catch (err) {
        record('ffprobe', false, `ffprobe execution failed: ${err.message}`);
    }
    if (!hasUrl || !hasKey) {
        console.log('\nCannot proceed with Supabase checks: missing credentials.');
        printSummary();
        return;
    }
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    // 4. Supabase connectivity
    try {
        const { data, error } = await supabase.from('documents').select('count', { count: 'exact', head: true });
        if (error)
            throw error;
        record('Supabase Connectivity', true, `Connected successfully to ${process.env.SUPABASE_URL}`);
    }
    catch (err) {
        record('Supabase Connectivity', false, `Failed to query Supabase: ${err.message}`);
    }
    // 5. Queue read access (audio_jobs)
    try {
        const { data, error } = await supabase.from('audio_jobs').select('id, status').limit(1);
        if (error)
            throw error;
        record('Queue Read Access (audio_jobs)', true, `Read query succeeded, table accessible`);
    }
    catch (err) {
        record('Queue Read Access (audio_jobs)', false, `Failed to read audio_jobs: ${err.message}`);
    }
    // 6. Claim / Complete RPCs check
    try {
        const { data, error } = await supabase.rpc('claim_next_job', { p_vt_seconds: 1 });
        if (error)
            throw error;
        record('claim_next_job RPC', true, 'RPC exists and executed successfully');
    }
    catch (err) {
        record('claim_next_job RPC', false, `RPC failed: ${err.message}`);
    }
    // 7. Storage Upload & Download
    try {
        const testFileName = `doctor-test-${Date.now()}.mp3`;
        // Minimal valid MP3 frame
        const testContent = Buffer.from([0xff, 0xfb, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00]);
        // Upload test file to audio bucket as audio/mpeg
        const { error: upErr } = await supabase.storage.from('audio').upload(testFileName, testContent, { contentType: 'audio/mpeg', upsert: true });
        if (upErr)
            throw upErr;
        // Download it back
        const { data: downData, error: downErr } = await supabase.storage.from('audio').download(testFileName);
        if (downErr)
            throw downErr;
        // Clean up
        await supabase.storage.from('audio').remove([testFileName]);
        record('Storage Upload & Download (audio bucket)', true, 'Successfully uploaded, downloaded, and cleaned up test MP3 object');
    }
    catch (err) {
        record('Storage Upload & Download (audio bucket)', false, `Storage verification failed: ${err.message}`);
    }
    // 8. Gemini text generation
    if (hasGemini) {
        try {
            const model = process.env.GEMINI_SCRIPT_MODEL || 'gemini-2.5-flash';
            const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const res = await fetch(genUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: 'Respond with exactly: OK' }] }]
                })
            });
            if (!res.ok) {
                const errBody = await res.text();
                throw new Error(`HTTP ${res.status}: ${errBody}`);
            }
            const resJson = (await res.json());
            const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            record('Gemini Text Generation', true, `Model ${model} returned: "${text}"`);
        }
        catch (err) {
            record('Gemini Text Generation', false, `Text generation failed: ${err.message}`);
        }
        // 9. Gemini text-to-speech
        try {
            const ttsModel = 'gemini-2.5-flash-preview-tts';
            const ttsUrl = `https://generativelanguage.googleapis.com/v1beta/models/${ttsModel}:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const ttsRes = await fetch(ttsUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: 'Read aloud: Welcome to Zukai audio explanations.' }] }],
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
            if (!ttsRes.ok) {
                const errBody = await ttsRes.text();
                throw new Error(`HTTP ${ttsRes.status}: ${errBody}`);
            }
            const ttsJson = (await ttsRes.json());
            const inlineData = ttsJson.candidates?.[0]?.content?.parts?.[0]?.inlineData;
            if (!inlineData?.data) {
                throw new Error('Response did not contain inline audio PCM data');
            }
            const rawPcmBytes = Buffer.from(inlineData.data, 'base64').length;
            record('Gemini Neural TTS', true, `Model ${ttsModel} returned ${inlineData.mimeType} (${rawPcmBytes} bytes PCM)`);
        }
        catch (err) {
            record('Gemini Neural TTS', false, `TTS generation failed: ${err.message}`);
        }
    }
    printSummary();
}
function printSummary() {
    console.log('\n----------------------------------------');
    const passCount = results.filter((r) => r.status === 'PASS').length;
    const failCount = results.filter((r) => r.status === 'FAIL').length;
    console.log(`TOTAL CHECKS: ${results.length} | PASS: ${passCount} | FAIL: ${failCount}`);
    if (failCount === 0) {
        console.log('🎉 ALL SYSTEM CHECKS PASSED — Worker is ready for production pipeline.');
    }
    else {
        console.log('⚠️ SOME CHECKS FAILED — Review errors above before processing jobs.');
        process.exitCode = 1;
    }
    console.log('----------------------------------------\n');
}
runDoctor();
