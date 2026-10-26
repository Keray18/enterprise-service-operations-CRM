import crypto from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOracleConnection } from '../src/database/oraclePool.js';
import { notificationRepository } from '../src/database/repositories/notificationRepository.js';
import { reportingRepository } from '../src/database/repositories/reportingRepository.js';
import { serviceRequestRepository } from '../src/database/repositories/serviceRequestRepository.js';
import { serviceClaimRepository } from '../src/database/repositories/serviceClaimRepository.js';
import { slaPenaltyRepository } from '../src/database/repositories/slaPenaltyRepository.js';
import { financeService } from '../src/services/financeService.js';
import { mockSmsAdapter, notificationService } from '../src/services/notificationService.js';
import { reportingService } from '../src/services/reportingService.js';
import { slaMonitoringService } from '../src/services/slaMonitoringService.js';
import { AuthenticatedUser } from '../src/types/auth.js';
import { backgroundScheduler } from '../src/workers/backgroundScheduler.js';

describe('Phase 5: SLA Evaluation, Notification Retries, Role Scoped Reporting & Operational Hardening', () => {
  const adminActor: AuthenticatedUser = {
    userId: '958d124e-135d-44de-b72c-f7ee96081205',
    username: 'admin',
    email: 'admin@enterprise.local',
    fullName: 'System Administrator',
    roles: ['ADMIN'],
    permissions: ['reports:view', 'sla:manage', 'system:audit', 'finance:approve', 'finance:read', 'finance:claims'],
  };

  const financeActor: AuthenticatedUser = {
    userId: '00000000-0000-0000-0000-000000000006',
    username: 'finance_officer',
    email: 'finance@enterprise.local',
    fullName: 'Finance Officer',
    roles: ['FINANCE'],
    permissions: ['reports:view', 'finance:approve', 'finance:read', 'finance:claims'],
  };

  const mumbaiAsfId = '00000000-0000-0000-0004-000000000001';
  const delhiWhId = '00000000-0000-0000-0004-000000000002';
  const skatercatBrandId = '00000000-0000-0000-0001-000000000001';

  const asfActor: AuthenticatedUser = {
    userId: '00000000-0000-0000-0000-000000000099',
    username: 'mumbai_asf_mgr',
    email: 'mumbai.asf@franchise.local',
    fullName: 'Mumbai Service Manager',
    locationId: mumbaiAsfId,
    roles: ['ASF'],
    permissions: ['reports:view'],
  };

  const createdRequestIds: string[] = [];

  beforeAll(async () => {
    mockSmsAdapter.clear();
  });

  afterAll(async () => {
    // Clean up test records
    const conn = await getOracleConnection();
    try {
      if (createdRequestIds.length > 0) {
        for (const reqId of createdRequestIds) {
          await conn.execute('DELETE FROM SLA_PENALTY_RECORDS WHERE SERVICE_REQUEST_ID = :id', { id: reqId });
          await conn.execute('DELETE FROM SERVICE_REQUEST_EVENTS WHERE REQUEST_ID = :id', { id: reqId });
          await conn.execute('DELETE FROM NOTIFICATIONS_OUTBOX WHERE REQUEST_ID = :id', { id: reqId });
          await conn.execute('DELETE FROM CLAIM_LINE_ITEMS WHERE SERVICE_REQUEST_ID = :id', { id: reqId });
          await conn.execute('DELETE FROM SERVICE_REQUEST_PARTS WHERE REQUEST_ID = :id', { id: reqId });
          await conn.execute('DELETE FROM SERVICE_REQUEST_VERIFICATIONS WHERE REQUEST_ID = :id', { id: reqId });
          await conn.execute('DELETE FROM SERVICE_REQUESTS WHERE REQUEST_ID = :id', { id: reqId });
        }
        await conn.commit();
      }
    } finally {
      await conn.close();
    }
  });

  // ============================================================================
  // 1. Reliable SLA Monitoring & Penalty Recording
  // ============================================================================

  describe('1. Reliable SLA Evaluation Engine (48h & 168h)', () => {
    it('should detect 48h acknowledgement breach, record lifecycle event, and create SLA penalty in PENDING_REVIEW', async () => {
      const conn = await getOracleConnection();
      let testReqId: string;
      try {
        testReqId = crypto.randomUUID();
        const randJob = `JOB-SLA-48-${Date.now().toString().slice(-6)}`;
        // Insert an unacknowledged job where SLA_48H_EXPIRES_AT is in the past
        await conn.execute(
          `INSERT INTO SERVICE_REQUESTS (
            REQUEST_ID, JOB_NUMBER, CUSTOMER_ID, BRAND_ID, PRODUCT_ID, MODEL_ID,
            CALL_TYPE, STATUS, ASSIGNED_LOCATION_ID, SLA_48H_EXPIRES_AT,
            SLA_BREACHED_48H, REGISTERED_AT, CREATED_AT, UPDATED_AT
          ) VALUES (
            :reqId, :jobNumber, '00000000-0000-0000-0009-000000000001',
            '00000000-0000-0000-0001-000000000001',
            '00000000-0000-0000-0002-000000000001',
            '00000000-0000-0000-0003-000000000001',
            'REPAIR', 'REGISTERED', :asfId,
            SYSTIMESTAMP - INTERVAL '2' HOUR,
            'N', SYSTIMESTAMP - INTERVAL '50' HOUR, SYSTIMESTAMP - INTERVAL '50' HOUR, SYSTIMESTAMP
          )`,
          { reqId: testReqId, jobNumber: randJob, asfId: mumbaiAsfId }
        );
        await conn.commit();
        createdRequestIds.push(testReqId);
      } finally {
        await conn.close();
      }

      // Execute SLA Evaluation
      const result = await slaMonitoringService.evaluate48hSlaBreaches(adminActor.userId);
      expect(result.breachedRequestIds).toContain(testReqId);

      // Verify DB record updated
      const updatedReq = await serviceRequestRepository.findById(testReqId);
      expect(updatedReq?.slaBreached48h).toBe('Y');
      expect(updatedReq?.slaBreached48hAt).toBeDefined();

      // Verify SLA penalty was recorded in PENDING_REVIEW (NEVER auto debited!)
      const penalties = await slaPenaltyRepository.listPenalties({ serviceRequestId: testReqId });
      expect(penalties.items.length).toBeGreaterThan(0);
      const ackPenalty = penalties.items.find((p) => p.breachType === 'SLA_48H_ACKNOWLEDGEMENT');
      expect(ackPenalty).toBeDefined();
      expect(ackPenalty!.status).toBe('PENDING_REVIEW');
      expect(ackPenalty!.calculatedAmount).toBe(0.0); // Hardcoded amounts removed per audit policy
      expect(ackPenalty!.policyVersion).toBe('UNCONFIGURED');
      expect(ackPenalty!.configStatus).toBe('AWAITING_POLICY_CONFIGURATION');
      expect(ackPenalty!.thresholdHours).toBe(48.0);
      expect(ackPenalty!.elapsedHours).toBeGreaterThanOrEqual(48);
      expect(ackPenalty!.journalId).toBeUndefined(); // Strict Invariant: No automatic financial debit

      // Test idempotency: re-running evaluation does not re-flag or duplicate penalty
      const rerun = await slaMonitoringService.evaluate48hSlaBreaches(adminActor.userId);
      expect(rerun.breachedRequestIds).not.toContain(testReqId);
    });

    it('should detect 168h closure breach, record penalty in PENDING_REVIEW, and preserve paused states', async () => {
      const conn = await getOracleConnection();
      let testReqId: string;
      let pausedReqId: string;
      try {
        testReqId = crypto.randomUUID();
        pausedReqId = crypto.randomUUID();

        // 1. Unclosed request older than 7 days (168 hours)
        await conn.execute(
          `INSERT INTO SERVICE_REQUESTS (
            REQUEST_ID, JOB_NUMBER, CUSTOMER_ID, BRAND_ID, PRODUCT_ID, MODEL_ID,
            CALL_TYPE, STATUS, ASSIGNED_LOCATION_ID,
            SLA_BREACHED_168H, CREATED_AT, UPDATED_AT
          ) VALUES (
            :reqId, :jobNumber, '00000000-0000-0000-0009-000000000001',
            '00000000-0000-0000-0001-000000000001',
            '00000000-0000-0000-0002-000000000001',
            '00000000-0000-0000-0003-000000000001',
            'REPAIR', 'IN_PROGRESS_REPAIR', :asfId,
            'N', SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP
          )`,
          { reqId: testReqId, jobNumber: `JOB-SLA-168-${Date.now().toString().slice(-6)}`, asfId: mumbaiAsfId }
        );

        // 2. Unclosed request older than 7 days in PENDING_SPARE_PART (SLA Paused state)
        await conn.execute(
          `INSERT INTO SERVICE_REQUESTS (
            REQUEST_ID, JOB_NUMBER, CUSTOMER_ID, BRAND_ID, PRODUCT_ID, MODEL_ID,
            CALL_TYPE, STATUS, ASSIGNED_LOCATION_ID,
            SLA_BREACHED_168H, CREATED_AT, UPDATED_AT
          ) VALUES (
            :reqId, :jobNumber, '00000000-0000-0000-0009-000000000001',
            '00000000-0000-0000-0001-000000000001',
            '00000000-0000-0000-0002-000000000001',
            '00000000-0000-0000-0003-000000000001',
            'REPAIR', 'PENDING_SPARE_PART', :asfId,
            'N', SYSTIMESTAMP - INTERVAL '9' DAY, SYSTIMESTAMP
          )`,
          { reqId: pausedReqId, jobNumber: `JOB-PAUSED-${Date.now().toString().slice(-6)}`, asfId: mumbaiAsfId }
        );

        await conn.commit();
        createdRequestIds.push(testReqId, pausedReqId);
      } finally {
        await conn.close();
      }

      // Execute 168h SLA Evaluation
      const result = await slaMonitoringService.evaluate168hSlaBreaches(adminActor.userId);
      expect(result.breachedRequestIds).toContain(testReqId);
      // Paused state must NOT be breached per Decision 2.2
      expect(result.breachedRequestIds).not.toContain(pausedReqId);

      // Verify active breach was recorded in PENDING_REVIEW
      const penalties = await slaPenaltyRepository.listPenalties({ serviceRequestId: testReqId });
      const closurePenalty = penalties.items.find((p) => p.breachType === 'SLA_168H_CLOSURE');
      expect(closurePenalty).toBeDefined();
      expect(closurePenalty!.status).toBe('PENDING_REVIEW');
      expect(closurePenalty!.calculatedAmount).toBe(0.0); // Hardcoded amounts removed per audit policy
      expect(closurePenalty!.policyVersion).toBe('UNCONFIGURED');
      expect(closurePenalty!.configStatus).toBe('AWAITING_POLICY_CONFIGURATION');
      expect(closurePenalty!.thresholdHours).toBe(168.0);
      expect(closurePenalty!.elapsedHours).toBeGreaterThanOrEqual(168);
    });

    it('should strictly gate SLA penalty approval: unconfigured penalty requires commercial policy authorization', async () => {
      // Find one of the recorded breaches in PENDING_REVIEW
      const penalties = await slaPenaltyRepository.listPenalties({ status: 'PENDING_REVIEW' });
      expect(penalties.items.length).toBeGreaterThan(0);
      const penalty = penalties.items[0];

      // 1. Attempting to APPROVE without authorizedAmount & policyReference must fail
      await expect(
        financeService.reviewPenalty(
          penalty.penaltyId,
          {
            action: 'APPROVE',
            reviewRemarks: 'Attempting to approve zero/unconfigured liability without policy backing',
          },
          financeActor
        )
      ).rejects.toThrow(/awaiting policy configuration|MISSING_POLICY_CONFIGURATION/i);

      // 2. Approving with authorized commercial amount and policy version succeeds
      const approved = await financeService.reviewPenalty(
        penalty.penaltyId,
        {
          action: 'APPROVE',
          reviewRemarks: 'Approved following commercial audit committee sign-off',
          authorizedAmount: 500.0,
          policyReference: 'POLICY_COMMERCIAL_SLA_2026_V1',
        },
        financeActor
      );

      expect(approved.status).toBe('APPROVED');
      expect(approved.calculatedAmount).toBe(500.0);
      expect(approved.configStatus).toBe('CONFIGURED');
      expect(approved.policyVersion).toBe('POLICY_COMMERCIAL_SLA_2026_V1');
      expect(approved.journalId).toBeUndefined(); // Invariant: Approving SLA evaluation never automatically posts GL journal
    });

    it('should allow waiving and disputing penalties with documented justification', async () => {
      const penalties = await slaPenaltyRepository.listPenalties({ status: 'PENDING_REVIEW' });
      if (penalties.items.length > 0) {
        const p1 = penalties.items[0];

        // Dispute penalty
        const disputed = await financeService.reviewPenalty(
          p1.penaltyId,
          {
            action: 'DISPUTE',
            reviewRemarks: 'Disputed due to documented severe flooding in region',
          },
          financeActor
        );
        expect(disputed.status).toBe('DISPUTED');

        // Waive disputed penalty
        const waived = await financeService.reviewPenalty(
          p1.penaltyId,
          {
            action: 'WAIVE',
            reviewRemarks: 'Waived 100% due to force majeure weather proof',
            waiverPercentage: 100,
          },
          financeActor
        );
        expect(waived.status).toBe('WAIVED');
        expect(waived.calculatedAmount).toBe(0.0);
        expect(waived.configStatus).toBe('EXEMPT');
      }
    });
  });

  // ============================================================================
  // 2. Notification Outbox Retries & Dead-Letter Escalation
  // ============================================================================

  describe('2. Notification Outbox Retries & Escalation Engine', () => {
    it('should retry queued/failed notifications and record outbox telemetry', async () => {
      // Enqueue a test notification
      const testNotif = await notificationRepository.enqueueNotification({
        recipient: '+919876543210',
        templateCode: 'SMS_01_REGISTRATION',
        messageBody: 'Dear Customer, your service request test notification is registered.',
      });

      // Run retry daemon
      mockSmsAdapter.clear();
      const retryResult = await notificationService.retryFailedNotifications(3);

      expect(retryResult.processedCount).toBeGreaterThan(0);
      expect(retryResult.succeededCount).toBeGreaterThan(0);

      const updated = await notificationRepository.findById(testNotif.notificationId);
      expect(updated?.status).toBe('SENT');
      expect(updated?.providerMessageId).toBeDefined();

      // Verify outbox metrics
      const metrics = await notificationService.getMetrics();
      expect(metrics.total).toBeGreaterThan(0);
      expect(metrics.sent).toBeGreaterThan(0);
    });

    it('should dead-letter exhausted notifications after maximum retries', async () => {
      // Enqueue a notification with retryCount already at 2
      const notif = await notificationRepository.enqueueNotification({
        recipient: '+919999999999',
        templateCode: 'SMS_07_CANCELLED',
        messageBody: 'Test retry exhaustion message.',
      });

      // Set fail simulation on mock adapter
      mockSmsAdapter.setAlwaysFail(true);

      // Artificially increment retryCount to 2
      const conn = await getOracleConnection();
      try {
        await conn.execute(
          `UPDATE NOTIFICATIONS_OUTBOX SET STATUS = 'FAILED', RETRY_COUNT = 2 WHERE NOTIFICATION_ID = :id`,
          { id: notif.notificationId },
          { autoCommit: true }
        );
      } finally {
        await conn.close();
      }

      // Execute retry daemon (maxRetries = 3)
      const res = await notificationService.retryFailedNotifications(3);
      expect(res.escalatedCount).toBeGreaterThanOrEqual(1);

      const check = await notificationRepository.findById(notif.notificationId);
      expect(check?.status).toBe('FAILED');
      expect(check?.retryCount).toBeGreaterThanOrEqual(3);
      expect(check?.errorMessage).toContain('MAX_RETRIES_EXCEEDED');

      mockSmsAdapter.setAlwaysFail(false);
    });

    it('should autonomously schedule, execute, and cleanly stop background jobs', async () => {
      // Start scheduler in non-immediate mode
      backgroundScheduler.start({ runImmediately: false, slaIntervalMs: 60000, notifIntervalMs: 60000 });
      const statusBefore = backgroundScheduler.getStatus();
      expect(statusBefore.active).toBe(true);

      // Execute manual ticks
      const sla48Res = await backgroundScheduler.runSla48hEvaluation();
      expect(sla48Res).toBeDefined();

      const sla168Res = await backgroundScheduler.runSla168hEvaluation();
      expect(sla168Res).toBeDefined();

      const notifRes = await backgroundScheduler.runNotificationRetry();
      expect(notifRes).toBeDefined();

      // Gracefully stop scheduler
      await backgroundScheduler.stop();
      const statusAfter = backgroundScheduler.getStatus();
      expect(statusAfter.active).toBe(false);
    });
  });

  // ============================================================================
  // 3. Role-Scoped Reporting Hub & Streaming Exports
  // ============================================================================

  describe('3. Role-Scoped Reporting Hub & Streaming Exports', () => {
    it('should enforce server-side location scope on Call Register for ASF role', async () => {
      // Query as Admin (unrestricted)
      const adminReport = await reportingService.getCallRegister({ limit: 10 }, adminActor);
      expect(Array.isArray(adminReport)).toBe(true);

      // Query as ASF Manager (location locked to Mumbai ASF)
      const asfReport = await reportingService.getCallRegister({ limit: 10 }, asfActor);
      expect(Array.isArray(asfReport)).toBe(true);

      // Verify that all rows in ASF report belong to Mumbai ASF
      for (const row of asfReport) {
        expect(row.assignedLocation).toBe('Mumbai Central Service Franchise');
      }
    });

    it('should query Part Consumption & Defect Trend Report', async () => {
      const report = await reportingService.getPartConsumption({ limit: 10 }, adminActor);
      expect(Array.isArray(report)).toBe(true);
    });

    it('should query Warranty Claims & Settlement Audit Report', async () => {
      const claimsReport = await reportingService.getWarrantyClaims({ limit: 10 }, adminActor);
      expect(Array.isArray(claimsReport)).toBe(true);
    });

    it('should query Inventory Stock Valuation Report', async () => {
      const stockReport = await reportingService.getStockValuation({ limit: 10 }, adminActor);
      expect(Array.isArray(stockReport)).toBe(true);
      if (stockReport.length > 0) {
        const item = stockReport[0];
        expect(item.availableQuantity).toBe(item.onHandQuantity - item.reservedQuantity);
        expect(item.totalValuation).toBe(item.onHandQuantity * item.unitCostPrice);
      }
    });

    it('should aggregate Operational Queues metrics', async () => {
      const queues = await reportingService.getOperationalQueues(adminActor);
      expect(queues).toBeDefined();
      expect(typeof queues.unacknowledgedCalls).toBe('number');
      expect(typeof queues.inProgressRepairs).toBe('number');
      expect(typeof queues.pendingSlaPenalties).toBe('number');
      expect(typeof queues.pendingClaimAudits).toBe('number');
    });

    it('should stream Call Register CSV with headers and proper formatting', async () => {
      let writtenData = '';
      const mockRes: any = {
        setHeader: () => {},
        write: (chunk: string) => {
          writtenData += chunk;
        },
        end: () => {},
      };

      await reportingService.streamCallRegisterCsv({ limit: 5 }, adminActor, mockRes);
      expect(writtenData).toContain('Job Number,Registered At,Customer Name');
    });
  });

  // ============================================================================
  // 4. Schema-Level Guardrails & Claim Gating Checks
  // ============================================================================

  describe('4. Schema-Level Guardrails & Claim Gating Checks', () => {
    it('should strictly gate claim batch approval when line items have missing commercial rates (FLAGGED)', async () => {
      const conn = await getOracleConnection();
      let testReqId: string;
      let testClaimId: string;

      try {
        testReqId = crypto.randomUUID();
        const randJob = `JOB-FLAG-${Date.now().toString().slice(-6)}`;

        // Insert a closed service request with Happy Code verified
        await conn.execute(
          `INSERT INTO SERVICE_REQUESTS (
            REQUEST_ID, JOB_NUMBER, CUSTOMER_ID, BRAND_ID, PRODUCT_ID, MODEL_ID,
            CALL_TYPE, STATUS, ASSIGNED_LOCATION_ID,
            CREATED_AT, CLOSED_AT, UPDATED_AT
          ) VALUES (
            :reqId, :jobNumber, '00000000-0000-0000-0009-000000000001',
            '00000000-0000-0000-0001-000000000001',
            '00000000-0000-0000-0002-000000000001',
            '00000000-0000-0000-0003-000000000001',
            'REPAIR', 'CLOSED', :asfId,
            SYSTIMESTAMP - INTERVAL '10' DAY, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP
          )`,
          { reqId: testReqId, jobNumber: randJob, asfId: mumbaiAsfId }
        );

        await conn.execute(
          `INSERT INTO SERVICE_REQUEST_VERIFICATIONS (
            VERIFICATION_ID, REQUEST_ID, HAPPY_CODE_HASH, HAPPY_CODE_VERIFIED_AT, CREATED_AT
          ) VALUES (
            :vId, :reqId, 'mock_hash', SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP
          )`,
          { vId: crypto.randomUUID(), reqId: testReqId }
        );

        // Ensure test period (8/2024) is clean
        await conn.execute(
          `DELETE FROM CLAIM_LINE_ITEMS WHERE CLAIM_ID IN (
            SELECT CLAIM_ID FROM SERVICE_CLAIMS WHERE ASF_LOCATION_ID = :asfId AND BRAND_ID = :brandId AND CLAIM_MONTH = 8 AND CLAIM_YEAR = 2024
          )`,
          { asfId: mumbaiAsfId, brandId: skatercatBrandId }
        );
        await conn.execute(
          `DELETE FROM SERVICE_CLAIMS WHERE ASF_LOCATION_ID = :asfId AND BRAND_ID = :brandId AND CLAIM_MONTH = 8 AND CLAIM_YEAR = 2024`,
          { asfId: mumbaiAsfId, brandId: skatercatBrandId }
        );

        // Manually create a claim batch with a FLAGGED line item (simulating missing rate in CLAIM_RATE_MATRIX)
        const claim = await serviceClaimRepository.createClaimBatch(
          {
            claimMonth: 8,
            claimYear: 2024,
            asfLocationId: mumbaiAsfId,
            brandId: skatercatBrandId,
            totalJobsCount: 1,
            grossLaborAmount: 0.0,
            grossTravelAmount: 0.0,
            penaltyDeductionAmount: 0.0,
            netClaimAmount: 0.0,
            status: 'SUBMITTED',
            submittedBy: adminActor.userId,
            submittedByUsername: adminActor.username,
            lineItems: [
              {
                serviceRequestId: testReqId,
                jobNumber: randJob,
                callType: 'REPAIR',
                productName: 'Skatercat Test Appliance',
                isHappyCodeVerified: 'Y',
                completionTatHours: 12,
                tatAppliedPercentage: 100,
                baseLaborAmount: 0.0,
                claimableLaborAmount: 0.0,
                travelKm: 10.0,
                travelAmount: 0.0,
                penaltyAmount: 0.0,
                netLineAmount: 0.0,
                auditStatus: 'FLAGGED',
                auditNote: 'Commercial rate matrix missing for Brand/Product/CallType',
              },
            ],
          },
          conn
        );

        await conn.commit();
        testClaimId = claim.claimId;
        createdRequestIds.push(testReqId);
      } finally {
        await conn.close();
      }

      // 1. Gating Check: Approving without resolving FLAGGED line item must fail
      await expect(
        financeService.auditClaimBatch(
          testClaimId,
          {
            action: 'APPROVE',
          },
          financeActor
        )
      ).rejects.toThrow(/unresolved FLAGGED line item|UNRESOLVED_FLAGGED_LINE_ITEMS/i);

      // 2. Approving WITH explicit authorized line item adjustments succeeds
      const claimObj = await serviceClaimRepository.getClaimById(testClaimId);
      const flaggedItemId = claimObj!.lineItems![0].itemId;

      const approvedClaim = await financeService.auditClaimBatch(
        testClaimId,
        {
          action: 'APPROVE',
          lineItemAdjustments: [
            {
              itemId: flaggedItemId,
              auditStatus: 'VERIFIED',
              authorizedLaborRate: 350.0,
              authorizedTravelAmount: 50.0,
              auditNote: 'Authorized manually by Finance Officer per special brand concession',
            },
          ],
        },
        financeActor
      );

      expect(approvedClaim.status).toBe('POSTED');
      expect(approvedClaim.netClaimAmount).toBe(400.0);
      expect(approvedClaim.journalId).toBeDefined();
    });

    it('should support durable claim year bounds: allows 2036 but rejects corruption like 6854', async () => {
      const conn = await getOracleConnection();
      try {
        // 1. Year 2036 is valid under V017 durable range [2020 - 2099]
        const validYearId = crypto.randomUUID();
        await conn.execute(
          `INSERT INTO SERVICE_CLAIMS (
            CLAIM_ID, CLAIM_NUMBER, CLAIM_MONTH, CLAIM_YEAR,
            ASF_LOCATION_ID, BRAND_ID, TOTAL_JOBS_COUNT,
            GROSS_LABOR_AMOUNT, GROSS_TRAVEL_AMOUNT, NET_CLAIM_AMOUNT,
            STATUS, SUBMITTED_BY, SUBMITTED_BY_USERNAME, CREATED_AT
          ) VALUES (
            :id, 'CLM-203610-TEST', 10, 2036,
            :asfId, :brandId, 1, 350.0, 50.0, 400.0,
            'DRAFT', '00000000-0000-0000-0000-000000000001', 'admin', SYSTIMESTAMP
          )`,
          {
            id: validYearId,
            asfId: mumbaiAsfId,
            brandId: skatercatBrandId,
          }
        );
        await conn.commit();

        // Clean up valid test claim
        await conn.execute('DELETE FROM SERVICE_CLAIMS WHERE CLAIM_ID = :id', { id: validYearId });
        await conn.commit();

        // 2. Year 6854 is rejected by durable CHK_CLAIM_YEAR constraint
        await expect(
          conn.execute(
            `INSERT INTO SERVICE_CLAIMS (
              CLAIM_ID, CLAIM_NUMBER, CLAIM_MONTH, CLAIM_YEAR,
              ASF_LOCATION_ID, BRAND_ID, TOTAL_JOBS_COUNT,
              GROSS_LABOR_AMOUNT, GROSS_TRAVEL_AMOUNT, NET_CLAIM_AMOUNT,
              STATUS, SUBMITTED_BY, SUBMITTED_BY_USERNAME, CREATED_AT
            ) VALUES (
              :id, 'CLM-685410-TEST', 10, 6854,
              :asfId, :brandId, 1, 350.0, 50.0, 400.0,
              'DRAFT', '00000000-0000-0000-0000-000000000001', 'admin', SYSTIMESTAMP
            )`,
            {
              id: crypto.randomUUID(),
              asfId: mumbaiAsfId,
              brandId: skatercatBrandId,
            }
          )
        ).rejects.toThrow(/CHK_CLAIM_YEAR|check constraint/i);
      } finally {
        await conn.close();
      }
    });
  });
});
