import { z } from 'zod';

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type NormalBalance = 'DEBIT' | 'CREDIT';

export interface GLAccountRecord {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  isActive: 'Y' | 'N';
  createdAt: Date;
  createdBy?: string;
}

export type JournalType =
  | 'WALLET_DEPOSIT'
  | 'WARRANTY_CLAIM'
  | 'SLA_PENALTY'
  | 'SETTLEMENT_PAYOUT'
  | 'REVERSAL'
  | 'ADJUSTMENT';

export type JournalStatus = 'POSTED' | 'REVERSED';

export interface FinancialJournalLineRecord {
  lineId: string;
  journalId: string;
  lineNumber: number;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  debitAmount: number;
  creditAmount: number;
  description?: string;
  entityType?: 'BRAND' | 'ASF' | 'WAREHOUSE' | 'GENERAL';
  entityId?: string;
  createdAt: Date;
}

export interface FinancialJournalRecord {
  journalId: string;
  journalNumber: string;
  postingDate: Date;
  journalType: JournalType;
  status: JournalStatus;
  totalDebit: number;
  totalCredit: number;
  currency: string;
  sourceReferenceType?: string;
  sourceReferenceId?: string;
  idempotencyKey?: string;
  reversalOfJournalId?: string;
  reversalReason?: string;
  description: string;
  postedBy: string;
  postedByUsername: string;
  createdAt: Date;
  lines?: FinancialJournalLineRecord[];
}

export type WalletStatus = 'ACTIVE' | 'SUSPENDED' | 'FROZEN';

export interface BrandWalletRecord {
  walletId: string;
  brandId: string;
  brandCode?: string;
  brandName?: string;
  currentBalance: number;
  totalDeposited: number;
  totalClaimDebited: number;
  totalPenaltyCredited: number;
  currency: string;
  status: WalletStatus;
  lowBalanceThreshold: number;
  versionNo: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export type WalletTxnType =
  | 'DEPOSIT'
  | 'WARRANTY_CLAIM_DEDUCTION'
  | 'REPLACEMENT_DEDUCTION'
  | 'ADJUSTMENT'
  | 'REVERSAL';

export type WalletTxnStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'POSTED' | 'REVERSED';

export interface WalletTransactionRecord {
  transactionId: string;
  walletId: string;
  brandId?: string;
  brandName?: string;
  transactionNumber: string;
  transactionType: WalletTxnType;
  paymentMode?: 'NEFT_RTGS' | 'CHEQUE' | 'BANK_TRANSFER' | 'INTERNAL_JOURNAL';
  referenceNumber: string;
  idempotencyKey?: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  status: WalletTxnStatus;
  journalId?: string;
  requestedBy?: string;
  requestedByUsername?: string;
  approvedBy?: string;
  approvedByUsername?: string;
  approvedAt?: Date;
  rejectionReason?: string;
  reversalOfTxnId?: string;
  remarks?: string;
  createdAt: Date;
}

export interface ClaimRateMatrixRecord {
  rateId: string;
  brandId: string;
  brandName?: string;
  productId: string;
  productName?: string;
  callType: 'INSTALLATION' | 'REPAIR' | 'DEMO' | 'PREVENTIVE_MAINTENANCE';
  aspLaborPrice: number;
  brandLaborPrice: number;
  travelRatePerKm: number;
  tatHoursThreshold: number;
  tatOnTimePercentage: number;
  tatDelayPercentage: number;
  isActive: 'Y' | 'N';
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export type ClaimStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'VALIDATED'
  | 'APPROVED'
  | 'REJECTED'
  | 'POSTED'
  | 'SETTLED';

export interface ClaimLineItemRecord {
  itemId: string;
  claimId: string;
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
  auditStatus: 'VERIFIED' | 'FLAGGED' | 'REJECTED';
  auditNote?: string;
  createdAt: Date;
}

export interface ServiceClaimRecord {
  claimId: string;
  claimNumber: string;
  claimMonth: number;
  claimYear: number;
  asfLocationId: string;
  asfLocationName?: string;
  brandId?: string;
  brandName?: string;
  totalJobsCount: number;
  grossLaborAmount: number;
  grossTravelAmount: number;
  penaltyDeductionAmount: number;
  netClaimAmount: number;
  status: ClaimStatus;
  submittedAt?: Date;
  submittedBy?: string;
  submittedByUsername?: string;
  auditedAt?: Date;
  auditedBy?: string;
  auditedByUsername?: string;
  approvedAt?: Date;
  approvedBy?: string;
  approvedByUsername?: string;
  rejectionReason?: string;
  journalId?: string;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
  lineItems?: ClaimLineItemRecord[];
}

export type PenaltyBreachType =
  | 'SLA_48H_ACKNOWLEDGEMENT'
  | 'SLA_168H_CLOSURE'
  | 'REPLACEMENT_DEBIT'
  | 'UNAUTHORIZED_DISPOSITION';

export type PenaltyStatus = 'PENDING_REVIEW' | 'APPROVED' | 'WAIVED' | 'DISPUTED' | 'POSTED';

export interface SlaPenaltyRecord {
  penaltyId: string;
  penaltyNumber: string;
  serviceRequestId: string;
  jobNumber?: string;
  asfLocationId: string;
  asfLocationName?: string;
  breachType: PenaltyBreachType;
  breachTimestamp: Date;
  calculatedAmount: number;
  status: PenaltyStatus;
  reviewedBy?: string;
  reviewedByUsername?: string;
  reviewedAt?: Date;
  reviewRemarks?: string;
  journalId?: string;
  createdAt: Date;
}

export type SettlementStatus = 'DRAFT' | 'APPROVED' | 'DISBURSED' | 'RECONCILED';

export interface SettlementBatchRecord {
  settlementId: string;
  settlementNumber: string;
  settlementDate: Date;
  asfLocationId: string;
  asfLocationName?: string;
  totalClaimsCount: number;
  totalPayableAmount: number;
  paymentReference?: string;
  paymentMode: 'BANK_NEFT' | 'RTGS' | 'CHEQUE';
  status: SettlementStatus;
  journalId?: string;
  disbursedAt?: Date;
  disbursedBy?: string;
  disbursedByUsername?: string;
  createdAt: Date;
}

export interface FinanceSummaryKpis {
  totalWalletReserves: number;
  activeBrandWalletsCount: number;
  pendingClaimsCount: number;
  pendingClaimsAmount: number;
  approvedPayablesLiability: number;
  postedJournalsCount: number;
  unbalancedJournalsCount: number;
  pendingPenaltiesCount: number;
  pendingPenaltiesAmount: number;
}

// ============================================================================
// Zod Validation Schemas
// ============================================================================

export const createWalletDepositSchema = z.object({
  brandId: z.string().uuid(),
  amount: z.number().positive('Deposit amount must be greater than zero.'),
  paymentMode: z.enum(['NEFT_RTGS', 'CHEQUE', 'BANK_TRANSFER']),
  referenceNumber: z.string().min(3, 'Bank reference/UTR must be at least 3 characters.').max(100),
  remarks: z.string().max(500).optional(),
  idempotencyKey: z.string().min(5).max(100).optional(),
});

export const approveWalletDepositSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  rejectionReason: z.string().max(500).optional(),
});

