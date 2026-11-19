/**
 * ZUKAI JOB REQUEUE SCRIPT (Stage A7)
 * Location: /worker/src/scripts/requeueJobs.ts
 *
 * Safely recovers jobs affected by CONFIG_ERROR or specific error codes.
 * - Dry run by default (use --execute or --no-dry-run to commit)
 * - Skips canceled or already ready jobs
 * - Respects per-user concurrency limits
 * - Credits nothing twice
 *
 * Usage:
 *   npm run jobs:requeue -- --error-code=CONFIG_ERROR
 *   npm run jobs:requeue -- --error-code=CONFIG_ERROR --execute
 *   npm run jobs:requeue -- --all-config-errors --execute
 */

import { supabaseAdmin } from '../supabase/client.js';
import { logger } from '../logger.js';

interface CliArgs {
  errorCode: string;
  isDryRun: boolean;
  allConfigErrors: boolean;
  limit: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let errorCode = 'CONFIG_ERROR';
  let isDryRun = true;
  let allConfigErrors = false;
  let limit = 50;

  for (const arg of args) {
    if (arg.startsWith('--error-code=')) {
      errorCode = arg.split('=')[1];
    } else if (arg === '--execute' || arg === '--no-dry-run') {
      isDryRun = false;
    } else if (arg === '--dry-run') {
      isDryRun = true;
    } else if (arg === '--all-config-errors') {
      allConfigErrors = true;
    } else if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1], 10) || 50;
    }
  }

  return { errorCode, isDryRun, allConfigErrors, limit };
}

async function main() {
  const { errorCode, isDryRun, allConfigErrors, limit } = parseArgs();

  console.log('\n======================================================');
  console.log('ZUKAI JOB REQUEUE TOOL');
  console.log(`Mode:       ${isDryRun ? 'DRY RUN (no database changes)' : 'EXECUTE (live updates)'}`);
  console.log(`Target:     ${allConfigErrors ? 'All config / modelsConfig errors' : `error_code = ${errorCode}`}`);
  console.log(`Limit:      ${limit} jobs`);
  console.log('======================================================\n');

  // 1. Query failed jobs matching criteria
  let query = supabaseAdmin
    .from('audio_jobs')
    .select('id, owner_id, document_id, status, error_code, error_message, attempt_count, created_at')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!allConfigErrors && errorCode) {
    query = query.eq('error_code', errorCode);
  }

  const { data: candidates, error } = await query;
  if (error) {
    console.error('Failed to query failed audio_jobs:', error);
    process.exit(1);
  }

  if (!candidates || candidates.length === 0) {
    // Also check for legacy failures where error_message mentions modelsConfig.json
    const { data: legacyCandidates, error: legacyError } = await supabaseAdmin
      .from('audio_jobs')
      .select('id, owner_id, document_id, status, error_code, error_message, attempt_count, created_at')
      .eq('status', 'failed')
      .ilike('error_message', '%modelsConfig%')
      .limit(limit);

    if (legacyError) {
      console.error('Failed to query legacy failed audio_jobs:', legacyError);
      process.exit(1);
    }

    if (!legacyCandidates || legacyCandidates.length === 0) {
      console.log('No eligible failed jobs found matching the criteria.');
      return;
    }

    processCandidates(legacyCandidates, isDryRun);
    return;
  }

  // Filter candidates if allConfigErrors is specified
  const filtered = allConfigErrors
    ? candidates.filter(
        (j) =>
          j.error_code === 'CONFIG_ERROR' ||
          j.error_code === 'BAD_CONFIG' ||
          (j.error_message && j.error_message.includes('modelsConfig'))
      )
    : candidates;

  await processCandidates(filtered, isDryRun);
}

async function processCandidates(jobs: any[], isDryRun: boolean) {
  console.log(`Found ${jobs.length} candidate job(s) for requeuing:\n`);

  let requeuedCount = 0;
  let skippedCount = 0;

  for (const job of jobs) {
    // 1. Safety check: ensure document still exists and has not been deleted
    const { data: doc } = await supabaseAdmin
      .from('documents')
      .select('id, status')
      .eq('id', job.document_id)
      .maybeSingle();

    if (!doc || doc.status === 'deleted') {
      console.log(`  [SKIP] Job ${job.id}: Underlying document ${job.document_id} was deleted.`);
      skippedCount++;
      continue;
    }

    // 2. Safety check: check active jobs for user to prevent abuse / exceeding concurrency
    const { data: activeJobs } = await supabaseAdmin
      .from('audio_jobs')
      .select('id')
      .eq('owner_id', job.owner_id)
      .in('status', ['queued', 'processing']);

    if (activeJobs && activeJobs.length >= 3) {
      console.log(`  [SKIP] Job ${job.id}: User ${job.owner_id} already has ${activeJobs.length} active jobs.`);
      skippedCount++;
      continue;
    }

    console.log(`  [MATCH] Job ${job.id} (Owner: ${job.owner_id})`);
    console.log(`          Error Code: ${job.error_code || 'N/A'}`);
    console.log(`          Error Msg:  ${(job.error_message || '').slice(0, 80)}...`);

    if (!isDryRun) {
      const { error: updateError } = await supabaseAdmin
        .from('audio_jobs')
        .update({
          status: 'queued',
          error_code: null,
          error_message: null,
          current_step: 'Requeued after system configuration fix',
          attempt_count: 0, // Reset attempt count for config errors
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (updateError) {
        console.error(`          FAILED to requeue job ${job.id}: ${updateError.message}`);
      } else {
        console.log(`          -> Successfully reset status to 'queued'`);
        requeuedCount++;

        // Audit the requeue event
        try {
          await supabaseAdmin.from('job_events').insert({
            job_id: job.id,
            event_type: 'job.requeued',
            stage: 'requeue_tool',
            error_details: {
              reason: 'Operator requeue after CONFIG_ERROR hotfix',
              previous_error_code: job.error_code,
              previous_error_message: job.error_message,
            },
          });
        } catch {
          // Non-fatal if table not yet migrated
        }
      }
    } else {
      requeuedCount++;
    }
  }

  console.log('\n======================================================');
  console.log(`Summary:`);
  console.log(`  Matched:  ${jobs.length}`);
  console.log(`  Eligible: ${requeuedCount}`);
  console.log(`  Skipped:  ${skippedCount}`);
  if (isDryRun) {
    console.log('\nDry run complete. To execute, run:');
    console.log('  npm run jobs:requeue -- --error-code=CONFIG_ERROR --execute');
  } else {
    console.log(`\nRequeued ${requeuedCount} job(s) successfully.`);
  }
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('Fatal error in requeue script:', err);
  process.exit(1);
});
