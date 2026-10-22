import crypto from 'crypto';
import oracledb from 'oracledb';
import { InventoryReservationRecord, ReservationStatus } from '../../types/inventory.js';
import { getOracleConnection } from '../oraclePool.js';

export class InventoryReservationRepository {
  async createReservation(
    input: {
      requestId: string;
      partEntryId: string;
      locationId: string;
      partId: string;
      quantity: number;
      reservedBy: string;
    },
    conn: oracledb.Connection
  ): Promise<string> {
    const reservationId = crypto.randomUUID();

    const sql = `
      INSERT INTO INVENTORY_RESERVATIONS (
        RESERVATION_ID,
        REQUEST_ID,
        PART_ENTRY_ID,
        LOCATION_ID,
        PART_ID,
        QUANTITY,
        STATUS,
        RESERVED_BY,
        RESERVED_AT
      ) VALUES (
        :reservationId,
        :requestId,
        :partEntryId,
        :locationId,
        :partId,
        :quantity,
        'ACTIVE',
        :reservedBy,
        SYSTIMESTAMP
      )
    `;

    await conn.execute(sql, {
      reservationId,
      requestId: input.requestId,
      partEntryId: input.partEntryId,
      locationId: input.locationId,
      partId: input.partId,
      quantity: input.quantity,
      reservedBy: input.reservedBy,
    });

    return reservationId;
  }

  async findActiveByRequestId(
    requestId: string,
    conn?: oracledb.Connection
  ): Promise<InventoryReservationRecord[]> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const sql = `
        SELECT 
          r.RESERVATION_ID,
          r.REQUEST_ID,
          sr.JOB_NUMBER,
          c.FULL_NAME AS CUSTOMER_NAME,
          r.PART_ENTRY_ID,
          r.LOCATION_ID,
          l.LOCATION_NAME,
          r.PART_ID,
          p.PART_CODE,
          p.PART_NAME,
          r.QUANTITY,
          r.STATUS,
          r.RESERVED_BY,
          u.FULL_NAME AS RESERVED_BY_NAME,
          r.RESERVED_AT,
          r.FULFILLED_AT,
          r.RELEASED_AT,
          r.RELEASE_REASON
        FROM INVENTORY_RESERVATIONS r
        JOIN SERVICE_REQUESTS sr ON r.REQUEST_ID = sr.REQUEST_ID
        JOIN CUSTOMERS c ON sr.CUSTOMER_ID = c.CUSTOMER_ID
        JOIN LOCATIONS l ON r.LOCATION_ID = l.LOCATION_ID
        JOIN PART_CODES p ON r.PART_ID = p.PART_ID
        JOIN APP_USERS u ON r.RESERVED_BY = u.USER_ID
        WHERE r.REQUEST_ID = :requestId AND r.STATUS = 'ACTIVE'
        ORDER BY r.RESERVED_AT ASC
      `;

