import crypto from 'crypto';
import oracledb from 'oracledb';
import { ServiceRequestEventRecord } from '../../types/callCenter.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToEvent(row: any): ServiceRequestEventRecord {
  return {
    eventId: row.EVENT_ID,
    requestId: row.REQUEST_ID,
    fromState: row.FROM_STATE,
    toState: row.TO_STATE,
    eventType: row.EVENT_TYPE,
    triggeredByUserId: row.TRIGGERED_BY_USER_ID,
    triggeredByUsername: row.TRIGGERED_BY_USERNAME,
    triggeredByRole: row.TRIGGERED_BY_ROLE,
    remarks: row.REMARKS || undefined,
    metadataJson: row.METADATA_JSON || undefined,
    createdAt: new Date(row.CREATED_AT),
  };
}

export class ServiceRequestEventRepository {
  /**
   * Appends an immutable audit event for a service request transition within a transaction.
   */
  async createEvent(
    event: {
      requestId: string;
      fromState?: string;
      toState: string;
      eventType?: string;
      triggeredByUserId: string;
      triggeredByUsername: string;
      triggeredByRole: string;
      remarks?: string;
      metadataJson?: Record<string, any>;
    },
    conn: oracledb.Connection
  ): Promise<ServiceRequestEventRecord> {
    const eventId = crypto.randomUUID();
    const fromState = event.fromState || 'NONE';
    const eventType = event.eventType || 'CALL_REGISTERED';
    const metadataString = event.metadataJson ? JSON.stringify(event.metadataJson) : null;

    const sql = `
      INSERT INTO SERVICE_REQUEST_EVENTS (
        EVENT_ID,
        REQUEST_ID,
        FROM_STATE,
        TO_STATE,
        EVENT_TYPE,
        TRIGGERED_BY_USER_ID,
        TRIGGERED_BY_USERNAME,
        TRIGGERED_BY_ROLE,
        REMARKS,
        METADATA_JSON
      ) VALUES (
        :eventId,
        :requestId,
        :fromState,
        :toState,
        :eventType,
        :triggeredByUserId,
        :triggeredByUsername,
        :triggeredByRole,
        :remarks,
        :metadataJson
      )
    `;

    await conn.execute(sql, {
      eventId,
      requestId: event.requestId,
      fromState,
      toState: event.toState,
      eventType,
      triggeredByUserId: event.triggeredByUserId,
      triggeredByUsername: event.triggeredByUsername,
      triggeredByRole: event.triggeredByRole,
      remarks: event.remarks || null,
      metadataJson: metadataString,
    });

    return {
      eventId,
      requestId: event.requestId,
      fromState,
      toState: event.toState,
      eventType,
      triggeredByUserId: event.triggeredByUserId,
      triggeredByUsername: event.triggeredByUsername,
      triggeredByRole: event.triggeredByRole,
      remarks: event.remarks,
      metadataJson: metadataString || undefined,
      createdAt: new Date(),
    };
  }

  /**
   * Retrieves chronological event history for a given service request.
   */
  async listEventsByRequestId(
    requestId: string,
    conn?: oracledb.Connection
  ): Promise<ServiceRequestEventRecord[]> {
    const shouldClose = !conn;
    const connection = conn || (await getOracleConnection());

    try {
      const sql = `
        SELECT 
          EVENT_ID,
          REQUEST_ID,
          FROM_STATE,
          TO_STATE,
          EVENT_TYPE,
          TRIGGERED_BY_USER_ID,
          TRIGGERED_BY_USERNAME,
          TRIGGERED_BY_ROLE,
          REMARKS,
          METADATA_JSON,
          CREATED_AT
        FROM SERVICE_REQUEST_EVENTS
        WHERE REQUEST_ID = :requestId
        ORDER BY CREATED_AT ASC
      `;

      const result = await connection.execute(
        sql,
        { requestId },
        {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          fetchInfo: {
            METADATA_JSON: { type: oracledb.STRING },
          },
        }
      );

      return (result.rows || []).map(mapRowToEvent);
    } finally {
      if (shouldClose) {
        await connection.close();
      }
    }
  }

  async findByRequestId(
    requestId: string,
    conn?: oracledb.Connection
  ): Promise<ServiceRequestEventRecord[]> {
    return this.listEventsByRequestId(requestId, conn);
  }
}

export const serviceRequestEventRepository = new ServiceRequestEventRepository();
