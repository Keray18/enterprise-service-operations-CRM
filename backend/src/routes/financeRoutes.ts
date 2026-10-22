import { Router } from 'express';
import { financeController } from '../controllers/financeController.js';
import { requireAnyPermission, requireAuth, requireCsrf, requirePermission } from '../middleware/authMiddleware.js';

export const financeRouter = Router();

// All finance routes require authenticated session
financeRouter.use(requireAuth);

/**
 * 1. Overview & KPIs
 */
financeRouter.get(
  '/overview',
  requirePermission('finance:read'),
  financeController.getOverviewKpis.bind(financeController)
);

/**
 * 2. Brand Wallets & Deposits
 */
financeRouter.get(
  '/wallets',
  requireAnyPermission('finance:read', 'finance:wallets'),
  financeController.listBrandWallets.bind(financeController)
);

financeRouter.get(
  '/wallets/:brandId',
  requireAnyPermission('finance:read', 'finance:wallets'),
  financeController.getBrandWallet.bind(financeController)
);

financeRouter.get(
  '/wallets/:brandId/reconcile',
  requirePermission('finance:read'),
  financeController.reconcileBrandWallet.bind(financeController)
);

financeRouter.post(
  '/wallets/deposit',
  requireCsrf,
  requirePermission('finance:wallets'),
  financeController.createWalletDeposit.bind(financeController)
);

financeRouter.post(
  '/wallets/transactions/:transactionId/decide',
  requireCsrf,
  requirePermission('finance:approve'),
  financeController.approveWalletDeposit.bind(financeController)
);

financeRouter.get(
  '/wallets-transactions',
  requireAnyPermission('finance:read', 'finance:wallets'),
  financeController.listWalletTransactions.bind(financeController)
);

/**
 * 3. Commercial Claim Rates & Service Claims
 */
financeRouter.get(
  '/rates',
  requireAnyPermission('finance:read', 'finance:claims'),
  financeController.listClaimRates.bind(financeController)
);

financeRouter.get(
  '/claims/eligible-jobs',
  requirePermission('finance:claims'),
  financeController.getEligibleClaimJobs.bind(financeController)
);

financeRouter.post(
  '/claims/generate',
  requireCsrf,
  requirePermission('finance:claims'),
  financeController.generateClaimBatch.bind(financeController)
);

financeRouter.get(
  '/claims',
  requireAnyPermission('finance:read', 'finance:claims'),
  financeController.listClaims.bind(financeController)
);

financeRouter.get(
  '/claims/:claimId',
  requireAnyPermission('finance:read', 'finance:claims'),
  financeController.getClaim.bind(financeController)
);

financeRouter.post(
  '/claims/:claimId/audit',
  requireCsrf,
  requirePermission('finance:approve'),
  financeController.auditClaimBatch.bind(financeController)
);

/**
 * 4. SLA Penalties Review
 */
financeRouter.get(
  '/penalties',
  requirePermission('finance:read'),
  financeController.listPenalties.bind(financeController)
);

financeRouter.post(
  '/penalties/:penaltyId/review',
  requireCsrf,
  requirePermission('finance:approve'),
  financeController.reviewPenalty.bind(financeController)
);

/**
 * 5. Settlement Batches
 */
financeRouter.post(
  '/settlements',
  requireCsrf,
  requirePermission('finance:settle'),
  financeController.createSettlementBatch.bind(financeController)
);

financeRouter.get(
  '/settlements',
  requireAnyPermission('finance:read', 'finance:settle'),
  financeController.listSettlementBatches.bind(financeController)
);

/**
 * 6. General Ledger & Reversals
 */
financeRouter.get(
  '/journals',
  requirePermission('finance:read'),
  financeController.listJournals.bind(financeController)
);

financeRouter.get(
  '/journals/:journalId',
  requirePermission('finance:read'),
  financeController.getJournal.bind(financeController)
);

financeRouter.post(
  '/journals/reverse',
  requireCsrf,
  requirePermission('finance:post'),
  financeController.reverseJournal.bind(financeController)
);
