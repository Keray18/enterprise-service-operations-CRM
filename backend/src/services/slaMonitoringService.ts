import { getOracleConnection } from '../database/oraclePool.js';
import { serviceRequestEventRepository } from '../database/repositories/serviceRequestEventRepository.js';
import { serviceRequestRepository } from '../database/repositories/serviceRequestRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { logger } from '../logging/logger.js';
import { SlaEvaluationResult } from '../types/asf.js';

export class SlaMonitoringService {
  /**
   * Evaluates all unacknowledged tickets that exceeded their 48-hour acknowledgement deadline.
   * Concurrency-safe: uses row locks and idempotency flags (SLA_BREACHED_48H = 'Y') to ensure
   * repeated scheduler executions or multiple app instances never duplicate breach events.
   */
  async evaluate48hSlaBreaches(actorUserId?: string): Promise<SlaEvaluationResult> {
    const conn = await getOracleConnection();
    const breachedRequestIds: string[] = [];

    try {
      // Find unacknowledged requests that exceeded deadline and have not been marked breached
      const overdueRequests = await serviceRequestRepository.findUnacknowledgedSlaBreaches(conn);

      let fallbackUserId = actorUserId;
      if (!fallbackUserId) {
        const adminUser = await userRepository.findByUsernameOrEmail('admin');
        fallbackUserId = adminUser?.userId || '958d124e-135d-44de-b72c-f7ee96081205';
      }

      for (const req of overdueRequests) {
        try {
          // 1. Mark SLA breached in database
          await serviceRequestRepository.markSlaBreach(req.requestId, conn);

          // 2. Append immutable lifecycle event
          await serviceRequestEventRepository.createEvent(
            {
              requestId: req.requestId,
              fromState: req.status,
              toState: req.status,
              eventType: 'SLA_48H_BREACHED',
              triggeredByUserId: req.registeredBy || fallbackUserId || '958d124e-135d-44de-b72c-f7ee96081205',
              triggeredByUsername: 'SYSTEM_SLA_DAEMON',
              triggeredByRole: 'SYSTEM',
              remarks: '48-hour acknowledgement SLA threshold exceeded. Flagged for supervisor review.',
              metadataJson: {
                jobNumber: req.jobNumber,
                registeredAt: req.registeredAt,
                sla48hExpiresAt: req.sla48hExpiresAt,
                evaluatedAt: new Date(),
              },
            },
            conn
          );

          await conn.commit();
          breachedRequestIds.push(req.requestId);

          logger.warn(`[SLA MONITOR] 48h acknowledgement breach flagged for job #${req.jobNumber} (ID: ${req.requestId})`);
        } catch (err: unknown) {
          await conn.rollback();
          logger.error(`[SLA MONITOR] Failed to process breach for job #${req.jobNumber}`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return {
        evaluatedCount: overdueRequests.length,
        newBreachesCount: breachedRequestIds.length,
        breachedRequestIds,
      };
    } finally {
      await conn.close();
    }
  }

  /**
   * Helper to calculate remaining SLA milliseconds and status badge label for UI.
   */
  calculateSlaStatus(registeredAt: Date, slaExpiresAt?: Date, acknowledgedAt?: Date): {
    isBreached: boolean;
    remainingMs: number;
    remainingHours: number;
    statusLabel: 'ACKNOWLEDGED' | 'ON_TRACK' | 'URGENT' | 'BREACHED';
  } {
    if (acknowledgedAt) {
      return {
        isBreached: false,
        remainingMs: 0,
        remainingHours: 0,
        statusLabel: 'ACKNOWLEDGED',
      };
    }

    const deadline = slaExpiresAt ? new Date(slaExpiresAt).getTime() : new Date(registeredAt).getTime() + 48 * 3600 * 1000;
    const now = Date.now();
    const remainingMs = deadline - now;
    const remainingHours = Math.round((remainingMs / (3600 * 1000)) * 10) / 10;

    if (remainingMs <= 0) {
      return {
        isBreached: true,
        remainingMs: 0,
        remainingHours: 0,
        statusLabel: 'BREACHED',
      };
    }

    if (remainingHours <= 12) {
      return {
        isBreached: false,
        remainingMs,
        remainingHours,
        statusLabel: 'URGENT',
      };
    }

    return {
      isBreached: false,
      remainingMs,
      remainingHours,
      statusLabel: 'ON_TRACK',
    };
  }
}

export const slaMonitoringService = new SlaMonitoringService();
