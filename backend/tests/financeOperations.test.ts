import crypto from 'crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { getOracleConnection } from '../src/database/oraclePool.js';
import { financialJournalRepository } from '../src/database/repositories/financialJournalRepository.js';
import { brandWalletRepository } from '../src/database/repositories/brandWalletRepository.js';
import { claimRateMatrixRepository } from '../src/database/repositories/claimRateMatrixRepository.js';
import { serviceClaimRepository } from '../src/database/repositories/serviceClaimRepository.js';
import { slaPenaltyRepository } from '../src/database/repositories/slaPenaltyRepository.js';
import { settlementBatchRepository } from '../src/database/repositories/settlementBatchRepository.js';
import { financeService } from '../src/services/financeService.js';
import { AuthenticatedUser } from '../src/types/auth.js';

describe('Phase 4: Finance, Brand Wallets, Service Claims & Settlement Operations', () => {
  let realServiceRequestId: string;

  const adminActor: AuthenticatedUser = {
    userId: '958d124e-135d-44de-b72c-f7ee96081205',
    username: 'admin',
    email: 'admin@enterprise.local',
    fullName: 'System Administrator',
    roles: ['ADMIN'],
    permissions: [
      'finance:read',
      'finance:wallets',
      'finance:claims',
      'finance:approve',
      'finance:post',
      'finance:settle',
    ],
  };

  const asfActor: AuthenticatedUser = {
    userId: '00000000-0000-0000-0000-000000000099',
    username: 'mumbai_asf_mgr',
    email: 'mumbai.asf@franchise.local',
    fullName: 'Mumbai Service Manager',
    locationId: '00000000-0000-0000-0004-000000000001',
    roles: ['ASF'],
    permissions: ['finance:read', 'finance:claims'],
  };

  const brandActor: AuthenticatedUser = {
    userId: '00000000-0000-0000-0000-000000000088',
    username: 'skc_brand_mgr',
    email: 'finance@skatercat.local',
    fullName: 'Skatercat Brand Finance Manager',
    roles: ['BRAND'],
    permissions: ['finance:read', 'finance:wallets'],
  };

  const skatercatBrandId = '00000000-0000-0000-0001-000000000001';
  const mumbaiAsfId = '00000000-0000-0000-0004-000000000001';

  // Seed standard GL account IDs from V015
  const ACCT_CASH = '00000000-0000-0000-0008-000000000001'; // 1010
  const ACCT_BRAND_RES = '00000000-0000-0000-0008-000000000002'; // 2010
  const ACCT_ASF_PAY = '00000000-0000-0000-0008-000000000003'; // 2020
  const ACCT_LABOR_EXP = '00000000-0000-0000-0008-000000000004'; // 5010
  const ACCT_TRAVEL_EXP = '00000000-0000-0000-0008-000000000005'; // 5020

  const testRunYear = 2200 + Math.floor(Math.random() * 7000);

  async function insertTestServiceRequest(): Promise<string> {
    const conn = await getOracleConnection();
    try {
      const reqId = crypto.randomUUID();
      const randJob = `JOB-TEST-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      await conn.execute(
        `INSERT INTO SERVICE_REQUESTS (
          REQUEST_ID, JOB_NUMBER, CUSTOMER_ID, BRAND_ID, PRODUCT_ID, MODEL_ID,
          CALL_TYPE, STATUS, CREATED_AT, UPDATED_AT
        ) VALUES (
          :requestId, :jobNumber, '00000000-0000-0000-0009-000000000001',
          '00000000-0000-0000-0001-000000000001',
          '00000000-0000-0000-0002-000000000001',
          '00000000-0000-0000-0003-000000000001',
          'REPAIR', 'REGISTERED',
          SYSTIMESTAMP, SYSTIMESTAMP
        )`,
        { requestId: reqId, jobNumber: randJob }
      );
      await conn.commit();
      return reqId;
    } finally {
      await conn.close();
    }
  }

  beforeAll(async () => {
    // Verify connection to Oracle and clean up test claims for testRunYear
    const conn = await getOracleConnection();
    try {
      const res = await conn.execute('SELECT 1 FROM DUAL');
      expect(res.rows).toBeDefined();

      await conn.execute(`DELETE FROM CLAIM_LINE_ITEMS WHERE CLAIM_ID IN (SELECT CLAIM_ID FROM SERVICE_CLAIMS WHERE CLAIM_YEAR = :y)`, { y: testRunYear });
      await conn.execute(`DELETE FROM SERVICE_CLAIMS WHERE CLAIM_YEAR = :y`, { y: testRunYear });
      await conn.commit();
    } finally {
      await conn.close();
    }
  });

  // ============================================================================
  // 1. Double-Entry General Ledger Foundation
  // ============================================================================

  describe('1. Double-Entry General Ledger Foundation', () => {
    it('should successfully post a balanced double-entry journal (Debits === Credits)', async () => {
      const conn = await getOracleConnection();
      try {
        const idempKey = `TEST-JRN-${crypto.randomUUID()}`;
        const journal = await financialJournalRepository.postJournal(
          {
            journalType: 'ADJUSTMENT',
            currency: 'INR',
            description: 'Test balanced journal posting',
            idempotencyKey: idempKey,
            postedBy: adminActor.userId,
            postedByUsername: adminActor.username,
            lines: [
              {
                accountId: ACCT_CASH,
                debitAmount: 1500.5,
                creditAmount: 0.0,
                description: 'Cash debit',
              },
              {
                accountId: ACCT_BRAND_RES,
                debitAmount: 0.0,
                creditAmount: 1500.5,
                description: 'Brand reserve credit',
              },
            ],
          },
          conn
        );

        await conn.commit();

        expect(journal.journalId).toBeDefined();
        expect(journal.journalNumber).toMatch(/^JRN-/);
        expect(journal.totalDebit).toBe(1500.5);
        expect(journal.totalCredit).toBe(1500.5);
        expect(journal.status).toBe('POSTED');
        expect(journal.lines).toHaveLength(2);
      } finally {
        await conn.close();
      }
    });

    it('should strictly reject an unbalanced journal entry', async () => {
      const conn = await getOracleConnection();
      try {
        await expect(
          financialJournalRepository.postJournal(
            {
              journalType: 'ADJUSTMENT',
              description: 'Unbalanced journal attempt',
              postedBy: adminActor.userId,
              postedByUsername: adminActor.username,
              lines: [
                {
                  accountId: ACCT_CASH,
                  debitAmount: 1000.0,
                  creditAmount: 0.0,
                },
                {
                  accountId: ACCT_BRAND_RES,
                  debitAmount: 0.0,
                  creditAmount: 950.0, // Unbalanced by 50.0!
                },
              ],
            },
            conn
          )
        ).rejects.toThrow(/Debits must equal Credits/i);
      } finally {
        await conn.close();
      }
    });

    it('should reject a journal line with both debit and credit or negative amounts', async () => {
      const conn = await getOracleConnection();
      try {
        await expect(
          financialJournalRepository.postJournal(
            {
              journalType: 'ADJUSTMENT',
              description: 'Invalid line amounts',
              postedBy: adminActor.userId,
              postedByUsername: adminActor.username,
              lines: [
                {
                  accountId: ACCT_CASH,
                  debitAmount: 500.0,
                  creditAmount: 200.0, // Invalid: both debit and credit
                },
                {
                  accountId: ACCT_BRAND_RES,
                  debitAmount: 0.0,
                  creditAmount: 700.0,
                },
              ],
            },
            conn
          )
        ).rejects.toThrow(/cannot contain both debit and credit/i);
      } finally {
        await conn.close();
      }
    });

    it('should be idempotent and return existing journal if duplicate idempotency key is submitted', async () => {
      const conn = await getOracleConnection();
      try {
        const idempKey = `IDEMP-DUP-${crypto.randomUUID()}`;

        const j1 = await financialJournalRepository.postJournal(
          {
            journalType: 'WALLET_DEPOSIT',
            idempotencyKey: idempKey,
            description: 'First attempt',
            postedBy: adminActor.userId,
            postedByUsername: adminActor.username,
            lines: [
              { accountId: ACCT_CASH, debitAmount: 2500.0, creditAmount: 0.0 },
              { accountId: ACCT_BRAND_RES, debitAmount: 0.0, creditAmount: 2500.0 },
            ],
          },
          conn
        );
        await conn.commit();

        const j2 = await financialJournalRepository.postJournal(
          {
            journalType: 'WALLET_DEPOSIT',
            idempotencyKey: idempKey,
            description: 'Duplicate retry attempt',
            postedBy: adminActor.userId,
            postedByUsername: adminActor.username,
            lines: [
              { accountId: ACCT_CASH, debitAmount: 2500.0, creditAmount: 0.0 },
              { accountId: ACCT_BRAND_RES, debitAmount: 0.0, creditAmount: 2500.0 },
            ],
          },
          conn
        );

        expect(j2.journalId).toBe(j1.journalId);
        expect(j2.journalNumber).toBe(j1.journalNumber);
      } finally {
        await conn.close();
      }
    });

    it('should create an inverse compensating journal on reversal and prevent double reversal', async () => {
      const conn = await getOracleConnection();
      try {
        const original = await financialJournalRepository.postJournal(
          {
            journalType: 'ADJUSTMENT',
            description: 'Journal to be reversed',
            postedBy: adminActor.userId,
            postedByUsername: adminActor.username,
            lines: [
              { accountId: ACCT_CASH, debitAmount: 800.0, creditAmount: 0.0 },
              { accountId: ACCT_BRAND_RES, debitAmount: 0.0, creditAmount: 800.0 },
            ],
          },
          conn
        );
        await conn.commit();

        // Reverse the journal
        const reversal = await financialJournalRepository.reverseJournal(
          original.journalId,
          'Administrative error in journal description and amount',
          { userId: adminActor.userId, username: adminActor.username },
          conn
        );
        await conn.commit();

        expect(reversal.journalType).toBe('REVERSAL');
        expect(reversal.reversalOfJournalId).toBe(original.journalId);
        expect(reversal.totalDebit).toBe(800.0);
        expect(reversal.totalCredit).toBe(800.0);

        // Verify original journal status is now REVERSED
        const refreshedOriginal = await financialJournalRepository.getJournalById(original.journalId, conn);
        expect(refreshedOriginal?.status).toBe('REVERSED');

        // Prevent second reversal
        await expect(
          financialJournalRepository.reverseJournal(
            original.journalId,
            'Attempting second reversal',
            { userId: adminActor.userId, username: adminActor.username },
            conn
          )
        ).rejects.toThrow(/already been reversed/i);
      } finally {
        await conn.close();
      }
    });
  });

  // ============================================================================
  // 2. Brand Wallet Management
  // ============================================================================

  describe('2. Brand Wallet Management', () => {
    it('should deposit funds into brand wallet and update authoritative balance and journal', async () => {
      const initialWallet = await brandWalletRepository.getWalletByBrandId(skatercatBrandId);
      expect(initialWallet).not.toBeNull();
      const initialBal = initialWallet!.currentBalance;

      const utrRef = `UTR-${Date.now()}`;
      const txn = await financeService.createWalletDeposit(
        {
          brandId: skatercatBrandId,
          amount: 5000.0,
          paymentMode: 'NEFT_RTGS',
          referenceNumber: utrRef,
          remarks: 'Automated test deposit',
        },
        adminActor
      );

      expect(txn.status).toBe('POSTED');
      expect(txn.amount).toBe(5000.0);
      expect(txn.journalId).toBeDefined();

      const updatedWallet = await brandWalletRepository.getWalletByBrandId(skatercatBrandId);
      expect(updatedWallet!.currentBalance).toBe(initialBal + 5000.0);
    });

    it('should reconcile brand wallet balance against posted transactions ledger', async () => {
      const rec = await financeService.reconcileBrandWallet(skatercatBrandId);
      expect(rec.isReconciled).toBe(true);
      expect(rec.discrepancy).toBe(0.0);
      expect(rec.currentBalance).toBe(rec.reconstructedBalance);
    });

    it('should reject deposit creation with non-positive amount', async () => {
      await expect(
        financeService.createWalletDeposit(
          {
            brandId: skatercatBrandId,
            amount: 0.0,
            paymentMode: 'NEFT_RTGS',
            referenceNumber: 'INVALID-0',
          },
          adminActor
        )
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // 3. ASF Service Labor & Travel Claims
  // ============================================================================

  describe('3. ASF Service Labor & Travel Claims', () => {
    it('should find rate from commercial claim rate matrix for Skatercat AC', async () => {
      const rates = await claimRateMatrixRepository.listRates({ brandId: skatercatBrandId });
      expect(rates.length).toBeGreaterThan(0);

      const acRepairRate = rates.find((r) => r.callType === 'REPAIR');
      expect(acRepairRate).toBeDefined();
      expect(acRepairRate!.aspLaborPrice).toBe(350.0);
      expect(acRepairRate!.brandLaborPrice).toBe(550.0);
      expect(acRepairRate!.travelRatePerKm).toBe(5.0);
    });

    it('should enforce segregation of duties: claimant cannot approve their own claim', async () => {
      const conn = await getOracleConnection();
      try {
        // Create a test claim in SUBMITTED status submitted by non-admin user
        const testClaim = await serviceClaimRepository.createClaimBatch(
          {
            claimMonth: 1,
            claimYear: testRunYear,
            asfLocationId: mumbaiAsfId,
            brandId: skatercatBrandId,
            totalJobsCount: 1,
            grossLaborAmount: 350.0,
            grossTravelAmount: 50.0,
            penaltyDeductionAmount: 0.0,
            netClaimAmount: 400.0,
            status: 'SUBMITTED',
            submittedBy: asfActor.userId,
            submittedByUsername: asfActor.username,
            remarks: 'Segregation of duties test batch',
            lineItems: [],
          },
          conn
        );
        await conn.commit();

        // Attempt to approve by the same user who submitted it
        await expect(
          financeService.auditClaimBatch(
            testClaim.claimId,
            { action: 'APPROVE' },
            asfActor // Same user!
          )
        ).rejects.toThrow(/Forbidden|Segregation of duties violation/i);
      } finally {
        await conn.close();
      }
    });

    it('should approve an eligible claim batch, post balanced journal, and debit brand wallet', async () => {
      const conn = await getOracleConnection();
      try {
        const walletBefore = await brandWalletRepository.getWalletByBrandId(skatercatBrandId, conn);
        const balBefore = walletBefore!.currentBalance;

        // Create a submitted claim batch
        const testClaim = await serviceClaimRepository.createClaimBatch(
          {
            claimMonth: 2,
            claimYear: testRunYear,
            asfLocationId: mumbaiAsfId,
            brandId: skatercatBrandId,
            totalJobsCount: 2,
            grossLaborAmount: 700.0,
            grossTravelAmount: 100.0,
            penaltyDeductionAmount: 0.0,
            netClaimAmount: 800.0,
            status: 'SUBMITTED',
            submittedBy: asfActor.userId,
            submittedByUsername: asfActor.username,
            remarks: 'Monthly franchise remuneration batch',
            lineItems: [],
          },
          conn
        );
        await conn.commit();

        // Audit & Approve by Admin
        const approvedClaim = await financeService.auditClaimBatch(
          testClaim.claimId,
          { action: 'APPROVE' },
          adminActor
        );

        expect(approvedClaim.status).toBe('POSTED');
        expect(approvedClaim.journalId).toBeDefined();

        // Verify Brand Wallet was decremented
        const walletAfter = await brandWalletRepository.getWalletByBrandId(skatercatBrandId);
        expect(walletAfter!.currentBalance).toBe(balBefore - 800.0);

        // Verify Journal exists and is balanced
        const journal = await financialJournalRepository.getJournalById(approvedClaim.journalId!);
        expect(journal).not.toBeNull();
        expect(journal!.totalDebit).toBe(journal!.totalCredit);
        expect(journal!.status).toBe('POSTED');
      } finally {
        await conn.close();
      }
    });

    it('should reject claim approval if Brand Wallet balance is insufficient', async () => {
      const conn = await getOracleConnection();
      try {
        // Create an excessively large claim amount beyond wallet reserve
        const excessiveClaim = await serviceClaimRepository.createClaimBatch(
          {
            claimMonth: 3,
            claimYear: testRunYear,
            asfLocationId: mumbaiAsfId,
            brandId: skatercatBrandId,
            totalJobsCount: 100,
            grossLaborAmount: 500000.0,
            grossTravelAmount: 50000.0,
            penaltyDeductionAmount: 0.0,
            netClaimAmount: 550000.0, // Exceeds wallet balance!
            status: 'SUBMITTED',
            submittedBy: asfActor.userId,
            submittedByUsername: asfActor.username,
            lineItems: [],
          },
          conn
        );
        await conn.commit();

        await expect(
          financeService.auditClaimBatch(
            excessiveClaim.claimId,
            { action: 'APPROVE' },
            adminActor
          )
        ).rejects.toThrow(/Insufficient Brand Wallet reserve/i);
      } finally {
        await conn.close();
      }
    });
  });

  // ============================================================================
  // 4. SLA Penalties Review (No Automatic Deductions)
  // ============================================================================

  describe('4. SLA Penalties Review Engine', () => {
    it('should record an SLA breach in PENDING_REVIEW status and require human review', async () => {
      const srId = await insertTestServiceRequest();
      const penalty = await slaPenaltyRepository.recordBreach({
        serviceRequestId: srId,
        asfLocationId: mumbaiAsfId,
        breachType: 'SLA_48H_ACKNOWLEDGEMENT',
        breachTimestamp: new Date(),
        calculatedAmount: 500.0,
      });

      expect(penalty.status).toBe('PENDING_REVIEW');
      expect(penalty.calculatedAmount).toBe(500.0);
      expect(penalty.journalId).toBeUndefined(); // NEVER automatically debited!

      // Review and approve
      const reviewed = await financeService.reviewPenalty(
        penalty.penaltyId,
        {
          action: 'APPROVE',
          reviewRemarks: 'Acknowledged SLA delay verified with franchise logs',
        },
        adminActor
      );

      expect(reviewed.status).toBe('APPROVED');
      expect(reviewed.reviewRemarks).toContain('franchise logs');
    });

    it('should support waiving a penalty with documented audit reasoning', async () => {
      const srId = await insertTestServiceRequest();
      const penalty = await slaPenaltyRepository.recordBreach({
        serviceRequestId: srId,
        asfLocationId: mumbaiAsfId,
        breachType: 'SLA_168H_CLOSURE',
        breachTimestamp: new Date(),
        calculatedAmount: 750.0,
      });

      const waived = await financeService.reviewPenalty(
        penalty.penaltyId,
        {
          action: 'WAIVE',
          reviewRemarks: 'Delay caused by severe monsoon weather and customer travel.',
          waiverPercentage: 100,
        },
        adminActor
      );

      expect(waived.status).toBe('WAIVED');
      expect(waived.calculatedAmount).toBe(0.0);
    });
  });

  // ============================================================================
  // 5. Settlement Batches & Disbursements
  // ============================================================================

  describe('5. Settlement Batches & Disbursements', () => {
    it('should execute a franchisee settlement batch, clear payable liability, and disburse funds', async () => {
      const conn = await getOracleConnection();
      try {
        // Create a posted claim to settle
        const claim = await serviceClaimRepository.createClaimBatch(
          {
            claimMonth: 4,
            claimYear: testRunYear,
            asfLocationId: mumbaiAsfId,
            brandId: skatercatBrandId,
            totalJobsCount: 1,
            grossLaborAmount: 350.0,
            grossTravelAmount: 50.0,
            penaltyDeductionAmount: 0.0,
            netClaimAmount: 400.0,
            status: 'POSTED',
            submittedBy: asfActor.userId,
            submittedByUsername: asfActor.username,
            lineItems: [],
          },
          conn
        );
        await conn.commit();

        const settlementRef = `NEFT-SET-${Date.now()}`;
        const batch = await financeService.createSettlementBatch(
          {
            asfLocationId: mumbaiAsfId,
            claimIds: [claim.claimId],
            paymentMode: 'BANK_NEFT',
            paymentReference: settlementRef,
          },
          adminActor
        );

        expect(batch.status).toBe('DISBURSED');
        expect(batch.totalPayableAmount).toBe(400.0);
        expect(batch.journalId).toBeDefined();

        // Verify settlement journal balances
        const journal = await financialJournalRepository.getJournalById(batch.journalId!);
        expect(journal!.totalDebit).toBe(400.0);
        expect(journal!.totalCredit).toBe(400.0);

        // Verify claim is now SETTLED
        const updatedClaim = await serviceClaimRepository.getClaimById(claim.claimId);
        expect(updatedClaim!.status).toBe('SETTLED');

        // Verify duplicate settlement of already settled claim is rejected
        await expect(
          financeService.createSettlementBatch(
            {
              asfLocationId: mumbaiAsfId,
              claimIds: [claim.claimId],
              paymentMode: 'BANK_NEFT',
              paymentReference: `DUP-${settlementRef}`,
            },
            adminActor
          )
        ).rejects.toThrow(/cannot be settled/i);
      } finally {
        await conn.close();
      }
    });
  });

  // ============================================================================
  // 6. Security & RBAC Gating
  // ============================================================================

  describe('6. Security & RBAC Boundary Protection', () => {
    it('should reject unauthorized settlement creation from non-finance actor', async () => {
      await expect(
        financeService.createSettlementBatch(
          {
            asfLocationId: mumbaiAsfId,
            claimIds: ['00000000-0000-0000-0000-000000000001'],
            paymentMode: 'BANK_NEFT',
            paymentReference: 'UNAUTHORIZED-TEST',
          },
          asfActor // Has only finance:read and finance:claims, lacks finance:settle!
        )
      ).rejects.toThrow(/Forbidden/i);
    });

    it('should reject unauthorized ledger reversal from non-post actor', async () => {
      await expect(
        financeService.reverseJournal(
          '00000000-0000-0000-0000-000000000001',
          'Unauthorized reversal attempt',
          brandActor // Has only finance:read and finance:wallets, lacks finance:post!
        )
      ).rejects.toThrow(/Forbidden/i);
    });
  });
});
