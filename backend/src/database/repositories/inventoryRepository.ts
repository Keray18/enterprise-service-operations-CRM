import crypto from 'crypto';
import oracledb from 'oracledb';
import { InventoryBalanceRecord, InventoryReconciliationRecord } from '../../types/inventory.js';
import { AppError } from '../../middleware/errorHandler.js';
import { getOracleConnection } from '../oraclePool.js';

export class InventoryRepository {
  async listBalances(options: {
    locationId?: string;
    partId?: string;
    search?: string;
    lowStockOnly?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ items: InventoryBalanceRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = ['1=1'];

      if (options.locationId) {
        binds.locationId = options.locationId;
        whereClauses.push('b.LOCATION_ID = :locationId');
      }

      if (options.partId) {
        binds.partId = options.partId;
        whereClauses.push('b.PART_ID = :partId');
      }

      if (options.search && options.search.trim()) {
        binds.search = `%${options.search.trim().toLowerCase()}%`;
        whereClauses.push('(LOWER(p.PART_CODE) LIKE :search OR LOWER(p.PART_NAME) LIKE :search OR LOWER(l.LOCATION_NAME) LIKE :search)');
      }

      if (options.lowStockOnly) {
        whereClauses.push('(b.QTY_ON_HAND - b.QTY_RESERVED) <= b.REORDER_LEVEL');
      }

      const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

      const countSql = `
        SELECT COUNT(*) AS CNT
        FROM INVENTORY_BALANCES b
        JOIN LOCATIONS l ON b.LOCATION_ID = l.LOCATION_ID
        JOIN PART_CODES p ON b.PART_ID = p.PART_ID
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
          b.BALANCE_ID,
          b.LOCATION_ID,
          l.LOCATION_CODE,
          l.LOCATION_NAME,
          l.PARTY_TYPE,
          b.PART_ID,
          p.PART_CODE,
          p.PART_NAME,
          p.PART_CATEGORY,
          p.CUSTOMER_PRICE,
          p.LOCATION_PRICE,
          hsn.HSN_CODE,
          b.QTY_ON_HAND,
          b.QTY_RESERVED,
          b.QTY_IN_TRANSIT,
          b.QTY_DEFECTIVE,
          b.REORDER_LEVEL,
          b.VERSION_NO,
          b.CREATED_AT,
          b.UPDATED_AT
        FROM INVENTORY_BALANCES b
        JOIN LOCATIONS l ON b.LOCATION_ID = l.LOCATION_ID
        JOIN PART_CODES p ON b.PART_ID = p.PART_ID
        LEFT JOIN HSN_TAX_MASTERS hsn ON p.HSN_ID = hsn.HSN_ID
        ${whereSql}
        ORDER BY l.LOCATION_NAME ASC, p.PART_NAME ASC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const dataResult = await conn.execute<any>(dataSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const items: InventoryBalanceRecord[] = (dataResult.rows || []).map((row) => {
        const onHand = Number(row.QTY_ON_HAND || 0);
        const reserved = Number(row.QTY_RESERVED || 0);
        return {
          balanceId: row.BALANCE_ID,
          locationId: row.LOCATION_ID,
          locationCode: row.LOCATION_CODE,
          locationName: row.LOCATION_NAME,
          partyType: row.PARTY_TYPE,
          partId: row.PART_ID,
          partCode: row.PART_CODE,
          partName: row.PART_NAME,
          partCategory: row.PART_CATEGORY,
          hsnCode: row.HSN_CODE || undefined,
          unitPrice: Number(row.LOCATION_PRICE || row.CUSTOMER_PRICE || 0),
          qtyOnHand: onHand,
          qtyReserved: reserved,
          qtyInTransit: Number(row.QTY_IN_TRANSIT || 0),
          qtyDefective: Number(row.QTY_DEFECTIVE || 0),
          qtyAvailable: Math.max(0, onHand - reserved),
          reorderLevel: Number(row.REORDER_LEVEL || 0),
          versionNo: Number(row.VERSION_NO || 1),
          createdAt: new Date(row.CREATED_AT),
          updatedAt: new Date(row.UPDATED_AT),
        };
      });

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

  async getBalance(
    locationId: string,
    partId: string,
    conn?: oracledb.Connection,
    forUpdate = false
  ): Promise<InventoryBalanceRecord | null> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const lockSql = forUpdate ? 'FOR UPDATE' : '';
      const sql = `
        SELECT 
          b.BALANCE_ID,
          b.LOCATION_ID,
          l.LOCATION_CODE,
          l.LOCATION_NAME,
          l.PARTY_TYPE,
          b.PART_ID,
          p.PART_CODE,
          p.PART_NAME,
          p.PART_CATEGORY,
          p.CUSTOMER_PRICE,
          p.LOCATION_PRICE,
          hsn.HSN_CODE,
          b.QTY_ON_HAND,
          b.QTY_RESERVED,
          b.QTY_IN_TRANSIT,
          b.QTY_DEFECTIVE,
          b.REORDER_LEVEL,
          b.VERSION_NO,
          b.CREATED_AT,
          b.UPDATED_AT
        FROM INVENTORY_BALANCES b
        JOIN LOCATIONS l ON b.LOCATION_ID = l.LOCATION_ID
        JOIN PART_CODES p ON b.PART_ID = p.PART_ID
        LEFT JOIN HSN_TAX_MASTERS hsn ON p.HSN_ID = hsn.HSN_ID
        WHERE b.LOCATION_ID = :locationId AND b.PART_ID = :partId
        ${lockSql}
      `;

      const result = await connection.execute<any>(sql, { locationId, partId }, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      const row = result.rows?.[0];
      if (!row) return null;

      const onHand = Number(row.QTY_ON_HAND || 0);
      const reserved = Number(row.QTY_RESERVED || 0);

      return {
        balanceId: row.BALANCE_ID,
        locationId: row.LOCATION_ID,
        locationCode: row.LOCATION_CODE,
        locationName: row.LOCATION_NAME,
        partyType: row.PARTY_TYPE,
        partId: row.PART_ID,
        partCode: row.PART_CODE,
        partName: row.PART_NAME,
        partCategory: row.PART_CATEGORY,
        hsnCode: row.HSN_CODE || undefined,
        unitPrice: Number(row.LOCATION_PRICE || row.CUSTOMER_PRICE || 0),
        qtyOnHand: onHand,
        qtyReserved: reserved,
        qtyInTransit: Number(row.QTY_IN_TRANSIT || 0),
        qtyDefective: Number(row.QTY_DEFECTIVE || 0),
        qtyAvailable: Math.max(0, onHand - reserved),
        reorderLevel: Number(row.REORDER_LEVEL || 0),
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

  async upsertBalanceDeltas(
    input: {
      locationId: string;
      partId: string;
      deltaOnHand?: number;
      deltaReserved?: number;
      deltaInTransit?: number;
      deltaDefective?: number;
    },
    conn: oracledb.Connection
  ): Promise<{ previousOnHand: number; newOnHand: number; previousReserved: number; newReserved: number }> {
    const deltaOnHand = input.deltaOnHand || 0;
    const deltaReserved = input.deltaReserved || 0;
    const deltaInTransit = input.deltaInTransit || 0;
    const deltaDefective = input.deltaDefective || 0;

    // Check existing with lock
    const existing = await this.getBalance(input.locationId, input.partId, conn, true);

    if (existing) {
      const newOnHand = existing.qtyOnHand + deltaOnHand;
      const newReserved = existing.qtyReserved + deltaReserved;
      const newInTransit = existing.qtyInTransit + deltaInTransit;
      const newDefective = existing.qtyDefective + deltaDefective;

      if (newOnHand < 0) {
        throw new Error(`Insufficient physical on-hand stock for part (${existing.partCode || input.partId}). Available: ${existing.qtyOnHand}, Requested reduction: ${Math.abs(deltaOnHand)}`);
      }
      if (newReserved < 0) {
        throw new Error(`Reserved quantity cannot drop below zero.`);
      }
      if (newReserved > newOnHand) {
        throw new Error(`Reserved quantity (${newReserved}) cannot exceed on-hand quantity (${newOnHand}).`);
      }
      if (newInTransit < 0) {
        throw new Error(`In-transit quantity cannot drop below zero.`);
      }
      if (newDefective < 0) {
        throw new Error(`Defective quantity cannot drop below zero.`);
      }

      const updateSql = `
        UPDATE INVENTORY_BALANCES
        SET 
          QTY_ON_HAND = :newOnHand,
          QTY_RESERVED = :newReserved,
          QTY_IN_TRANSIT = :newInTransit,
          QTY_DEFECTIVE = :newDefective,
          VERSION_NO = VERSION_NO + 1,
          UPDATED_AT = SYSTIMESTAMP
        WHERE BALANCE_ID = :balanceId
      `;

      await conn.execute(updateSql, {
        newOnHand,
        newReserved,
        newInTransit,
        newDefective,
        balanceId: existing.balanceId,
      });

      return {
        previousOnHand: existing.qtyOnHand,
        newOnHand,
        previousReserved: existing.qtyReserved,
        newReserved,
      };
    } else {
      // Must be initial positive balance
      if (deltaOnHand < 0 || deltaReserved < 0 || deltaInTransit < 0 || deltaDefective < 0) {
        throw new Error(`Initial inventory balance values cannot be negative.`);
      }
      if (deltaReserved > deltaOnHand) {
        throw new Error(`Initial reserved quantity cannot exceed initial on-hand quantity.`);
      }

      const balanceId = crypto.randomUUID();
      const insertSql = `
        INSERT INTO INVENTORY_BALANCES (
          BALANCE_ID,
          LOCATION_ID,
          PART_ID,
          QTY_ON_HAND,
          QTY_RESERVED,
          QTY_IN_TRANSIT,
          QTY_DEFECTIVE,
          REORDER_LEVEL,
          VERSION_NO,
          CREATED_AT,
          UPDATED_AT
        ) VALUES (
          :balanceId,
          :locationId,
          :partId,
          :deltaOnHand,
          :deltaReserved,
          :deltaInTransit,
          :deltaDefective,
          5,
          1,
          SYSTIMESTAMP,
          SYSTIMESTAMP
        )
      `;

      await conn.execute(insertSql, {
        balanceId,
        locationId: input.locationId,
        partId: input.partId,
        deltaOnHand,
        deltaReserved,
        deltaInTransit,
        deltaDefective,
      });

      return {
        previousOnHand: 0,
        newOnHand: deltaOnHand,
        previousReserved: 0,
        newReserved: deltaReserved,
      };
    }
  }

  async reconcileStock(
    locationId: string,
    partId: string,
    conn?: oracledb.Connection
  ): Promise<InventoryReconciliationRecord> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      // 1. Get cached balance
      const balance = await this.getBalance(locationId, partId, connection);
      const cachedOnHand = balance ? balance.qtyOnHand : 0;
      const cachedReserved = balance ? balance.qtyReserved : 0;

      let locationName = balance?.locationName;
      let locationCode = balance?.locationCode;
      let partCode = balance?.partCode;
      let partName = balance?.partName;

      if (!balance) {
        // Scope existence verification for valid empty inventory
        const locRes = await connection.execute<any>(
          `SELECT LOCATION_NAME, LOCATION_CODE FROM LOCATIONS WHERE LOCATION_ID = :locationId`,
          { locationId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (!locRes.rows?.[0]) {
          throw new AppError(`Location '${locationId}' not found.`, 404, 'NOT_FOUND');
        }
        locationName = locRes.rows[0].LOCATION_NAME;
        locationCode = locRes.rows[0].LOCATION_CODE;

        const partRes = await connection.execute<any>(
          `SELECT PART_CODE, PART_NAME FROM PART_CODES WHERE PART_ID = :partId`,
          { partId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (!partRes.rows?.[0]) {
          throw new AppError(`Part '${partId}' not found.`, 404, 'NOT_FOUND');
        }
        partCode = partRes.rows[0].PART_CODE;
        partName = partRes.rows[0].PART_NAME;
      }

      // 2. Calculate net sum from immutable movement ledger
      const ledgerSql = `
        SELECT 
          NVL(SUM(CASE 
            WHEN STOCK_BUCKET = 'ON_HAND' THEN QUANTITY 
            ELSE 0 
          END), 0) AS LEDGER_ON_HAND
        FROM INVENTORY_MOVEMENTS
        WHERE LOCATION_ID = :locationId AND PART_ID = :partId
      `;

      const ledgerResult = await connection.execute<any>(ledgerSql, { locationId, partId }, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      const ledgerOnHand = Number(ledgerResult.rows?.[0]?.LEDGER_ON_HAND || 0);

      // 3. Calculate sum of active reservations
      const resSql = `
        SELECT NVL(SUM(QUANTITY), 0) AS ACTIVE_RESERVED
        FROM INVENTORY_RESERVATIONS
        WHERE LOCATION_ID = :locationId AND PART_ID = :partId AND STATUS = 'ACTIVE'
      `;
      const resResult = await connection.execute<any>(resSql, { locationId, partId }, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      const activeReserved = Number(resResult.rows?.[0]?.ACTIVE_RESERVED || 0);

      const discrepancyOnHand = cachedOnHand - ledgerOnHand;
      const discrepancyReserved = cachedReserved - activeReserved;
      const isBalancedOnHand = discrepancyOnHand === 0;
      const isBalancedReserved = discrepancyReserved === 0;
      const isReconciled = isBalancedOnHand && isBalancedReserved;
      const status: 'BALANCED' | 'DISCREPANCY_DETECTED' = isReconciled ? 'BALANCED' : 'DISCREPANCY_DETECTED';

      return {
        locationId,
        locationName: locationName || locationId,
        locationCode: locationCode || undefined,
        partId,
        partCode: partCode || partId,
        partName: partName || 'Unknown Part',
        status,
        isReconciled,
        discrepanciesFound: !isReconciled,
        lastCheckedAt: new Date(),
        onHand: {
          cached: cachedOnHand,
          movementSum: ledgerOnHand,
          difference: discrepancyOnHand,
          isBalanced: isBalancedOnHand,
        },
        reserved: {
          cached: cachedReserved,
          activeReservationSum: activeReserved,
          difference: discrepancyReserved,
          isBalanced: isBalancedReserved,
        },
        cachedOnHand,
        ledgerOnHand,
        discrepancyOnHand,
        cachedReserved,
        activeReserved,
        discrepancyReserved,
      };
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

}

export const inventoryRepository = new InventoryRepository();
