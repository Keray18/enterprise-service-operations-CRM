import { describe, expect, it } from 'vitest';
import { formatCurrency, formatNumber, formatPercentage } from '../src/lib/formatters';
import type { WarrantyClaimReportRow } from '../src/lib/reportingApi';

describe('Reports Data Contracts & Currency Formatting (P0 Hotfix)', () => {
  describe('formatCurrency - Monetary Representation Contract', () => {
    it('authoritative zero (0, "0", "0.00") formats strictly as ₹0.00', () => {
      expect(formatCurrency(0)).toBe('₹0.00');
      expect(formatCurrency('0')).toBe('₹0.00');
      expect(formatCurrency('0.00')).toBe('₹0.00');
    });

    it('valid monetary numbers format with Indian locale grouping and 2 decimal places', () => {
      expect(formatCurrency(1500)).toBe('₹1,500.00');
      expect(formatCurrency(1500.5)).toBe('₹1,500.50');
      expect(formatCurrency(1234567.89)).toBe('₹12,34,567.89');
    });

    it('numeric string representations are safely parsed and formatted', () => {
      expect(formatCurrency('750')).toBe('₹750.00');
      expect(formatCurrency('4500.75')).toBe('₹4,500.75');
    });

    it('missing, undefined, or null values display unavailable state "—" without throwing TypeError', () => {
      expect(formatCurrency(undefined)).toBe('—');
      expect(formatCurrency(null)).toBe('—');
      expect(formatCurrency('')).toBe('—');
    });

    it('malformed numeric input or NaN returns unavailable state "—"', () => {
      expect(formatCurrency('invalid_num')).toBe('—');
      expect(formatCurrency(NaN)).toBe('—');
    });

    it('negative values display proper sign and currency formatting', () => {
      expect(formatCurrency(-500)).toBe('-₹500.00');
    });

    it('supports custom fallback string when explicitly requested', () => {
      expect(formatCurrency(undefined, { fallback: 'N/A' })).toBe('N/A');
      expect(formatCurrency(null, { fallback: 'NOT_SET' })).toBe('NOT_SET');
    });
  });

  describe('WarrantyClaimReportRow Null Safety & Missing Penalty Handling', () => {
    it('handles row where penaltyDeductionAmount is undefined without throwing runtime error', () => {
      // Simulates the exact payload that previously crashed frontend/src/app/(workspace)/reports/page.tsx:664
      const row: Partial<WarrantyClaimReportRow> = {
        claimNumber: 'CLM-2026-001',
        claimPeriod: '10/2026',
        asfName: 'Franchise South',
        totalJobsCount: 12,
        grossLaborAmount: 4800,
        grossTravelAmount: 600,
        penaltyDeductionAmount: undefined as any,
        netClaimAmount: 5400,
        status: 'SUBMITTED',
      };

      expect(() => {
        const deductionText = formatCurrency(row.penaltyDeductionAmount);
        expect(deductionText).toBe('—');
      }).not.toThrow();
    });

    it('handles row where penaltyDeductionAmount is explicitly 0.00', () => {
      const row: WarrantyClaimReportRow = {
        claimNumber: 'CLM-2026-002',
        claimPeriod: '10/2026',
        asfName: 'Franchise North',
        totalJobsCount: 5,
        grossLaborAmount: 2000,
        grossTravelAmount: 250,
        penaltyDeductionAmount: 0,
        netClaimAmount: 2250,
        status: 'APPROVED',
      };

      expect(formatCurrency(row.penaltyDeductionAmount)).toBe('₹0.00');
      expect(formatCurrency(row.grossLaborAmount)).toBe('₹2,000.00');
      expect(formatCurrency(row.grossTravelAmount)).toBe('₹250.00');
      expect(formatCurrency(row.netClaimAmount)).toBe('₹2,250.00');
    });

    it('handles row with active penalty deduction amount', () => {
      const row: WarrantyClaimReportRow = {
        claimNumber: 'CLM-2026-003',
        claimPeriod: '10/2026',
        asfName: 'Franchise West',
        totalJobsCount: 8,
        grossLaborAmount: 3200,
        grossTravelAmount: 400,
        penaltyDeductionAmount: 500,
        netClaimAmount: 3100,
        status: 'POSTED',
      };

      expect(formatCurrency(row.penaltyDeductionAmount)).toBe('₹500.00');
      expect(formatCurrency(row.netClaimAmount)).toBe('₹3,100.00');
    });
  });

  describe('formatNumber & formatPercentage Utilities', () => {
    it('formats counts with locale grouping and handles zero/null', () => {
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(15420)).toBe('15,420');
      expect(formatNumber(null)).toBe('—');
      expect(formatNumber(undefined)).toBe('—');
    });

    it('formats percentage with decimal places and handles zero/null', () => {
      expect(formatPercentage(95.45, { decimals: 1 })).toBe('95.5%');
      expect(formatPercentage(100)).toBe('100.0%');
      expect(formatPercentage(0)).toBe('0.0%');
      expect(formatPercentage(null)).toBe('—');
    });
  });
});
