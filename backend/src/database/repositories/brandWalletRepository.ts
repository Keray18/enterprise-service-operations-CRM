import crypto from 'crypto';
import oracledb from 'oracledb';
import {
  BrandWalletRecord,
  WalletStatus,
  WalletTransactionRecord,
  WalletTxnStatus,
  WalletTxnType,
} from '../../types/finance.js';
import { getOracleConnection } from '../oraclePool.js';

export class BrandWalletRepository {
  async getWalletByBrandId(
    brandId: string,
    conn?: oracledb.Connection,
    forUpdate: boolean = false
  ): Promise<BrandWalletRecord | null> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const lockSql = forUpdate ? 'FOR UPDATE' : '';
      const sql = `
        SELECT w.WALLET_ID, w.BRAND_ID, b.BRAND_CODE, b.BRAND_NAME,
               w.CURRENT_BALANCE, w.TOTAL_DEPOSITED, w.TOTAL_CLAIM_DEBITED,
               w.TOTAL_PENALTY_CREDITED, w.CURRENCY, w.STATUS,
               w.LOW_BALANCE_THRESHOLD, w.VERSION_NO, w.CREATED_AT, w.UPDATED_AT
        FROM BRAND_WALLETS w
        JOIN BRANDS b ON w.BRAND_ID = b.BRAND_ID
        WHERE w.BRAND_ID = :brandId
        ${lockSql}
      `;

