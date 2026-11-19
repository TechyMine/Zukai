import dotenv from 'dotenv';
import { supabaseAdmin } from '../supabase/client.js';
import { DurableOrchestrator } from '../pipelines/orchestrator.js';
import { logger } from '../logger.js';
import type { PipelineStageName } from '../pipelines/types.js';

dotenv.config();

async function replayJob() {
  const args = process.argv.slice(2);
  const jobId = args.find((a) => !a.startsWith('--'));
  const fromArg = args.find((a) => a.startsWith('--from='));
  const fromStage = (fromArg ? fromArg.split('=')[1] : 'reading') as PipelineStageName;

  if (!jobId) {
    console.error('Usage: npm run job:replay -- <job_id> [--from=stage]');
    console.error('Valid stages: reading, understanding, writing, recording, final_touches');
    process.exit(1);
  }

  console.log(`\n============================================================`);
  console.log(`                ZUKAI JOB REPLAY HARNESS                    `);
  console.log(`============================================================`);
  console.log(`Replaying Job ID: ${jobId} from stage: ${fromStage.toUpperCase()}`);

  // Fetch job record
  const { data: job, error: jobErr } = await supabaseAdmin
    .from('audio_jobs')
    .select('*, documents(*)')
    .eq('id', jobId)
    .single();

  if (jobErr || !job) {
    console.error(`Error: Job not found: ${jobErr?.message || 'Unknown'}`);
    process.exit(1);
  }

  // Reset status to processing
  await supabaseAdmin
    .from('audio_jobs')
    .update({
      status: 'processing',
      failed_stage: null,
      error_code: null,
      error_message: null,
      current_step: `Replaying from ${fromStage}`,
    })
    .eq('id', jobId);

  // Download original document from storage
  console.log(`Downloading source document from storage: ${job.documents.storage_path}...`);
  const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
    .from('documents')
    .download(job.documents.storage_path);

  if (downloadError || !fileBlob) {
    console.error(`Failed to download document: ${downloadError?.message}`);
    process.exit(1);
  }

  const arrayBuffer = await fileBlob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  console.log(`Source document retrieved (${buffer.length} bytes). Launching Durable Orchestrator...`);

  await DurableOrchestrator.executeJob({
    jobId: job.id,
    documentId: job.document_id,
    ownerId: job.owner_id,
    orgId: job.org_id || undefined,
    documentBuffer: buffer,
    language: job.language === 'hinglish' ? 'hinglish' : 'en',
    depth: job.depth,
    voiceId: job.voice,
    pipelineVersion: 'v2',
    promptVersion: 'v2.0-agentic-rag',
    supabase: supabaseAdmin,
    logger,
    fromStage,
  });

  console.log(`Replay completed successfully for job ${jobId}!`);
}

replayJob().catch((err) => {
  console.error('Fatal replay error:', err);
  process.exit(1);
});
