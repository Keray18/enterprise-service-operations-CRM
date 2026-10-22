import { Request, Response } from 'express';
import {
  approveWalletDepositSchema,
  auditClaimSchema,
  createSettlementBatchSchema,
  createWalletDepositSchema,
  generateClaimBatchSchema,
  reverseJournalSchema,
  reviewPenaltySchema,
} from '../types/finance.js';
import { financeService } from '../services/financeService.js';
import { AuthenticatedUser } from '../types/auth.js';
import { sendError, sendSuccess } from '../middleware/errorHandler.js';

export class FinanceController {
  async getOverviewKpis(_req: Request, res: Response): Promise<void> {
    try {
      const kpis = await financeService.getSummaryKpis();
      sendSuccess(res, kpis);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  // ============================================================================
  // Brand Wallets
  // ============================================================================

  async listBrandWallets(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const userAny = user as any;
      const { status, search, page, limit } = req.query;

      // Brand users are scoped to their own brand
      let brandId = req.query.brandId as string | undefined;
      if (user.roles.includes('BRAND') && userAny.brandId) {
        brandId = userAny.brandId;
      }

      const result = await financeService.listBrandWallets({
        status: status as any,
        search: search ? String(search) : undefined,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });

      // If brand user, filter items
      if (brandId) {
        result.items = result.items.filter((item) => item.brandId === brandId);
        result.total = result.items.length;
      }

      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async getBrandWallet(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const userAny = user as any;
      const brandId = req.params.brandId;

      if (!brandId) {
        sendError(res, 'brandId is required.', 400, 'VALIDATION_ERROR');
        return;
      }

      if (user.roles.includes('BRAND') && userAny.brandId && userAny.brandId !== brandId) {
        sendError(res, 'Forbidden: You can only view your own brand wallet.', 403, 'FORBIDDEN');
        return;
      }

      const wallet = await financeService.getBrandWallet(brandId);
      sendSuccess(res, wallet);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async reconcileBrandWallet(req: Request, res: Response): Promise<void> {
    try {
      const brandId = req.params.brandId;
      if (!brandId) {
        sendError(res, 'brandId is required.', 400, 'VALIDATION_ERROR');
        return;
      }
      const reconciliation = await financeService.reconcileBrandWallet(brandId);
      sendSuccess(res, reconciliation);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async createWalletDeposit(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const userAny = user as any;
      const validated = createWalletDepositSchema.parse(req.body);

      if (user.roles.includes('BRAND') && userAny.brandId && userAny.brandId !== validated.brandId) {
        sendError(res, 'Forbidden: You can only deposit to your own brand wallet.', 403, 'FORBIDDEN');
        return;
      }

      const txn = await financeService.createWalletDeposit(validated, user);
      sendSuccess(res, txn, 201);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async approveWalletDeposit(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const transactionId = req.params.transactionId;
      if (!transactionId) {
        sendError(res, 'transactionId is required.', 400, 'VALIDATION_ERROR');
        return;
      }
      const validated = approveWalletDepositSchema.parse(req.body);

      const updated = await financeService.approveWalletDeposit(transactionId, validated, user);
      sendSuccess(res, updated);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async listWalletTransactions(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const userAny = user as any;
      const { walletId, status, transactionType, search, page, limit } = req.query;

      let brandId = req.query.brandId as string | undefined;
      if (user.roles.includes('BRAND') && userAny.brandId) {
        brandId = userAny.brandId;
      }

      const result = await financeService.listWalletTransactions({
        walletId: walletId ? String(walletId) : undefined,
        brandId,
        status: status as any,
        transactionType: transactionType as any,
        search: search ? String(search) : undefined,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });

      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  // ============================================================================
  // Commercial Rates & Service Claims
  // ============================================================================

  async listClaimRates(req: Request, res: Response): Promise<void> {
    try {
      const { brandId, productId } = req.query;
      const rates = await financeService.listClaimRates({
        brandId: brandId ? String(brandId) : undefined,
        productId: productId ? String(productId) : undefined,
      });
      sendSuccess(res, rates);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async getEligibleClaimJobs(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      let asfLocationId = req.query.asfLocationId as string | undefined;

      if (user.roles.includes('ASF') && user.locationId) {
        asfLocationId = user.locationId;
      }

      if (!asfLocationId) {
        sendError(res, 'asfLocationId is required.', 400, 'VALIDATION_ERROR');
        return;
      }

      const brandId = req.query.brandId as string | undefined;
      const jobs = await financeService.getEligibleClaimJobs(asfLocationId, brandId);
      sendSuccess(res, jobs);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async generateClaimBatch(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const validated = generateClaimBatchSchema.parse(req.body);

      if (user.roles.includes('ASF') && user.locationId && user.locationId !== validated.asfLocationId) {
        sendError(res, 'Forbidden: You can only submit claims for your own franchise.', 403, 'FORBIDDEN');
        return;
      }

      const claim = await financeService.generateClaimBatch(validated, user);
      sendSuccess(res, claim, 201);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async listClaims(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const { brandId, status, claimMonth, claimYear, search, page, limit } = req.query;

      let asfLocationId = req.query.asfLocationId as string | undefined;
      if (user.roles.includes('ASF') && user.locationId) {
        asfLocationId = user.locationId;
      }

      const result = await financeService.listClaims({
        asfLocationId,
        brandId: brandId ? String(brandId) : undefined,
        status: status as any,
        claimMonth: claimMonth ? Number(claimMonth) : undefined,
        claimYear: claimYear ? Number(claimYear) : undefined,
        search: search ? String(search) : undefined,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });

      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async getClaim(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const claimId = req.params.claimId;
      if (!claimId) {
        sendError(res, 'claimId is required.', 400, 'VALIDATION_ERROR');
        return;
      }

      const claim = await financeService.getClaim(claimId);

      if (user.roles.includes('ASF') && user.locationId && user.locationId !== claim.asfLocationId) {
        sendError(res, 'Forbidden: You can only view your own franchise claims.', 403, 'FORBIDDEN');
        return;
      }

      sendSuccess(res, claim);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async auditClaimBatch(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const claimId = req.params.claimId;
      if (!claimId) {
        sendError(res, 'claimId is required.', 400, 'VALIDATION_ERROR');
        return;
      }
      const validated = auditClaimSchema.parse(req.body);

      const updated = await financeService.auditClaimBatch(claimId, validated, user);
      sendSuccess(res, updated);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  // ============================================================================
  // SLA Penalties Review
  // ============================================================================

  async listPenalties(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const { status, breachType, page, limit } = req.query;

      let asfLocationId = req.query.asfLocationId as string | undefined;
      if (user.roles.includes('ASF') && user.locationId) {
        asfLocationId = user.locationId;
      }

      const result = await financeService.listPenalties({
        asfLocationId,
        status: status as any,
        breachType: breachType as any,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });

      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async reviewPenalty(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const penaltyId = req.params.penaltyId;
      if (!penaltyId) {
        sendError(res, 'penaltyId is required.', 400, 'VALIDATION_ERROR');
        return;
      }
      const validated = reviewPenaltySchema.parse(req.body);

      const updated = await financeService.reviewPenalty(penaltyId, validated, user);
      sendSuccess(res, updated);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  // ============================================================================
  // Settlement Batches
  // ============================================================================

  async createSettlementBatch(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const validated = createSettlementBatchSchema.parse(req.body);

      const batch = await financeService.createSettlementBatch(validated, user);
      sendSuccess(res, batch, 201);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async listSettlementBatches(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const { status, page, limit } = req.query;

      let asfLocationId = req.query.asfLocationId as string | undefined;
      if (user.roles.includes('ASF') && user.locationId) {
        asfLocationId = user.locationId;
      }

      const result = await financeService.listSettlementBatches({
        asfLocationId,
        status: status as any,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });

      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  // ============================================================================
  // Journals & Reversals
  // ============================================================================

  async listJournals(req: Request, res: Response): Promise<void> {
    try {
      const { journalType, status, search, page, limit } = req.query;
      const result = await financeService.listJournals({
        journalType: journalType as any,
        status: status as any,
        search: search ? String(search) : undefined,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });

      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async getJournal(req: Request, res: Response): Promise<void> {
    try {
      const journalId = req.params.journalId;
      if (!journalId) {
        sendError(res, 'journalId is required.', 400, 'VALIDATION_ERROR');
        return;
      }
      const journal = await financeService.getJournal(journalId);
      sendSuccess(res, journal);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }

  async reverseJournal(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthenticatedUser;
      const validated = reverseJournalSchema.parse(req.body);

      const reversal = await financeService.reverseJournal(validated.journalId, validated.reason, user);
      sendSuccess(res, reversal);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode || 500, err.code || 'INTERNAL_ERROR');
    }
  }
}

export const financeController = new FinanceController();
