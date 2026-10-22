import crypto from 'crypto';
import oracledb from 'oracledb';
import {
  FinancialJournalLineRecord,
  FinancialJournalRecord,
  JournalStatus,
  JournalType,
} from '../../types/finance.js';
import { getOracleConnection } from '../oraclePool.js';

export class FinancialJournalRepository {
  /**
   * Authoritatively posts a double-entry balanced journal within the provided connection/transaction.
   * Enforces: sum(debits) === sum(credits), non-empty lines, non-negative amounts.
   */
  async postJournal(
    data: {
      journalType: JournalType;
      currency?: string;
      sourceReferenceType?: string;
      sourceReferenceId?: string;
      idempotencyKey?: string;
      reversalOfJournalId?: string;
      reversalReason?: string;
      description: string;
      postedBy: string;
      postedByUsername: string;
      lines: Array<{
        accountId: string;
        debitAmount: number;
        creditAmount: number;
        description?: string;
        entityType?: 'BRAND' | 'ASF' | 'WAREHOUSE' | 'GENERAL';
        entityId?: string;
      }>;
    },
    conn: oracledb.Connection
  ): Promise<FinancialJournalRecord> {
    if (!data.lines || data.lines.length < 2) {
      throw new Error('A double-entry journal requires at least two lines.');
    }

    let totalDebit = 0;
    let totalCredit = 0;

    for (const line of data.lines) {
      if (line.debitAmount < 0 || line.creditAmount < 0) {
        throw new Error('Debit and credit amounts cannot be negative.');
      }
      if (line.debitAmount > 0 && line.creditAmount > 0) {
        throw new Error('A single journal line cannot contain both debit and credit amounts.');
      }
      if (line.debitAmount === 0 && line.creditAmount === 0) {
        throw new Error('A journal line cannot have zero for both debit and credit.');
      }

      totalDebit += line.debitAmount;
      totalCredit += line.creditAmount;
    }

    totalDebit = Math.round(totalDebit * 100) / 100;
    totalCredit = Math.round(totalCredit * 100) / 100;

    if (totalDebit !== totalCredit) {
      throw new Error(
        `Journal entry is unbalanced. Total Debits: ${totalDebit}, Total Credits: ${totalCredit}. Invariant violated: Debits must equal Credits.`
      );
    }

    if (totalDebit <= 0) {
      throw new Error('Journal total amount must be strictly positive.');
    }

    // Idempotency check
    if (data.idempotencyKey) {
      const checkSql = `SELECT JOURNAL_ID, JOURNAL_NUMBER FROM FINANCIAL_JOURNALS WHERE IDEMPOTENCY_KEY = :idempotencyKey`;
      const checkResult = await conn.execute<any>(
        checkSql,
        { idempotencyKey: data.idempotencyKey },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (checkResult.rows && checkResult.rows.length > 0) {
        const existing = await this.getJournalById(checkResult.rows[0].JOURNAL_ID, conn);
        if (existing) return existing;
      }
    }

    const journalId = crypto.randomUUID();
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    const journalNumber = `JRN-${dateStr}-${randPart}`;

    const insertJournalSql = `
      INSERT INTO FINANCIAL_JOURNALS (
        JOURNAL_ID,
        JOURNAL_NUMBER,
        POSTING_DATE,
        JOURNAL_TYPE,
        STATUS,
        TOTAL_DEBIT,
        TOTAL_CREDIT,
        CURRENCY,
        SOURCE_REFERENCE_TYPE,
        SOURCE_REFERENCE_ID,
        IDEMPOTENCY_KEY,
        REVERSAL_OF_JOURNAL_ID,
        REVERSAL_REASON,
        DESCRIPTION,
        POSTED_BY,
        POSTED_BY_USERNAME,
        CREATED_AT
      ) VALUES (
        :journalId,
        :journalNumber,
        SYSTIMESTAMP,
        :journalType,
        'POSTED',
        :totalDebit,
        :totalCredit,
        :currency,
        :sourceReferenceType,
        :sourceReferenceId,
        :idempotencyKey,
        :reversalOfJournalId,
        :reversalReason,
        :description,
        :postedBy,
        :postedByUsername,
        SYSTIMESTAMP
      )
    `;

    await conn.execute(insertJournalSql, {
      journalId,
      journalNumber,
      journalType: data.journalType,
      totalDebit,
      totalCredit,
      currency: data.currency || 'INR',
      sourceReferenceType: data.sourceReferenceType || null,
      sourceReferenceId: data.sourceReferenceId || null,
      idempotencyKey: data.idempotencyKey || null,
      reversalOfJournalId: data.reversalOfJournalId || null,
      reversalReason: data.reversalReason || null,
      description: data.description,
      postedBy: data.postedBy,
      postedByUsername: data.postedByUsername,
    });

    const insertLineSql = `
      INSERT INTO FINANCIAL_JOURNAL_LINES (
        LINE_ID,
        JOURNAL_ID,
        LINE_NUMBER,
        ACCOUNT_ID,
        DEBIT_AMOUNT,
        CREDIT_AMOUNT,
        DESCRIPTION,
        ENTITY_TYPE,
        ENTITY_ID,
        CREATED_AT
      ) VALUES (
        :lineId,
        :journalId,
        :lineNumber,
        :accountId,
        :debitAmount,
        :creditAmount,
        :description,
        :entityType,
        :entityId,
        SYSTIMESTAMP
      )
    `;

    let lineIndex = 1;
    const insertedLines: FinancialJournalLineRecord[] = [];

    for (const line of data.lines) {
      const lineId = crypto.randomUUID();
      await conn.execute(insertLineSql, {
        lineId,
        journalId,
        lineNumber: lineIndex,
        accountId: line.accountId,
        debitAmount: line.debitAmount,
        creditAmount: line.creditAmount,
        description: line.description || data.description,
        entityType: line.entityType || null,
        entityId: line.entityId || null,
      });

      insertedLines.push({
        lineId,
        journalId,
        lineNumber: lineIndex,
        accountId: line.accountId,
        debitAmount: line.debitAmount,
        creditAmount: line.creditAmount,
        description: line.description || data.description,
        entityType: line.entityType,
        entityId: line.entityId,
        createdAt: new Date(),
      });

      lineIndex++;
    }

    return {
      journalId,
      journalNumber,
      postingDate: new Date(),
      journalType: data.journalType,
      status: 'POSTED',
      totalDebit,
      totalCredit,
      currency: data.currency || 'INR',
      sourceReferenceType: data.sourceReferenceType,
      sourceReferenceId: data.sourceReferenceId,
      idempotencyKey: data.idempotencyKey,
      reversalOfJournalId: data.reversalOfJournalId,
      reversalReason: data.reversalReason,
      description: data.description,
      postedBy: data.postedBy,
      postedByUsername: data.postedByUsername,
      createdAt: new Date(),
      lines: insertedLines,
    };
  }

  async getJournalById(journalId: string, conn?: oracledb.Connection): Promise<FinancialJournalRecord | null> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const journalSql = `
        SELECT JOURNAL_ID, JOURNAL_NUMBER, POSTING_DATE, JOURNAL_TYPE, STATUS,
               TOTAL_DEBIT, TOTAL_CREDIT, CURRENCY, SOURCE_REFERENCE_TYPE,
               SOURCE_REFERENCE_ID, IDEMPOTENCY_KEY, REVERSAL_OF_JOURNAL_ID,
               REVERSAL_REASON, DESCRIPTION, POSTED_BY, POSTED_BY_USERNAME, CREATED_AT
        FROM FINANCIAL_JOURNALS
        WHERE JOURNAL_ID = :journalId
      `;

      const result = await connection.execute<any>(
        journalSql,
        { journalId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const row = result.rows?.[0];
      if (!row) return null;

      const linesSql = `
        SELECT l.LINE_ID, l.JOURNAL_ID, l.LINE_NUMBER, l.ACCOUNT_ID,
               a.ACCOUNT_CODE, a.ACCOUNT_NAME,
               l.DEBIT_AMOUNT, l.CREDIT_AMOUNT, l.DESCRIPTION,
               l.ENTITY_TYPE, l.ENTITY_ID, l.CREATED_AT
        FROM FINANCIAL_JOURNAL_LINES l
        JOIN GL_ACCOUNTS a ON l.ACCOUNT_ID = a.ACCOUNT_ID
        WHERE l.JOURNAL_ID = :journalId
        ORDER BY l.LINE_NUMBER ASC
      `;

      const linesResult = await connection.execute<any>(
        linesSql,
        { journalId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const lines: FinancialJournalLineRecord[] = (linesResult.rows || []).map((lr: any) => ({
        lineId: lr.LINE_ID,
        journalId: lr.JOURNAL_ID,
        lineNumber: Number(lr.LINE_NUMBER),
        accountId: lr.ACCOUNT_ID,
        accountCode: lr.ACCOUNT_CODE,
        accountName: lr.ACCOUNT_NAME,
        debitAmount: Number(lr.DEBIT_AMOUNT || 0),
        creditAmount: Number(lr.CREDIT_AMOUNT || 0),
        description: lr.DESCRIPTION || undefined,
        entityType: lr.ENTITY_TYPE || undefined,
        entityId: lr.ENTITY_ID || undefined,
        createdAt: new Date(lr.CREATED_AT),
      }));

      return {
        journalId: row.JOURNAL_ID,
        journalNumber: row.JOURNAL_NUMBER,
        postingDate: new Date(row.POSTING_DATE),
        journalType: row.JOURNAL_TYPE,
        status: row.STATUS,
        totalDebit: Number(row.TOTAL_DEBIT || 0),
        totalCredit: Number(row.TOTAL_CREDIT || 0),
        currency: row.CURRENCY,
        sourceReferenceType: row.SOURCE_REFERENCE_TYPE || undefined,
        sourceReferenceId: row.SOURCE_REFERENCE_ID || undefined,
        idempotencyKey: row.IDEMPOTENCY_KEY || undefined,
        reversalOfJournalId: row.REVERSAL_OF_JOURNAL_ID || undefined,
        reversalReason: row.REVERSAL_REASON || undefined,
        description: row.DESCRIPTION,
        postedBy: row.POSTED_BY,
        postedByUsername: row.POSTED_BY_USERNAME,
        createdAt: new Date(row.CREATED_AT),
        lines,
      };
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async listJournals(options: {
    journalType?: JournalType;
    status?: JournalStatus;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: FinancialJournalRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = [];

      if (options.journalType) {
        binds.journalType = options.journalType;
        whereClauses.push('JOURNAL_TYPE = :journalType');
      }

      if (options.status) {
        binds.status = options.status;
        whereClauses.push('STATUS = :status');
      }

      if (options.search && options.search.trim()) {
        binds.search = `%${options.search.trim().toLowerCase()}%`;
        whereClauses.push(
          '(LOWER(JOURNAL_NUMBER) LIKE :search OR LOWER(DESCRIPTION) LIKE :search OR LOWER(SOURCE_REFERENCE_ID) LIKE :search)'
        );
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const countSql = `SELECT COUNT(*) AS CNT FROM FINANCIAL_JOURNALS ${whereSql}`;
      const countRes = await conn.execute<any>(countSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const total = Number(countRes.rows?.[0]?.CNT || 0);

      const page = Math.max(1, options.page || 1);
      const limit = Math.min(100, Math.max(1, options.limit || 20));
      const offset = (page - 1) * limit;

      binds.offset = offset;
      binds.limit = limit;

      const sql = `
        SELECT JOURNAL_ID, JOURNAL_NUMBER, POSTING_DATE, JOURNAL_TYPE, STATUS,
               TOTAL_DEBIT, TOTAL_CREDIT, CURRENCY, SOURCE_REFERENCE_TYPE,
               SOURCE_REFERENCE_ID, IDEMPOTENCY_KEY, REVERSAL_OF_JOURNAL_ID,
               REVERSAL_REASON, DESCRIPTION, POSTED_BY, POSTED_BY_USERNAME, CREATED_AT
        FROM FINANCIAL_JOURNALS
        ${whereSql}
        ORDER BY POSTING_DATE DESC, CREATED_AT DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const result = await conn.execute<any>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const items: FinancialJournalRecord[] = (result.rows || []).map((row: any) => ({
        journalId: row.JOURNAL_ID,
        journalNumber: row.JOURNAL_NUMBER,
        postingDate: new Date(row.POSTING_DATE),
        journalType: row.JOURNAL_TYPE,
        status: row.STATUS,
        totalDebit: Number(row.TOTAL_DEBIT || 0),
        totalCredit: Number(row.TOTAL_CREDIT || 0),
        currency: row.CURRENCY,
        sourceReferenceType: row.SOURCE_REFERENCE_TYPE || undefined,
        sourceReferenceId: row.SOURCE_REFERENCE_ID || undefined,
        idempotencyKey: row.IDEMPOTENCY_KEY || undefined,
        reversalOfJournalId: row.REVERSAL_OF_JOURNAL_ID || undefined,
        reversalReason: row.REVERSAL_REASON || undefined,
        description: row.DESCRIPTION,
        postedBy: row.POSTED_BY,
        postedByUsername: row.POSTED_BY_USERNAME,
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

  /**
   * Reverse an existing posted journal by creating a balanced inverse compensating journal.
   * Inverts debits into credits and credits into debits.
   */
  async reverseJournal(
    originalJournalId: string,
    reason: string,
    actor: { userId: string; username: string },
    conn: oracledb.Connection
  ): Promise<FinancialJournalRecord> {
    const original = await this.getJournalById(originalJournalId, conn);
    if (!original) {
      throw new Error(`Original journal ${originalJournalId} not found.`);
    }

    if (original.status === 'REVERSED') {
      throw new Error(`Journal ${original.journalNumber} has already been reversed.`);
    }

    // Invert line items: debits become credits, credits become debits
    const invertedLines = (original.lines || []).map((line) => ({
      accountId: line.accountId,
      debitAmount: line.creditAmount, // Inverted
      creditAmount: line.debitAmount, // Inverted
      description: `Reversal of line ${line.lineNumber}: ${line.description || original.description}`,
      entityType: line.entityType,
      entityId: line.entityId,
    }));

    const reversalJournal = await this.postJournal(
      {
        journalType: 'REVERSAL',
        currency: original.currency,
        sourceReferenceType: 'FINANCIAL_JOURNAL',
        sourceReferenceId: original.journalNumber,
        idempotencyKey: `REV-${original.journalId}`,
        reversalOfJournalId: original.journalId,
        reversalReason: reason,
        description: `Compensating Reversal of ${original.journalNumber}: ${reason}`,
        postedBy: actor.userId,
        postedByUsername: actor.username,
        lines: invertedLines,
      },
      conn
    );

    // Mark original as REVERSED
    await conn.execute(
      `UPDATE FINANCIAL_JOURNALS
       SET STATUS = 'REVERSED',
           REVERSAL_REASON = :reason
       WHERE JOURNAL_ID = :journalId`,
      {
        reason,
        journalId: original.journalId,
      }
    );

    return reversalJournal;
  }
}

export const financialJournalRepository = new FinancialJournalRepository();
