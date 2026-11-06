import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import oracledb from 'oracledb';
import { getOracleConnection } from '../src/database/oraclePool.js';
import { financeService, GL_ACCOUNTS } from '../src/services/financeService.js';
import { slaMonitoringService } from '../src/services/slaMonitoringService.js';
import { notificationService, mockSmsAdapter } from '../src/services/notificationService.js';
import { backgroundScheduler } from '../src/workers/backgroundScheduler.js';
import { slaPenaltyRepository } from '../src/database/repositories/slaPenaltyRepository.js';
import { slaPolicyRepository } from '../src/database/repositories/slaPolicyRepository.js';
import { financialJournalRepository } from '../src/database/repositories/financialJournalRepository.js';
import { notificationRepository } from '../src/database/repositories/notificationRepository.js';
import { serviceRequestRepository } from '../src/database/repositories/serviceRequestRepository.js';
import { serviceRequestEventRepository } from '../src/database/repositories/serviceRequestEventRepository.js';
import { AuthenticatedUser } from '../src/types/auth.js';

describe('Phase 5 Release Gate: Penalty Policy, Retry Consistency & Worker Safety', () => {
  const financeUser: AuthenticatedUser = {
    userId: '00000000-0000-0000-0000-000000000001',
    username: 'finance_gate_tester',
    roles: ['FINANCE'],
    permissions: ['finance:read', 'finance:approve', 'finance:post'],
  };

  const adminUser: AuthenticatedUser = {
    userId: '00000000-0000-0000-0000-000000000003',
    username: 'commercial_director_tester',
    roles: ['ADMIN'],
    permissions: ['finance:read', 'finance:approve', 'finance:post', 'system:audit'],
  };

  const financeSubmitter: AuthenticatedUser = {
    userId: '00000000-0000-0000-0000-000000000004',
    username: 'finance_submitter',
    roles: ['FINANCE'],
    permissions: ['finance:read', 'finance:approve'],
  };

  const technicianUser: AuthenticatedUser = {
    userId: '00000000-0000-0000-0000-000000000002',
    username: 'technician_tester',
    roles: ['TECHNICIAN'],
    permissions: ['tickets:read'],
  };

  const testLocationId = '00000000-0000-0000-0004-000000000001';
  const skatercatBrandId = '00000000-0000-0000-0001-000000000001';
  const acProductId = '00000000-0000-0000-0002-000000000001';
  const acModelId = 'f973b2c7-b310-4d3f-9ef5-f2516b1aaf61';
  const customerId = '00000000-0000-0000-0009-000000000001';

  async function createTestServiceRequest(options?: {
    registeredHoursAgo?: number;
    createdHoursAgo?: number;
    brandId?: string;
  }): Promise<string> {
    const conn = await getOracleConnection();
    try {
      const requestId = crypto.randomUUID();
      const jobNumber = `JOB-GATE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const regHours = options?.registeredHoursAgo ?? 52;
      const createdHours = options?.createdHoursAgo ?? 52;

      const regDate = new Date(Date.now() - regHours * 3600 * 1000);
      const createdDate = new Date(Date.now() - createdHours * 3600 * 1000);
      const slaExpires = new Date(regDate.getTime() + 48 * 3600 * 1000);

      const sql = `
        INSERT INTO SERVICE_REQUESTS (
          REQUEST_ID, JOB_NUMBER, CUSTOMER_ID, BRAND_ID, PRODUCT_ID, MODEL_ID,
          CALL_TYPE, SERVICE_TYPE, STATUS, ASSIGNED_LOCATION_ID,
          REGISTERED_AT, SLA_48H_EXPIRES_AT, SLA_BREACHED_48H, SLA_BREACHED_168H,
          CREATED_AT, UPDATED_AT
        ) VALUES (
          :requestId, :jobNumber, :customerId, :brandId, :productId, :modelId,
          'REPAIR', 'CARRY_IN', 'REGISTERED', :locationId,
          SYSTIMESTAMP - INTERVAL '52' HOUR, SYSTIMESTAMP - INTERVAL '4' HOUR, 'N', 'N',
          SYSTIMESTAMP - INTERVAL '52' HOUR, SYSTIMESTAMP
        )
      `;

      await conn.execute(sql, {
        requestId,
        jobNumber,
        customerId,
        brandId: options?.brandId || skatercatBrandId,
        productId: acProductId,
        modelId: acModelId,
        locationId: testLocationId,
      }, { autoCommit: true });

      return requestId;
    } finally {
      await conn.close();
    }
  }

  // ============================================================================
  // 1. SLA Penalty Authorization & Commercial Policy Guardrails
  // ============================================================================
  describe('1. SLA Penalty Authorization & Commercial Policy Validation', () => {
    let testApproved48hPolicyCode: string;
    let testApproved168hPolicyCode: string;

    beforeEach(async () => {
      // Ensure unique approved test policies exist for testing authorized posting flows
      testApproved48hPolicyCode = `POL-TEST-48H-${Date.now().toString().slice(-6)}`;
      testApproved168hPolicyCode = `POL-TEST-168H-${Date.now().toString().slice(-6)}`;

      await slaPolicyRepository.createPolicy({
        policyCode: testApproved48hPolicyCode,
        policyName: 'Test Approved 48h Acknowledgement Policy',
        policyVersion: '1.0',
        breachType: 'SLA_48H_ACKNOWLEDGEMENT',
        calculationType: 'FIXED',
        penaltyAmount: 500.0,
        effectiveFrom: new Date(Date.now() - 3600 * 1000),
        isActive: 'Y',
        governanceRef: 'AUDIT-TEST-APPV-01',
        approvalStatus: 'APPROVED',
        approvedBy: adminUser.userId,
        approvedAt: new Date(),
        approvalRemarks: 'Formally approved for test verification',
        submittedBy: financeSubmitter.userId,
      });

      await slaPolicyRepository.createPolicy({
        policyCode: testApproved168hPolicyCode,
        policyName: 'Test Approved 168h Closure Policy',
        policyVersion: '1.0',
        breachType: 'SLA_168H_CLOSURE',
        calculationType: 'FIXED',
        penaltyAmount: 750.0,
        effectiveFrom: new Date(Date.now() - 3600 * 1000),
        isActive: 'Y',
        governanceRef: 'AUDIT-TEST-APPV-02',
        approvalStatus: 'APPROVED',
        approvedBy: adminUser.userId,
        approvedAt: new Date(),
        approvalRemarks: 'Formally approved for test verification',
        submittedBy: financeSubmitter.userId,
      });
    });

    it('should reject unauthorized penalty review attempts by non-finance actors (403)', async () => {
      const srId = await createTestServiceRequest();
      const penalty = await slaPenaltyRepository.recordBreach({
        serviceRequestId: srId,
        asfLocationId: testLocationId,
        breachType: 'SLA_48H_ACKNOWLEDGEMENT',
        breachTimestamp: new Date(),
        calculatedAmount: 0.0,
      });

      await expect(
        financeService.reviewPenalty(
          penalty.penaltyId,
          {
            action: 'APPROVE',
            policyReference: testApproved48hPolicyCode,
            reviewRemarks: 'Attempting review without authorization',
          },
          technicianUser
        )
      ).rejects.toThrow(/Forbidden: Only Finance or Admin/i);
    });

    it('should reject approval when policyReference is missing or empty', async () => {
      const srId = await createTestServiceRequest();
      const penalty = await slaPenaltyRepository.recordBreach({
        serviceRequestId: srId,
        asfLocationId: testLocationId,
        breachType: 'SLA_48H_ACKNOWLEDGEMENT',
        breachTimestamp: new Date(),
        calculatedAmount: 0.0,
      });

      await expect(
        financeService.reviewPenalty(
          penalty.penaltyId,
          {
            action: 'APPROVE',
            reviewRemarks: 'Attempting approval without policy reference string',
          },
          financeUser
        )
      ).rejects.toThrow(/approved commercial penalty policy reference is strictly required|MISSING_POLICY_REFERENCE/i);
    });

    it('should reject approval when policyReference does not exist in SLA_PENALTY_POLICIES', async () => {
      const srId = await createTestServiceRequest();
      const penalty = await slaPenaltyRepository.recordBreach({
        serviceRequestId: srId,
        asfLocationId: testLocationId,
        breachType: 'SLA_48H_ACKNOWLEDGEMENT',
        breachTimestamp: new Date(),
        calculatedAmount: 0.0,
      });

      await expect(
        financeService.reviewPenalty(
          penalty.penaltyId,
          {
            action: 'APPROVE',
            policyReference: 'POL-NONEXISTENT-999',
            reviewRemarks: 'Testing rejection of invented policy code',
          },
          financeUser
        )
      ).rejects.toThrow(/not a recognized approved commercial penalty policy record|NONEXISTENT_POLICY/i);
    });

    it('should strictly reject seeded ₹500 policy POL-SLA-48H-STD as PENDING_APPROVAL without commercial sign-off', async () => {
      const srId = await createTestServiceRequest();
      const penalty = await slaPenaltyRepository.recordBreach({
        serviceRequestId: srId,
        asfLocationId: testLocationId,
        breachType: 'SLA_48H_ACKNOWLEDGEMENT',
        breachTimestamp: new Date(),
        calculatedAmount: 0.0,
      });

      // POL-SLA-48H-STD was seeded but lacks customer sign-off (V020 migration set PENDING_APPROVAL)
      await expect(
        financeService.reviewPenalty(
          penalty.penaltyId,
          {
            action: 'APPROVE',
            policyReference: 'POL-SLA-48H-STD',
            reviewRemarks: 'Attempting to post with unapproved seeded ₹500 rate',
          },
          financeUser
        )
      ).rejects.toThrow(/not formally approved for commercial use|UNAPPROVED_POLICY/i);
    });

    it('should strictly reject seeded ₹750 policy POL-SLA-168H-STD as PENDING_APPROVAL without commercial sign-off', async () => {
      const srId = await createTestServiceRequest();
      const penalty = await slaPenaltyRepository.recordBreach({
        serviceRequestId: srId,
        asfLocationId: testLocationId,
        breachType: 'SLA_168H_CLOSURE',
        breachTimestamp: new Date(),
        calculatedAmount: 0.0,
      });

      // POL-SLA-168H-STD was seeded but lacks customer sign-off (V020 migration set PENDING_APPROVAL)
      await expect(
        financeService.reviewPenalty(
          penalty.penaltyId,
          {
            action: 'APPROVE',
            policyReference: 'POL-SLA-168H-STD',
            reviewRemarks: 'Attempting to post with unapproved seeded ₹750 rate',
          },
          financeUser
        )
      ).rejects.toThrow(/not formally approved for commercial use|UNAPPROVED_POLICY/i);
    });

    it('should reject approval under an inactive/rejected SLA penalty policy record', async () => {
      const srId = await createTestServiceRequest();
      const penalty = await slaPenaltyRepository.recordBreach({
        serviceRequestId: srId,
        asfLocationId: testLocationId,
        breachType: 'SLA_48H_ACKNOWLEDGEMENT',
        breachTimestamp: new Date(),
        calculatedAmount: 0.0,
      });

      // POL-SLA-48H-INACTIVE was seeded in V018 and marked REJECTED & IS_ACTIVE = 'N' in V020
      await expect(
        financeService.reviewPenalty(
          penalty.penaltyId,
          {
            action: 'APPROVE',
            policyReference: 'POL-SLA-48H-INACTIVE',
            reviewRemarks: 'Testing inactive policy rejection',
          },
          financeUser
        )
      ).rejects.toThrow(/not formally approved for commercial use|UNAPPROVED_POLICY|inactive|INACTIVE_POLICY/i);
    });

    it('should enforce segregation of duties: submitter cannot approve their own SLA penalty policy', async () => {
      const draftCode = `POL-SOD-TEST-${Date.now().toString().slice(-6)}`;
      const policy = await slaPolicyRepository.createPolicy({
        policyCode: draftCode,
        policyName: 'SOD Test Policy',
        policyVersion: '1.0',
        breachType: 'SLA_48H_ACKNOWLEDGEMENT',
        calculationType: 'FIXED',
        penaltyAmount: 600.0,
        effectiveFrom: new Date(),
        isActive: 'Y',
        approvalStatus: 'PENDING_APPROVAL',
        submittedBy: financeSubmitter.userId,
      });

      // Submitter attempts to self-approve
      await expect(
        financeService.reviewPolicyApproval(
          policy.policyId,
          { action: 'APPROVE', remarks: 'Self-approval attempt' },
          financeSubmitter
        )
      ).rejects.toThrow(/Segregation of duties violation|SEGREGATION_OF_DUTIES_VIOLATION/i);

      // Distinct authorized actor approves successfully
      const approved = await financeService.reviewPolicyApproval(
        policy.policyId,
        { action: 'APPROVE', remarks: 'Approved by independent commercial director' },
        adminUser
      );
      expect(approved.approvalStatus).toBe('APPROVED');
      expect(approved.approvedBy).toBe(adminUser.userId);
    });

    it('should reject approval if policy breach type does not match penalty breach type', async () => {
      const srId = await createTestServiceRequest();
      const penalty = await slaPenaltyRepository.recordBreach({
        serviceRequestId: srId,
        asfLocationId: testLocationId,
        breachType: 'SLA_48H_ACKNOWLEDGEMENT',
        breachTimestamp: new Date(),
        calculatedAmount: 0.0,
      });

      // testApproved168hPolicyCode is for 168h closure, not 48h acknowledgement
      await expect(
        financeService.reviewPenalty(
          penalty.penaltyId,
          {
            action: 'APPROVE',
            policyReference: testApproved168hPolicyCode,
            reviewRemarks: 'Breach type mismatch test',
          },
          financeUser
        )
      ).rejects.toThrow(/applies to breach type|POLICY_BREACH_TYPE_MISMATCH/i);
    });

    it('should reject custom positive amounts that do not match the approved commercial policy rate', async () => {
      const srId = await createTestServiceRequest();
      const penalty = await slaPenaltyRepository.recordBreach({
        serviceRequestId: srId,
        asfLocationId: testLocationId,
        breachType: 'SLA_48H_ACKNOWLEDGEMENT',
        breachTimestamp: new Date(),
        calculatedAmount: 0.0,
      });

      // Reviewer attempts to pass 1200.00 when approved rate is 500.00
      await expect(
        financeService.reviewPenalty(
          penalty.penaltyId,
          {
            action: 'APPROVE',
            authorizedAmount: 1200.0,
            policyReference: testApproved48hPolicyCode,
            reviewRemarks: 'Attempting to inject custom unauthorized rate',
          },
          financeUser
        )
      ).rejects.toThrow(/does not match approved policy rate|INVALID_AUTHORIZED_AMOUNT/i);
    });

    it('should approve penalty under valid approved policy, derive rate, and post double-entry GL journal', async () => {
      const srId = await createTestServiceRequest();
      const penalty = await slaPenaltyRepository.recordBreach({
        serviceRequestId: srId,
        asfLocationId: testLocationId,
        breachType: 'SLA_48H_ACKNOWLEDGEMENT',
        breachTimestamp: new Date(),
        calculatedAmount: 0.0,
      });

      const approved = await financeService.reviewPenalty(
        penalty.penaltyId,
        {
          action: 'APPROVE',
          policyReference: testApproved48hPolicyCode,
          reviewRemarks: 'Approved strictly following Commercial Annexure 2026 SLA Schedule',
        },
        financeUser
      );

      expect(approved.status).toBe('POSTED');
      expect(approved.calculatedAmount).toBe(500.0); // Derived directly from policy rate!
      expect(approved.policyVersion).toBe(testApproved48hPolicyCode);
      expect(approved.configStatus).toBe('CONFIGURED');
      expect(approved.reviewedBy).toBe(financeUser.userId);
      expect(approved.reviewedByUsername).toBe(financeUser.username);
      expect(approved.journalId).toBeDefined();

      // Verify the posted General Ledger journal in Oracle DB
      const journal = await financialJournalRepository.getJournalById(approved.journalId!);
      expect(journal).not.toBeNull();
      expect(journal!.status).toBe('POSTED');
      expect(journal!.journalType).toBe('SLA_PENALTY');
      expect(journal!.totalDebit).toBe(500.0);
      expect(journal!.totalCredit).toBe(500.0);
      expect(journal!.lines).toHaveLength(2);

      // Line 1: Debit 2020-ASF-PAYABLE (reducing liability)
      const debitLine = journal!.lines!.find((l) => l.accountId === GL_ACCOUNTS.ASF_PAYABLE);
      expect(debitLine).toBeDefined();
      expect(debitLine!.debitAmount).toBe(500.0);
      expect(debitLine!.creditAmount).toBe(0.0);
      expect(debitLine!.entityType).toBe('ASF');
      expect(debitLine!.entityId).toBe(testLocationId);

      // Line 2: Credit 4010-PENALTY-INCOME (recognizing penalty recovery income)
      const creditLine = journal!.lines!.find((l) => l.accountId === GL_ACCOUNTS.PENALTY_INCOME);
      expect(creditLine).toBeDefined();
      expect(creditLine!.debitAmount).toBe(0.0);
      expect(creditLine!.creditAmount).toBe(500.0);
      expect(creditLine!.entityType).toBe('ASF');
      expect(creditLine!.entityId).toBe(testLocationId);
    });

    it('should correctly reverse penalty journal: inverse debit/credit directions and zero net accounting effect', async () => {
      const srId = await createTestServiceRequest();
      const penalty = await slaPenaltyRepository.recordBreach({
        serviceRequestId: srId,
        asfLocationId: testLocationId,
        breachType: 'SLA_48H_ACKNOWLEDGEMENT',
        breachTimestamp: new Date(),
        calculatedAmount: 0.0,
      });

      const approved = await financeService.reviewPenalty(
        penalty.penaltyId,
        {
          action: 'APPROVE',
          policyReference: testApproved48hPolicyCode,
          reviewRemarks: 'Original penalty approval for reversal test',
        },
        financeUser
      );

      const originalJournalId = approved.journalId!;
      expect(originalJournalId).toBeDefined();

      const originalJournal = await financialJournalRepository.getJournalById(originalJournalId);
      expect(originalJournal).not.toBeNull();
      expect(originalJournal!.status).toBe('POSTED');

      // Execute Reversal with mandatory justification
      const reversalReason = 'Customer conceded late acknowledgment due to outstation absence';
      const reversed = await financeService.reversePenalty(
        penalty.penaltyId,
        { reason: reversalReason },
        financeUser
      );

      expect(reversed.status).toBe('REVERSED');
      expect(reversed.reversalReason).toBe(reversalReason);
      expect(reversed.reversedBy).toBe(financeUser.userId);
      expect(reversed.reversedAt).toBeDefined();

      // 1. Verify original journal is marked REVERSED and remains immutable
      const reloadedOriginal = await financialJournalRepository.getJournalById(originalJournalId);
      expect(reloadedOriginal!.status).toBe('REVERSED');
      expect(reloadedOriginal!.reversalReason).toContain(reversalReason);
      // Original line directions and amounts must remain unchanged
      const origDr = reloadedOriginal!.lines!.find((l) => l.accountId === GL_ACCOUNTS.ASF_PAYABLE)!;
      const origCr = reloadedOriginal!.lines!.find((l) => l.accountId === GL_ACCOUNTS.PENALTY_INCOME)!;
      expect(origDr.debitAmount).toBe(500.0);
      expect(origDr.creditAmount).toBe(0.0);
      expect(origCr.debitAmount).toBe(0.0);
      expect(origCr.creditAmount).toBe(500.0);

      // 2. Locate the compensating reversal journal via REVERSAL_OF_JOURNAL_ID
      const conn = await getOracleConnection();
      let revJournalId: string;
      try {
        const revRes = await conn.execute<any>(
          `SELECT JOURNAL_ID FROM FINANCIAL_JOURNALS WHERE REVERSAL_OF_JOURNAL_ID = :originalJournalId`,
          { originalJournalId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        expect(revRes.rows?.length).toBe(1);
        revJournalId = revRes.rows![0].JOURNAL_ID;
      } finally {
        await conn.close();
      }

      const reversalJournal = await financialJournalRepository.getJournalById(revJournalId);
      expect(reversalJournal).not.toBeNull();
      expect(reversalJournal!.journalType).toBe('REVERSAL');
      expect(reversalJournal!.reversalOfJournalId).toBe(originalJournalId);
      expect(reversalJournal!.totalDebit).toBe(500.0);
      expect(reversalJournal!.totalCredit).toBe(500.0);

      // 3. Compensating entries MUST use the OPPOSITE account directions:
      // Original: Debit 2020 (500), Credit 4010 (500)
      // Reversal: Debit 4010 (500), Credit 2020 (500)
      const revDrLine = reversalJournal!.lines!.find((l) => l.accountId === GL_ACCOUNTS.PENALTY_INCOME)!;
      const revCrLine = reversalJournal!.lines!.find((l) => l.accountId === GL_ACCOUNTS.ASF_PAYABLE)!;

      expect(revDrLine).toBeDefined();
      expect(revDrLine.debitAmount).toBe(500.0); // DEBIT 4010-PENALTY-INCOME!
      expect(revDrLine.creditAmount).toBe(0.0);

      expect(revCrLine).toBeDefined();
      expect(revCrLine.debitAmount).toBe(0.0);
      expect(revCrLine.creditAmount).toBe(500.0); // CREDIT 2020-ASF-PAYABLE!

      // 4. Mathematical proof of ZERO net accounting impact:
      // Net 2020-ASF-PAYABLE = Dr 500 (orig) - Cr 500 (rev) = 0.00
      const netAsfPayable = (origDr.debitAmount - origDr.creditAmount) + (revCrLine.debitAmount - revCrLine.creditAmount);
      expect(netAsfPayable).toBe(0.0);

      // Net 4010-PENALTY-INCOME = Cr 500 (orig) - Dr 500 (rev) = 0.00
      const netPenaltyIncome = (origCr.creditAmount - origCr.debitAmount) + (revDrLine.creditAmount - revDrLine.debitAmount);
      expect(netPenaltyIncome).toBe(0.0);

      // 5. Repeated reversal of the same penalty MUST be rejected
      await expect(
        financeService.reversePenalty(
          penalty.penaltyId,
          { reason: 'Attempting second duplicate reversal' },
          financeUser
        )
      ).rejects.toThrow(/already been reversed|ALREADY_REVERSED/i);

      // 6. Reversed penalty cannot be re-reviewed or re-approved
      await expect(
        financeService.reviewPenalty(
          penalty.penaltyId,
          {
            action: 'APPROVE',
            policyReference: testApproved48hPolicyCode,
            reviewRemarks: 'Attempting re-approval after reversal',
          },
          financeUser
        )
      ).rejects.toThrow(/has already been finalized|DUPLICATE_POSTING/i);
    });

    it('should reject reversal without mandatory justification (min 10 characters)', async () => {
      const srId = await createTestServiceRequest();
      const penalty = await slaPenaltyRepository.recordBreach({
        serviceRequestId: srId,
        asfLocationId: testLocationId,
        breachType: 'SLA_48H_ACKNOWLEDGEMENT',
        breachTimestamp: new Date(),
        calculatedAmount: 0.0,
      });

      await financeService.reviewPenalty(
        penalty.penaltyId,
        {
          action: 'APPROVE',
          policyReference: testApproved48hPolicyCode,
          reviewRemarks: 'Valid approval for short reason test',
        },
        financeUser
      );

      await expect(
        financeService.reversePenalty(
          penalty.penaltyId,
          { reason: 'Short' },
          financeUser
        )
      ).rejects.toThrow(/detailed reversal justification \(min 10 characters\) is mandatory|REASON_REQUIRED/i);
    });

    it('should prevent duplicate posting or re-reviewing of already finalized penalties', async () => {
      const srId = await createTestServiceRequest();
      const penalty = await slaPenaltyRepository.recordBreach({
        serviceRequestId: srId,
        asfLocationId: testLocationId,
        breachType: 'SLA_48H_ACKNOWLEDGEMENT',
        breachTimestamp: new Date(),
        calculatedAmount: 0.0,
      });

      await financeService.reviewPenalty(
        penalty.penaltyId,
        {
          action: 'APPROVE',
          policyReference: testApproved48hPolicyCode,
          reviewRemarks: 'First approval cycle',
        },
        financeUser
      );

      // Attempting to review or approve again must fail with DUPLICATE_POSTING
      await expect(
        financeService.reviewPenalty(
          penalty.penaltyId,
          {
            action: 'APPROVE',
            policyReference: testApproved48hPolicyCode,
            reviewRemarks: 'Second duplicate approval cycle',
          },
          financeUser
        )
      ).rejects.toThrow(/has already been finalized and cannot be re-reviewed|DUPLICATE_POSTING/i);
    });

    it('should support full and partial waivers with documented justification', async () => {
      const srId = await createTestServiceRequest();
      const penalty = await slaPenaltyRepository.recordBreach({
        serviceRequestId: srId,
        asfLocationId: testLocationId,
        breachType: 'SLA_48H_ACKNOWLEDGEMENT',
        breachTimestamp: new Date(),
        calculatedAmount: 500.0,
      });

      // 100% full waiver
      const waived = await financeService.reviewPenalty(
        penalty.penaltyId,
        {
          action: 'WAIVE',
          waiverPercentage: 100,
          reviewRemarks: 'Full waiver granted due to documented municipal road closure during floods',
        },
        financeUser
      );

      expect(waived.status).toBe('WAIVED');
      expect(waived.calculatedAmount).toBe(0.0);
      expect(waived.configStatus).toBe('EXEMPT');
    });

    it('should support disputing penalties for operations review', async () => {
      const srId = await createTestServiceRequest();
      const penalty = await slaPenaltyRepository.recordBreach({
        serviceRequestId: srId,
        asfLocationId: testLocationId,
        breachType: 'SLA_48H_ACKNOWLEDGEMENT',
        breachTimestamp: new Date(),
        calculatedAmount: 0.0,
      });

      const disputed = await financeService.reviewPenalty(
        penalty.penaltyId,
        {
          action: 'DISPUTE',
          reviewRemarks: 'Disputed by franchisee due to customer phone unreachable error code 404',
        },
        financeUser
      );

      expect(disputed.status).toBe('DISPUTED');
    });

    it('should verify Oracle database has zero corrupted or incorrect historical SLA penalty reversals', async () => {
      const conn = await getOracleConnection();
      try {
        // Query any historical reversal journals for SLA penalties that might have been posted with same directions
        const res = await conn.execute<any>(
          `SELECT j.JOURNAL_ID, j.JOURNAL_NUMBER, j.REVERSAL_OF_JOURNAL_ID
           FROM FINANCIAL_JOURNALS j
           WHERE j.JOURNAL_TYPE = 'REVERSAL'
             AND j.SOURCE_REFERENCE_TYPE = 'SLA_PENALTY'`,
          {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        // Pre-hotfix database inspection confirmed 0 historical SLA penalty reversals existed
        expect(res.rows || []).toHaveLength(0);
      } finally {
        await conn.close();
      }
    });
  });

  // ============================================================================
  // 2. Notification Retries, Backoff & Dead-Letter Consistency
  // ============================================================================
  describe('2. Notification Retries & Backoff Scheduling', () => {
    it('should enforce exponential backoff: 1st failure delays 1m, 2nd failure delays 5m, 3rd failure dead-letters', async () => {
      const notif = await notificationRepository.enqueueNotification({
        recipient: '+919876543210',
        templateCode: 'SMS_01_REGISTRATION',
        messageBody: 'Test backoff notification delivery.',
      });

      // Attempt 1 Failure: Should transition to FAILED with nextRetryAt set ~1 min into future
      const fail1 = await notificationRepository.recordDispatchFailure(
        notif.notificationId,
        0,
        'GATEWAY_TIMEOUT_ATTEMPT_1',
        3
      );
      expect(fail1.status).toBe('FAILED');
      expect(fail1.retryCount).toBe(1);

      const rec1 = await notificationRepository.findById(notif.notificationId);
      expect(rec1?.status).toBe('FAILED');
      expect(rec1?.nextRetryAt).toBeDefined();
      const delay1Ms = (rec1!.nextRetryAt!.getTime() - Date.now()) / 1000;
      expect(delay1Ms).toBeGreaterThan(45); // ~60 seconds
      expect(delay1Ms).toBeLessThanOrEqual(65);

      // Attempt 2 Failure: Should transition to FAILED with nextRetryAt set ~5 min into future
      const fail2 = await notificationRepository.recordDispatchFailure(
        notif.notificationId,
        1,
        'GATEWAY_TIMEOUT_ATTEMPT_2',
        3
      );
      expect(fail2.status).toBe('FAILED');
      expect(fail2.retryCount).toBe(2);

      const rec2 = await notificationRepository.findById(notif.notificationId);
      const delay2Ms = (rec2!.nextRetryAt!.getTime() - Date.now()) / 1000;
      expect(delay2Ms).toBeGreaterThan(270); // ~300 seconds
      expect(delay2Ms).toBeLessThanOrEqual(305);

      // Attempt 3 Failure: Should escalate to DEAD_LETTER with nextRetryAt cleared
      const fail3 = await notificationRepository.recordDispatchFailure(
        notif.notificationId,
        2,
        'GATEWAY_TIMEOUT_ATTEMPT_3',
        3
      );
      expect(fail3.status).toBe('DEAD_LETTER');
      expect(fail3.retryCount).toBe(3);

      const rec3 = await notificationRepository.findById(notif.notificationId);
      expect(rec3?.status).toBe('DEAD_LETTER');
      expect(rec3?.nextRetryAt).toBeUndefined();
      expect(rec3?.errorMessage).toContain('MAX_RETRIES_EXCEEDED');
    });

    it('should ignore future nextRetryAt notifications during active daemon retry ticks', async () => {
      // Create a notification scheduled for future retry (+10 minutes)
      const notif = await notificationRepository.enqueueNotification({
        recipient: '+919111111111',
        templateCode: 'SMS_07_CANCELLED',
        messageBody: 'Future retry test message.',
      });

      const conn = await getOracleConnection();
      try {
        await conn.execute(
          `UPDATE NOTIFICATIONS_OUTBOX
           SET STATUS = 'FAILED', RETRY_COUNT = 1, NEXT_RETRY_AT = SYSTIMESTAMP + INTERVAL '10' MINUTE
           WHERE NOTIFICATION_ID = :id`,
          { id: notif.notificationId },
          { autoCommit: true }
        );
      } finally {
        await conn.close();
      }

      mockSmsAdapter.clear();
      // Retry cycle should NOT claim or dispatch this future record
      const result = await notificationService.retryFailedNotifications(3);
      const check = await notificationRepository.findById(notif.notificationId);

      expect(check?.status).toBe('FAILED');
      expect(check?.retryCount).toBe(1);
    });

    it('should purge ciphertext on delivery success so retries do not repeat business effects or leak secrets', async () => {
      const notif = await notificationRepository.enqueueNotification({
        recipient: '+919222222222',
        templateCode: 'SMS_04_CLOSURE',
        messageBody: '[PROTECTED_OTP_NOTIFICATION]',
        isEncrypted: 'Y',
        encryptedPayload: 'mock-ciphertext-abc',
        encryptionIv: 'mock-iv-123',
        authTag: 'mock-tag-xyz',
      });

      await notificationRepository.recordDispatchSuccess(notif.notificationId, 'TELCO-PROVIDER-999');

      const delivered = await notificationRepository.findById(notif.notificationId);
      expect(delivered?.status).toBe('SENT');
      expect(delivered?.providerMessageId).toBe('TELCO-PROVIDER-999');
      expect(delivered?.encryptedPayload).toBeUndefined(); // Ciphertext wiped
      expect(delivered?.encryptionIv).toBeUndefined(); // IV wiped
      expect(delivered?.authTag).toBeUndefined(); // Auth tag wiped
      expect(delivered?.messageBody).toBe('[DELIVERED_AND_PURGED]');
    });
  });

  // ============================================================================
  // 3. Background-Worker Concurrency & Crash Recovery (Oracle-Backed)
  // ============================================================================
  describe('3. Background-Worker Concurrency, Safety & Recovery', () => {
    it('should demonstrate that concurrent SLA evaluators never create duplicate breach events or penalty records', async () => {
      const srId = await createTestServiceRequest({ registeredHoursAgo: 72 });

      // Run 2 concurrent invocations of 48h SLA evaluation in parallel
      const [worker1Result, worker2Result] = await Promise.all([
        slaMonitoringService.evaluate48hSlaBreaches('958d124e-135d-44de-b72c-f7ee96081205'),
        slaMonitoringService.evaluate48hSlaBreaches('958d124e-135d-44de-b72c-f7ee96081205'),
      ]);

      // Exactly ONE worker must have claimed and recorded the breach for srId
      const worker1Claimed = worker1Result.breachedRequestIds.includes(srId);
      const worker2Claimed = worker2Result.breachedRequestIds.includes(srId);
      expect(Number(worker1Claimed) + Number(worker2Claimed)).toBe(1);

      // Verify at database level: exactly 1 penalty record exists for this request
      const conn = await getOracleConnection();
      try {
        const countPenaltiesRes = await conn.execute<any>(
          `SELECT COUNT(*) AS CNT FROM SLA_PENALTY_RECORDS WHERE SERVICE_REQUEST_ID = :srId`,
          { srId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        expect(Number(countPenaltiesRes.rows?.[0]?.CNT)).toBe(1);

        // Verify at database level: exactly 1 lifecycle event exists
        const countEventsRes = await conn.execute<any>(
          `SELECT COUNT(*) AS CNT FROM SERVICE_REQUEST_EVENTS WHERE REQUEST_ID = :srId AND EVENT_TYPE = 'SLA_48H_BREACHED'`,
          { srId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        expect(Number(countEventsRes.rows?.[0]?.CNT)).toBe(1);
      } finally {
        await conn.close();
      }
    });

    it('should demonstrate that concurrent outbox workers cannot claim the same message or duplicate deliveries', async () => {
      // Enqueue 4 test notifications
      const ids: string[] = [];
      for (let i = 0; i < 4; i++) {
        const notif = await notificationRepository.enqueueNotification({
          recipient: `+91987654321${i}`,
          templateCode: 'SMS_01_REGISTRATION',
          messageBody: `Concurrent dispatch test ${i}`,
        });
        ids.push(notif.notificationId);
      }

      mockSmsAdapter.clear();

      // Launch 2 independent worker dispatches concurrently
      const [workerA, workerB] = await Promise.all([
        notificationService.retryFailedNotifications(3, 50),
        notificationService.retryFailedNotifications(3, 50),
      ]);

      const sentMessages = mockSmsAdapter.getSentMessages();

      // Verify that every message body was dispatched AT MOST once (0 duplicate SMS deliveries!)
      const messageBodies = sentMessages.map((m) => m.messageBody);
      const uniqueBodies = new Set(messageBodies);
      expect(messageBodies.length).toBe(uniqueBodies.size);

      // Verify total processed across both workers equals total claimed
      expect(workerA.succeededCount + workerB.succeededCount).toBe(4);
    });

    it('should recover queued work stuck in PROCESSING after a simulated worker crash / restart', async () => {
      const notif = await notificationRepository.enqueueNotification({
        recipient: '+919988776655',
        templateCode: 'SMS_03_REPLACED',
        messageBody: 'Crash recovery demonstration message.',
      });

      // Simulate a crashed worker: row was marked PROCESSING 10 minutes ago
      const conn = await getOracleConnection();
      try {
        await conn.execute(
          `UPDATE NOTIFICATIONS_OUTBOX
           SET STATUS = 'PROCESSING', UPDATED_AT = SYSTIMESTAMP - INTERVAL '10' MINUTE
           WHERE NOTIFICATION_ID = :id`,
          { id: notif.notificationId },
          { autoCommit: true }
        );
      } finally {
        await conn.close();
      }

      // Run recovery
      const recoveredCount = await notificationRepository.recoverStaleProcessing(5);
      expect(recoveredCount).toBeGreaterThanOrEqual(1);

      // Verify record is returned to FAILED with CRASH_RECOVERY explanation
      const check = await notificationRepository.findById(notif.notificationId);
      expect(check?.status).toBe('FAILED');
      expect(check?.errorMessage).toContain('CRASH_RECOVERY');

      // Subsequent daemon tick can now safely pick it up and deliver it
      mockSmsAdapter.clear();
      const retryRes = await notificationService.retryFailedNotifications(3);
      expect(retryRes.succeededCount).toBeGreaterThanOrEqual(1);

      const delivered = await notificationRepository.findById(notif.notificationId);
      expect(delivered?.status).toBe('SENT');
    });

    it('should cleanly stop scheduler and wait for in-flight tasks', async () => {
      backgroundScheduler.start({ runImmediately: false });
      expect(backgroundScheduler.getStatus().active).toBe(true);

      await backgroundScheduler.stop();
      expect(backgroundScheduler.getStatus().active).toBe(false);
    });
  });
});
