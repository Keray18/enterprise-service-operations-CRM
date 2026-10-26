import { createApp } from './app.js';
import { env } from './config/env.js';
import { closeOraclePool, initOraclePool } from './database/oraclePool.js';
import { logger } from './logging/logger.js';
import { backgroundScheduler } from './workers/backgroundScheduler.js';

const app = createApp();

const server = app.listen(env.PORT, env.HOST, async () => {
  logger.info(`Enterprise Sales CRM API listening on http://${env.HOST}:${env.PORT}`, {
    environment: env.NODE_ENV,
    port: env.PORT,
    host: env.HOST,
  });

  // Attempt initial database pool connection (non-fatal if database is not yet running)
  try {
    await initOraclePool();

    // Start background job scheduler in non-test environments
    if (env.NODE_ENV !== 'test') {
      backgroundScheduler.start({ runImmediately: true });
      logger.info('Autonomous background scheduler started successfully.');
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`Oracle connection pool not ready at startup: ${errorMsg}. Server will continue running in degraded readiness mode.`);
  }
});

let isShuttingDown = false;

async function handleShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // Stop background scheduler first so no new jobs start
  try {
    await backgroundScheduler.stop();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`Error stopping background scheduler: ${errorMsg}`);
  }

  // Stop accepting new HTTP requests
  server.close(async () => {
    logger.info('HTTP server closed');

    // Close database connection pool
    try {
      await closeOraclePool(5);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Error during database pool shutdown: ${errorMsg}`);
    }

    logger.info('Graceful shutdown complete');
    process.exit(0);
  });

  // Force close after 10s if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Shutdown timed out, forcing process termination');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
