import crypto from 'crypto';
import oracledb from 'oracledb';
import { GoodsReceiptItemRecord, GoodsReceiptRecord } from '../../types/inventory.js';
import { getOracleConnection } from '../oraclePool.js';

export class GoodsReceiptRepository {
  async createGrn(
    input: {
      grnNumber: string;
      receivingLocationId: string;
      supplierName: string;
      supplierInvoiceNo: string;
      supplierInvoiceDate: string;
      poNumber?: string;
      gateEntryNo?: string;
      vehicleNo?: string;
      receivedBy: string;
      totalItems: number;
      totalQuantity: number;
      remarks?: string;
      items: Array<{
        partId: string;
        receivedQty: number;
        acceptedQty: number;
        rejectedQty: number;
        unitPrice: number;
        remarks?: string;
      }>;
    },
    conn: oracledb.Connection
  ): Promise<string> {
    const grnId = crypto.randomUUID();

    const grnSql = `
      INSERT INTO GOODS_RECEIPTS (
        GRN_ID,
        GRN_NUMBER,
        RECEIVING_LOCATION_ID,
        SUPPLIER_NAME,
        SUPPLIER_INVOICE_NO,
        SUPPLIER_INVOICE_DATE,
        PO_NUMBER,
        GATE_ENTRY_NO,
        VEHICLE_NO,
        RECEIVED_BY,
        TOTAL_ITEMS,
        TOTAL_QUANTITY,
        STATUS,
        REMARKS,
        CREATED_AT
      ) VALUES (
        :grnId,
        :grnNumber,
        :receivingLocationId,
        :supplierName,
        :supplierInvoiceNo,
        TO_DATE(:supplierInvoiceDate, 'YYYY-MM-DD'),
        :poNumber,
        :gateEntryNo,
        :vehicleNo,
        :receivedBy,
        :totalItems,
        :totalQuantity,
        'RECEIVED',
        :remarks,
        SYSTIMESTAMP
      )
    `;

    await conn.execute(grnSql, {
      grnId,
      grnNumber: input.grnNumber,
      receivingLocationId: input.receivingLocationId,
      supplierName: input.supplierName,
      supplierInvoiceNo: input.supplierInvoiceNo,
      supplierInvoiceDate: input.supplierInvoiceDate,
      poNumber: input.poNumber || null,
      gateEntryNo: input.gateEntryNo || null,
      vehicleNo: input.vehicleNo || null,
      receivedBy: input.receivedBy,
      totalItems: input.totalItems,
      totalQuantity: input.totalQuantity,
      remarks: input.remarks || null,
    });

    const itemSql = `
      INSERT INTO GOODS_RECEIPT_ITEMS (
        GRN_ITEM_ID,
        GRN_ID,
        PART_ID,
        RECEIVED_QTY,
        ACCEPTED_QTY,
        REJECTED_QTY,
        UNIT_PRICE,
        REMARKS
      ) VALUES (
        :grnItemId,
        :grnId,
        :partId,
        :receivedQty,
        :acceptedQty,
        :rejectedQty,
        :unitPrice,
        :remarks
      )
    `;

    for (const item of input.items) {
      const grnItemId = crypto.randomUUID();
      await conn.execute(itemSql, {
        grnItemId,
        grnId,
        partId: item.partId,
        receivedQty: item.receivedQty,
        acceptedQty: item.acceptedQty,
        rejectedQty: item.rejectedQty,
        unitPrice: item.unitPrice,
        remarks: item.remarks || null,
      });
    }

    return grnId;
  }

