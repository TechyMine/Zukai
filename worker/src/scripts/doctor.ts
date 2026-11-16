/**
 * ZUKAI WORKER DOCTOR (Diagnostic Suite)
 * Verifies all external and internal dependencies required for full end-to-end audio pipeline.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { getAllModels, getPriorityModels } from '../ai/registry.js';
import { executeWithFallback } from '../ai/router.js';

dotenv.config();

const execAsync = promisify(exec);

interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const results: CheckResult[] = [];

function record(name: string, passed: boolean, details: string) {
  const status: 'PASS' | 'FAIL' = passed ? 'PASS' : 'FAIL';
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
  record(
    'Environment Variables',
    hasUrl && hasKey && hasGemini,
    `SUPABASE_URL: ${hasUrl ? 'OK' : 'MISSING'}, SERVICE_ROLE_KEY: ${hasKey ? 'OK' : 'MISSING'}, GEMINI_API_KEY: ${hasGemini ? 'OK' : 'MISSING'}`
  );

  // 2. ffmpeg with libmp3lame
  try {
    const { stdout } = await execAsync('ffmpeg -version');
    const hasLame = stdout.includes('libmp3lame') || stdout.includes('--enable-libmp3lame');
    record('ffmpeg & libmp3lame', hasLame, hasLame ? 'ffmpeg installed with libmp3lame codec support' : 'ffmpeg found but libmp3lame missing');
  } catch (err: any) {
    record('ffmpeg & libmp3lame', false, `ffmpeg execution failed: ${err.message}`);
  }

  // 3. ffprobe
  try {
    const { stdout } = await execAsync('ffprobe -version');
    const firstLine = stdout.split('\n')[0] || 'ffprobe present';
    record('ffprobe', true, firstLine.trim());
  } catch (err: any) {
    record('ffprobe', false, `ffprobe execution failed: ${err.message}`);
  }

  if (!hasUrl || !hasKey) {
    console.log('\nCannot proceed with Supabase checks: missing credentials.');
    printSummary();
    return;
  }

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // 4. Supabase connectivity
  try {
    const { data, error } = await supabase.from('documents').select('count', { count: 'exact', head: true });
    if (error) throw error;
    record('Supabase Connectivity', true, `Connected successfully to ${process.env.SUPABASE_URL}`);
  } catch (err: any) {
    record('Supabase Connectivity', false, `Failed to query Supabase: ${err.message}`);
  }

  // 5. Queue read access (audio_jobs)
  try {
    const { data, error } = await supabase.from('audio_jobs').select('id, status').limit(1);
    if (error) throw error;
    record('Queue Read Access (audio_jobs)', true, `Read query succeeded, table accessible`);
  } catch (err: any) {
    record('Queue Read Access (audio_jobs)', false, `Failed to read audio_jobs: ${err.message}`);
  }

  // 6. Claim / Complete RPCs check
  try {
    const { data, error } = await supabase.rpc('claim_next_job', { p_vt_seconds: 1 });
    if (error) throw error;
    record('claim_next_job RPC', true, 'RPC exists and executed successfully');
  } catch (err: any) {
    record('claim_next_job RPC', false, `RPC failed: ${err.message}`);
  }

  // 7. Storage Upload & Download
  try {
    const testFileName = `doctor-test-${Date.now()}.mp3`;
    // Minimal valid MP3 frame
    const testContent = Buffer.from([0xff, 0xfb, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00]);
    
    // Upload test file to audio bucket as audio/mpeg
    const { error: upErr } = await supabase.storage.from('audio').upload(testFileName, testContent, { contentType: 'audio/mpeg', upsert: true });
    if (upErr) throw upErr;

    // Download it back
    const { data: downData, error: downErr } = await supabase.storage.from('audio').download(testFileName);
    if (downErr) throw downErr;

    // Clean up
    await supabase.storage.from('audio').remove([testFileName]);

    record('Storage Upload & Download (audio bucket)', true, 'Successfully uploaded, downloaded, and cleaned up test MP3 object');
  } catch (err: any) {
    record('Storage Upload & Download (audio bucket)', false, `Storage verification failed: ${err.message}`);
  }

  // 8. Multi-Model Health & Connectivity
  if (hasGemini) {
    const allModels = getAllModels().filter((m) => m.enabled);
    console.log(`\nTesting ${allModels.length} enabled models from modelsConfig.json...`);

    for (const model of allModels) {
      if (model.kind === 'text') {
        try {
          const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${process.env.GEMINI_API_KEY}`;
          const res = await fetch(genUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'Respond with: OK' }] }],
            }),
          });

          if (!res.ok) {
            const errBody = await res.text();
            record(`Model: ${model.id} (${model.kind})`, false, `HTTP ${res.status}: ${errBody.slice(0, 80)}`);
          } else {
            record(`Model: ${model.id} (${model.kind})`, true, `Online & responding`);
          }
        } catch (err: any) {
          record(`Model: ${model.id} (${model.kind})`, false, `Network error: ${err.message}`);
        }
      } else if (model.kind === 'tts') {
        try {
          const ttsUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${process.env.GEMINI_API_KEY}`;
          const ttsRes = await fetch(ttsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'Zukai' }] }],
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Puck' },
                  },
                },
              },
            }),
          });

          if (!ttsRes.ok) {
            const errBody = await ttsRes.text();
            record(`Model: ${model.id} (${model.kind})`, false, `HTTP ${ttsRes.status}: ${errBody.slice(0, 80)}`);
          } else {
            record(`Model: ${model.id} (${model.kind})`, true, `Online & generated audio`);
          }
        } catch (err: any) {
          record(`Model: ${model.id} (${model.kind})`, false, `Network error: ${err.message}`);
        }
      } else if (model.kind === 'live-audio') {
        // Live audio dialog endpoint test
        try {
          const liveUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${process.env.GEMINI_API_KEY}`;
          const liveRes = await fetch(liveUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'Hi' }] }],
              generationConfig: {
                responseModalities: ['AUDIO'],
              },
            }),
          });

          if (liveRes.ok) {
            record(`Model: ${model.id} (${model.kind})`, true, `Live audio endpoint active`);
          } else {
            const errBody = await liveRes.text();
            record(`Model: ${model.id} (${model.kind})`, false, `HTTP ${liveRes.status}: ${errBody.slice(0, 80)}`);
          }
        } catch (err: any) {
          record(`Model: ${model.id} (${model.kind})`, false, `Network error: ${err.message}`);
        }
      }
    }

    // 9. Router Fallback Verification
    try {
      console.log('\nTesting Quota-Aware Router Fallback...');
      let attemptCount = 0;
      const res = await executeWithFallback('script', async (model) => {
        attemptCount++;
        if (attemptCount === 1) {
          // Simulate quota exhaustion on first attempt
          throw new Error('429 Resource has been exhausted (quota simulated for fallback test)');
        }
        return { result: true, tokensUsed: 1000 };
      });

      const pass = res.result && attemptCount > 1;
      record(
        'Quota-Aware Router Fallback',
        pass,
        `Successfully routed past 429 quota failure on primary model to fallback model (${res.modelId})`
      );
    } catch (err: any) {
      record('Quota-Aware Router Fallback', false, `Fallback test failed: ${err.message}`);
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
  } else {
    console.log('⚠️ SOME CHECKS FAILED — Review errors above before processing jobs.');
    process.exitCode = 1;
  }
  console.log('----------------------------------------\n');
}

runDoctor();
