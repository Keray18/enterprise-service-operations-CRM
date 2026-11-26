import crypto from 'crypto';
import oracledb from 'oracledb';
import { PartCustodyHandoverRecord, CustodyStatus } from '../../types/custody.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToHandover(row: any): PartCustodyHandoverRecord {
  return {
    handoverId: row.HANDOVER_ID,
    replacementId: row.REPLACEMENT_ID,
    partId: row.PART_ID,
    partCode: row.PART_CODE || undefined,
    partName: row.PART_NAME || undefined,
    asfLocationId: row.ASF_LOCATION_ID,
    engineerId: row.ENGINEER_ID,
    engineerName: row.ENGINEER_NAME || undefined,
    handedOverBy: row.HANDED_OVER_BY,
    handedOverByName: row.HANDED_OVER_BY_NAME || undefined,
    handedOverAt: new Date(row.HANDED_OVER_AT),
    collectionAcknowledged: row.COLLECTION_ACKNOWLEDGED,
    collectedAt: row.COLLECTED_AT ? new Date(row.COLLECTED_AT) : undefined,
    status: row.STATUS as CustodyStatus,
    remarks: row.REMARKS || undefined,
    createdAt: new Date(row.CREATED_AT),
  };
}

const SELECT_HANDOVER_SQL = `
  SELECT 
    h.HANDOVER_ID,
    h.REPLACEMENT_ID,
    h.PART_ID,
    p.PART_CODE,
    p.PART_NAME,
    h.ASF_LOCATION_ID,
    h.ENGINEER_ID,
    u_eng.FULL_NAME AS ENGINEER_NAME,
    h.HANDED_OVER_BY,
    u_by.FULL_NAME AS HANDED_OVER_BY_NAME,
    h.HANDED_OVER_AT,
    h.COLLECTION_ACKNOWLEDGED,
    h.COLLECTED_AT,
    h.STATUS,
    h.REMARKS,
    h.CREATED_AT
  FROM PART_CUSTODY_HANDOVERS h
  LEFT JOIN PART_CODES p ON h.PART_ID = p.PART_ID
  LEFT JOIN APP_USERS u_eng ON h.ENGINEER_ID = u_eng.USER_ID
  LEFT JOIN APP_USERS u_by ON h.HANDED_OVER_BY = u_by.USER_ID
`;

export class CustodyRepository {
  async findById(handoverId: string, connection?: oracledb.Connection): Promise<PartCustodyHandoverRecord | null> {
    const conn = connection || (await getOracleConnection());
    try {
      const sql = `${SELECT_HANDOVER_SQL} WHERE h.HANDOVER_ID = :handoverId`;
      const result = await conn.execute<any>(sql, { handoverId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!result.rows || result.rows.length === 0) return null;
      return mapRowToHandover(result.rows[0]);
    } finally {
      if (!connection) await conn.close();
    }
  }

  async findByReplacementId(replacementId: string, connection?: oracledb.Connection): Promise<PartCustodyHandoverRecord[]> {
    const conn = connection || (await getOracleConnection());
    try {
      const sql = `${SELECT_HANDOVER_SQL} WHERE h.REPLACEMENT_ID = :replacementId ORDER BY h.CREATED_AT DESC`;
      const result = await conn.execute<any>(sql, { replacementId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return (result.rows || []).map(mapRowToHandover);
    } finally {
      if (!connection) await conn.close();
    }
  }

  async createHandover(
    data: {
      replacementId: string;
      partId: string;
      asfLocationId: string;
      engineerId: string;
      handedOverBy: string;
      remarks?: string;
    },
    conn: oracledb.Connection
  ): Promise<PartCustodyHandoverRecord> {
    const handoverId = crypto.randomUUID();
    const sql = `
      INSERT INTO PART_CUSTODY_HANDOVERS (
        HANDOVER_ID,
        REPLACEMENT_ID,
        PART_ID,
        ASF_LOCATION_ID,
        ENGINEER_ID,
        HANDED_OVER_BY,
        HANDED_OVER_AT,
        COLLECTION_ACKNOWLEDGED,
        STATUS,
        REMARKS,
        CREATED_AT
      ) VALUES (
        :handoverId,
        :replacementId,
        :partId,
        :asfLocationId,
        :engineerId,
        :handedOverBy,
        SYSTIMESTAMP,
        'N',
        'PENDING_COLLECTION',
        :remarks,
        SYSTIMESTAMP
      )
    `;
    await conn.execute(sql, {
      handoverId,
      replacementId: data.replacementId,
      partId: data.partId,
      asfLocationId: data.asfLocationId,
      engineerId: data.engineerId,
      handedOverBy: data.handedOverBy,
      remarks: data.remarks || null,
    });

    const record = await this.findById(handoverId, conn);
    if (!record) {
      throw new Error('HANDOVER_CREATION_FAILED: Failed to fetch newly created custody handover record');
    }
    return record;
  }

  async acknowledgeCollection(
    handoverId: string,
    engineerId: string,
    remarks: string | undefined,
    conn: oracledb.Connection
  ): Promise<PartCustodyHandoverRecord> {
    const sql = `
      UPDATE PART_CUSTODY_HANDOVERS
      SET 
        COLLECTION_ACKNOWLEDGED = 'Y',
        COLLECTED_AT = SYSTIMESTAMP,
        STATUS = 'COLLECTED',
        REMARKS = CASE WHEN :remarks IS NOT NULL THEN NVL(REMARKS, '') || ' [Collected: ' || :remarks || ']' ELSE REMARKS END
      WHERE HANDOVER_ID = :handoverId
        AND ENGINEER_ID = :engineerId
        AND STATUS = 'PENDING_COLLECTION'
    `;
    const result = await conn.execute(sql, {
      handoverId,
      engineerId,
      remarks: remarks || null,
    });

    if (result.rowsAffected === 0) {
      throw new Error('COLLECTION_ACKNOWLEDGE_FAILED: Handover record not found, already collected, or engineer mismatch');
    }

    const record = await this.findById(handoverId, conn);
    if (!record) {
      throw new Error('COLLECTION_ACKNOWLEDGE_FETCH_FAILED: Handover record not found after update');
    }
    return record;
  }

  async markInstalled(
    handoverId: string,
    engineerId: string,
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE PART_CUSTODY_HANDOVERS
      SET STATUS = 'INSTALLED'
      WHERE HANDOVER_ID = :handoverId
        AND ENGINEER_ID = :engineerId
        AND STATUS = 'COLLECTED'
    `;
    const result = await conn.execute(sql, { handoverId, engineerId });
    if (result.rowsAffected === 0) {
      throw new Error('MARK_INSTALLED_FAILED: Handover record must be in COLLECTED status and owned by assigned engineer');
    }
  }

  async markReturned(
    handoverId: string,
    reason: string,
    conn: oracledb.Connection
  ): Promise<void> {
    const sql = `
      UPDATE PART_CUSTODY_HANDOVERS
      SET STATUS = 'RETURNED', REMARKS = NVL(REMARKS, '') || ' [Returned: ' || :reason || ']'
      WHERE HANDOVER_ID = :handoverId
    `;
    await conn.execute(sql, { handoverId, reason });
  }
}

export const custodyRepository = new CustodyRepository();
