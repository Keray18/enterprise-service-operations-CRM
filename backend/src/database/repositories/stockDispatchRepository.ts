import crypto from 'crypto';
import oracledb from 'oracledb';
import { DispatchDocumentType, DispatchItemRecord, DispatchStatus, StockDispatchRecord } from '../../types/inventory.js';
import { getOracleConnection } from '../oraclePool.js';

export class StockDispatchRepository {
  async createDispatch(
    input: {
      dispatchNumber: string;
      documentType: DispatchDocumentType;
      fromLocationId: string;
      toLocationId: string;
      requestId?: string;
      courierName: string;
      docketNumber: string;
      dispatchedBy: string;
      totalQuantity: number;
      subtotalAmount: number;
      cgstAmount: number;
      sgstAmount: number;
      igstAmount: number;
      totalAmount: number;
      remarks?: string;
      items: Array<{
        partId: string;
        quantity: number;
        unitPrice: number;
        cgstRate: number;
        sgstRate: number;
        igstRate: number;
        cgstAmount: number;
        sgstAmount: number;
        igstAmount: number;
        totalAmount: number;
      }>;
    },
    conn: oracledb.Connection
  ): Promise<string> {
    const dispatchId = crypto.randomUUID();

    const dispatchSql = `
      INSERT INTO STOCK_DISPATCHES (
        DISPATCH_ID,
        DISPATCH_NUMBER,
        DOCUMENT_TYPE,
        FROM_LOCATION_ID,
        TO_LOCATION_ID,
        REQUEST_ID,
        COURIER_NAME,
        DOCKET_NUMBER,
        DISPATCH_DATE,
        DISPATCHED_BY,
        TOTAL_QUANTITY,
        SUBTOTAL_AMOUNT,
        CGST_AMOUNT,
        SGST_AMOUNT,
        IGST_AMOUNT,
        TOTAL_AMOUNT,
        STATUS,
        REMARKS,
        CREATED_AT
      ) VALUES (
        :dispatchId,
        :dispatchNumber,
        :documentType,
        :fromLocationId,
        :toLocationId,
        :requestId,
        :courierName,
        :docketNumber,
        SYSTIMESTAMP,
        :dispatchedBy,
        :totalQuantity,
        :subtotalAmount,
        :cgstAmount,
        :sgstAmount,
        :igstAmount,
        :totalAmount,
        'IN_TRANSIT',
        :remarks,
        SYSTIMESTAMP
      )
    `;

    await conn.execute(dispatchSql, {
      dispatchId,
      dispatchNumber: input.dispatchNumber,
      documentType: input.documentType,
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      requestId: input.requestId || null,
      courierName: input.courierName,
      docketNumber: input.docketNumber,
      dispatchedBy: input.dispatchedBy,
      totalQuantity: input.totalQuantity,
      subtotalAmount: input.subtotalAmount,
      cgstAmount: input.cgstAmount,
      sgstAmount: input.sgstAmount,
      igstAmount: input.igstAmount,
      totalAmount: input.totalAmount,
      remarks: input.remarks || null,
    });

    const itemSql = `
      INSERT INTO DISPATCH_ITEMS (
        DISPATCH_ITEM_ID,
        DISPATCH_ID,
        PART_ID,
        QUANTITY,
        UNIT_PRICE,
        CGST_RATE,
        SGST_RATE,
        IGST_RATE,
        CGST_AMOUNT,
        SGST_AMOUNT,
        IGST_AMOUNT,
        TOTAL_AMOUNT
      ) VALUES (
        :dispatchItemId,
        :dispatchId,
        :partId,
        :quantity,
        :unitPrice,
        :cgstRate,
        :sgstRate,
        :igstRate,
        :cgstAmount,
        :sgstAmount,
        :igstAmount,
        :totalAmount
      )
    `;

    for (const item of input.items) {
      const dispatchItemId = crypto.randomUUID();
      await conn.execute(itemSql, {
        dispatchItemId,
        dispatchId,
        partId: item.partId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        cgstRate: item.cgstRate,
        sgstRate: item.sgstRate,
        igstRate: item.igstRate,
        cgstAmount: item.cgstAmount,
        sgstAmount: item.sgstAmount,
        igstAmount: item.igstAmount,
        totalAmount: item.totalAmount,
      });
    }

    return dispatchId;
  }

