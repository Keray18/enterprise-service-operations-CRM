import crypto from 'crypto';
import oracledb from 'oracledb';
import { PartEntryStatus, PartEntryType, ServiceRequestPartRecord } from '../../types/job360.js';
import { getOracleConnection } from '../oraclePool.js';

export class ServiceRequestPartsRepository {
  async listPartsByRequestId(
    requestId: string,
    conn?: oracledb.Connection
  ): Promise<ServiceRequestPartRecord[]> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const sql = `
        SELECT 
          srp.PART_ENTRY_ID,
          srp.REQUEST_ID,
          srp.PART_ID,
          srp.QUANTITY,
          srp.PART_CONSUMPTION_NO,
          srp.DEFECTIVE_SERIAL_NO,
          srp.NEW_PART_SERIAL_NO,
          srp.IS_CHARGEABLE_TO_CUSTOMER,
          srp.UNIT_PRICE,
          srp.TOTAL_PRICE,
          srp.ENTRY_TYPE,
          srp.STATUS,
          srp.PNA_INDENT_NO,
          srp.REMARKS,
          srp.CREATED_AT,
          srp.CREATED_BY,
          pc.PART_CODE,
          pc.PART_NAME,
          pc.PART_CATEGORY,
          hsn.HSN_CODE
        FROM SERVICE_REQUEST_PARTS srp
        JOIN PART_CODES pc ON srp.PART_ID = pc.PART_ID
        LEFT JOIN HSN_TAX_MASTERS hsn ON pc.HSN_ID = hsn.HSN_ID
        WHERE srp.REQUEST_ID = :requestId
        ORDER BY srp.CREATED_AT ASC
      `;

      const result = await connection.execute<any>(sql, { requestId }, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      return (result.rows || []).map((row) => ({
        partEntryId: row.PART_ENTRY_ID,
        requestId: row.REQUEST_ID,
        partId: row.PART_ID,
        partCode: row.PART_CODE,
        partName: row.PART_NAME,
        hsnCode: row.HSN_CODE || undefined,
        partCategory: row.PART_CATEGORY,
        quantity: Number(row.QUANTITY),
        partConsumptionNo: row.PART_CONSUMPTION_NO || undefined,
        defectiveSerialNo: row.DEFECTIVE_SERIAL_NO || undefined,
        newPartSerialNo: row.NEW_PART_SERIAL_NO || undefined,
        isChargeableToCustomer: row.IS_CHARGEABLE_TO_CUSTOMER,
        unitPrice: Number(row.UNIT_PRICE),
        totalPrice: Number(row.TOTAL_PRICE),
        entryType: row.ENTRY_TYPE as PartEntryType,
        status: row.STATUS as PartEntryStatus,
        pnaIndentNo: row.PNA_INDENT_NO || undefined,
        remarks: row.REMARKS || undefined,
        createdAt: new Date(row.CREATED_AT),
        createdBy: row.CREATED_BY,
      }));
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async addPart(
    input: {
      requestId: string;
      partId: string;
      quantity: number;
      partConsumptionNo?: string;
      defectiveSerialNo?: string;
      newPartSerialNo?: string;
      isChargeableToCustomer: 'Y' | 'N';
      unitPrice: number;
      totalPrice: number;
      entryType: PartEntryType;
      status?: PartEntryStatus;
      pnaIndentNo?: string;
      remarks?: string;
      actorUsername: string;
    },
    conn: oracledb.Connection
  ): Promise<string> {
    const partEntryId = crypto.randomUUID();
    const status = input.status || (input.entryType === 'USED' ? 'COMMITTED' : 'PENDING_FULFILLMENT');

    const sql = `
      INSERT INTO SERVICE_REQUEST_PARTS (
        PART_ENTRY_ID,
        REQUEST_ID,
        PART_ID,
        QUANTITY,
        PART_CONSUMPTION_NO,
        DEFECTIVE_SERIAL_NO,
        NEW_PART_SERIAL_NO,
        IS_CHARGEABLE_TO_CUSTOMER,
        UNIT_PRICE,
        TOTAL_PRICE,
        ENTRY_TYPE,
        STATUS,
        PNA_INDENT_NO,
        REMARKS,
        CREATED_AT,
        UPDATED_AT,
        CREATED_BY,
        UPDATED_BY
      ) VALUES (
        :partEntryId,
        :requestId,
        :partId,
        :quantity,
        :partConsumptionNo,
        :defectiveSerialNo,
        :newPartSerialNo,
        :isChargeable,
        :unitPrice,
        :totalPrice,
        :entryType,
        :status,
        :pnaIndentNo,
        :remarks,
        SYSTIMESTAMP,
        SYSTIMESTAMP,
        :actorUsername,
        :actorUsername
      )
    `;

    await conn.execute(sql, {
      partEntryId,
      requestId: input.requestId,
      partId: input.partId,
      quantity: input.quantity,
      partConsumptionNo: input.partConsumptionNo || null,
      defectiveSerialNo: input.defectiveSerialNo || null,
      newPartSerialNo: input.newPartSerialNo || null,
      isChargeable: input.isChargeableToCustomer,
      unitPrice: input.unitPrice,
      totalPrice: input.totalPrice,
      entryType: input.entryType,
      status,
      pnaIndentNo: input.pnaIndentNo || null,
      remarks: input.remarks || null,
      actorUsername: input.actorUsername,
    });

    return partEntryId;
  }

  async deletePart(
    partEntryId: string,
    requestId: string,
    conn: oracledb.Connection
  ): Promise<boolean> {
    const sql = `
      DELETE FROM SERVICE_REQUEST_PARTS
      WHERE PART_ENTRY_ID = :partEntryId AND REQUEST_ID = :requestId
    `;
    const result = await conn.execute(sql, { partEntryId, requestId });
    return (result.rowsAffected || 0) > 0;
  }

  async calculatePartsTotal(
    requestId: string,
    conn: oracledb.Connection
  ): Promise<{ partsTotalCharge: number; chargeableCount: number; usedCount: number }> {
    const sql = `
      SELECT 
        NVL(SUM(CASE WHEN IS_CHARGEABLE_TO_CUSTOMER = 'Y' THEN TOTAL_PRICE ELSE 0 END), 0) AS CHARGEABLE_TOTAL,
        COUNT(CASE WHEN IS_CHARGEABLE_TO_CUSTOMER = 'Y' THEN 1 END) AS CHARGEABLE_COUNT,
        COUNT(CASE WHEN ENTRY_TYPE = 'USED' THEN 1 END) AS USED_COUNT
      FROM SERVICE_REQUEST_PARTS
      WHERE REQUEST_ID = :requestId AND STATUS != 'CANCELLED'
    `;
    const result = await conn.execute<any>(sql, { requestId }, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });
    const row = result.rows?.[0];
    return {
      partsTotalCharge: Number(row?.CHARGEABLE_TOTAL || 0),
      chargeableCount: Number(row?.CHARGEABLE_COUNT || 0),
      usedCount: Number(row?.USED_COUNT || 0),
    };
  }
}

export const serviceRequestPartsRepository = new ServiceRequestPartsRepository();