export const createManualAdjustmentSchema = z.object({
  brandId: z.string().uuid(),
  adjustmentType: z.enum(['CREDIT', 'DEBIT']),
  amount: z.number().positive(),
  reason: z.string().min(5, 'A documented explanation (min 5 chars) is mandatory.'),
  idempotencyKey: z.string().min(5).max(100).optional(),
});

export const generateClaimBatchSchema = z.object({
  asfLocationId: z.string().uuid(),
  brandId: z.string().uuid().optional(),
  claimMonth: z.number().int().min(1).max(12),
  claimYear: z.number().int().min(2020).max(2035),
  remarks: z.string().max(500).optional(),
});

export const auditClaimSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  rejectionReason: z.string().max(500).optional(),
  lineItemAdjustments: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        auditStatus: z.enum(['VERIFIED', 'FLAGGED', 'REJECTED']),
        auditNote: z.string().max(500).optional(),
        deductionAmount: z.number().min(0).optional(),
      })
    )
    .optional(),
});

export const reviewPenaltySchema = z.object({
  action: z.enum(['APPROVE', 'WAIVE', 'DISPUTE']),
  reviewRemarks: z.string().min(5, 'Documented review remarks (min 5 chars) are required.'),
  waiverPercentage: z.number().min(0).max(100).optional(),
});

export const createSettlementBatchSchema = z.object({
  asfLocationId: z.string().uuid(),
  claimIds: z.array(z.string().uuid()).min(1, 'At least one approved claim must be selected.'),
  paymentMode: z.enum(['BANK_NEFT', 'RTGS', 'CHEQUE']),
  paymentReference: z.string().min(3, 'Disbursement reference must be at least 3 characters.'),
});

export const reverseJournalSchema = z.object({
  journalId: z.string().uuid(),
  reason: z.string().min(10, 'A detailed reversal justification (min 10 chars) is mandatory.'),
});