  async listGrns(options: {
    receivingLocationId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: GoodsReceiptRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = ['1=1'];

      if (options.receivingLocationId) {
        binds.receivingLocationId = options.receivingLocationId;
        whereClauses.push('g.RECEIVING_LOCATION_ID = :receivingLocationId');
      }

      if (options.search && options.search.trim()) {
        binds.search = `%${options.search.trim().toLowerCase()}%`;
        whereClauses.push('(LOWER(g.GRN_NUMBER) LIKE :search OR LOWER(g.SUPPLIER_NAME) LIKE :search OR LOWER(g.SUPPLIER_INVOICE_NO) LIKE :search)');
      }

      const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

      const countSql = `
        SELECT COUNT(*) AS CNT
        FROM GOODS_RECEIPTS g
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
          g.GRN_ID,
          g.GRN_NUMBER,
          g.RECEIVING_LOCATION_ID,
          l.LOCATION_NAME AS RECEIVING_LOCATION_NAME,
          g.SUPPLIER_NAME,
          g.SUPPLIER_INVOICE_NO,
          TO_CHAR(g.SUPPLIER_INVOICE_DATE, 'YYYY-MM-DD') AS SUPPLIER_INVOICE_DATE,
          g.PO_NUMBER,
          g.GATE_ENTRY_NO,
          g.VEHICLE_NO,
          g.RECEIVED_BY,
          u.FULL_NAME AS RECEIVED_BY_NAME,
          g.TOTAL_ITEMS,
          g.TOTAL_QUANTITY,
          g.STATUS,
          g.REMARKS,
          g.CREATED_AT
        FROM GOODS_RECEIPTS g
        JOIN LOCATIONS l ON g.RECEIVING_LOCATION_ID = l.LOCATION_ID
        JOIN APP_USERS u ON g.RECEIVED_BY = u.USER_ID
        ${whereSql}
        ORDER BY g.CREATED_AT DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const dataResult = await conn.execute<any>(dataSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const items: GoodsReceiptRecord[] = (dataResult.rows || []).map((row) => ({
        grnId: row.GRN_ID,
        grnNumber: row.GRN_NUMBER,
        receivingLocationId: row.RECEIVING_LOCATION_ID,
        receivingLocationName: row.RECEIVING_LOCATION_NAME,
        supplierName: row.SUPPLIER_NAME,
        supplierInvoiceNo: row.SUPPLIER_INVOICE_NO,
        supplierInvoiceDate: row.SUPPLIER_INVOICE_DATE,
        poNumber: row.PO_NUMBER || undefined,
        gateEntryNo: row.GATE_ENTRY_NO || undefined,
        vehicleNo: row.VEHICLE_NO || undefined,
        receivedBy: row.RECEIVED_BY,
        receivedByName: row.RECEIVED_BY_NAME,
        totalItems: Number(row.TOTAL_ITEMS),
        totalQuantity: Number(row.TOTAL_QUANTITY),
        status: row.STATUS,
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

  async getGrnById(grnId: string): Promise<GoodsReceiptRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT 
          g.GRN_ID,
          g.GRN_NUMBER,
          g.RECEIVING_LOCATION_ID,
          l.LOCATION_NAME AS RECEIVING_LOCATION_NAME,
          g.SUPPLIER_NAME,
          g.SUPPLIER_INVOICE_NO,
          TO_CHAR(g.SUPPLIER_INVOICE_DATE, 'YYYY-MM-DD') AS SUPPLIER_INVOICE_DATE,
          g.PO_NUMBER,
          g.GATE_ENTRY_NO,
          g.VEHICLE_NO,
          g.RECEIVED_BY,
          u.FULL_NAME AS RECEIVED_BY_NAME,
          g.TOTAL_ITEMS,
          g.TOTAL_QUANTITY,
          g.STATUS,
          g.REMARKS,
          g.CREATED_AT
        FROM GOODS_RECEIPTS g
        JOIN LOCATIONS l ON g.RECEIVING_LOCATION_ID = l.LOCATION_ID
        JOIN APP_USERS u ON g.RECEIVED_BY = u.USER_ID
        WHERE g.GRN_ID = :grnId
      `;

      const result = await conn.execute<any>(sql, { grnId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const row = result.rows?.[0];
      if (!row) return null;

      const itemsSql = `
        SELECT 
          gi.GRN_ITEM_ID,
          gi.GRN_ID,
          gi.PART_ID,
          p.PART_CODE,
          p.PART_NAME,
          gi.RECEIVED_QTY,
          gi.ACCEPTED_QTY,
          gi.REJECTED_QTY,
          gi.UNIT_PRICE,
          gi.REMARKS
        FROM GOODS_RECEIPT_ITEMS gi
        JOIN PART_CODES p ON gi.PART_ID = p.PART_ID
        WHERE gi.GRN_ID = :grnId
      `;

      const itemsResult = await conn.execute<any>(itemsSql, { grnId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const items: GoodsReceiptItemRecord[] = (itemsResult.rows || []).map((i) => ({
        grnItemId: i.GRN_ITEM_ID,
        grnId: i.GRN_ID,
        partId: i.PART_ID,
        partCode: i.PART_CODE,
        partName: i.PART_NAME,
        receivedQty: Number(i.RECEIVED_QTY),
        acceptedQty: Number(i.ACCEPTED_QTY),
        rejectedQty: Number(i.REJECTED_QTY),
        unitPrice: Number(i.UNIT_PRICE),
        remarks: i.REMARKS || undefined,
      }));

      return {
        grnId: row.GRN_ID,
        grnNumber: row.GRN_NUMBER,
        receivingLocationId: row.RECEIVING_LOCATION_ID,
        receivingLocationName: row.RECEIVING_LOCATION_NAME,
        supplierName: row.SUPPLIER_NAME,
        supplierInvoiceNo: row.SUPPLIER_INVOICE_NO,
        supplierInvoiceDate: row.SUPPLIER_INVOICE_DATE,
        poNumber: row.PO_NUMBER || undefined,
        gateEntryNo: row.GATE_ENTRY_NO || undefined,
        vehicleNo: row.VEHICLE_NO || undefined,
        receivedBy: row.RECEIVED_BY,
        receivedByName: row.RECEIVED_BY_NAME,
        totalItems: Number(row.TOTAL_ITEMS),
        totalQuantity: Number(row.TOTAL_QUANTITY),
        status: row.STATUS,
        remarks: row.REMARKS || undefined,
        createdAt: new Date(row.CREATED_AT),
        items,
      };
    } finally {
      await conn.close();
    }
  }
}

export const goodsReceiptRepository = new GoodsReceiptRepository();