      const result = await connection.execute<any>(
        sql,
        { brandId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const row = result.rows?.[0];
      if (!row) return null;

      return {
        walletId: row.WALLET_ID,
        brandId: row.BRAND_ID,
        brandCode: row.BRAND_CODE,
        brandName: row.BRAND_NAME,
        currentBalance: Number(row.CURRENT_BALANCE || 0),
        totalDeposited: Number(row.TOTAL_DEPOSITED || 0),
        totalClaimDebited: Number(row.TOTAL_CLAIM_DEBITED || 0),
        totalPenaltyCredited: Number(row.TOTAL_PENALTY_CREDITED || 0),
        currency: row.CURRENCY,
        status: row.STATUS as WalletStatus,
        lowBalanceThreshold: Number(row.LOW_BALANCE_THRESHOLD || 10000),
        versionNo: Number(row.VERSION_NO || 1),
        createdAt: new Date(row.CREATED_AT),
        updatedAt: new Date(row.UPDATED_AT),
      };
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async getWalletById(
    walletId: string,
    conn?: oracledb.Connection,
    forUpdate: boolean = false
  ): Promise<BrandWalletRecord | null> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const lockSql = forUpdate ? 'FOR UPDATE' : '';
      const sql = `
        SELECT w.WALLET_ID, w.BRAND_ID, b.BRAND_CODE, b.BRAND_NAME,
               w.CURRENT_BALANCE, w.TOTAL_DEPOSITED, w.TOTAL_CLAIM_DEBITED,
               w.TOTAL_PENALTY_CREDITED, w.CURRENCY, w.STATUS,
               w.LOW_BALANCE_THRESHOLD, w.VERSION_NO, w.CREATED_AT, w.UPDATED_AT
        FROM BRAND_WALLETS w
        JOIN BRANDS b ON w.BRAND_ID = b.BRAND_ID
        WHERE w.WALLET_ID = :walletId
        ${lockSql}
      `;

      const result = await connection.execute<any>(
        sql,
        { walletId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const row = result.rows?.[0];
      if (!row) return null;

      return {
        walletId: row.WALLET_ID,
        brandId: row.BRAND_ID,
        brandCode: row.BRAND_CODE,
        brandName: row.BRAND_NAME,
        currentBalance: Number(row.CURRENT_BALANCE || 0),
        totalDeposited: Number(row.TOTAL_DEPOSITED || 0),
        totalClaimDebited: Number(row.TOTAL_CLAIM_DEBITED || 0),
        totalPenaltyCredited: Number(row.TOTAL_PENALTY_CREDITED || 0),
        currency: row.CURRENCY,
        status: row.STATUS as WalletStatus,
        lowBalanceThreshold: Number(row.LOW_BALANCE_THRESHOLD || 10000),
        versionNo: Number(row.VERSION_NO || 1),
        createdAt: new Date(row.CREATED_AT),
        updatedAt: new Date(row.UPDATED_AT),
      };
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async createWallet(
    brandId: string,
    createdBy: string,
    conn: oracledb.Connection
  ): Promise<BrandWalletRecord> {
    const walletId = crypto.randomUUID();
    const insertSql = `
      INSERT INTO BRAND_WALLETS (
        WALLET_ID, BRAND_ID, CURRENT_BALANCE, TOTAL_DEPOSITED,
        TOTAL_CLAIM_DEBITED, TOTAL_PENALTY_CREDITED, CURRENCY, STATUS,
        LOW_BALANCE_THRESHOLD, VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY
      ) VALUES (
        :walletId, :brandId, 0.00, 0.00, 0.00, 0.00, 'INR', 'ACTIVE',
        10000.00, 1, SYSTIMESTAMP, SYSTIMESTAMP, :createdBy
      )
    `;

    await conn.execute(insertSql, {
      walletId,
      brandId,
      createdBy,
    });

    const created = await this.getWalletById(walletId, conn);
    if (!created) throw new Error('Failed to retrieve newly created wallet.');
    return created;
  }

  async listWallets(options: {
    status?: WalletStatus;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: BrandWalletRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = [];

      if (options.status) {
        binds.status = options.status;
        whereClauses.push('w.STATUS = :status');
      }

      if (options.search && options.search.trim()) {
        binds.search = `%${options.search.trim().toLowerCase()}%`;
        whereClauses.push('(LOWER(b.BRAND_NAME) LIKE :search OR LOWER(b.BRAND_CODE) LIKE :search)');
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const countSql = `
        SELECT COUNT(*) AS CNT
        FROM BRAND_WALLETS w
        JOIN BRANDS b ON w.BRAND_ID = b.BRAND_ID
        ${whereSql}
      `;

      const countRes = await conn.execute<any>(countSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const total = Number(countRes.rows?.[0]?.CNT || 0);

      const page = Math.max(1, options.page || 1);
      const limit = Math.min(100, Math.max(1, options.limit || 20));
      const offset = (page - 1) * limit;

      binds.offset = offset;
      binds.limit = limit;

      const sql = `
        SELECT w.WALLET_ID, w.BRAND_ID, b.BRAND_CODE, b.BRAND_NAME,
               w.CURRENT_BALANCE, w.TOTAL_DEPOSITED, w.TOTAL_CLAIM_DEBITED,
               w.TOTAL_PENALTY_CREDITED, w.CURRENCY, w.STATUS,
               w.LOW_BALANCE_THRESHOLD, w.VERSION_NO, w.CREATED_AT, w.UPDATED_AT
        FROM BRAND_WALLETS w
        JOIN BRANDS b ON w.BRAND_ID = b.BRAND_ID
        ${whereSql}
        ORDER BY b.BRAND_NAME ASC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const result = await conn.execute<any>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const items: BrandWalletRecord[] = (result.rows || []).map((row: any) => ({
        walletId: row.WALLET_ID,
        brandId: row.BRAND_ID,
        brandCode: row.BRAND_CODE,
        brandName: row.BRAND_NAME,
        currentBalance: Number(row.CURRENT_BALANCE || 0),
        totalDeposited: Number(row.TOTAL_DEPOSITED || 0),
        totalClaimDebited: Number(row.TOTAL_CLAIM_DEBITED || 0),
        totalPenaltyCredited: Number(row.TOTAL_PENALTY_CREDITED || 0),
        currency: row.CURRENCY,
        status: row.STATUS as WalletStatus,
        lowBalanceThreshold: Number(row.LOW_BALANCE_THRESHOLD || 10000),
        versionNo: Number(row.VERSION_NO || 1),
        createdAt: new Date(row.CREATED_AT),
        updatedAt: new Date(row.UPDATED_AT),
      }));

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    } finally {
      await conn.close();
    }
  }

  async recordTransaction(
    data: {
      walletId: string;
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
    },
    conn: oracledb.Connection
  ): Promise<WalletTransactionRecord> {
    const transactionId = crypto.randomUUID();
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    const transactionNumber = `TXN-${dateStr}-${randPart}`;

    const insertSql = `
      INSERT INTO WALLET_TRANSACTIONS (
        TRANSACTION_ID,
        WALLET_ID,
        TRANSACTION_NUMBER,
        TRANSACTION_TYPE,
        PAYMENT_MODE,
        REFERENCE_NUMBER,
        IDEMPOTENCY_KEY,
        AMOUNT,
        BALANCE_BEFORE,
        BALANCE_AFTER,
        STATUS,
        JOURNAL_ID,
        REQUESTED_BY,
        REQUESTED_BY_USERNAME,
        APPROVED_BY,
        APPROVED_BY_USERNAME,
        APPROVED_AT,
        REJECTION_REASON,
        REVERSAL_OF_TXN_ID,
        REMARKS,
        CREATED_AT
      ) VALUES (
        :transactionId,
        :walletId,
        :transactionNumber,
        :transactionType,
        :paymentMode,
        :referenceNumber,
        :idempotencyKey,
        :amount,
        :balanceBefore,
        :balanceAfter,
        :status,
        :journalId,
        :requestedBy,
        :requestedByUsername,
        :approvedBy,
        :approvedByUsername,
        :approvedAt,
        :rejectionReason,
        :reversalOfTxnId,
        :remarks,
        SYSTIMESTAMP
      )
    `;

    await conn.execute(insertSql, {
      transactionId,
      walletId: data.walletId,
      transactionNumber,
      transactionType: data.transactionType,
      paymentMode: data.paymentMode || null,
      referenceNumber: data.referenceNumber,
      idempotencyKey: data.idempotencyKey || null,
      amount: data.amount,
      balanceBefore: data.balanceBefore,
      balanceAfter: data.balanceAfter,
      status: data.status,
      journalId: data.journalId || null,
      requestedBy: data.requestedBy || null,
      requestedByUsername: data.requestedByUsername || null,
      approvedBy: data.approvedBy || null,
      approvedByUsername: data.approvedByUsername || null,
      approvedAt: data.approvedAt || null,
      rejectionReason: data.rejectionReason || null,
      reversalOfTxnId: data.reversalOfTxnId || null,
      remarks: data.remarks || null,
    });

    return {
      transactionId,
      walletId: data.walletId,
      transactionNumber,
      transactionType: data.transactionType,
      paymentMode: data.paymentMode,
      referenceNumber: data.referenceNumber,
      idempotencyKey: data.idempotencyKey,
      amount: data.amount,
      balanceBefore: data.balanceBefore,
      balanceAfter: data.balanceAfter,
      status: data.status,
      journalId: data.journalId,
      requestedBy: data.requestedBy,
      requestedByUsername: data.requestedByUsername,
      approvedBy: data.approvedBy,
      approvedByUsername: data.approvedByUsername,
      approvedAt: data.approvedAt,
      rejectionReason: data.rejectionReason,
      reversalOfTxnId: data.reversalOfTxnId,
      remarks: data.remarks,
      createdAt: new Date(),
    };
  }

  async updateWalletBalances(
    data: {
      walletId: string;
      newBalance: number;
      deltaDeposited?: number;
      deltaClaimDebited?: number;
      deltaPenaltyCredited?: number;
      updatedBy: string;
    },
    conn: oracledb.Connection
  ): Promise<void> {
    const deltaDeposited = data.deltaDeposited || 0;
    const deltaClaimDebited = data.deltaClaimDebited || 0;
    const deltaPenaltyCredited = data.deltaPenaltyCredited || 0;

    const sql = `
      UPDATE BRAND_WALLETS
      SET CURRENT_BALANCE = :newBalance,
          TOTAL_DEPOSITED = TOTAL_DEPOSITED + :deltaDeposited,
          TOTAL_CLAIM_DEBITED = TOTAL_CLAIM_DEBITED + :deltaClaimDebited,
          TOTAL_PENALTY_CREDITED = TOTAL_PENALTY_CREDITED + :deltaPenaltyCredited,
          VERSION_NO = VERSION_NO + 1,
          UPDATED_AT = SYSTIMESTAMP,
          UPDATED_BY = :updatedBy
      WHERE WALLET_ID = :walletId
    `;

    await conn.execute(sql, {
      newBalance: data.newBalance,
      deltaDeposited,
      deltaClaimDebited,
      deltaPenaltyCredited,
      updatedBy: data.updatedBy,
      walletId: data.walletId,
    });
  }

  async listTransactions(options: {
    walletId?: string;
    brandId?: string;
    status?: WalletTxnStatus;
    transactionType?: WalletTxnType;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: WalletTransactionRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = [];

      if (options.walletId) {
        binds.walletId = options.walletId;
        whereClauses.push('t.WALLET_ID = :walletId');
      }

      if (options.brandId) {
        binds.brandId = options.brandId;
        whereClauses.push('w.BRAND_ID = :brandId');
      }

      if (options.status) {
        binds.status = options.status;
        whereClauses.push('t.STATUS = :status');
      }

      if (options.transactionType) {
        binds.transactionType = options.transactionType;
        whereClauses.push('t.TRANSACTION_TYPE = :transactionType');
      }

      if (options.search && options.search.trim()) {
        binds.search = `%${options.search.trim().toLowerCase()}%`;
        whereClauses.push(
          '(LOWER(t.TRANSACTION_NUMBER) LIKE :search OR LOWER(t.REFERENCE_NUMBER) LIKE :search OR LOWER(t.REMARKS) LIKE :search)'
        );
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const countSql = `
        SELECT COUNT(*) AS CNT
        FROM WALLET_TRANSACTIONS t
        JOIN BRAND_WALLETS w ON t.WALLET_ID = w.WALLET_ID
        ${whereSql}
      `;

      const countRes = await conn.execute<any>(countSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const total = Number(countRes.rows?.[0]?.CNT || 0);

      const page = Math.max(1, options.page || 1);
      const limit = Math.min(100, Math.max(1, options.limit || 20));
      const offset = (page - 1) * limit;

      binds.offset = offset;
      binds.limit = limit;

      const sql = `
        SELECT t.TRANSACTION_ID, t.WALLET_ID, w.BRAND_ID, b.BRAND_NAME,
               t.TRANSACTION_NUMBER, t.TRANSACTION_TYPE, t.PAYMENT_MODE,
               t.REFERENCE_NUMBER, t.IDEMPOTENCY_KEY, t.AMOUNT,
               t.BALANCE_BEFORE, t.BALANCE_AFTER, t.STATUS, t.JOURNAL_ID,
               t.REQUESTED_BY, t.REQUESTED_BY_USERNAME, t.APPROVED_BY,
               t.APPROVED_BY_USERNAME, t.APPROVED_AT, t.REJECTION_REASON,
               t.REVERSAL_OF_TXN_ID, t.REMARKS, t.CREATED_AT
        FROM WALLET_TRANSACTIONS t
        JOIN BRAND_WALLETS w ON t.WALLET_ID = w.WALLET_ID
        JOIN BRANDS b ON w.BRAND_ID = b.BRAND_ID
        ${whereSql}
        ORDER BY t.CREATED_AT DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const result = await conn.execute<any>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const items: WalletTransactionRecord[] = (result.rows || []).map((row: any) => ({
        transactionId: row.TRANSACTION_ID,
        walletId: row.WALLET_ID,
        brandId: row.BRAND_ID,
        brandName: row.BRAND_NAME,
        transactionNumber: row.TRANSACTION_NUMBER,
        transactionType: row.TRANSACTION_TYPE as WalletTxnType,
        paymentMode: row.PAYMENT_MODE,
        referenceNumber: row.REFERENCE_NUMBER,
        idempotencyKey: row.IDEMPOTENCY_KEY || undefined,
        amount: Number(row.AMOUNT || 0),
        balanceBefore: Number(row.BALANCE_BEFORE || 0),
        balanceAfter: Number(row.BALANCE_AFTER || 0),
        status: row.STATUS as WalletTxnStatus,
        journalId: row.JOURNAL_ID || undefined,
        requestedBy: row.REQUESTED_BY || undefined,
        requestedByUsername: row.REQUESTED_BY_USERNAME || undefined,
        approvedBy: row.APPROVED_BY || undefined,
        approvedByUsername: row.APPROVED_BY_USERNAME || undefined,
        approvedAt: row.APPROVED_AT ? new Date(row.APPROVED_AT) : undefined,
        rejectionReason: row.REJECTION_REASON || undefined,
        reversalOfTxnId: row.REVERSAL_OF_TXN_ID || undefined,
        remarks: row.REMARKS || undefined,
        createdAt: new Date(row.CREATED_AT),
      }));

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    } finally {
      await conn.close();
    }
  }

  async getTransactionById(
    transactionId: string,
    conn?: oracledb.Connection
  ): Promise<WalletTransactionRecord | null> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const sql = `
        SELECT t.TRANSACTION_ID, t.WALLET_ID, w.BRAND_ID, b.BRAND_NAME,
               t.TRANSACTION_NUMBER, t.TRANSACTION_TYPE, t.PAYMENT_MODE,
               t.REFERENCE_NUMBER, t.IDEMPOTENCY_KEY, t.AMOUNT,
               t.BALANCE_BEFORE, t.BALANCE_AFTER, t.STATUS, t.JOURNAL_ID,
               t.REQUESTED_BY, t.REQUESTED_BY_USERNAME, t.APPROVED_BY,
               t.APPROVED_BY_USERNAME, t.APPROVED_AT, t.REJECTION_REASON,
               t.REVERSAL_OF_TXN_ID, t.REMARKS, t.CREATED_AT
        FROM WALLET_TRANSACTIONS t
        JOIN BRAND_WALLETS w ON t.WALLET_ID = w.WALLET_ID
        JOIN BRANDS b ON w.BRAND_ID = b.BRAND_ID
        WHERE t.TRANSACTION_ID = :transactionId
      `;

      const result = await connection.execute<any>(
        sql,
        { transactionId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const row = result.rows?.[0];
      if (!row) return null;

      return {
        transactionId: row.TRANSACTION_ID,
        walletId: row.WALLET_ID,
        brandId: row.BRAND_ID,
        brandName: row.BRAND_NAME,
        transactionNumber: row.TRANSACTION_NUMBER,
        transactionType: row.TRANSACTION_TYPE as WalletTxnType,
        paymentMode: row.PAYMENT_MODE,
        referenceNumber: row.REFERENCE_NUMBER,
        idempotencyKey: row.IDEMPOTENCY_KEY || undefined,
        amount: Number(row.AMOUNT || 0),
        balanceBefore: Number(row.BALANCE_BEFORE || 0),
        balanceAfter: Number(row.BALANCE_AFTER || 0),
        status: row.STATUS as WalletTxnStatus,
        journalId: row.JOURNAL_ID || undefined,
        requestedBy: row.REQUESTED_BY || undefined,
        requestedByUsername: row.REQUESTED_BY_USERNAME || undefined,
        approvedBy: row.APPROVED_BY || undefined,
        approvedByUsername: row.APPROVED_BY_USERNAME || undefined,
        approvedAt: row.APPROVED_AT ? new Date(row.APPROVED_AT) : undefined,
        rejectionReason: row.REJECTION_REASON || undefined,
        reversalOfTxnId: row.REVERSAL_OF_TXN_ID || undefined,
        remarks: row.REMARKS || undefined,
        createdAt: new Date(row.CREATED_AT),
      };
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async updateTransactionStatus(
    transactionId: string,
    status: WalletTxnStatus,
    data: {
      approvedBy?: string;
      approvedByUsername?: string;
      approvedAt?: Date;
      rejectionReason?: string;
      journalId?: string;
      balanceBefore?: number;
      balanceAfter?: number;
    },
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE WALLET_TRANSACTIONS
      SET STATUS = :status,
          APPROVED_BY = NVL(:approvedBy, APPROVED_BY),
          APPROVED_BY_USERNAME = NVL(:approvedByUsername, APPROVED_BY_USERNAME),
          APPROVED_AT = NVL(:approvedAt, APPROVED_AT),
          REJECTION_REASON = NVL(:rejectionReason, REJECTION_REASON),
          JOURNAL_ID = NVL(:journalId, JOURNAL_ID),
          BALANCE_BEFORE = NVL(:balanceBefore, BALANCE_BEFORE),
          BALANCE_AFTER = NVL(:balanceAfter, BALANCE_AFTER)
      WHERE TRANSACTION_ID = :transactionId
    `;

    await conn.execute(sql, {
      status,
      approvedBy: data.approvedBy || null,
      approvedByUsername: data.approvedByUsername || null,
      approvedAt: data.approvedAt || null,
      rejectionReason: data.rejectionReason || null,
      journalId: data.journalId || null,
      balanceBefore: data.balanceBefore !== undefined ? data.balanceBefore : null,
      balanceAfter: data.balanceAfter !== undefined ? data.balanceAfter : null,
      transactionId,
    });
  }

  /**
   * Reconciles brand wallet: compares currentBalance with sum of posted transactions.
   */
  async reconcileWallet(brandId: string): Promise<{
    walletId: string;
    brandId: string;
    currentBalance: number;
    reconstructedBalance: number;
    discrepancy: number;
    isReconciled: boolean;
  }> {
    const conn = await getOracleConnection();
    try {
      const wallet = await this.getWalletByBrandId(brandId, conn);
      if (!wallet) throw new Error(`Wallet not found for brand: ${brandId}`);

      const sumSql = `
        SELECT 
          NVL(SUM(CASE 
            WHEN TRANSACTION_TYPE IN ('DEPOSIT', 'ADJUSTMENT') AND STATUS = 'POSTED' THEN AMOUNT
            WHEN TRANSACTION_TYPE IN ('WARRANTY_CLAIM_DEDUCTION', 'REPLACEMENT_DEDUCTION') AND STATUS = 'POSTED' THEN -AMOUNT
            WHEN TRANSACTION_TYPE = 'REVERSAL' AND STATUS = 'POSTED' THEN -AMOUNT
            ELSE 0
          END), 0) AS RECONSTRUCTED_BAL
        FROM WALLET_TRANSACTIONS
        WHERE WALLET_ID = :walletId
      `;

      const sumRes = await conn.execute<any>(sumSql, { walletId: wallet.walletId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const reconstructedBalance = Number(sumRes.rows?.[0]?.RECONSTRUCTED_BAL || 0);
      const discrepancy = Math.round((wallet.currentBalance - reconstructedBalance) * 100) / 100;

      return {
        walletId: wallet.walletId,
        brandId: wallet.brandId,
        currentBalance: wallet.currentBalance,
        reconstructedBalance,
        discrepancy,
        isReconciled: discrepancy === 0,
      };
    } finally {
      await conn.close();
    }
  }
}

export const brandWalletRepository = new BrandWalletRepository();
