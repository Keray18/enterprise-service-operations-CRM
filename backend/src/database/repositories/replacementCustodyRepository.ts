import crypto from 'crypto';
import oracledb from 'oracledb';
import { getOracleConnection } from '../oraclePool.js';

export type CustodyEventType =
  | 'WAREHOUSE_DISPATCH'
  | 'ASF_RECEIPT'
  | 'ENGINEER_HANDOVER_INITIATED'
  | 'ENGINEER_COLLECTION'
  | 'CUSTOMER_INSTALLATION'
  | 'REPLACEMENT_CLOSURE';

export type CustodianType = 'WAREHOUSE' | 'IN_TRANSIT' | 'ASF' | 'ENGINEER' | 'CUSTOMER';
export type CaptureMethod = 'SCANNER' | 'MANUAL';

export interface CustodyEventRecord {
  eventId: string;
  replacementId: string;
  handoverId?: string;
  partId: string;
  partCode?: string;
  eventType: CustodyEventType;
  custodianType: CustodianType;
  locationId?: string;
  locationName?: string;
  custodianUserId?: string;
  custodianName?: string;
  scannedBarcode?: string;
  captureMethod?: CaptureMethod;
  actorId: string;
  actorUsername?: string;
  actorRole: string;
  remarks?: string;
  createdAt: Date;
}

export interface InstallationRecord {
  installationId: string;
  replacementId: string;
  requestId: string;
  handoverId?: string;
  partId: string;
  installedPartCode: string;
  captureMethod?: CaptureMethod;
  serialNumber?: string;
  engineerId: string;
  engineerName?: string;
  installedAt: Date;
  remarks?: string;
}

/**
 * Append-only chain-of-custody ledger and installation evidence for replacement units.
 * Only successful, validated movements are written; rejected scans never create rows.
 */
export class ReplacementCustodyRepository {
  async recordEvent(
    data: Omit<CustodyEventRecord, 'eventId' | 'createdAt' | 'partCode' | 'locationName' | 'custodianName' | 'actorUsername'>,
    conn: oracledb.Connection
  ): Promise<string> {
    const eventId = crypto.randomUUID();
    await conn.execute(
      `INSERT INTO REPLACEMENT_CUSTODY_EVENTS (
         EVENT_ID, REPLACEMENT_ID, HANDOVER_ID, PART_ID, EVENT_TYPE, CUSTODIAN_TYPE, LOCATION_ID,
         CUSTODIAN_USER_ID, SCANNED_BARCODE, CAPTURE_METHOD, ACTOR_ID, ACTOR_ROLE, REMARKS, CREATED_AT
       ) VALUES (
         :eventId, :replacementId, :handoverId, :partId, :eventType, :custodianType, :locationId,
         :custodianUserId, :scannedBarcode, :captureMethod, :actorId, :actorRole, :remarks, SYSTIMESTAMP
       )`,
      {
        eventId,
        replacementId: data.replacementId,
        handoverId: data.handoverId || null,
        partId: data.partId,
        eventType: data.eventType,
        custodianType: data.custodianType,
        locationId: data.locationId || null,
        custodianUserId: data.custodianUserId || null,
        scannedBarcode: data.scannedBarcode ? data.scannedBarcode.slice(0, 100) : null,
        captureMethod: data.captureMethod || null,
        actorId: data.actorId,
        actorRole: data.actorRole.slice(0, 30),
        remarks: data.remarks ? data.remarks.slice(0, 1000) : null,
      }
    );
    return eventId;
  }