      const result = await connection.execute<any>(sql, { requestId }, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      return (result.rows || []).map((row) => ({
        reservationId: row.RESERVATION_ID,
        requestId: row.REQUEST_ID,
        jobNumber: row.JOB_NUMBER,
        customerName: row.CUSTOMER_NAME,
        partEntryId: row.PART_ENTRY_ID,
        locationId: row.LOCATION_ID,
        locationName: row.LOCATION_NAME,
        partId: row.PART_ID,
        partCode: row.PART_CODE,
        partName: row.PART_NAME,
        quantity: Number(row.QUANTITY),
        status: row.STATUS as ReservationStatus,
        reservedBy: row.RESERVED_BY,
        reservedByName: row.RESERVED_BY_NAME,
        reservedAt: new Date(row.RESERVED_AT),
        fulfilledAt: row.FULFILLED_AT ? new Date(row.FULFILLED_AT) : undefined,
        releasedAt: row.RELEASED_AT ? new Date(row.RELEASED_AT) : undefined,
        releaseReason: row.RELEASE_REASON || undefined,
      }));
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async findActiveByPartEntryId(
    partEntryId: string,
    conn?: oracledb.Connection
  ): Promise<InventoryReservationRecord | null> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const sql = `
        SELECT 
          r.RESERVATION_ID,
          r.REQUEST_ID,
          sr.JOB_NUMBER,
          c.FULL_NAME AS CUSTOMER_NAME,
          r.PART_ENTRY_ID,
          r.LOCATION_ID,
          l.LOCATION_NAME,
          r.PART_ID,
          p.PART_CODE,
          p.PART_NAME,
          r.QUANTITY,
          r.STATUS,
          r.RESERVED_BY,
          u.FULL_NAME AS RESERVED_BY_NAME,
          r.RESERVED_AT,
          r.FULFILLED_AT,
          r.RELEASED_AT,
          r.RELEASE_REASON
        FROM INVENTORY_RESERVATIONS r
        JOIN SERVICE_REQUESTS sr ON r.REQUEST_ID = sr.REQUEST_ID
        JOIN CUSTOMERS c ON sr.CUSTOMER_ID = c.CUSTOMER_ID
        JOIN LOCATIONS l ON r.LOCATION_ID = l.LOCATION_ID
        JOIN PART_CODES p ON r.PART_ID = p.PART_ID
        JOIN APP_USERS u ON r.RESERVED_BY = u.USER_ID
        WHERE r.PART_ENTRY_ID = :partEntryId AND r.STATUS = 'ACTIVE'
      `;

      const result = await connection.execute<any>(sql, { partEntryId }, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      const row = result.rows?.[0];
      if (!row) return null;

      return {
        reservationId: row.RESERVATION_ID,
        requestId: row.REQUEST_ID,
        jobNumber: row.JOB_NUMBER,
        customerName: row.CUSTOMER_NAME,
        partEntryId: row.PART_ENTRY_ID,
        locationId: row.LOCATION_ID,
        locationName: row.LOCATION_NAME,
        partId: row.PART_ID,
        partCode: row.PART_CODE,
        partName: row.PART_NAME,
        quantity: Number(row.QUANTITY),
        status: row.STATUS as ReservationStatus,
        reservedBy: row.RESERVED_BY,
        reservedByName: row.RESERVED_BY_NAME,
        reservedAt: new Date(row.RESERVED_AT),
        fulfilledAt: row.FULFILLED_AT ? new Date(row.FULFILLED_AT) : undefined,
        releasedAt: row.RELEASED_AT ? new Date(row.RELEASED_AT) : undefined,
        releaseReason: row.RELEASE_REASON || undefined,
      };
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async fulfillReservation(
    reservationId: string,
    conn: oracledb.Connection
  ): Promise<boolean> {
    const sql = `
      UPDATE INVENTORY_RESERVATIONS
      SET STATUS = 'FULFILLED', FULFILLED_AT = SYSTIMESTAMP
      WHERE RESERVATION_ID = :reservationId AND STATUS = 'ACTIVE'
    `;
    const result = await conn.execute(sql, { reservationId });
    return (result.rowsAffected || 0) > 0;
  }

  async releaseReservation(
    reservationId: string,
    reason: string,
    conn: oracledb.Connection
  ): Promise<boolean> {
    const sql = `
      UPDATE INVENTORY_RESERVATIONS
      SET STATUS = 'RELEASED', RELEASED_AT = SYSTIMESTAMP, RELEASE_REASON = :reason
      WHERE RESERVATION_ID = :reservationId AND STATUS = 'ACTIVE'
    `;
    const result = await conn.execute(sql, { reservationId, reason });
    return (result.rowsAffected || 0) > 0;
  }

  async listReservations(options: {
    locationId?: string;
    status?: ReservationStatus;
    page?: number;
    limit?: number;
  }): Promise<{ items: InventoryReservationRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const whereClauses: string[] = ['1=1'];

      if (options.locationId) {
        binds.locationId = options.locationId;
        whereClauses.push('r.LOCATION_ID = :locationId');
      }

      if (options.status) {
        binds.status = options.status;
        whereClauses.push('r.STATUS = :status');
      }

      const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

      const countSql = `
        SELECT COUNT(*) AS CNT
        FROM INVENTORY_RESERVATIONS r
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
          r.RESERVATION_ID,
          r.REQUEST_ID,
          sr.JOB_NUMBER,
          c.FULL_NAME AS CUSTOMER_NAME,
          r.PART_ENTRY_ID,
          r.LOCATION_ID,
          l.LOCATION_NAME,
          r.PART_ID,
          p.PART_CODE,
          p.PART_NAME,
          r.QUANTITY,
          r.STATUS,
          r.RESERVED_BY,
          u.FULL_NAME AS RESERVED_BY_NAME,
          r.RESERVED_AT,
          r.FULFILLED_AT,
          r.RELEASED_AT,
          r.RELEASE_REASON
        FROM INVENTORY_RESERVATIONS r
        JOIN SERVICE_REQUESTS sr ON r.REQUEST_ID = sr.REQUEST_ID
        JOIN CUSTOMERS c ON sr.CUSTOMER_ID = c.CUSTOMER_ID
        JOIN LOCATIONS l ON r.LOCATION_ID = l.LOCATION_ID
        JOIN PART_CODES p ON r.PART_ID = p.PART_ID
        JOIN APP_USERS u ON r.RESERVED_BY = u.USER_ID
        ${whereSql}
        ORDER BY r.RESERVED_AT DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;

      const dataResult = await conn.execute<any>(dataSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const items: InventoryReservationRecord[] = (dataResult.rows || []).map((row) => ({
        reservationId: row.RESERVATION_ID,
        requestId: row.REQUEST_ID,
        jobNumber: row.JOB_NUMBER,
        customerName: row.CUSTOMER_NAME,
        partEntryId: row.PART_ENTRY_ID,
        locationId: row.LOCATION_ID,
        locationName: row.LOCATION_NAME,
        partId: row.PART_ID,
        partCode: row.PART_CODE,
        partName: row.PART_NAME,
        quantity: Number(row.QUANTITY),
        status: row.STATUS as ReservationStatus,
        reservedBy: row.RESERVED_BY,
        reservedByName: row.RESERVED_BY_NAME,
        reservedAt: new Date(row.RESERVED_AT),
        fulfilledAt: row.FULFILLED_AT ? new Date(row.FULFILLED_AT) : undefined,
        releasedAt: row.RELEASED_AT ? new Date(row.RELEASED_AT) : undefined,
        releaseReason: row.RELEASE_REASON || undefined,
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

export const inventoryReservationRepository = new InventoryReservationRepository();
