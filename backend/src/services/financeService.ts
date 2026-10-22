import oracledb from 'oracledb';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedUser } from '../types/auth.js';
import {
  BrandWalletRecord,
  ClaimRateMatrixRecord,
  ClaimStatus,
  FinancialJournalRecord,
  FinanceSummaryKpis,
  JournalStatus,
  JournalType,
  PenaltyBreachType,
  PenaltyStatus,
  ServiceClaimRecord,
  SettlementBatchRecord,
  SettlementStatus,
  SlaPenaltyRecord,
  WalletStatus,
  WalletTransactionRecord,
  WalletTxnStatus,
  WalletTxnType,
} from '../types/finance.js';
import { brandWalletRepository } from '../database/repositories/brandWalletRepository.js';
import { claimRateMatrixRepository } from '../database/repositories/claimRateMatrixRepository.js';
import { financialJournalRepository } from '../database/repositories/financialJournalRepository.js';
import { serviceClaimRepository } from '../database/repositories/serviceClaimRepository.js';
import { settlementBatchRepository } from '../database/repositories/settlementBatchRepository.js';
import { slaPenaltyRepository } from '../database/repositories/slaPenaltyRepository.js';
import { brandRepository } from '../database/repositories/brandRepository.js';
import { getOracleConnection } from '../database/oraclePool.js';

// Account IDs seeded in V015
const GL_ACCOUNTS = {
  CASH_BANK: '00000000-0000-0000-0008-000000000001', // 1010
  BRAND_WALLET_RESERVE: '00000000-0000-0000-0008-000000000002', // 2010
  ASF_PAYABLE: '00000000-0000-0000-0008-000000000003', // 2020
  LABOR_EXPENSE: '00000000-0000-0000-0008-000000000004', // 5010
  TRAVEL_EXPENSE: '00000000-0000-0000-0008-000000000005', // 5020
  PENALTY_INCOME: '00000000-0000-0000-0008-000000000006', // 4010
  REPLACEMENT_WRITEDOWN: '00000000-0000-0000-0008-000000000007', // 5030
};

export class FinanceService {
  // ============================================================================
  // 1. KPI Overview & Reconciliation
  // ============================================================================