  async listEvents(replacementId: string, connection?: oracledb.Connection): Promise<CustodyEventRecord[]> {
    const conn = connection || (await getOracleConnection());
    try {
      const res = await conn.execute<any>(
        `SELECT e.EVENT_ID, e.REPLACEMENT_ID, e.HANDOVER_ID, e.PART_ID, p.PART_CODE, e.EVENT_TYPE, e.CUSTODIAN_TYPE,
                e.LOCATION_ID, l.LOCATION_NAME, e.CUSTODIAN_USER_ID, cu.FULL_NAME AS CUSTODIAN_NAME,
                e.SCANNED_BARCODE, e.CAPTURE_METHOD, e.ACTOR_ID, au.USERNAME AS ACTOR_USERNAME, e.ACTOR_ROLE,
                e.REMARKS, e.CREATED_AT
           FROM REPLACEMENT_CUSTODY_EVENTS e
           LEFT JOIN PART_CODES p ON p.PART_ID = e.PART_ID
           LEFT JOIN LOCATIONS l ON l.LOCATION_ID = e.LOCATION_ID
           LEFT JOIN APP_USERS cu ON cu.USER_ID = e.CUSTODIAN_USER_ID
           LEFT JOIN APP_USERS au ON au.USER_ID = e.ACTOR_ID
          WHERE e.REPLACEMENT_ID = :replacementId
          ORDER BY e.CREATED_AT ASC`,
        { replacementId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return (res.rows || []).map((r: any) => ({
        eventId: r.EVENT_ID,
        replacementId: r.REPLACEMENT_ID,
        handoverId: r.HANDOVER_ID || undefined,
        partId: r.PART_ID,
        partCode: r.PART_CODE || undefined,
        eventType: r.EVENT_TYPE,
        custodianType: r.CUSTODIAN_TYPE,
        locationId: r.LOCATION_ID || undefined,
        locationName: r.LOCATION_NAME || undefined,
        custodianUserId: r.CUSTODIAN_USER_ID || undefined,
        custodianName: r.CUSTODIAN_NAME || undefined,
        scannedBarcode: r.SCANNED_BARCODE || undefined,
        captureMethod: r.CAPTURE_METHOD || undefined,
        actorId: r.ACTOR_ID,
        actorUsername: r.ACTOR_USERNAME || undefined,
        actorRole: r.ACTOR_ROLE,
        remarks: r.REMARKS || undefined,
        createdAt: new Date(r.CREATED_AT),
      }));
    } finally {
      if (!connection) await conn.close();
    }
  }

  async recordInstallation(data: Omit<InstallationRecord, 'installationId' | 'installedAt' | 'engineerName'>, conn: oracledb.Connection): Promise<string> {
    const installationId = crypto.randomUUID();
    await conn.execute(
      `INSERT INTO REPLACEMENT_INSTALLATIONS (
         INSTALLATION_ID, REPLACEMENT_ID, REQUEST_ID, HANDOVER_ID, PART_ID, INSTALLED_PART_CODE,
         CAPTURE_METHOD, SERIAL_NUMBER, ENGINEER_ID, INSTALLED_AT, REMARKS
       ) VALUES (
         :installationId, :replacementId, :requestId, :handoverId, :partId, :installedPartCode,
         :captureMethod, :serialNumber, :engineerId, SYSTIMESTAMP, :remarks
       )`,
      {
        installationId,
        replacementId: data.replacementId,
        requestId: data.requestId,
        handoverId: data.handoverId || null,
        partId: data.partId,
        installedPartCode: data.installedPartCode.slice(0, 100),
        captureMethod: data.captureMethod || null,
        serialNumber: data.serialNumber ? data.serialNumber.slice(0, 100) : null,
        engineerId: data.engineerId,
        remarks: data.remarks ? data.remarks.slice(0, 1000) : null,
      }
    );
    return installationId;
  }

  async findInstallation(replacementId: string, connection?: oracledb.Connection): Promise<InstallationRecord | null> {
    const conn = connection || (await getOracleConnection());
    try {
      const res = await conn.execute<any>(
        `SELECT i.INSTALLATION_ID, i.REPLACEMENT_ID, i.REQUEST_ID, i.HANDOVER_ID, i.PART_ID, i.INSTALLED_PART_CODE,
                i.CAPTURE_METHOD, i.SERIAL_NUMBER, i.ENGINEER_ID, u.FULL_NAME AS ENGINEER_NAME, i.INSTALLED_AT, i.REMARKS
           FROM REPLACEMENT_INSTALLATIONS i
           LEFT JOIN APP_USERS u ON u.USER_ID = i.ENGINEER_ID
          WHERE i.REPLACEMENT_ID = :replacementId`,
        { replacementId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const r = res.rows?.[0];
      if (!r) return null;
      return {
        installationId: r.INSTALLATION_ID,
        replacementId: r.REPLACEMENT_ID,
        requestId: r.REQUEST_ID,
        handoverId: r.HANDOVER_ID || undefined,
        partId: r.PART_ID,
        installedPartCode: r.INSTALLED_PART_CODE,
        captureMethod: r.CAPTURE_METHOD || undefined,
        serialNumber: r.SERIAL_NUMBER || undefined,
        engineerId: r.ENGINEER_ID,
        engineerName: r.ENGINEER_NAME || undefined,
        installedAt: new Date(r.INSTALLED_AT),
        remarks: r.REMARKS || undefined,
      };
    } finally {
      if (!connection) await conn.close();
    }
  }
}

export const replacementCustodyRepository = new ReplacementCustodyRepository();
