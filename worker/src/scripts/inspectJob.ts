import dotenv from 'dotenv';
import { supabaseAdmin } from '../supabase/client.js';

dotenv.config();

async function inspectJob() {
  const args = process.argv.slice(2);
  const jobId = args.find((a) => !a.startsWith('--'));

  if (!jobId) {
    console.error('Usage: npm run job:inspect -- <job_id>');
    process.exit(1);
  }

  console.log(`\n============================================================`);
  console.log(`             ZUKAI JOB INSPECTION REPORT                    `);
  console.log(`============================================================`);
  console.log(`Job ID: ${jobId}`);

  // 1. Fetch audio_job record
  const { data: job, error: jobErr } = await supabaseAdmin
    .from('audio_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (jobErr || !job) {
    console.error(`Error: Job not found: ${jobErr?.message || 'Unknown'}`);
    process.exit(1);
  }

  console.log(`Status:            ${job.status.toUpperCase()}`);
  console.log(`Progress:          ${job.progress}% (${job.current_step})`);
  console.log(`Language/Depth:    ${job.language} / ${job.depth}`);
  console.log(`Voice:             ${job.voice}`);
  console.log(`Pipeline Version:  ${job.pipeline_version || 'v1'}`);
  console.log(`Prompt Version:    ${job.prompt_version || 'v1'}`);
  if (job.failed_stage) {
    console.log(`Failed Stage:      ${job.failed_stage}`);
  }
  if (job.error_code) {
    console.log(`Error Code:        ${job.error_code}`);
    console.log(`Error Message:     ${job.error_message}`);
  }
  console.log(`Created:           ${job.created_at}`);
  console.log(`Finished:          ${job.finished_at || 'In-Flight'}`);

  // 2. Fetch Timeline Events from job_events
  const { data: events, error: evErr } = await supabaseAdmin
    .from('job_events')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });

  console.log(`\n------------------------------------------------------------`);
  console.log(`                 EXECUTION TIMELINE EVENTS                  `);
  console.log(`------------------------------------------------------------`);

  if (!events || events.length === 0) {
    console.log('No timeline events recorded.');
  } else {
    for (const ev of events) {
      const time = new Date(ev.created_at).toISOString().slice(11, 19);
      const stageStr = ev.stage ? `[${ev.stage.padEnd(14)}]` : '[SYSTEM        ]';
      const typeStr = ev.event_type.padEnd(16);
      const durationStr = ev.duration_ms ? `${ev.duration_ms}ms`.padStart(8) : ''.padStart(8);
      const modelStr = ev.model ? `(Model: ${ev.model})` : '';

      console.log(`${time} ${stageStr} ${typeStr} ${durationStr} ${modelStr}`);
      if (ev.error_code) {
        console.log(`         -> Error: [${ev.error_code}] ${JSON.stringify(ev.error_details)}`);
      }
    }
  }

  // 3. Fetch Job Artifacts
  const { data: artifacts } = await supabaseAdmin
    .from('job_artifacts')
    .select('step, chunk_index, artifact_type, created_at')
    .eq('job_id', jobId)
    .order('chunk_index', { ascending: true });

  console.log(`\n------------------------------------------------------------`);
  console.log(`                    PERSISTED ARTIFACTS                     `);
  console.log(`------------------------------------------------------------`);

  if (!artifacts || artifacts.length === 0) {
    console.log('No persisted artifacts found.');
  } else {
    for (const art of artifacts) {
      console.log(`- ${art.step.padEnd(20)} [idx: ${art.chunk_index}] (${art.artifact_type}) saved at ${art.created_at.slice(11, 19)}`);
    }
  }

  console.log(`============================================================\n`);
}

inspectJob().catch((err) => {
  console.error('Fatal inspection error:', err);
  process.exit(1);
});
