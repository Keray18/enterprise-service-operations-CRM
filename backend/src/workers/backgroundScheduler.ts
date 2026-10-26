import { logger } from '../logging/logger.js';
import { notificationService } from '../services/notificationService.js';
import { slaMonitoringService } from '../services/slaMonitoringService.js';

interface JobExecutionStats {
  totalRuns: number;
  lastRunAt?: Date;
  lastSuccessAt?: Date;
  lastErrorAt?: Date;
  lastErrorMessage?: string;
  itemsProcessed: number;
}

export class BackgroundScheduler {
  private sla48hTimer?: NodeJS.Timeout;
  private sla168hTimer?: NodeJS.Timeout;
  private notifRetryTimer?: NodeJS.Timeout;

  private isRunningSla48h = false;
  private isRunningSla168h = false;
  private isRunningNotifRetry = false;

  private isStopping = false;

  // Telemetry metrics
  public stats: {
    sla48h: JobExecutionStats;
    sla168h: JobExecutionStats;
    notifRetry: JobExecutionStats;
  } = {
    sla48h: { totalRuns: 0, itemsProcessed: 0 },
    sla168h: { totalRuns: 0, itemsProcessed: 0 },
    notifRetry: { totalRuns: 0, itemsProcessed: 0 },
  };

  // Default execution intervals (milliseconds)
  private readonly INTERVALS = {
    SLA_48H_MS: 5 * 60 * 1000, // 5 minutes
    SLA_168H_MS: 5 * 60 * 1000, // 5 minutes
    NOTIF_RETRY_MS: 2 * 60 * 1000, // 2 minutes
  };

  /**
   * Starts all automated background workers.
   */
  start(options?: {
    runImmediately?: boolean;
    slaIntervalMs?: number;
    notifIntervalMs?: number;
  }): void {
    if (this.isStopping) {
      logger.warn('[SCHEDULER] Cannot start scheduler while shutdown is in progress.');
      return;
    }

    const slaMs = options?.slaIntervalMs || this.INTERVALS.SLA_48H_MS;
    const notifMs = options?.notifIntervalMs || this.INTERVALS.NOTIF_RETRY_MS;

    logger.info('[SCHEDULER] Initializing autonomous background job scheduler...', {
      sla48hIntervalMs: slaMs,
      sla168hIntervalMs: slaMs,
      notifRetryIntervalMs: notifMs,
    });

    // Schedule 48-hour SLA evaluation job
    this.sla48hTimer = setInterval(async () => {
      await this.runSla48hEvaluation();
    }, slaMs);

    // Schedule 168-hour closure SLA evaluation job
    this.sla168hTimer = setInterval(async () => {
      await this.runSla168hEvaluation();
    }, slaMs);

    // Schedule notification outbox retry & dead-letter escalation job
    this.notifRetryTimer = setInterval(async () => {
      await this.runNotificationRetry();
    }, notifMs);

    // Unref timers so they do not artificially keep Node process alive if shutdown is triggered
    this.sla48hTimer.unref();
    this.sla168hTimer.unref();
    this.notifRetryTimer.unref();

    if (options?.runImmediately) {
      // Trigger initial tick asynchronously after 2 seconds to allow connection pool warm-up
      setTimeout(async () => {
        if (!this.isStopping) {
          await Promise.allSettled([
            this.runSla48hEvaluation(),
            this.runSla168hEvaluation(),
            this.runNotificationRetry(),
          ]);
        }
      }, 2000).unref();
    }
  }

  /**
   * Evaluates 48-hour acknowledgement SLA threshold across all open tickets.
   * Concurrency safe: protected by internal lock and Oracle FOR UPDATE SKIP LOCKED.
   */
  async runSla48hEvaluation(): Promise<{ evaluatedCount: number; newBreachesCount: number } | null> {
    if (this.isRunningSla48h || this.isStopping) {
      logger.debug('[SCHEDULER] 48h SLA job tick skipped: previous run still in progress.');
      return null;
    }

    this.isRunningSla48h = true;
    this.stats.sla48h.totalRuns++;
    this.stats.sla48h.lastRunAt = new Date();

    try {
      const result = await slaMonitoringService.evaluate48hSlaBreaches('00000000-0000-0000-0000-000000000001');
      this.stats.sla48h.itemsProcessed += result.newBreachesCount;
      this.stats.sla48h.lastSuccessAt = new Date();

      if (result.newBreachesCount > 0) {
        logger.info(
          `[SCHEDULER] 48h SLA evaluator flagged ${result.newBreachesCount} new breach(es) across ${result.evaluatedCount} ticket(s).`
        );
      }
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.stats.sla48h.lastErrorAt = new Date();
      this.stats.sla48h.lastErrorMessage = msg;
      logger.error('[SCHEDULER] 48h SLA evaluator failed', { error: msg });
      return null;
    } finally {
      this.isRunningSla48h = false;
    }
  }

