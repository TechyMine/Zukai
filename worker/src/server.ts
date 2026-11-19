import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { startWorkerLoop, stopWorker } from './worker.js';
import { logger } from './logger.js';
import { supabaseAdmin } from './supabase/client.js';
import { runStartupValidation, isSystemReady, getLastValidationResult } from './startup.js';

const fastify = Fastify({
  loggerInstance: logger,
});

await fastify.register(cors, {
  origin: '*',
});

// GET /healthz: Liveness check (always returns status and build SHA)
fastify.get('/healthz', async () => {
  return {
    status: 'ok',
    service: 'zukai-worker',
    uptime: process.uptime(),
    buildSha: process.env.BUILD_SHA || process.env.GIT_SHA || 'dev',
    timestamp: new Date().toISOString(),
  };
});

// GET /readyz: Deep readiness check
// Returns 503 until startup validation passed AND Supabase & queue access work
fastify.get('/readyz', async (_request, reply) => {
  if (!isSystemReady()) {
    reply.status(503);
    const lastResult = getLastValidationResult();
    return {
      status: 'unready',
      reason: 'Startup validation has not passed or was aborted',
      errors: lastResult?.errors || ['System validation pending'],
    };
  }

  try {
    const { error: dbError } = await supabaseAdmin.from('plans').select('tier').limit(1);
    if (dbError) {
      reply.status(503);
      return {
        status: 'unready',
        error: `Database connection check failed: ${dbError.message}`,
      };
    }

    const { error: queueError } = await supabaseAdmin.from('audio_jobs').select('id').limit(1);
    if (queueError) {
      reply.status(503);
      return {
        status: 'unready',
        error: `Queue check failed: ${queueError.message}`,
      };
    }

    const diagnostics = getLastValidationResult()?.diagnostics;
    return {
      status: 'ready',
      database: 'connected',
      queue: 'accessible',
      diagnostics,
      buildSha: process.env.BUILD_SHA || process.env.GIT_SHA || 'dev',
      geminiConfigured: Boolean(config.GEMINI_API_KEY && config.GEMINI_API_KEY.length > 5),
    };
  } catch (err: unknown) {
    reply.status(503);
    return {
      status: 'unready',
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

// Graceful shutdown handling
let isShuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, 'Received shutdown signal, initiating graceful stop...');

  try {
    await stopWorker();
    await fastify.close();
    logger.info('Fastify server closed cleanly');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during graceful shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

async function main() {
  try {
    // Stage A4: Fail fast and visibly at process start
    // Validates ALL configs, prompts, dictionaries, and required binaries (ffmpeg, ffprobe, libmp3lame)
    await runStartupValidation(true);

    await fastify.listen({ port: config.PORT, host: config.HOST });
    logger.info(`Worker listening on http://${config.HOST}:${config.PORT}`);

    // Start background queue polling loop
    startWorkerLoop();
  } catch (err) {
    logger.fatal({ err }, 'Failed to start Fastify worker');
    process.exit(1);
  }
}

main();
