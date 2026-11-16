/**
 * ZUKAI QUOTA STATUS CLI
 * Location: /worker/src/scripts/quotaStatus.ts
 * Displays real-time model usage, sliding-window limits, daily reset timers, and cooldown states.
 * Run with: npm run quota:status
 */

import dotenv from 'dotenv';
dotenv.config();

import { getAllModels, loadRegistryConfig } from '../ai/registry.js';
import { getUsageStatus, getPacificDayStart } from '../ai/quotaTracker.js';
import { supabaseWorker } from '../supabase/client.js';

async function main() {
  console.log('\n========================================================================================');
  console.log('                          ZUKAI GEMINI MULTI-MODEL QUOTA STATUS                         ');
  console.log('========================================================================================\n');

  const config = loadRegistryConfig();
  const dayStart = getPacificDayStart();
  const nextResetDate = new Date(dayStart + 24 * 3600 * 1000);
  const msUntilReset = nextResetDate.getTime() - Date.now();
  const hoursUntilReset = (msUntilReset / (3600 * 1000)).toFixed(1);

  console.log(`Daily Quota Reset Window: Pacific Midnight (00:00 PST / 08:00 UTC)`);
  console.log(`Next Daily Reset:        ${nextResetDate.toISOString()} (~${hoursUntilReset}h remaining)`);
  console.log(`Active Task Pipelines:   outline (${config.taskPriorities.outline.join(' -> ')})`);
  console.log(`                         script  (${config.taskPriorities.script.join(' -> ')})`);
  console.log(`                         voice   (${config.taskPriorities.voice.join(' -> ')})`);
  console.log('----------------------------------------------------------------------------------------\n');

  // Try fetching persisted quota records from Supabase
  let dbQuotas: Record<string, any> = {};
  try {
    const { data } = await supabaseWorker.from('model_quotas').select('*');
    if (data) {
      for (const row of data) {
        dbQuotas[row.model_id] = row;
      }
    }
  } catch {
    // If table not yet seeded or offline, fallback to in-memory
  }

  const memoryStatuses = getUsageStatus();

  const tableRows = memoryStatuses.map((s) => {
    const db = dbQuotas[s.modelId];
    const rpdDisplay = db ? `${db.requests_today}/${s.rpdUsed.split('/')[1]}` : s.rpdUsed;
    const lastErr = db?.last_error ? ` (${db.last_error.slice(0, 30)}...)` : '';

    return {
      'Model ID': s.modelId,
      Kind: s.kind,
      Status: s.status + lastErr,
      'RPM (1m)': s.rpmUsed,
      'TPM (1m)': s.tpmUsed,
      'RPD (Day)': rpdDisplay,
      Active: s.activeConcurrent,
    };
  });

  console.table(tableRows);

  console.log('\nLegend:');
  console.log('  • READY: Available for immediate request dispatch.');
  console.log('  • COOLDOWN: 429 received; model suspended until countdown expires.');
  console.log('  • CIRCUIT_BREAKER: Consecutive failures threshold exceeded.');
  console.log('  • DISABLED: Turned off in worker/src/ai/modelsConfig.json.');
  console.log('\n========================================================================================\n');
}

main().catch((err) => {
  console.error('Error generating quota status:', err);
  process.exit(1);
});
