import crypto from 'crypto';
import oracledb from 'oracledb';
import { ReturnDisposition, ReturnItemRecord, StockReturnRecord, StockReturnStatus } from '../../types/inventory.js';
import { getOracleConnection } from '../oraclePool.js';

export class StockReturnRepository {
  async createReturn(
    input: {
      returnNumber: string;
      fromLocationId: string;
      toLocationId: string;
      requestId?: string;
      receivedBy: string;
      items: Array<{
        partId: string;
        quantity: number;
        defectiveSerialNo?: string;
        defectReason?: string;
      }>;
    },
    conn: oracledb.Connection
  ): Promise<string> {
    const returnId = crypto.randomUUID();

    const returnSql = `
      INSERT INTO STOCK_RETURNS (
        RETURN_ID,
        RETURN_NUMBER,
        FROM_LOCATION_ID,
        TO_LOCATION_ID,
        REQUEST_ID,
        STATUS,
        RECEIVED_BY,
        RECEIVED_AT,
        CREATED_AT
      ) VALUES (
        :returnId,
        :returnNumber,
        :fromLocationId,
        :toLocationId,
        :requestId,
        'IN_QUARANTINE',
        :receivedBy,
        SYSTIMESTAMP,
        SYSTIMESTAMP
      )
    `;

    await conn.execute(returnSql, {
      returnId,
      returnNumber: input.returnNumber,
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      requestId: input.requestId || null,
      receivedBy: input.receivedBy,
    });

    const itemSql = `
      INSERT INTO RETURN_ITEMS (
        RETURN_ITEM_ID,
        RETURN_ID,
        PART_ID,
        QUANTITY,
        DEFECTIVE_SERIAL_NO,
        DEFECT_REASON
      ) VALUES (
        :returnItemId,
        :returnId,
        :partId,
        :quantity,
        :defectiveSerialNo,
        :defectReason
      )
    `;

    for (const item of input.items) {
      const returnItemId = crypto.randomUUID();
      await conn.execute(itemSql, {
        returnItemId,
        returnId,
        partId: item.partId,
        quantity: item.quantity,
        defectiveSerialNo: item.defectiveSerialNo || null,
        defectReason: item.defectReason || null,
      });
    }

    return returnId;
  }

  async updateDisposition(
    input: {
      returnId: string;
      disposition: ReturnDisposition;
      remarks: string;
      inspectedBy: string;
    },
    conn: oracledb.Connection
  ): Promise<boolean> {
    let targetStatus: StockReturnStatus;
    if (input.disposition === 'SCRAP') {
      targetStatus = 'DISPOSED_SCRAP';
    } else if (input.disposition === 'RESTOCK') {
      targetStatus = 'RESTOCKED';
    } else {
      targetStatus = 'INSPECTED';
    }

    const sql = `
      UPDATE STOCK_RETURNS
      SET 
        STATUS = :targetStatus,
        DISPOSITION = :disposition,
        DISPOSITION_REMARKS = :remarks,
        INSPECTED_BY = :inspectedBy,
        INSPECTED_AT = SYSTIMESTAMP
      WHERE RETURN_ID = :returnId AND STATUS = 'IN_QUARANTINE'
    `;

    const result = await conn.execute(sql, {
      targetStatus,
      disposition: input.disposition,
      remarks: input.remarks,
      inspectedBy: input.inspectedBy,
      returnId: input.returnId,
    });

    return (result.rowsAffected || 0) > 0;
  }