  /**
   * Evaluates 168-hour closure SLA threshold across all open tickets.
   */
  async runSla168hEvaluation(): Promise<{ evaluatedCount: number; newBreachesCount: number } | null> {
    if (this.isRunningSla168h || this.isStopping) {
      logger.debug('[SCHEDULER] 168h SLA job tick skipped: previous run still in progress.');
      return null;
    }

    this.isRunningSla168h = true;
    this.stats.sla168h.totalRuns++;
    this.stats.sla168h.lastRunAt = new Date();

    try {
      const result = await slaMonitoringService.evaluate168hSlaBreaches('00000000-0000-0000-0000-000000000001');
      this.stats.sla168h.itemsProcessed += result.newBreachesCount;
      this.stats.sla168h.lastSuccessAt = new Date();

      if (result.newBreachesCount > 0) {
        logger.info(
          `[SCHEDULER] 168h SLA evaluator flagged ${result.newBreachesCount} new breach(es) across ${result.evaluatedCount} ticket(s).`
        );
      }
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.stats.sla168h.lastErrorAt = new Date();
      this.stats.sla168h.lastErrorMessage = msg;
      logger.error('[SCHEDULER] 168h SLA evaluator failed', { error: msg });
      return null;
    } finally {
      this.isRunningSla168h = false;
    }
  }

  /**
   * Retries eligible failed notifications and escalates exhausted notifications to dead-letter queue.
   */
  async runNotificationRetry(): Promise<{ succeededCount: number; failedCount: number; escalatedCount: number } | null> {
    if (this.isRunningNotifRetry || this.isStopping) {
      logger.debug('[SCHEDULER] Notification retry job tick skipped: previous run still in progress.');
      return null;
    }

    this.isRunningNotifRetry = true;
    this.stats.notifRetry.totalRuns++;
    this.stats.notifRetry.lastRunAt = new Date();

    try {
      const result = await notificationService.retryFailedNotifications();
      this.stats.notifRetry.itemsProcessed += result.succeededCount + result.escalatedCount;
      this.stats.notifRetry.lastSuccessAt = new Date();

      if (result.succeededCount > 0 || result.escalatedCount > 0) {
        logger.info(
          `[SCHEDULER] Notification retry complete. Succeeded: ${result.succeededCount}, Failed: ${result.failedCount}, Dead-letter escalated: ${result.escalatedCount}`
        );
      }
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.stats.notifRetry.lastErrorAt = new Date();
      this.stats.notifRetry.lastErrorMessage = msg;
      logger.error('[SCHEDULER] Notification retry cycle failed', { error: msg });
      return null;
    } finally {
      this.isRunningNotifRetry = false;
    }
  }

  /**
   * Stops all scheduler timers and gracefully awaits in-flight executions.
   */
  async stop(): Promise<void> {
    this.isStopping = true;
    logger.info('[SCHEDULER] Stopping background scheduler...');

    if (this.sla48hTimer) clearInterval(this.sla48hTimer);
    if (this.sla168hTimer) clearInterval(this.sla168hTimer);
    if (this.notifRetryTimer) clearInterval(this.notifRetryTimer);

    // Wait up to 5 seconds for in-flight tasks to terminate
    const startWait = Date.now();
    while (
      (this.isRunningSla48h || this.isRunningSla168h || this.isRunningNotifRetry) &&
      Date.now() - startWait < 5000
    ) {
      await new Promise((res) => setTimeout(res, 100));
    }

    logger.info('[SCHEDULER] Background scheduler stopped cleanly.');
  }

  /**
   * Returns current scheduler health and telemetry status.
   */
  getStatus(): {
    active: boolean;
    isRunning: {
      sla48h: boolean;
      sla168h: boolean;
      notifRetry: boolean;
    };
    stats: {
      sla48h: JobExecutionStats;
      sla168h: JobExecutionStats;
      notifRetry: JobExecutionStats;
    };
  } {
    return {
      active: !this.isStopping && Boolean(this.sla48hTimer || this.notifRetryTimer),
      isRunning: {
        sla48h: this.isRunningSla48h,
        sla168h: this.isRunningSla168h,
        notifRetry: this.isRunningNotifRetry,
      },
      stats: this.stats,
    };
  }
}

export const backgroundScheduler = new BackgroundScheduler();
