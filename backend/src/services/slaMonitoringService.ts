import { getOracleConnection } from '../database/oraclePool.js';
import { serviceRequestEventRepository } from '../database/repositories/serviceRequestEventRepository.js';
import { serviceRequestRepository } from '../database/repositories/serviceRequestRepository.js';
import { slaPenaltyRepository } from '../database/repositories/slaPenaltyRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { logger } from '../logging/logger.js';
import { SlaEvaluationResult } from '../types/asf.js';

export class SlaMonitoringService {
  /**
   * Evaluates all unacknowledged tickets that exceeded their 48-hour acknowledgement deadline.
   * Concurrency-safe: uses row locks and idempotency flags (SLA_BREACHED_48H = 'Y') to ensure
   * repeated scheduler executions or multiple app instances never duplicate breach events.
   * Invariant: Never automatically debits an ASF; penalty record initializes in PENDING_REVIEW.
   */
  async evaluate48hSlaBreaches(actorUserId?: string): Promise<SlaEvaluationResult> {
    const conn = await getOracleConnection();
    const breachedRequestIds: string[] = [];

    try {
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

          // 2. Record SLA penalty in PENDING_REVIEW (NEVER auto debited!)
          const asfLocId = req.assignedLocationId || '00000000-0000-0000-0004-000000000001';
          const regDate = req.registeredAt && !isNaN(new Date(req.registeredAt).getTime())
            ? new Date(req.registeredAt)
            : req.createdAt
              ? new Date(req.createdAt)
              : new Date();
          const elapsedHours48 = Math.max(0, Math.round(((Date.now() - regDate.getTime()) / (1000 * 3600)) * 100) / 100);

          await slaPenaltyRepository.recordBreach(
            {
              serviceRequestId: req.requestId,
              asfLocationId: asfLocId,
              breachType: 'SLA_48H_ACKNOWLEDGEMENT',
              breachTimestamp: new Date(),
              calculatedAmount: 0.0,
              policyVersion: 'UNCONFIGURED',
              configStatus: 'AWAITING_POLICY_CONFIGURATION',
              elapsedHours: elapsedHours48,
              thresholdHours: 48.0,
            },
            conn
          );

          // 3. Append immutable lifecycle event
          await serviceRequestEventRepository.createEvent(
            {
              requestId: req.requestId,
              fromState: req.status,
              toState: req.status,
              eventType: 'SLA_48H_BREACHED',
              triggeredByUserId: req.registeredBy || fallbackUserId || '958d124e-135d-44de-b72c-f7ee96081205',
              triggeredByUsername: 'SYSTEM_SLA_DAEMON',
              triggeredByRole: 'SYSTEM',
              remarks: '48-hour acknowledgement SLA threshold exceeded. Flagged for review; awaiting approved penalty policy configuration.',
              metadataJson: {
                jobNumber: req.jobNumber,
                registeredAt: req.registeredAt,
                sla48hExpiresAt: req.sla48hExpiresAt,
                elapsedHours: elapsedHours48,
                thresholdHours: 48.0,
                policyVersion: 'UNCONFIGURED',
                configStatus: 'AWAITING_POLICY_CONFIGURATION',
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
          logger.error(`[SLA MONITOR] Failed to process 48h breach for job #${req.jobNumber}`, {
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
   * Evaluates all unclosed tickets that exceeded 168 hours (7 days) without closure.
   * Concurrency-safe: utilizes SKIP LOCKED row locks. Pauses during PNA and estimates per Decision 2.2.
   * Invariant: Never automatically debits an ASF; penalty record initializes in PENDING_REVIEW.
   */
  async evaluate168hSlaBreaches(actorUserId?: string): Promise<SlaEvaluationResult> {
    const conn = await getOracleConnection();
    const breachedRequestIds: string[] = [];

    try {
      const overdueRequests = await serviceRequestRepository.findUnclosed168hSlaBreaches(conn);

      let fallbackUserId = actorUserId;
      if (!fallbackUserId) {
        const adminUser = await userRepository.findByUsernameOrEmail('admin');
        fallbackUserId = adminUser?.userId || '958d124e-135d-44de-b72c-f7ee96081205';
      }

      for (const req of overdueRequests) {
        try {
          // 1. Mark 168h SLA breached in database
          await serviceRequestRepository.mark168hSlaBreach(req.requestId, conn);

          // 2. Record SLA penalty in PENDING_REVIEW (NEVER auto debited!)
          const asfLocId = req.assignedLocationId || '00000000-0000-0000-0004-000000000001';
          const createdTime = req.createdAt ? new Date(req.createdAt).getTime() : Date.now();
          const elapsedHours168 = Math.round(((Date.now() - createdTime) / (1000 * 3600)) * 100) / 100;

          await slaPenaltyRepository.recordBreach(
            {
              serviceRequestId: req.requestId,
              asfLocationId: asfLocId,
              breachType: 'SLA_168H_CLOSURE',
              breachTimestamp: new Date(),
              calculatedAmount: 0.0,
              policyVersion: 'UNCONFIGURED',
              configStatus: 'AWAITING_POLICY_CONFIGURATION',
              elapsedHours: elapsedHours168,
              thresholdHours: 168.0,
            },
            conn
          );

          // 3. Append immutable lifecycle event
          await serviceRequestEventRepository.createEvent(
            {
              requestId: req.requestId,
              fromState: req.status,
              toState: req.status,
              eventType: 'SLA_168H_BREACHED',
              triggeredByUserId: fallbackUserId || '958d124e-135d-44de-b72c-f7ee96081205',
              triggeredByUsername: 'SYSTEM_SLA_DAEMON',
              triggeredByRole: 'SYSTEM',
              remarks: '168-hour (7-day) closure SLA threshold exceeded. Flagged for review; awaiting approved penalty policy configuration.',
              metadataJson: {
                jobNumber: req.jobNumber,
                createdAt: req.createdAt,
                elapsedHours: elapsedHours168,
                thresholdHours: 168.0,
                policyVersion: 'UNCONFIGURED',
                configStatus: 'AWAITING_POLICY_CONFIGURATION',
                evaluatedAt: new Date(),
              },
            },
            conn
          );

          await conn.commit();
          breachedRequestIds.push(req.requestId);

          logger.warn(`[SLA MONITOR] 168h closure breach flagged for job #${req.jobNumber} (ID: ${req.requestId})`);
        } catch (err: unknown) {
          await conn.rollback();
          logger.error(`[SLA MONITOR] Failed to process 168h breach for job #${req.jobNumber}`, {
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
   * Evaluates all SLA thresholds (48h acknowledgement and 168h closure).
   */
  async evaluateAllSlaBreaches(actorUserId?: string): Promise<{
    ack48h: SlaEvaluationResult;
    closure168h: SlaEvaluationResult;
    timestamp: Date;
  }> {
    const ack48h = await this.evaluate48hSlaBreaches(actorUserId);
    const closure168h = await this.evaluate168hSlaBreaches(actorUserId);
    return {
      ack48h,
      closure168h,
      timestamp: new Date(),
    };
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