  async listReturns(options: {
    locationId?: string;
    status?: StockReturnStatus;
    page?: number;
    limit?: number;
  }): Promise<{ items: StockReturnRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = ['1=1'];

      if (options.locationId) {
        binds.locationId = options.locationId;
        whereClauses.push('(r.TO_LOCATION_ID = :locationId OR r.FROM_LOCATION_ID = :locationId)');
      }

      if (options.status) {
        binds.status = options.status;
        whereClauses.push('r.STATUS = :status');
      }

      const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

      const countSql = `
        SELECT COUNT(*) AS CNT
        FROM STOCK_RETURNS r
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
          r.RETURN_ID,
          r.RETURN_NUMBER,
          r.FROM_LOCATION_ID,
          fl.LOCATION_NAME AS FROM_LOCATION_NAME,
          r.TO_LOCATION_ID,
          tl.LOCATION_NAME AS TO_LOCATION_NAME,
          r.REQUEST_ID,
          sr.JOB_NUMBER,
          r.STATUS,
          r.RECEIVED_BY,
          u.FULL_NAME AS RECEIVED_BY_NAME,
          r.RECEIVED_AT,
          r.INSPECTED_BY,
          iu.FULL_NAME AS INSPECTED_BY_NAME,
          r.INSPECTED_AT,
          r.DISPOSITION,
          r.DISPOSITION_REMARKS,
          r.CREATED_AT
        FROM STOCK_RETURNS r
        JOIN LOCATIONS fl ON r.FROM_LOCATION_ID = fl.LOCATION_ID
        JOIN LOCATIONS tl ON r.TO_LOCATION_ID = tl.LOCATION_ID
        LEFT JOIN SERVICE_REQUESTS sr ON r.REQUEST_ID = sr.REQUEST_ID
        JOIN APP_USERS u ON r.RECEIVED_BY = u.USER_ID
        LEFT JOIN APP_USERS iu ON r.INSPECTED_BY = iu.USER_ID
        ${whereSql}
        ORDER BY r.CREATED_AT DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const dataResult = await conn.execute<any>(dataSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const items: StockReturnRecord[] = (dataResult.rows || []).map((row) => ({
        returnId: row.RETURN_ID,
        returnNumber: row.RETURN_NUMBER,
        fromLocationId: row.FROM_LOCATION_ID,
        fromLocationName: row.FROM_LOCATION_NAME,
        toLocationId: row.TO_LOCATION_ID,
        toLocationName: row.TO_LOCATION_NAME,
        requestId: row.REQUEST_ID || undefined,
        jobNumber: row.JOB_NUMBER || undefined,
        status: row.STATUS as StockReturnStatus,
        receivedBy: row.RECEIVED_BY,
        receivedByName: row.RECEIVED_BY_NAME,
        receivedAt: new Date(row.RECEIVED_AT),
        inspectedBy: row.INSPECTED_BY || undefined,
        inspectedByName: row.INSPECTED_BY_NAME || undefined,
        inspectedAt: row.INSPECTED_AT ? new Date(row.INSPECTED_AT) : undefined,
        disposition: row.DISPOSITION as ReturnDisposition || undefined,
        dispositionRemarks: row.DISPOSITION_REMARKS || undefined,
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

  async getReturnById(returnId: string): Promise<StockReturnRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT 
          r.RETURN_ID,
          r.RETURN_NUMBER,
          r.FROM_LOCATION_ID,
          fl.LOCATION_NAME AS FROM_LOCATION_NAME,
          r.TO_LOCATION_ID,
          tl.LOCATION_NAME AS TO_LOCATION_NAME,
          r.REQUEST_ID,
          sr.JOB_NUMBER,
          r.STATUS,
          r.RECEIVED_BY,
          u.FULL_NAME AS RECEIVED_BY_NAME,
          r.RECEIVED_AT,
          r.INSPECTED_BY,
          iu.FULL_NAME AS INSPECTED_BY_NAME,
          r.INSPECTED_AT,
          r.DISPOSITION,
          r.DISPOSITION_REMARKS,
          r.CREATED_AT
        FROM STOCK_RETURNS r
        JOIN LOCATIONS fl ON r.FROM_LOCATION_ID = fl.LOCATION_ID
        JOIN LOCATIONS tl ON r.TO_LOCATION_ID = tl.LOCATION_ID
        LEFT JOIN SERVICE_REQUESTS sr ON r.REQUEST_ID = sr.REQUEST_ID
        JOIN APP_USERS u ON r.RECEIVED_BY = u.USER_ID
        LEFT JOIN APP_USERS iu ON r.INSPECTED_BY = iu.USER_ID
        WHERE r.RETURN_ID = :returnId
      `;

      const result = await conn.execute<any>(sql, { returnId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const row = result.rows?.[0];
      if (!row) return null;

      const itemsSql = `
        SELECT 
          ri.RETURN_ITEM_ID,
          ri.RETURN_ID,
          ri.PART_ID,
          p.PART_CODE,
          p.PART_NAME,
          ri.QUANTITY,
          ri.DEFECTIVE_SERIAL_NO,
          ri.DEFECT_REASON
        FROM RETURN_ITEMS ri
        JOIN PART_CODES p ON ri.PART_ID = p.PART_ID
        WHERE ri.RETURN_ID = :returnId
      `;

      const itemsResult = await conn.execute<any>(itemsSql, { returnId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const items: ReturnItemRecord[] = (itemsResult.rows || []).map((i) => ({
        returnItemId: i.RETURN_ITEM_ID,
        returnId: i.RETURN_ID,
        partId: i.PART_ID,
        partCode: i.PART_CODE,
        partName: i.PART_NAME,
        quantity: Number(i.QUANTITY),
        defectiveSerialNo: i.DEFECTIVE_SERIAL_NO || undefined,
        defectReason: i.DEFECT_REASON || undefined,
      }));

      return {
        returnId: row.RETURN_ID,
        returnNumber: row.RETURN_NUMBER,
        fromLocationId: row.FROM_LOCATION_ID,
        fromLocationName: row.FROM_LOCATION_NAME,
        toLocationId: row.TO_LOCATION_ID,
        toLocationName: row.TO_LOCATION_NAME,
        requestId: row.REQUEST_ID || undefined,
        jobNumber: row.JOB_NUMBER || undefined,
        status: row.STATUS as StockReturnStatus,
        receivedBy: row.RECEIVED_BY,
        receivedByName: row.RECEIVED_BY_NAME,
        receivedAt: new Date(row.RECEIVED_AT),
        inspectedBy: row.INSPECTED_BY || undefined,
        inspectedByName: row.INSPECTED_BY_NAME || undefined,
        inspectedAt: row.INSPECTED_AT ? new Date(row.INSPECTED_AT) : undefined,
        disposition: row.DISPOSITION as ReturnDisposition || undefined,
        dispositionRemarks: row.DISPOSITION_REMARKS || undefined,
        createdAt: new Date(row.CREATED_AT),
        items,
      };
    } finally {
      await conn.close();
    }
  }
}

export const stockReturnRepository = new StockReturnRepository();
