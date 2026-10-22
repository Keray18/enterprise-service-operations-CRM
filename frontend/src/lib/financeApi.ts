/**
 * Finance, Brand Wallets, Service Claims & Settlement API Client
 * Phase 4: TanStack Query hooks and typed API client.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './apiClient';

// ============================================================================
// Types & Domain Models
// ============================================================================

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

export type WalletStatus = 'ACTIVE' | 'SUSPENDED' | 'FROZEN';

export interface BrandWallet {
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
  createdAt: string;
  updatedAt: string;
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

export interface WalletTransaction {
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
  approvedAt?: string;
  rejectionReason?: string;
  reversalOfTxnId?: string;
  remarks?: string;
  createdAt: string;
}

export interface ClaimRate {
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
  createdAt: string;
  updatedAt: string;
}

export interface EligibleClaimJob {
  serviceRequestId: string;
  jobNumber: string;
  brandId: string;
  brandName?: string;
  productId: string;
  productName?: string;
  callType: string;
  isHappyCodeVerified: 'Y' | 'N';
  closedAt: string;
  turnaroundHours: number;
  travelDistanceKm: number;
  baseLaborPrice: number;
  tatPercentage: number;
  claimableLaborAmount: number;
  claimableTravelAmount: number;
  netLineTotal: number;
}

export type ClaimStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'VALIDATED'
  | 'APPROVED'
  | 'REJECTED'
  | 'POSTED'
  | 'SETTLED';

export interface ClaimLineItem {
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
  createdAt: string;
}

export interface ServiceClaim {
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
  submittedAt?: string;
  submittedBy?: string;
  submittedByUsername?: string;
  auditedAt?: string;
  auditedBy?: string;
  auditedByUsername?: string;
  approvedAt?: string;
  approvedBy?: string;
  approvedByUsername?: string;
  rejectionReason?: string;
  journalId?: string;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
  lineItems?: ClaimLineItem[];
}

export type PenaltyBreachType =
  | 'SLA_48H_ACKNOWLEDGEMENT'
  | 'SLA_168H_CLOSURE'
  | 'REPLACEMENT_DEBIT'
  | 'UNAUTHORIZED_DISPOSITION';

export type PenaltyStatus = 'PENDING_REVIEW' | 'APPROVED' | 'WAIVED' | 'DISPUTED' | 'POSTED';

export interface SlaPenalty {
  penaltyId: string;
  penaltyNumber: string;
  serviceRequestId: string;
  jobNumber?: string;
  asfLocationId: string;
  asfLocationName?: string;
  breachType: PenaltyBreachType;
  breachTimestamp: string;
  calculatedAmount: number;
  status: PenaltyStatus;
  reviewedBy?: string;
  reviewedByUsername?: string;
  reviewedAt?: string;
  reviewRemarks?: string;
  journalId?: string;
  createdAt: string;
}

export type SettlementStatus = 'DRAFT' | 'APPROVED' | 'DISBURSED' | 'RECONCILED';

export interface SettlementBatch {
  settlementId: string;
  settlementNumber: string;
  settlementDate: string;
  asfLocationId: string;
  asfLocationName?: string;
  totalClaimsCount: number;
  totalPayableAmount: number;
  paymentReference?: string;
  paymentMode: 'BANK_NEFT' | 'RTGS' | 'CHEQUE';
  status: SettlementStatus;
  journalId?: string;
  disbursedAt?: string;
  disbursedBy?: string;
  disbursedByUsername?: string;
  createdAt: string;
}

export interface FinancialJournalLine {
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
  createdAt: string;
}

export interface FinancialJournal {
  journalId: string;
  journalNumber: string;
  postingDate: string;
  journalType: string;
  status: 'POSTED' | 'REVERSED';
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
  createdAt: string;
  lines?: FinancialJournalLine[];
}

export interface WalletReconciliation {
  walletId: string;
  brandId: string;
  currentBalance: number;
  reconstructedBalance: number;
  discrepancy: number;
  isReconciled: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================================================
// API Hook Queries & Mutations
// ============================================================================

export function useFinanceOverviewKpis() {
  return useQuery<FinanceSummaryKpis>({
    queryKey: ['finance', 'overview'],
    queryFn: () => apiClient.get<FinanceSummaryKpis>('/api/v1/finance/overview'),
    refetchInterval: 30000,
  });
}

export function useBrandWallets(params?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
  brandId?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.brandId) searchParams.set('brandId', params.brandId);

  const queryStr = searchParams.toString();
  const endpoint = `/api/v1/finance/wallets${queryStr ? `?${queryStr}` : ''}`;

  return useQuery<PaginatedResult<BrandWallet>>({
    queryKey: ['finance', 'wallets', params],
    queryFn: () => apiClient.get<PaginatedResult<BrandWallet>>(endpoint),
  });
}

export function useBrandWallet(brandId: string | undefined) {
  return useQuery<BrandWallet>({
    queryKey: ['finance', 'wallets', brandId],
    queryFn: () => apiClient.get<BrandWallet>(`/api/v1/finance/wallets/${brandId}`),
    enabled: !!brandId,
  });
}

export function useWalletTransactions(params?: {
  walletId?: string;
  brandId?: string;
  status?: string;
  transactionType?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.walletId) searchParams.set('walletId', params.walletId);
  if (params?.brandId) searchParams.set('brandId', params.brandId);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.transactionType) searchParams.set('transactionType', params.transactionType);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const queryStr = searchParams.toString();
  const endpoint = `/api/v1/finance/wallets-transactions${queryStr ? `?${queryStr}` : ''}`;

  return useQuery<PaginatedResult<WalletTransaction>>({
    queryKey: ['finance', 'wallets-transactions', params],
    queryFn: () => apiClient.get<PaginatedResult<WalletTransaction>>(endpoint),
  });
}

export function useDepositWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      brandId: string;
      amount: number;
      paymentMode: 'NEFT_RTGS' | 'CHEQUE' | 'BANK_TRANSFER';
      referenceNumber: string;
      remarks?: string;
      idempotencyKey?: string;
    }) => apiClient.post<WalletTransaction>('/api/v1/finance/wallets/deposit', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
  });
}

export function useDecideWalletTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      transactionId,
      body,
    }: {
      transactionId: string;
      body: { action: 'APPROVE' | 'REJECT'; rejectionReason?: string };
    }) => apiClient.post<WalletTransaction>(`/api/v1/finance/wallets/transactions/${transactionId}/decide`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
  });
}

export function useClaimRates(params?: { brandId?: string; productId?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.brandId) searchParams.set('brandId', params.brandId);
  if (params?.productId) searchParams.set('productId', params.productId);

  const queryStr = searchParams.toString();
  const endpoint = `/api/v1/finance/rates${queryStr ? `?${queryStr}` : ''}`;

  return useQuery<ClaimRate[]>({
    queryKey: ['finance', 'rates', params],
    queryFn: () => apiClient.get<ClaimRate[]>(endpoint),
  });
}

export function useEligibleClaimJobs(params: { asfLocationId?: string; brandId?: string }) {
  const searchParams = new URLSearchParams();
  if (params.asfLocationId) searchParams.set('asfLocationId', params.asfLocationId);
  if (params.brandId) searchParams.set('brandId', params.brandId);

  const queryStr = searchParams.toString();
  const endpoint = `/api/v1/finance/claims/eligible-jobs${queryStr ? `?${queryStr}` : ''}`;

  return useQuery<EligibleClaimJob[]>({
    queryKey: ['finance', 'eligible-jobs', params],
    queryFn: () => apiClient.get<EligibleClaimJob[]>(endpoint),
    enabled: !!params.asfLocationId,
  });
}

export function useServiceClaims(params?: {
  asfLocationId?: string;
  brandId?: string;
  status?: string;
  claimMonth?: number;
  claimYear?: number;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.asfLocationId) searchParams.set('asfLocationId', params.asfLocationId);
  if (params?.brandId) searchParams.set('brandId', params.brandId);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.claimMonth) searchParams.set('claimMonth', String(params.claimMonth));
  if (params?.claimYear) searchParams.set('claimYear', String(params.claimYear));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const queryStr = searchParams.toString();
  const endpoint = `/api/v1/finance/claims${queryStr ? `?${queryStr}` : ''}`;

  return useQuery<PaginatedResult<ServiceClaim>>({
    queryKey: ['finance', 'claims', params],
    queryFn: () => apiClient.get<PaginatedResult<ServiceClaim>>(endpoint),
  });
}

export function useServiceClaim(claimId: string | undefined) {
  return useQuery<ServiceClaim>({
    queryKey: ['finance', 'claims', claimId],
    queryFn: () => apiClient.get<ServiceClaim>(`/api/v1/finance/claims/${claimId}`),
    enabled: !!claimId,
  });
}

export function useGenerateClaimBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      asfLocationId: string;
      brandId?: string;
      claimMonth: number;
      claimYear: number;
      remarks?: string;
    }) => apiClient.post<ServiceClaim>('/api/v1/finance/claims/generate', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
  });
}

export function useAuditClaimBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      claimId,
      body,
    }: {
      claimId: string;
      body: {
        action: 'APPROVE' | 'REJECT';
        rejectionReason?: string;
        remarks?: string;
        lineAudits?: Array<{
          itemId: string;
          auditStatus: 'VERIFIED' | 'FLAGGED' | 'REJECTED';
          disallowedAmount?: number;
          auditNote?: string;
        }>;
      };
    }) => apiClient.post<ServiceClaim>(`/api/v1/finance/claims/${claimId}/audit`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
  });
}

export function useSlaPenalties(params?: {
  asfLocationId?: string;
  status?: string;
  breachType?: string;
  page?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.asfLocationId) searchParams.set('asfLocationId', params.asfLocationId);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.breachType) searchParams.set('breachType', params.breachType);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const queryStr = searchParams.toString();
  const endpoint = `/api/v1/finance/penalties${queryStr ? `?${queryStr}` : ''}`;

  return useQuery<PaginatedResult<SlaPenalty>>({
    queryKey: ['finance', 'penalties', params],
    queryFn: () => apiClient.get<PaginatedResult<SlaPenalty>>(endpoint),
  });
}

export function useReviewPenalty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      penaltyId,
      body,
    }: {
      penaltyId: string;
      body: {
        action: 'APPROVE' | 'WAIVE' | 'DISPUTE';
        reviewRemarks: string;
        waiverPercentage?: number;
      };
    }) => apiClient.post<SlaPenalty>(`/api/v1/finance/penalties/${penaltyId}/review`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
  });
}

export function useSettlementBatches(params?: {
  asfLocationId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.asfLocationId) searchParams.set('asfLocationId', params.asfLocationId);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const queryStr = searchParams.toString();
  const endpoint = `/api/v1/finance/settlements${queryStr ? `?${queryStr}` : ''}`;

  return useQuery<PaginatedResult<SettlementBatch>>({
    queryKey: ['finance', 'settlements', params],
    queryFn: () => apiClient.get<PaginatedResult<SettlementBatch>>(endpoint),
  });
}

export function useCreateSettlementBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      asfLocationId: string;
      claimIds: string[];
      paymentMode: 'BANK_NEFT' | 'RTGS' | 'CHEQUE';
      paymentReference: string;
      remarks?: string;
    }) => apiClient.post<SettlementBatch>('/api/v1/finance/settlements', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
  });
}

export function useFinancialJournals(params?: {
  journalType?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.journalType) searchParams.set('journalType', params.journalType);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const queryStr = searchParams.toString();
  const endpoint = `/api/v1/finance/journals${queryStr ? `?${queryStr}` : ''}`;

  return useQuery<PaginatedResult<FinancialJournal>>({
    queryKey: ['finance', 'journals', params],
    queryFn: () => apiClient.get<PaginatedResult<FinancialJournal>>(endpoint),
  });
}

export function useFinancialJournal(journalId: string | undefined) {
  return useQuery<FinancialJournal>({
    queryKey: ['finance', 'journals', journalId],
    queryFn: () => apiClient.get<FinancialJournal>(`/api/v1/finance/journals/${journalId}`),
    enabled: !!journalId,
  });
}

export function useReverseJournal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { journalId: string; reason: string }) =>
      apiClient.post<FinancialJournal>('/api/v1/finance/journals/reverse', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
  });
}

export function useReconcileBrandWallet(brandId: string | undefined) {
  return useQuery<WalletReconciliation>({
    queryKey: ['finance', 'wallets', brandId, 'reconcile'],
    queryFn: () => apiClient.get<WalletReconciliation>(`/api/v1/finance/wallets/${brandId}/reconcile`),
    enabled: !!brandId,
  });
}
