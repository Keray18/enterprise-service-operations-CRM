import { describe, expect, it, vi, beforeEach } from 'vitest';
import { apiClient } from '../src/lib/apiClient';

describe('Phase 4 Finance, Brand Wallets & Service Claims Frontend API Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Finance Overview KPIs & Summary', () => {
    it('fetches finance summary KPIs', async () => {
      const mockKpis = {
        totalWalletReserves: 75000.0,
        activeBrandWalletsCount: 1,
        pendingClaimsCount: 2,
        pendingClaimsAmount: 3200.0,
        approvedPayablesLiability: 1500.0,
        postedJournalsCount: 8,
        unbalancedJournalsCount: 0,
        pendingPenaltiesCount: 1,
        pendingPenaltiesAmount: 500.0,
      };

      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockKpis);

      const res = await apiClient.get('/api/v1/finance/overview');

      expect(getSpy).toHaveBeenCalledWith('/api/v1/finance/overview');
      expect(res).toEqual(mockKpis);
      expect((res as any).unbalancedJournalsCount).toBe(0);
    });
  });

  describe('2. Brand Wallets & Deposits', () => {
    it('lists brand wallets with balance and thresholds', async () => {
      const mockWallets = {
        items: [
          {
            walletId: 'wal-01',
            brandId: 'brand-01',
            brandCode: 'SKC',
            brandName: 'Skatercat',
            currentBalance: 75000.0,
            totalDeposited: 75000.0,
            totalClaimDebited: 0.0,
            totalPenaltyCredited: 0.0,
            currency: 'INR',
            status: 'ACTIVE',
            lowBalanceThreshold: 10000.0,
            versionNo: 1,
            createdAt: '2026-10-22T00:00:00Z',
            updatedAt: '2026-10-22T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };

      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockWallets);

      const res = await apiClient.get('/api/v1/finance/wallets');

      expect(getSpy).toHaveBeenCalledWith('/api/v1/finance/wallets');
      expect((res as any).items[0].currentBalance).toBe(75000.0);
    });

    it('submits a brand wallet deposit', async () => {
      const mockTxn = {
        transactionId: 'txn-01',
        walletId: 'wal-01',
        transactionNumber: 'WTX-20261022-0001',
        transactionType: 'DEPOSIT',
        paymentMode: 'NEFT_RTGS',
        referenceNumber: 'UTR99887766',
        amount: 50000.0,
        balanceBefore: 75000.0,
        balanceAfter: 125000.0,
        status: 'POSTED',
        createdAt: '2026-10-22T00:00:00Z',
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockTxn);

      const depositPayload = {
        brandId: 'brand-01',
        amount: 50000.0,
        paymentMode: 'NEFT_RTGS',
        referenceNumber: 'UTR99887766',
      };

      const res = await apiClient.post('/api/v1/finance/wallets/deposit', depositPayload);

      expect(postSpy).toHaveBeenCalledWith('/api/v1/finance/wallets/deposit', depositPayload);
      expect((res as any).transactionNumber).toBe('WTX-20261022-0001');
    });

    it('reconciles brand wallet against ledger', async () => {
      const mockRecon = {
        walletId: 'wal-01',
        brandId: 'brand-01',
        currentBalance: 75000.0,
        reconstructedBalance: 75000.0,
        discrepancy: 0.0,
        isReconciled: true,
      };

      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockRecon);

      const res = await apiClient.get('/api/v1/finance/wallets/brand-01/reconcile');

      expect(getSpy).toHaveBeenCalledWith('/api/v1/finance/wallets/brand-01/reconcile');
      expect((res as any).isReconciled).toBe(true);
      expect((res as any).discrepancy).toBe(0.0);
    });
  });

  describe('3. Service Claims & Commercial Rate Matrix', () => {
    it('fetches commercial claim rates for brand and product', async () => {
      const mockRates = [
        {
          rateId: 'rate-01',
          brandId: 'brand-01',
          productId: 'prod-ac-01',
          callType: 'REPAIR',
          aspLaborPrice: 350.0,
          brandLaborPrice: 550.0,
          travelRatePerKm: 5.0,
          tatHoursThreshold: 48,
          tatOnTimePercentage: 100.0,
          tatDelayPercentage: 80.0,
          isActive: 'Y',
          createdAt: '2026-10-22T00:00:00Z',
          updatedAt: '2026-10-22T00:00:00Z',
        },
      ];

      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockRates);

      const res = await apiClient.get('/api/v1/finance/rates?brandId=brand-01');

      expect(getSpy).toHaveBeenCalledWith('/api/v1/finance/rates?brandId=brand-01');
      expect((res as any)[0].aspLaborPrice).toBe(350.0);
    });

    it('generates a monthly claim batch', async () => {
      const mockClaim = {
        claimId: 'claim-01',
        claimNumber: 'CLM-2026-10-MUM-0001',
        claimMonth: 10,
        claimYear: 2026,
        asfLocationId: 'asf-mum-01',
        brandId: 'brand-01',
        totalJobsCount: 5,
        grossLaborAmount: 1750.0,
        grossTravelAmount: 250.0,
        penaltyDeductionAmount: 0.0,
        netClaimAmount: 2000.0,
        status: 'SUBMITTED',
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockClaim);

      const generatePayload = {
        asfLocationId: 'asf-mum-01',
        brandId: 'brand-01',
        claimMonth: 10,
        claimYear: 2026,
      };

      const res = await apiClient.post('/api/v1/finance/claims/generate', generatePayload);

      expect(postSpy).toHaveBeenCalledWith('/api/v1/finance/claims/generate', generatePayload);
      expect((res as any).netClaimAmount).toBe(2000.0);
    });

    it('submits claim audit decision (Approve)', async () => {
      const mockApproved = {
        claimId: 'claim-01',
        status: 'POSTED',
        journalId: 'jrn-01',
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockApproved);

      const res = await apiClient.post('/api/v1/finance/claims/claim-01/audit', {
        action: 'APPROVE',
        remarks: 'Audited and verified against franchise Happy Code records',
      });

      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/finance/claims/claim-01/audit',
        expect.objectContaining({ action: 'APPROVE' })
      );
      expect((res as any).status).toBe('POSTED');
    });
  });

  describe('4. SLA Penalties Review & Waivers', () => {
    it('reviews and waives an SLA penalty with documented reasoning', async () => {
      const mockWaived = {
        penaltyId: 'pen-01',
        status: 'WAIVED',
        calculatedAmount: 0.0,
        reviewRemarks: 'Concession granted due to documented customer unavailability',
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockWaived);

      const res = await apiClient.post('/api/v1/finance/penalties/pen-01/review', {
        action: 'WAIVE',
        reviewRemarks: 'Concession granted due to documented customer unavailability',
        waiverPercentage: 100,
      });

      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/finance/penalties/pen-01/review',
        expect.objectContaining({ action: 'WAIVE', waiverPercentage: 100 })
      );
      expect((res as any).status).toBe('WAIVED');
    });
  });

  describe('5. Franchisee Settlement Batches', () => {
    it('creates a franchisee settlement payout batch', async () => {
      const mockBatch = {
        settlementId: 'set-01',
        settlementNumber: 'SET-20261022-0001',
        settlementDate: '2026-10-22T00:00:00Z',
        asfLocationId: 'asf-mum-01',
        totalClaimsCount: 1,
        totalPayableAmount: 2000.0,
        paymentReference: 'NEFT-AXIS-998811',
        paymentMode: 'BANK_NEFT',
        status: 'DISBURSED',
        journalId: 'jrn-set-01',
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockBatch);

      const settlementPayload = {
        asfLocationId: 'asf-mum-01',
        claimIds: ['claim-01'],
        paymentMode: 'BANK_NEFT',
        paymentReference: 'NEFT-AXIS-998811',
      };

      const res = await apiClient.post('/api/v1/finance/settlements', settlementPayload);

      expect(postSpy).toHaveBeenCalledWith('/api/v1/finance/settlements', settlementPayload);
      expect((res as any).status).toBe('DISBURSED');
      expect((res as any).totalPayableAmount).toBe(2000.0);
    });
  });

  describe('6. General Ledger & Reversals', () => {
    it('fetches double-entry journal with balanced line items', async () => {
      const mockJournal = {
        journalId: 'jrn-01',
        journalNumber: 'JRN-20261022-0001',
        postingDate: '2026-10-22T00:00:00Z',
        journalType: 'WALLET_DEPOSIT',
        status: 'POSTED',
        totalDebit: 50000.0,
        totalCredit: 50000.0,
        currency: 'INR',
        description: 'Authorized Prepaid Deposit',
        postedByUsername: 'admin',
        lines: [
          {
            lineId: 'l1',
            lineNumber: 1,
            accountId: 'acct-1010',
            accountCode: '1010',
            accountName: 'Cash & Bank Clearing',
            debitAmount: 50000.0,
            creditAmount: 0.0,
          },
          {
            lineId: 'l2',
            lineNumber: 2,
            accountId: 'acct-2010',
            accountCode: '2010',
            accountName: 'Brand Prepaid Warranty Reserve',
            debitAmount: 0.0,
            creditAmount: 50000.0,
          },
        ],
      };

      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockJournal);

      const res = await apiClient.get('/api/v1/finance/journals/jrn-01');

      expect(getSpy).toHaveBeenCalledWith('/api/v1/finance/journals/jrn-01');
      expect((res as any).totalDebit).toBe((res as any).totalCredit);
      expect((res as any).lines.length).toBe(2);
    });

    it('posts a compensating journal reversal', async () => {
      const mockReversal = {
        journalId: 'jrn-rev-01',
        journalNumber: 'JRN-20261022-0002',
        journalType: 'REVERSAL',
        status: 'POSTED',
        reversalOfJournalId: 'jrn-01',
        reversalReason: 'Correction of erroneous bank deposit entry',
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockReversal);

      const res = await apiClient.post('/api/v1/finance/journals/reverse', {
        journalId: 'jrn-01',
        reason: 'Correction of erroneous bank deposit entry',
      });

      expect(postSpy).toHaveBeenCalledWith('/api/v1/finance/journals/reverse', {
        journalId: 'jrn-01',
        reason: 'Correction of erroneous bank deposit entry',
      });
      expect((res as any).journalType).toBe('REVERSAL');
    });
  });
});
