import crypto from 'crypto';
import oracledb from 'oracledb';
import { InventoryMovementRecord, InventoryMovementType, StockBucket } from '../../types/inventory.js';
import { getOracleConnection } from '../oraclePool.js';

export class InventoryMovementRepository {
  async recordMovement(
    input: {
      locationId: string;
      partId: string;
      movementType: InventoryMovementType;
      stockBucket: StockBucket;
      quantity: number;
      balanceBefore: number;
      balanceAfter: number;
      referenceType: string;
      referenceId: string;
      sourceLocationId?: string;
      destLocationId?: string;
      actorId?: string;
      actorUsername: string;
      remarks?: string;
    },
    conn: oracledb.Connection
  ): Promise<string> {
    const movementId = crypto.randomUUID();

    const sql = `
      INSERT INTO INVENTORY_MOVEMENTS (
        MOVEMENT_ID,
        LOCATION_ID,
        PART_ID,
        MOVEMENT_TYPE,
        STOCK_BUCKET,
        QUANTITY,
        BALANCE_BEFORE,
        BALANCE_AFTER,
        REFERENCE_TYPE,
        REFERENCE_ID,
        SOURCE_LOCATION_ID,
        DEST_LOCATION_ID,
        ACTOR_ID,
        ACTOR_USERNAME,
        REMARKS,
        CREATED_AT
      ) VALUES (
        :movementId,
        :locationId,
        :partId,
        :movementType,
        :stockBucket,
        :quantity,
        :balanceBefore,
        :balanceAfter,
        :referenceType,
        :referenceId,
        :sourceLocationId,
        :destLocationId,
        :actorId,
        :actorUsername,
        :remarks,
        SYSTIMESTAMP
      )
    `;

    await conn.execute(sql, {
      movementId,
      locationId: input.locationId,
      partId: input.partId,
      movementType: input.movementType,
      stockBucket: input.stockBucket,
      quantity: input.quantity,
      balanceBefore: input.balanceBefore,
      balanceAfter: input.balanceAfter,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      sourceLocationId: input.sourceLocationId || null,
      destLocationId: input.destLocationId || null,
      actorId: input.actorId || null,
      actorUsername: input.actorUsername,
      remarks: input.remarks || null,
    });

    return movementId;
  }

  async listMovements(options: {
    locationId?: string;
    partId?: string;
    movementType?: string;
    referenceId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: InventoryMovementRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = ['1=1'];

      if (options.locationId) {
        binds.locationId = options.locationId;
        whereClauses.push('m.LOCATION_ID = :locationId');
      }

      if (options.partId) {
        binds.partId = options.partId;
        whereClauses.push('m.PART_ID = :partId');
      }

      if (options.movementType) {
        binds.movementType = options.movementType;
        whereClauses.push('m.MOVEMENT_TYPE = :movementType');
      }

      if (options.referenceId) {
        binds.referenceId = `%${options.referenceId.trim()}%`;
        whereClauses.push('m.REFERENCE_ID LIKE :referenceId');
      }

      const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

      const countSql = `
        SELECT COUNT(*) AS CNT
        FROM INVENTORY_MOVEMENTS m
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
          m.MOVEMENT_ID,
          m.LOCATION_ID,
          l.LOCATION_NAME,
          m.PART_ID,
          p.PART_CODE,
          p.PART_NAME,
          m.MOVEMENT_TYPE,
          m.STOCK_BUCKET,
          m.QUANTITY,
          m.BALANCE_BEFORE,
          m.BALANCE_AFTER,
          m.REFERENCE_TYPE,
          m.REFERENCE_ID,
          m.SOURCE_LOCATION_ID,
          sl.LOCATION_NAME AS SOURCE_LOCATION_NAME,
          m.DEST_LOCATION_ID,
          dl.LOCATION_NAME AS DEST_LOCATION_NAME,
          m.ACTOR_ID,
          m.ACTOR_USERNAME,
          m.REMARKS,
          m.CREATED_AT
        FROM INVENTORY_MOVEMENTS m
        JOIN LOCATIONS l ON m.LOCATION_ID = l.LOCATION_ID
        JOIN PART_CODES p ON m.PART_ID = p.PART_ID
        LEFT JOIN LOCATIONS sl ON m.SOURCE_LOCATION_ID = sl.LOCATION_ID
        LEFT JOIN LOCATIONS dl ON m.DEST_LOCATION_ID = dl.LOCATION_ID
        ${whereSql}
        ORDER BY m.CREATED_AT DESC, m.MOVEMENT_ID DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const dataResult = await conn.execute<any>(dataSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const items: InventoryMovementRecord[] = (dataResult.rows || []).map((row) => ({
        movementId: row.MOVEMENT_ID,
        locationId: row.LOCATION_ID,
        locationName: row.LOCATION_NAME,
        partId: row.PART_ID,
        partCode: row.PART_CODE,
        partName: row.PART_NAME,
        movementType: row.MOVEMENT_TYPE,
        stockBucket: row.STOCK_BUCKET,
        quantity: Number(row.QUANTITY),
        balanceBefore: Number(row.BALANCE_BEFORE),
        balanceAfter: Number(row.BALANCE_AFTER),
        referenceType: row.REFERENCE_TYPE,
        referenceId: row.REFERENCE_ID,
        sourceLocationId: row.SOURCE_LOCATION_ID || undefined,
        sourceLocationName: row.SOURCE_LOCATION_NAME || undefined,
        destLocationId: row.DEST_LOCATION_ID || undefined,
        destLocationName: row.DEST_LOCATION_NAME || undefined,
        actorId: row.ACTOR_ID || undefined,
        actorUsername: row.ACTOR_USERNAME,
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
}

export const inventoryMovementRepository = new InventoryMovementRepository();