  async getSummaryKpis(): Promise<FinanceSummaryKpis> {
    const conn = await getOracleConnection();
    try {
      // 1. Total wallet reserves and active count
      const walletSql = `
        SELECT 
          NVL(SUM(CURRENT_BALANCE), 0) AS TOTAL_RESERVES,
          COUNT(CASE WHEN STATUS = 'ACTIVE' THEN 1 END) AS ACTIVE_COUNT
        FROM BRAND_WALLETS
      `;
      const walletRes = await conn.execute<any>(walletSql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const totalWalletReserves = Number(walletRes.rows?.[0]?.TOTAL_RESERVES || 0);
      const activeBrandWalletsCount = Number(walletRes.rows?.[0]?.ACTIVE_COUNT || 0);

      // 2. Pending claims
      const claimsSql = `
        SELECT 
          COUNT(*) AS PENDING_COUNT,
          NVL(SUM(NET_CLAIM_AMOUNT), 0) AS PENDING_AMOUNT
        FROM SERVICE_CLAIMS
        WHERE STATUS IN ('SUBMITTED', 'VALIDATED')
      `;
      const claimsRes = await conn.execute<any>(claimsSql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const pendingClaimsCount = Number(claimsRes.rows?.[0]?.PENDING_COUNT || 0);
      const pendingClaimsAmount = Number(claimsRes.rows?.[0]?.PENDING_AMOUNT || 0);

      // 3. Approved payables liability
      const payablesSql = `
        SELECT NVL(SUM(NET_CLAIM_AMOUNT), 0) AS APPROVED_LIABILITY
        FROM SERVICE_CLAIMS
        WHERE STATUS = 'APPROVED'
      `;
      const payablesRes = await conn.execute<any>(payablesSql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const approvedPayablesLiability = Number(payablesRes.rows?.[0]?.APPROVED_LIABILITY || 0);

      // 4. Journals and balanced check
      const journalSql = `
        SELECT 
          COUNT(*) AS POSTED_COUNT,
          COUNT(CASE WHEN TOTAL_DEBIT != TOTAL_CREDIT THEN 1 END) AS UNBALANCED_COUNT
        FROM FINANCIAL_JOURNALS
        WHERE STATUS = 'POSTED'
      `;
      const journalRes = await conn.execute<any>(journalSql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const postedJournalsCount = Number(journalRes.rows?.[0]?.POSTED_COUNT || 0);
      const unbalancedJournalsCount = Number(journalRes.rows?.[0]?.UNBALANCED_COUNT || 0);

      // 5. Pending SLA penalties
      const penaltySql = `
        SELECT 
          COUNT(*) AS PENALTY_COUNT,
          NVL(SUM(CALCULATED_AMOUNT), 0) AS PENALTY_AMOUNT
        FROM SLA_PENALTY_RECORDS
        WHERE STATUS = 'PENDING_REVIEW'
      `;
      const penaltyRes = await conn.execute<any>(penaltySql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const pendingPenaltiesCount = Number(penaltyRes.rows?.[0]?.PENALTY_COUNT || 0);
      const pendingPenaltiesAmount = Number(penaltyRes.rows?.[0]?.PENALTY_AMOUNT || 0);

      return {
        totalWalletReserves,
        activeBrandWalletsCount,
        pendingClaimsCount,
        pendingClaimsAmount,
        approvedPayablesLiability,
        postedJournalsCount,
        unbalancedJournalsCount,
        pendingPenaltiesCount,
        pendingPenaltiesAmount,
      };
    } finally {
      await conn.close();
    }
  }

  // ============================================================================
  // 2. Brand Wallet Operations
  // ============================================================================

  async listBrandWallets(options: {
    status?: WalletStatus;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: BrandWalletRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    return brandWalletRepository.listWallets(options);
  }

  async getBrandWallet(brandId: string): Promise<BrandWalletRecord> {
    const wallet = await brandWalletRepository.getWalletByBrandId(brandId);
    if (!wallet) {
      throw new AppError(`Brand wallet not found for brand: ${brandId}`, 404, 'WALLET_NOT_FOUND');
    }
    return wallet;
  }

  async createWalletDeposit(
    input: {
      brandId: string;
      amount: number;
      paymentMode: 'NEFT_RTGS' | 'CHEQUE' | 'BANK_TRANSFER';
      referenceNumber: string;
      remarks?: string;
      idempotencyKey?: string;
    },
    actor: AuthenticatedUser
  ): Promise<WalletTransactionRecord> {
    if (input.amount <= 0) {
      throw new AppError('Deposit amount must be strictly positive.', 400, 'INVALID_AMOUNT');
    }

    const brand = await brandRepository.findById(input.brandId);
    if (!brand || brand.isActive !== 'Y') {
      throw new AppError('Brand not found or inactive.', 404, 'BRAND_NOT_FOUND');
    }

    const conn = await getOracleConnection();

    try {
      let wallet = await brandWalletRepository.getWalletByBrandId(input.brandId, conn, true);
      if (!wallet) {
        wallet = await brandWalletRepository.createWallet(input.brandId, actor.userId, conn);
      }

      // Record transaction in PENDING_APPROVAL status (or immediately approved if actor has finance:approve)
      const canAutoApprove = actor.permissions.includes('finance:approve') || actor.roles.includes('ADMIN') || actor.roles.includes('FINANCE');

      let transactionStatus: WalletTxnStatus = canAutoApprove ? 'POSTED' : 'PENDING_APPROVAL';
      let journalId: string | undefined = undefined;

      const balanceBefore = wallet.currentBalance;
      let balanceAfter = balanceBefore;

      if (canAutoApprove) {
        balanceAfter = Math.round((balanceBefore + input.amount) * 100) / 100;

        // Post balanced journal
        // Debit: Cash & Bank Clearing (Asset +)
        // Credit: Brand Prepaid Warranty Reserve (Liability +)
        const journal = await financialJournalRepository.postJournal(
          {
            journalType: 'WALLET_DEPOSIT',
            currency: 'INR',
            sourceReferenceType: 'WALLET_TRANSACTION',
            sourceReferenceId: input.referenceNumber,
            idempotencyKey: input.idempotencyKey || `DEP-${input.brandId}-${input.referenceNumber}`,
            description: `Prepaid Warranty Reserve Deposit from ${brand.brandName} via ${input.paymentMode} (${input.referenceNumber})`,
            postedBy: actor.userId,
            postedByUsername: actor.username,
            lines: [
              {
                accountId: GL_ACCOUNTS.CASH_BANK,
                debitAmount: input.amount,
                creditAmount: 0.0,
                description: `Bank Clearing: UTR ${input.referenceNumber}`,
                entityType: 'BRAND',
                entityId: input.brandId,
              },
              {
                accountId: GL_ACCOUNTS.BRAND_WALLET_RESERVE,
                debitAmount: 0.0,
                creditAmount: input.amount,
                description: `Brand Prepaid Warranty Reserve: ${brand.brandName}`,
                entityType: 'BRAND',
                entityId: input.brandId,
              },
            ],
          },
          conn
        );

        journalId = journal.journalId;

        await brandWalletRepository.updateWalletBalances(
          {
            walletId: wallet.walletId,
            newBalance: balanceAfter,
            deltaDeposited: input.amount,
            updatedBy: actor.userId,
          },
          conn
        );
      }

      const txn = await brandWalletRepository.recordTransaction(
        {
          walletId: wallet.walletId,
          transactionType: 'DEPOSIT',
          paymentMode: input.paymentMode,
          referenceNumber: input.referenceNumber,
          idempotencyKey: input.idempotencyKey,
          amount: input.amount,
          balanceBefore,
          balanceAfter,
          status: transactionStatus,
          journalId,
          requestedBy: actor.userId,
          requestedByUsername: actor.username,
          approvedBy: canAutoApprove ? actor.userId : undefined,
          approvedByUsername: canAutoApprove ? actor.username : undefined,
          approvedAt: canAutoApprove ? new Date() : undefined,
          remarks: input.remarks,
        },
        conn
      );

      await conn.commit();
      return txn;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  async approveWalletDeposit(
    transactionId: string,
    input: { action: 'APPROVE' | 'REJECT'; rejectionReason?: string },
    actor: AuthenticatedUser
  ): Promise<WalletTransactionRecord> {
    if (!actor.permissions.includes('finance:approve') && !actor.roles.includes('ADMIN') && !actor.roles.includes('FINANCE')) {
      throw new AppError('Forbidden: Only Finance or Admin can authorize wallet deposits.', 403, 'FORBIDDEN');
    }

    const conn = await getOracleConnection();

    try {
      const txn = await brandWalletRepository.getTransactionById(transactionId, conn);
      if (!txn) {
        throw new AppError('Transaction not found.', 404, 'TRANSACTION_NOT_FOUND');
      }

      if (txn.status !== 'PENDING_APPROVAL') {
        throw new AppError(`Cannot decide transaction in status '${txn.status}'.`, 400, 'INVALID_TXN_STATUS');
      }

      const wallet = await brandWalletRepository.getWalletById(txn.walletId, conn, true);
      if (!wallet) {
        throw new AppError('Associated brand wallet not found.', 404, 'WALLET_NOT_FOUND');
      }

      if (input.action === 'APPROVE') {
        const balanceBefore = wallet.currentBalance;
        const balanceAfter = Math.round((balanceBefore + txn.amount) * 100) / 100;

        // Create balanced journal
        const journal = await financialJournalRepository.postJournal(
          {
            journalType: 'WALLET_DEPOSIT',
            currency: 'INR',
            sourceReferenceType: 'WALLET_TRANSACTION',
            sourceReferenceId: txn.transactionNumber,
            idempotencyKey: `APPR-${txn.transactionId}`,
            description: `Authorized Prepaid Deposit: ${txn.paymentMode} ref ${txn.referenceNumber}`,
            postedBy: actor.userId,
            postedByUsername: actor.username,
            lines: [
              {
                accountId: GL_ACCOUNTS.CASH_BANK,
                debitAmount: txn.amount,
                creditAmount: 0.0,
                description: `Bank Clearing: ${txn.referenceNumber}`,
                entityType: 'BRAND',
                entityId: wallet.brandId,
              },
              {
                accountId: GL_ACCOUNTS.BRAND_WALLET_RESERVE,
                debitAmount: 0.0,
                creditAmount: txn.amount,
                description: `Brand Prepaid Reserve Credit`,
                entityType: 'BRAND',
                entityId: wallet.brandId,
              },
            ],
          },
          conn
        );

        await brandWalletRepository.updateWalletBalances(
          {
            walletId: wallet.walletId,
            newBalance: balanceAfter,
            deltaDeposited: txn.amount,
            updatedBy: actor.userId,
          },
          conn
        );

        await brandWalletRepository.updateTransactionStatus(
          txn.transactionId,
          'POSTED',
          {
            approvedBy: actor.userId,
            approvedByUsername: actor.username,
            approvedAt: new Date(),
            journalId: journal.journalId,
            balanceBefore,
            balanceAfter,
          },
          conn
        );
      } else {
        if (!input.rejectionReason || input.rejectionReason.trim().length < 5) {
          throw new AppError('A rejection reason (min 5 characters) is required.', 400, 'REASON_REQUIRED');
        }

        await brandWalletRepository.updateTransactionStatus(
          txn.transactionId,
          'REJECTED',
          {
            approvedBy: actor.userId,
            approvedByUsername: actor.username,
            approvedAt: new Date(),
            rejectionReason: input.rejectionReason,
          },
          conn
        );
      }

      await conn.commit();

      const updated = await brandWalletRepository.getTransactionById(transactionId);
      if (!updated) throw new Error('Failed to retrieve updated transaction.');
      return updated;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  async listWalletTransactions(options: {
    walletId?: string;
    brandId?: string;
    status?: WalletTxnStatus;
    transactionType?: WalletTxnType;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: WalletTransactionRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    return brandWalletRepository.listTransactions(options);
  }

  async reconcileBrandWallet(brandId: string): Promise<{
    walletId: string;
    brandId: string;
    currentBalance: number;
    reconstructedBalance: number;
    discrepancy: number;
    isReconciled: boolean;
  }> {
    return brandWalletRepository.reconcileWallet(brandId);
  }

  // ============================================================================
  // 3. Commercial Claim Rates
  // ============================================================================

  async listClaimRates(options?: { brandId?: string; productId?: string }): Promise<ClaimRateMatrixRecord[]> {
    return claimRateMatrixRepository.listRates(options);
  }

  // ============================================================================
  // 4. ASF Service Labor & Travel Claims
  // ============================================================================

  async getEligibleClaimJobs(
    asfLocationId: string,
    brandId?: string
  ): Promise<
    Array<{
      requestId: string;
      jobNumber: string;
      brandId: string;
      productId: string;
      productName: string;
      callType: string;
      isHappyCodeVerified: boolean;
      tatHours: number;
      closedAt: Date;
    }>
  > {
    return serviceClaimRepository.findEligibleJobsForClaims(asfLocationId, brandId);
  }

  async generateClaimBatch(
    input: {
      asfLocationId: string;
      brandId?: string;
      claimMonth: number;
      claimYear: number;
      remarks?: string;
    },
    actor: AuthenticatedUser
  ): Promise<ServiceClaimRecord> {
    const conn = await getOracleConnection();

    try {
      const eligibleJobs = await serviceClaimRepository.findEligibleJobsForClaims(
        input.asfLocationId,
        input.brandId,
        conn
      );

      if (eligibleJobs.length === 0) {
        throw new AppError(
          'No eligible closed jobs found for claim generation in this period. Jobs must be CLOSED with verified Happy Code or authorized supervisor closure.',
          400,
          'NO_ELIGIBLE_JOBS'
        );
      }

      let grossLaborAmount = 0;
      let grossTravelAmount = 0;
      const penaltyDeductionAmount = 0; // Penalties audited separately

      const lineItems: Array<{
        serviceRequestId: string;
        jobNumber: string;
        callType: string;
        productName?: string;
        isHappyCodeVerified: 'Y' | 'N';
        completionTatHours: number;
        tatAppliedPercentage: number;
        baseLaborAmount: number;
        claimableLaborAmount: number;
        travelKm: number;
        travelAmount: number;
        penaltyAmount: number;
        netLineAmount: number;
      }> = [];

      for (const job of eligibleJobs) {
        // Look up rates from commercial rate matrix
        const rate = await claimRateMatrixRepository.findRate(job.brandId, job.productId, job.callType, conn);

        const baseLabor = rate ? rate.aspLaborPrice : 350.0; // fallback standard repair labor
        const tatThreshold = rate ? rate.tatHoursThreshold : 48;
        const onTimePct = rate ? rate.tatOnTimePercentage : 100;
        const delayPct = rate ? rate.tatDelayPercentage : 80;

        const tatAppliedPercentage = job.tatHours <= tatThreshold ? onTimePct : delayPct;
        const claimableLabor = Math.round(baseLabor * (tatAppliedPercentage / 100) * 100) / 100;

        // Baseline travel allowance: 10km standard local radius @ ratePerKm
        const travelRatePerKm = rate ? rate.travelRatePerKm : 5.0;
        const travelKm = 10.0;
        const travelAmount = Math.round(travelKm * travelRatePerKm * 100) / 100;

        const netLineAmount = Math.round((claimableLabor + travelAmount) * 100) / 100;

        grossLaborAmount += claimableLabor;
        grossTravelAmount += travelAmount;

        lineItems.push({
          serviceRequestId: job.requestId,
          jobNumber: job.jobNumber,
          callType: job.callType,
          productName: job.productName,
          isHappyCodeVerified: job.isHappyCodeVerified ? 'Y' : 'N',
          completionTatHours: job.tatHours,
          tatAppliedPercentage,
          baseLaborAmount: baseLabor,
          claimableLaborAmount: claimableLabor,
          travelKm,
          travelAmount,
          penaltyAmount: 0.0,
          netLineAmount,
        });
      }

      grossLaborAmount = Math.round(grossLaborAmount * 100) / 100;
      grossTravelAmount = Math.round(grossTravelAmount * 100) / 100;
      const netClaimAmount = Math.round((grossLaborAmount + grossTravelAmount - penaltyDeductionAmount) * 100) / 100;

      const claim = await serviceClaimRepository.createClaimBatch(
        {
          claimMonth: input.claimMonth,
          claimYear: input.claimYear,
          asfLocationId: input.asfLocationId,
          brandId: input.brandId,
          totalJobsCount: eligibleJobs.length,
          grossLaborAmount,
          grossTravelAmount,
          penaltyDeductionAmount,
          netClaimAmount,
          status: 'SUBMITTED',
          submittedBy: actor.userId,
          submittedByUsername: actor.username,
          remarks: input.remarks,
          lineItems,
        },
        conn
      );

      await conn.commit();
      return claim;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  async auditClaimBatch(
    claimId: string,
    input: {
      action: 'APPROVE' | 'REJECT';
      rejectionReason?: string;
      lineItemAdjustments?: Array<{
        itemId: string;
        auditStatus: 'VERIFIED' | 'FLAGGED' | 'REJECTED';
        auditNote?: string;
        deductionAmount?: number;
      }>;
    },
    actor: AuthenticatedUser
  ): Promise<ServiceClaimRecord> {
    if (!actor.permissions.includes('finance:approve') && !actor.roles.includes('ADMIN') && !actor.roles.includes('FINANCE')) {
      throw new AppError('Forbidden: Only Finance or Admin can authorize service claims.', 403, 'FORBIDDEN');
    }

    const conn = await getOracleConnection();

    try {
      const claim = await serviceClaimRepository.getClaimById(claimId, conn);
      if (!claim) {
        throw new AppError('Service claim not found.', 404, 'CLAIM_NOT_FOUND');
      }

      if (claim.status !== 'SUBMITTED' && claim.status !== 'VALIDATED') {
        throw new AppError(`Cannot audit claim in status '${claim.status}'.`, 400, 'INVALID_CLAIM_STATUS');
      }

      // Segregation of Duties: Claimant cannot approve their own claim!
      if (claim.submittedBy === actor.userId && !actor.roles.includes('ADMIN')) {
        throw new AppError(
          'Segregation of duties violation: You cannot approve a claim that you submitted.',
          403,
          'SEGREGATION_OF_DUTIES_VIOLATION'
        );
      }

      if (input.action === 'APPROVE') {
        let totalDeductions = 0;

        if (input.lineItemAdjustments && input.lineItemAdjustments.length > 0) {
          for (const adj of input.lineItemAdjustments) {
            if (adj.deductionAmount && adj.deductionAmount > 0) {
              totalDeductions += adj.deductionAmount;
            }
          }
        }

        const approvedNetClaim = Math.max(0, Math.round((claim.netClaimAmount - totalDeductions) * 100) / 100);

        // Check Brand Wallet Balance if Brand is specified
        if (claim.brandId) {
          const brandWallet = await brandWalletRepository.getWalletByBrandId(claim.brandId, conn, true);
          if (!brandWallet) {
            throw new AppError(`Brand wallet not found for brand: ${claim.brandId}`, 404, 'WALLET_NOT_FOUND');
          }

          if (brandWallet.currentBalance < approvedNetClaim) {
            throw new AppError(
              `Insufficient Brand Wallet reserve. Required: ₹${approvedNetClaim}, Current balance: ₹${brandWallet.currentBalance}. Brand must deposit additional warranty funds before claim can be approved.`,
              400,
              'INSUFFICIENT_WALLET_BALANCE'
            );
          }

          const balanceBefore = brandWallet.currentBalance;
          const balanceAfter = Math.round((balanceBefore - approvedNetClaim) * 100) / 100;

          // Post authoritative balanced double-entry journal
          // Debit: 5010 Labor Expense + 5020 Travel Expense (Expenses increase)
          // Credit: 2010 Brand Wallet Liability (Brand reserve decreases)
          // Credit: 2020 ASF Claim Payables (Franchise payable liability increases)
          // Invariant: Total Debits == Total Credits!
          const journal = await financialJournalRepository.postJournal(
            {
              journalType: 'WARRANTY_CLAIM',
              currency: 'INR',
              sourceReferenceType: 'SERVICE_CLAIM',
              sourceReferenceId: claim.claimNumber,
              idempotencyKey: `CLM-APP-${claim.claimId}`,
              description: `Approved Warranty Claim ${claim.claimNumber} for ${claim.asfLocationName} (${claim.totalJobsCount} jobs)`,
              postedBy: actor.userId,
              postedByUsername: actor.username,
              lines: [
                {
                  accountId: GL_ACCOUNTS.BRAND_WALLET_RESERVE,
                  debitAmount: approvedNetClaim,
                  creditAmount: 0.0,
                  description: `Brand Wallet Warranty Debit: ${claim.claimNumber}`,
                  entityType: 'BRAND',
                  entityId: claim.brandId,
                },
                {
                  accountId: GL_ACCOUNTS.ASF_PAYABLE,
                  debitAmount: 0.0,
                  creditAmount: approvedNetClaim,
                  description: `ASF Payable Liability: ${claim.claimNumber}`,
                  entityType: 'ASF',
                  entityId: claim.asfLocationId,
                },
              ],
            },
            conn
          );

          // Update Brand Wallet balance
          await brandWalletRepository.updateWalletBalances(
            {
              walletId: brandWallet.walletId,
              newBalance: balanceAfter,
              deltaClaimDebited: approvedNetClaim,
              updatedBy: actor.userId,
            },
            conn
          );

          // Record transaction in WALLET_TRANSACTIONS
          await brandWalletRepository.recordTransaction(
            {
              walletId: brandWallet.walletId,
              transactionType: 'WARRANTY_CLAIM_DEDUCTION',
              paymentMode: 'INTERNAL_JOURNAL',
              referenceNumber: claim.claimNumber,
              idempotencyKey: `WT-CLM-${claim.claimId}`,
              amount: approvedNetClaim,
              balanceBefore,
              balanceAfter,
              status: 'POSTED',
              journalId: journal.journalId,
              approvedBy: actor.userId,
              approvedByUsername: actor.username,
              approvedAt: new Date(),
              remarks: `Warranty labor deduction against approved claim batch ${claim.claimNumber}`,
            },
            conn
          );

          await serviceClaimRepository.updateClaimStatus(
            claim.claimId,
            'POSTED',
            {
              approvedBy: actor.userId,
              approvedByUsername: actor.username,
              approvedAt: new Date(),
              journalId: journal.journalId,
              netClaimAmount: approvedNetClaim,
              penaltyDeductionAmount: totalDeductions,
            },
            conn
          );
        } else {
          // If no brand assigned, post directly to general warranty ledger
          const journal = await financialJournalRepository.postJournal(
            {
              journalType: 'WARRANTY_CLAIM',
              currency: 'INR',
              sourceReferenceType: 'SERVICE_CLAIM',
              sourceReferenceId: claim.claimNumber,
              idempotencyKey: `CLM-APP-${claim.claimId}`,
              description: `Approved Service Claim ${claim.claimNumber} for ${claim.asfLocationName}`,
              postedBy: actor.userId,
              postedByUsername: actor.username,
              lines: [
                {
                  accountId: GL_ACCOUNTS.LABOR_EXPENSE,
                  debitAmount: approvedNetClaim,
                  creditAmount: 0.0,
                  description: `Labor Remuneration: ${claim.claimNumber}`,
                  entityType: 'ASF',
                  entityId: claim.asfLocationId,
                },
                {
                  accountId: GL_ACCOUNTS.ASF_PAYABLE,
                  debitAmount: 0.0,
                  creditAmount: approvedNetClaim,
                  description: `ASF Payable Liability: ${claim.claimNumber}`,
                  entityType: 'ASF',
                  entityId: claim.asfLocationId,
                },
              ],
            },
            conn
          );

          await serviceClaimRepository.updateClaimStatus(
            claim.claimId,
            'POSTED',
            {
              approvedBy: actor.userId,
              approvedByUsername: actor.username,
              approvedAt: new Date(),
              journalId: journal.journalId,
              netClaimAmount: approvedNetClaim,
            },
            conn
          );
        }
      } else {
        if (!input.rejectionReason || input.rejectionReason.trim().length < 5) {
          throw new AppError('A documented rejection reason (min 5 characters) is required.', 400, 'REASON_REQUIRED');
        }

        await serviceClaimRepository.updateClaimStatus(
          claim.claimId,
          'REJECTED',
          {
            approvedBy: actor.userId,
            approvedByUsername: actor.username,
            approvedAt: new Date(),
            rejectionReason: input.rejectionReason,
          },
          conn
        );
      }

      await conn.commit();

      const updated = await serviceClaimRepository.getClaimById(claimId);
      if (!updated) throw new Error('Failed to retrieve updated claim.');
      return updated;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  async listClaims(options: {
    asfLocationId?: string;
    brandId?: string;
    status?: ClaimStatus;
    claimMonth?: number;
    claimYear?: number;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: ServiceClaimRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    return serviceClaimRepository.listClaims(options);
  }

  async getClaim(claimId: string): Promise<ServiceClaimRecord> {
    const claim = await serviceClaimRepository.getClaimById(claimId);
    if (!claim) {
      throw new AppError(`Claim '${claimId}' not found.`, 404, 'CLAIM_NOT_FOUND');
    }
    return claim;
  }

  // ============================================================================
  // 5. SLA Penalties & Replacement Deductions Review
  // ============================================================================

  async listPenalties(options: {
    asfLocationId?: string;
    status?: PenaltyStatus;
    breachType?: PenaltyBreachType;
    page?: number;
    limit?: number;
  }): Promise<{ items: SlaPenaltyRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    return slaPenaltyRepository.listPenalties(options);
  }

  async reviewPenalty(
    penaltyId: string,
    input: {
      action: 'APPROVE' | 'WAIVE' | 'DISPUTE';
      reviewRemarks: string;
      waiverPercentage?: number;
    },
    actor: AuthenticatedUser
  ): Promise<SlaPenaltyRecord> {
    if (!actor.permissions.includes('finance:approve') && !actor.roles.includes('ADMIN') && !actor.roles.includes('FINANCE')) {
      throw new AppError('Forbidden: Only Finance or Admin can review SLA penalties.', 403, 'FORBIDDEN');
    }

    const conn = await getOracleConnection();

    try {
      const penalty = await slaPenaltyRepository.getPenaltyById(penaltyId, conn);
      if (!penalty) {
        throw new AppError('Penalty record not found.', 404, 'PENALTY_NOT_FOUND');
      }

      if (penalty.status !== 'PENDING_REVIEW' && penalty.status !== 'DISPUTED') {
        throw new AppError(`Penalty in status '${penalty.status}' cannot be modified.`, 400, 'INVALID_STATUS');
      }

      let newStatus: PenaltyStatus = 'APPROVED';
      let calculatedAmount = penalty.calculatedAmount;

      if (input.action === 'WAIVE') {
        newStatus = 'WAIVED';
        const waiverPct = input.waiverPercentage !== undefined ? input.waiverPercentage : 100;
        calculatedAmount = Math.round(penalty.calculatedAmount * (1 - waiverPct / 100) * 100) / 100;
      } else if (input.action === 'DISPUTE') {
        newStatus = 'DISPUTED';
      }

      await slaPenaltyRepository.updatePenaltyStatus(
        penaltyId,
        newStatus,
        {
          reviewedBy: actor.userId,
          reviewedByUsername: actor.username,
          reviewRemarks: input.reviewRemarks,
          calculatedAmount,
        },
        conn
      );

      await conn.commit();

      const updated = await slaPenaltyRepository.getPenaltyById(penaltyId);
      if (!updated) throw new Error('Failed to retrieve updated penalty record.');
      return updated;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  // ============================================================================
  // 6. Settlement Batches & Franchisee Disbursements
  // ============================================================================

  async createSettlementBatch(
    input: {
      asfLocationId: string;
      claimIds: string[];
      paymentMode: 'BANK_NEFT' | 'RTGS' | 'CHEQUE';
      paymentReference: string;
    },
    actor: AuthenticatedUser
  ): Promise<SettlementBatchRecord> {
    if (!actor.permissions.includes('finance:settle') && !actor.roles.includes('ADMIN') && !actor.roles.includes('FINANCE')) {
      throw new AppError('Forbidden: Only Finance or Admin can disburse settlement batches.', 403, 'FORBIDDEN');
    }

    const conn = await getOracleConnection();

    try {
      let totalPayable = 0;
      const verifiedClaims: ServiceClaimRecord[] = [];

      for (const claimId of input.claimIds) {
        const claim = await serviceClaimRepository.getClaimById(claimId, conn);
        if (!claim) {
          throw new AppError(`Claim '${claimId}' not found.`, 404, 'CLAIM_NOT_FOUND');
        }

        if (claim.status !== 'POSTED' && claim.status !== 'APPROVED') {
          throw new AppError(`Claim ${claim.claimNumber} is in status '${claim.status}' and cannot be settled.`, 400, 'UNSETTLEABLE_CLAIM');
        }

        if (claim.asfLocationId !== input.asfLocationId) {
          throw new AppError(`Claim ${claim.claimNumber} does not belong to location ${input.asfLocationId}.`, 400, 'LOCATION_MISMATCH');
        }

        totalPayable += claim.netClaimAmount;
        verifiedClaims.push(claim);
      }

      totalPayable = Math.round(totalPayable * 100) / 100;

      // Post settlement journal
      // Debit: 2020 ASF Claim Payables (Liability cleared)
      // Credit: 1010 Cash/Bank Clearing (Cash disbursed)
      const journal = await financialJournalRepository.postJournal(
        {
          journalType: 'SETTLEMENT_PAYOUT',
          currency: 'INR',
          sourceReferenceType: 'SETTLEMENT_BATCH',
          sourceReferenceId: input.paymentReference,
          idempotencyKey: `SET-${input.asfLocationId}-${input.paymentReference}`,
          description: `Franchisee Settlement Payout to Location ${input.asfLocationId} (${input.claimIds.length} claims)`,
          postedBy: actor.userId,
          postedByUsername: actor.username,
          lines: [
            {
              accountId: GL_ACCOUNTS.ASF_PAYABLE,
              debitAmount: totalPayable,
              creditAmount: 0.0,
              description: `Clear ASF Payable Liability`,
              entityType: 'ASF',
              entityId: input.asfLocationId,
            },
            {
              accountId: GL_ACCOUNTS.CASH_BANK,
              debitAmount: 0.0,
              creditAmount: totalPayable,
              description: `Disbursement via ${input.paymentMode}: ${input.paymentReference}`,
              entityType: 'ASF',
              entityId: input.asfLocationId,
            },
          ],
        },
        conn
      );

      const batch = await settlementBatchRepository.createSettlementBatch(
        {
          asfLocationId: input.asfLocationId,
          totalClaimsCount: input.claimIds.length,
          totalPayableAmount: totalPayable,
          paymentMode: input.paymentMode,
          paymentReference: input.paymentReference,
          status: 'DISBURSED',
          journalId: journal.journalId,
        },
        conn
      );

      await settlementBatchRepository.markDisbursed(
        batch.settlementId,
        {
          disbursedBy: actor.userId,
          disbursedByUsername: actor.username,
          paymentReference: input.paymentReference,
        },
        conn
      );

      // Transition claims to SETTLED
      for (const claim of verifiedClaims) {
        await serviceClaimRepository.updateClaimStatus(claim.claimId, 'SETTLED', {}, conn);
      }

      await conn.commit();
      return batch;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  async listSettlementBatches(options: {
    asfLocationId?: string;
    status?: SettlementStatus;
    page?: number;
    limit?: number;
  }): Promise<{ items: SettlementBatchRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    return settlementBatchRepository.listSettlements(options);
  }

  // ============================================================================
  // 7. General Ledger & Journal Reversals
  // ============================================================================

  async listJournals(options: {
    journalType?: JournalType;
    status?: JournalStatus;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: FinancialJournalRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    return financialJournalRepository.listJournals(options);
  }

  async getJournal(journalId: string): Promise<FinancialJournalRecord> {
    const journal = await financialJournalRepository.getJournalById(journalId);
    if (!journal) {
      throw new AppError(`Financial journal '${journalId}' not found.`, 404, 'JOURNAL_NOT_FOUND');
    }
    return journal;
  }

  async reverseJournal(
    journalId: string,
    reason: string,
    actor: AuthenticatedUser
  ): Promise<FinancialJournalRecord> {
    if (!actor.permissions.includes('finance:post') && !actor.roles.includes('ADMIN') && !actor.roles.includes('FINANCE')) {
      throw new AppError('Forbidden: Only Finance or Admin can authorize ledger reversals.', 403, 'FORBIDDEN');
    }

    if (!reason || reason.trim().length < 10) {
      throw new AppError('A detailed reversal justification (min 10 characters) is mandatory.', 400, 'REASON_REQUIRED');
    }

    const conn = await getOracleConnection();

    try {
      const reversalJournal = await financialJournalRepository.reverseJournal(
        journalId,
        reason,
        { userId: actor.userId, username: actor.username },
        conn
      );

      await conn.commit();
      return reversalJournal;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }
}

export const financeService = new FinanceService();
