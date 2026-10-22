import crypto from 'crypto';
import oracledb from 'oracledb';
import { AttachmentType, ServiceRequestAttachmentRecord } from '../../types/job360.js';
import { getOracleConnection } from '../oraclePool.js';

export class AttachmentRepository {
  async createAttachment(
    input: {
      requestId: string;
      attachmentType: AttachmentType;
      fileName: string;
      originalName: string;
      storedPath: string;
      mimeType: string;
      fileSizeBytes: number;
      sha256Checksum?: string;
      uploadedByUserId: string;
      uploadedByUsername: string;
    },
    conn?: oracledb.Connection
  ): Promise<ServiceRequestAttachmentRecord> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    const attachmentId = crypto.randomUUID();

    try {
      const sql = `
        INSERT INTO SERVICE_REQUEST_ATTACHMENTS (
          ATTACHMENT_ID,
          REQUEST_ID,
          ATTACHMENT_TYPE,
          FILE_NAME,
          ORIGINAL_NAME,
          STORED_PATH,
          MIME_TYPE,
          FILE_SIZE_BYTES,
          SHA256_CHECKSUM,
          UPLOADED_BY_USER_ID,
          UPLOADED_BY_USERNAME,
          UPLOADED_AT
        ) VALUES (
          :attachmentId,
          :requestId,
          :attachmentType,
          :fileName,
          :originalName,
          :storedPath,
          :mimeType,
          :fileSizeBytes,
          :sha256Checksum,
          :uploadedByUserId,
          :uploadedByUsername,
          SYSTIMESTAMP
        )
      `;

      await connection.execute(
        sql,
        {
          attachmentId,
          requestId: input.requestId,
          attachmentType: input.attachmentType,
          fileName: input.fileName,
          originalName: input.originalName,
          storedPath: input.storedPath,
          mimeType: input.mimeType,
          fileSizeBytes: input.fileSizeBytes,
          sha256Checksum: input.sha256Checksum || null,
          uploadedByUserId: input.uploadedByUserId,
          uploadedByUsername: input.uploadedByUsername,
        },
        { autoCommit: !isExternalConn }
      );

      return {
        attachmentId,
        requestId: input.requestId,
        attachmentType: input.attachmentType,
        fileName: input.fileName,
        originalName: input.originalName,
        storedPath: input.storedPath,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        sha256Checksum: input.sha256Checksum,
        uploadedByUserId: input.uploadedByUserId,
        uploadedByUsername: input.uploadedByUsername,
        uploadedAt: new Date(),
      };
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async listByRequestId(
    requestId: string,
    conn?: oracledb.Connection
  ): Promise<ServiceRequestAttachmentRecord[]> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const sql = `
        SELECT 
          ATTACHMENT_ID, REQUEST_ID, ATTACHMENT_TYPE, FILE_NAME, 
          ORIGINAL_NAME, STORED_PATH, MIME_TYPE, FILE_SIZE_BYTES, 
          SHA256_CHECKSUM, UPLOADED_BY_USER_ID, UPLOADED_BY_USERNAME, UPLOADED_AT
        FROM SERVICE_REQUEST_ATTACHMENTS
        WHERE REQUEST_ID = :requestId
        ORDER BY UPLOADED_AT DESC
      `;

      const result = await connection.execute<any>(sql, { requestId }, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      return (result.rows || []).map((row) => ({
        attachmentId: row.ATTACHMENT_ID,
        requestId: row.REQUEST_ID,
        attachmentType: row.ATTACHMENT_TYPE as AttachmentType,
        fileName: row.FILE_NAME,
        originalName: row.ORIGINAL_NAME,
        storedPath: row.STORED_PATH,
        mimeType: row.MIME_TYPE,
        fileSizeBytes: Number(row.FILE_SIZE_BYTES),
        sha256Checksum: row.SHA256_CHECKSUM || undefined,
        uploadedByUserId: row.UPLOADED_BY_USER_ID,
        uploadedByUsername: row.UPLOADED_BY_USERNAME,
        uploadedAt: new Date(row.UPLOADED_AT),
      }));
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async findById(
    attachmentId: string,
    conn?: oracledb.Connection
  ): Promise<ServiceRequestAttachmentRecord | null> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const sql = `
        SELECT 
          ATTACHMENT_ID, REQUEST_ID, ATTACHMENT_TYPE, FILE_NAME, 
          ORIGINAL_NAME, STORED_PATH, MIME_TYPE, FILE_SIZE_BYTES, 
          SHA256_CHECKSUM, UPLOADED_BY_USER_ID, UPLOADED_BY_USERNAME, UPLOADED_AT
        FROM SERVICE_REQUEST_ATTACHMENTS
        WHERE ATTACHMENT_ID = :attachmentId
      `;

      const result = await connection.execute<any>(sql, { attachmentId }, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      if (!result.rows || result.rows.length === 0) return null;
      const row = result.rows[0];

      return {
        attachmentId: row.ATTACHMENT_ID,
        requestId: row.REQUEST_ID,
        attachmentType: row.ATTACHMENT_TYPE as AttachmentType,
        fileName: row.FILE_NAME,
        originalName: row.ORIGINAL_NAME,
        storedPath: row.STORED_PATH,
        mimeType: row.MIME_TYPE,
        fileSizeBytes: Number(row.FILE_SIZE_BYTES),
        sha256Checksum: row.SHA256_CHECKSUM || undefined,
        uploadedByUserId: row.UPLOADED_BY_USER_ID,
        uploadedByUsername: row.UPLOADED_BY_USERNAME,
        uploadedAt: new Date(row.UPLOADED_AT),
      };
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async deleteAttachment(attachmentId: string, conn?: oracledb.Connection): Promise<boolean> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());

    try {
      const sql = `
        DELETE FROM SERVICE_REQUEST_ATTACHMENTS
        WHERE ATTACHMENT_ID = :attachmentId
      `;
      const result = await connection.execute(sql, { attachmentId }, { autoCommit: !isExternalConn });
      return (result.rowsAffected || 0) > 0;
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }
}

export const attachmentRepository = new AttachmentRepository();