  async acknowledgeDispatch(
    dispatchId: string,
    acknowledgedBy: string,
    conn: oracledb.Connection
  ): Promise<boolean> {
    const sql = `
      UPDATE STOCK_DISPATCHES
      SET STATUS = 'ACKNOWLEDGED', ACKNOWLEDGED_BY = :acknowledgedBy, ACKNOWLEDGED_AT = SYSTIMESTAMP
      WHERE DISPATCH_ID = :dispatchId AND STATUS = 'IN_TRANSIT'
    `;
    const result = await conn.execute(sql, { dispatchId, acknowledgedBy });
    return (result.rowsAffected || 0) > 0;
  }

  async listDispatches(options: {
    fromLocationId?: string;
    toLocationId?: string;
    requestId?: string;
    status?: DispatchStatus;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: StockDispatchRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = ['1=1'];

      if (options.fromLocationId) {
        binds.fromLocationId = options.fromLocationId;
        whereClauses.push('d.FROM_LOCATION_ID = :fromLocationId');
      }

      if (options.toLocationId) {
        binds.toLocationId = options.toLocationId;
        whereClauses.push('d.TO_LOCATION_ID = :toLocationId');
      }

      if (options.requestId) {
        binds.requestId = options.requestId;
        whereClauses.push('d.REQUEST_ID = :requestId');
      }

      if (options.status) {
        binds.status = options.status;
        whereClauses.push('d.STATUS = :status');
      }

      if (options.search && options.search.trim()) {
        binds.search = `%${options.search.trim().toLowerCase()}%`;
        whereClauses.push('(LOWER(d.DISPATCH_NUMBER) LIKE :search OR LOWER(d.DOCKET_NUMBER) LIKE :search OR LOWER(d.COURIER_NAME) LIKE :search)');
      }

      const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

      const countSql = `
        SELECT COUNT(*) AS CNT
        FROM STOCK_DISPATCHES d
        ${whereSql}
      `;

      const countResult = await conn.execute<any>(countSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const total = Number(countResult.rows?.[0]?.CNT || 0);

      const page = Math.max(1, options.page || 1);
      const limit = Math.min(100, Math.max(1, options.limit || 20));
      const offset = (page - 1) * limit;

      binds.offset = offset;
      binds.limit = limit;

      const dataSql = `
        SELECT 
          d.DISPATCH_ID,
          d.DISPATCH_NUMBER,
          d.DOCUMENT_TYPE,
          d.FROM_LOCATION_ID,
          fl.LOCATION_NAME AS FROM_LOCATION_NAME,
          d.TO_LOCATION_ID,
          tl.LOCATION_NAME AS TO_LOCATION_NAME,
          d.REQUEST_ID,
          sr.JOB_NUMBER,
          d.COURIER_NAME,
          d.DOCKET_NUMBER,
          d.DISPATCH_DATE,
          d.DISPATCHED_BY,
          u.FULL_NAME AS DISPATCHED_BY_NAME,
          d.TOTAL_QUANTITY,
          d.SUBTOTAL_AMOUNT,
          d.CGST_AMOUNT,
          d.SGST_AMOUNT,
          d.IGST_AMOUNT,
          d.TOTAL_AMOUNT,
          d.STATUS,
          d.ACKNOWLEDGED_BY,
          au.FULL_NAME AS ACKNOWLEDGED_BY_NAME,
          d.ACKNOWLEDGED_AT,
          d.REMARKS,
          d.CREATED_AT
        FROM STOCK_DISPATCHES d
        JOIN LOCATIONS fl ON d.FROM_LOCATION_ID = fl.LOCATION_ID
        JOIN LOCATIONS tl ON d.TO_LOCATION_ID = tl.LOCATION_ID
        LEFT JOIN SERVICE_REQUESTS sr ON d.REQUEST_ID = sr.REQUEST_ID
        JOIN APP_USERS u ON d.DISPATCHED_BY = u.USER_ID
        LEFT JOIN APP_USERS au ON d.ACKNOWLEDGED_BY = au.USER_ID
        ${whereSql}
        ORDER BY d.CREATED_AT DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const dataResult = await conn.execute<any>(dataSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const items: StockDispatchRecord[] = (dataResult.rows || []).map((row) => ({
        dispatchId: row.DISPATCH_ID,
        dispatchNumber: row.DISPATCH_NUMBER,
        documentType: row.DOCUMENT_TYPE as DispatchDocumentType,
        fromLocationId: row.FROM_LOCATION_ID,
        fromLocationName: row.FROM_LOCATION_NAME,
        toLocationId: row.TO_LOCATION_ID,
        toLocationName: row.TO_LOCATION_NAME,
        requestId: row.REQUEST_ID || undefined,
        jobNumber: row.JOB_NUMBER || undefined,
        courierName: row.COURIER_NAME,
        docketNumber: row.DOCKET_NUMBER,
        dispatchDate: new Date(row.DISPATCH_DATE),
        dispatchedBy: row.DISPATCHED_BY,
        dispatchedByName: row.DISPATCHED_BY_NAME,
        totalQuantity: Number(row.TOTAL_QUANTITY),
        subtotalAmount: Number(row.SUBTOTAL_AMOUNT),
        cgstAmount: Number(row.CGST_AMOUNT),
        sgstAmount: Number(row.SGST_AMOUNT),
        igstAmount: Number(row.IGST_AMOUNT),
        totalAmount: Number(row.TOTAL_AMOUNT),
        status: row.STATUS as DispatchStatus,
        acknowledgedBy: row.ACKNOWLEDGED_BY || undefined,
        acknowledgedByName: row.ACKNOWLEDGED_BY_NAME || undefined,
        acknowledgedAt: row.ACKNOWLEDGED_AT ? new Date(row.ACKNOWLEDGED_AT) : undefined,
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

  async getDispatchById(dispatchId: string): Promise<StockDispatchRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT 
          d.DISPATCH_ID,
          d.DISPATCH_NUMBER,
          d.DOCUMENT_TYPE,
          d.FROM_LOCATION_ID,
          fl.LOCATION_NAME AS FROM_LOCATION_NAME,
          d.TO_LOCATION_ID,
          tl.LOCATION_NAME AS TO_LOCATION_NAME,
          d.REQUEST_ID,
          sr.JOB_NUMBER,
          d.COURIER_NAME,
          d.DOCKET_NUMBER,
          d.DISPATCH_DATE,
          d.DISPATCHED_BY,
          u.FULL_NAME AS DISPATCHED_BY_NAME,
          d.TOTAL_QUANTITY,
          d.SUBTOTAL_AMOUNT,
          d.CGST_AMOUNT,
          d.SGST_AMOUNT,
          d.IGST_AMOUNT,
          d.TOTAL_AMOUNT,
          d.STATUS,
          d.ACKNOWLEDGED_BY,
          au.FULL_NAME AS ACKNOWLEDGED_BY_NAME,
          d.ACKNOWLEDGED_AT,
          d.REMARKS,
          d.CREATED_AT
        FROM STOCK_DISPATCHES d
        JOIN LOCATIONS fl ON d.FROM_LOCATION_ID = fl.LOCATION_ID
        JOIN LOCATIONS tl ON d.TO_LOCATION_ID = tl.LOCATION_ID
        LEFT JOIN SERVICE_REQUESTS sr ON d.REQUEST_ID = sr.REQUEST_ID
        JOIN APP_USERS u ON d.DISPATCHED_BY = u.USER_ID
        LEFT JOIN APP_USERS au ON d.ACKNOWLEDGED_BY = au.USER_ID
        WHERE d.DISPATCH_ID = :dispatchId
      `;

      const result = await conn.execute<any>(sql, { dispatchId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const row = result.rows?.[0];
      if (!row) return null;

      const itemsSql = `
        SELECT 
          di.DISPATCH_ITEM_ID,
          di.DISPATCH_ID,
          di.PART_ID,
          p.PART_CODE,
          p.PART_NAME,
          hsn.HSN_CODE,
          di.QUANTITY,
          di.UNIT_PRICE,
          di.CGST_RATE,
          di.SGST_RATE,
          di.IGST_RATE,
          di.CGST_AMOUNT,
          di.SGST_AMOUNT,
          di.IGST_AMOUNT,
          di.TOTAL_AMOUNT
        FROM DISPATCH_ITEMS di
        JOIN PART_CODES p ON di.PART_ID = p.PART_ID
        LEFT JOIN HSN_TAX_MASTERS hsn ON p.HSN_ID = hsn.HSN_ID
        WHERE di.DISPATCH_ID = :dispatchId
      `;

      const itemsResult = await conn.execute<any>(itemsSql, { dispatchId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const items: DispatchItemRecord[] = (itemsResult.rows || []).map((i) => ({
        dispatchItemId: i.DISPATCH_ITEM_ID,
        dispatchId: i.DISPATCH_ID,
        partId: i.PART_ID,
        partCode: i.PART_CODE,
        partName: i.PART_NAME,
        hsnCode: i.HSN_CODE || undefined,
        quantity: Number(i.QUANTITY),
        unitPrice: Number(i.UNIT_PRICE),
        cgstRate: Number(i.CGST_RATE),
        sgstRate: Number(i.SGST_RATE),
        igstRate: Number(i.IGST_RATE),
        cgstAmount: Number(i.CGST_AMOUNT),
        sgstAmount: Number(i.SGST_AMOUNT),
        igstAmount: Number(i.IGST_AMOUNT),
        totalAmount: Number(i.TOTAL_AMOUNT),
      }));

      return {
        dispatchId: row.DISPATCH_ID,
        dispatchNumber: row.DISPATCH_NUMBER,
        documentType: row.DOCUMENT_TYPE as DispatchDocumentType,
        fromLocationId: row.FROM_LOCATION_ID,
        fromLocationName: row.FROM_LOCATION_NAME,
        toLocationId: row.TO_LOCATION_ID,
        toLocationName: row.TO_LOCATION_NAME,
        requestId: row.REQUEST_ID || undefined,
        jobNumber: row.JOB_NUMBER || undefined,
        courierName: row.COURIER_NAME,
        docketNumber: row.DOCKET_NUMBER,
        dispatchDate: new Date(row.DISPATCH_DATE),
        dispatchedBy: row.DISPATCHED_BY,
        dispatchedByName: row.DISPATCHED_BY_NAME,
        totalQuantity: Number(row.TOTAL_QUANTITY),
        subtotalAmount: Number(row.SUBTOTAL_AMOUNT),
        cgstAmount: Number(row.CGST_AMOUNT),
        sgstAmount: Number(row.SGST_AMOUNT),
        igstAmount: Number(row.IGST_AMOUNT),
        totalAmount: Number(row.TOTAL_AMOUNT),
        status: row.STATUS as DispatchStatus,
        acknowledgedBy: row.ACKNOWLEDGED_BY || undefined,
        acknowledgedByName: row.ACKNOWLEDGED_BY_NAME || undefined,
        acknowledgedAt: row.ACKNOWLEDGED_AT ? new Date(row.ACKNOWLEDGED_AT) : undefined,
        remarks: row.REMARKS || undefined,
        createdAt: new Date(row.CREATED_AT),
        items,
      };
    } finally {
      await conn.close();
    }
  }
}

export const stockDispatchRepository = new StockDispatchRepository();
