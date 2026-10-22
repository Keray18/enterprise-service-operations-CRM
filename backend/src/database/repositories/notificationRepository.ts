import crypto from 'crypto';
import oracledb from 'oracledb';
import { NotificationOutboxRecord } from '../../types/callCenter.js';
import { getOracleConnection } from '../oraclePool.js';

function isOtpTemplate(templateCode: string): boolean {
  return (
    templateCode === 'SMS_02_APPOINTMENT' ||
    templateCode === 'SMS_06_OTP_REGEN' ||
    templateCode === 'SMS_4_CALL_CLOSURE' ||
    templateCode === 'SMS_5_REGENERATE_HAPPY_CODE' ||
    templateCode === 'SMS_04_CLOSURE' ||
    templateCode === 'SMS_05_HAPPY_CODE_REGEN'
  );
}

function mapRowToNotification(row: any, sanitizeForApi = false): NotificationOutboxRecord {
  const isOtp = isOtpTemplate(row.TEMPLATE_CODE);
  let body = row.MESSAGE_BODY;

  if (sanitizeForApi && isOtp) {
    body = '[PROTECTED_OTP_NOTIFICATION]';
  }

  return {
    notificationId: row.NOTIFICATION_ID,
    requestId: row.REQUEST_ID || undefined,
    channel: row.CHANNEL,
    recipient: row.RECIPIENT,
    templateCode: row.TEMPLATE_CODE,
    messageBody: body,
    isEncrypted: row.IS_ENCRYPTED || 'N',
    encryptedPayload: sanitizeForApi ? undefined : (row.ENCRYPTED_PAYLOAD || undefined),
    encryptionIv: sanitizeForApi ? undefined : (row.ENCRYPTION_IV || undefined),
    authTag: sanitizeForApi ? undefined : (row.AUTH_TAG || undefined),
    keyVersion: row.KEY_VERSION || undefined,
    status: row.STATUS,
    providerMessageId: row.PROVIDER_MESSAGE_ID || undefined,
    errorMessage: row.ERROR_MESSAGE || undefined,
    retryCount: Number(row.RETRY_COUNT || 0),
    sentAt: row.SENT_AT ? new Date(row.SENT_AT) : undefined,
    createdAt: new Date(row.CREATED_AT),
  };
}

export class NotificationRepository {
  /**
   * Enqueues a notification into the durable outbox within an open transaction.
   * OTP-bearing messages are stored strictly encrypted (AES-256-GCM) with no plaintext OTP.
   */
  async enqueueNotification(
    input: {
      requestId?: string;
      channel?: 'SMS' | 'EMAIL' | 'WHATSAPP';
      recipient: string;
      templateCode: string;
      messageBody: string;
      isEncrypted?: 'Y' | 'N';
      encryptedPayload?: string;
      encryptionIv?: string;
      authTag?: string;
      keyVersion?: string;
    },
    conn?: oracledb.Connection
  ): Promise<NotificationOutboxRecord> {
    const notificationId = crypto.randomUUID();
    const channel = input.channel || 'SMS';
    const status = 'QUEUED';
    const isEncrypted = input.isEncrypted || 'N';

    const sql = `
      INSERT INTO NOTIFICATIONS_OUTBOX (
        NOTIFICATION_ID,
        REQUEST_ID,
        CHANNEL,
        RECIPIENT,
        TEMPLATE_CODE,
        MESSAGE_BODY,
        IS_ENCRYPTED,
        ENCRYPTED_PAYLOAD,
        ENCRYPTION_IV,
        AUTH_TAG,
        KEY_VERSION,
        STATUS,
        RETRY_COUNT
      ) VALUES (
        :notificationId,
        :requestId,
        :channel,
        :recipient,
        :templateCode,
        :messageBody,
        :isEncrypted,
        :encryptedPayload,
        :encryptionIv,
        :authTag,
        :keyVersion,
        :status,
        0
      )
    `;

    const binds = {
      notificationId,
      requestId: input.requestId || null,
      channel,
      recipient: input.recipient,
      templateCode: input.templateCode,
      messageBody: input.messageBody,
      isEncrypted,
      encryptedPayload: input.encryptedPayload || null,
      encryptionIv: input.encryptionIv || null,
      authTag: input.authTag || null,
      keyVersion: input.keyVersion || null,
      status,
    };

    if (conn) {
      await conn.execute(sql, binds);
    } else {
      const managedConn = await getOracleConnection();
      try {
        await managedConn.execute(sql, binds, { autoCommit: true });
      } finally {
        await managedConn.close();
      }
    }

    return {
      notificationId,
      requestId: input.requestId,
      channel,
      recipient: input.recipient,
      templateCode: input.templateCode,
      messageBody: input.messageBody,
      isEncrypted,
      encryptedPayload: input.encryptedPayload,
      encryptionIv: input.encryptionIv,
      authTag: input.authTag,
      keyVersion: input.keyVersion,
      status,
      retryCount: 0,
      createdAt: new Date(),
    };
  }

  /**
   * Retrieves full notification record including ciphertext for internal delivery pipeline.
   */
  async findById(notificationId: string): Promise<NotificationOutboxRecord | null> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT 
          NOTIFICATION_ID, REQUEST_ID, CHANNEL, RECIPIENT, TEMPLATE_CODE,
          MESSAGE_BODY, IS_ENCRYPTED, ENCRYPTED_PAYLOAD, ENCRYPTION_IV,
          AUTH_TAG, KEY_VERSION, STATUS, PROVIDER_MESSAGE_ID, ERROR_MESSAGE,
          RETRY_COUNT, SENT_AT, CREATED_AT
        FROM NOTIFICATIONS_OUTBOX
        WHERE NOTIFICATION_ID = :notificationId
      `;

      const result = await conn.execute<any>(
        sql,
        { notificationId },
        {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          fetchInfo: { ENCRYPTED_PAYLOAD: { type: oracledb.STRING } },
        }
      );

      if (!result.rows || result.rows.length === 0) {
        return null;
      }

      return mapRowToNotification(result.rows[0], false);
    } finally {
      await conn.close();
    }
  }

  /**
   * Updates dispatch status in the outbox.
   * If delivery succeeds ('SENT') on an encrypted notification, purges ciphertext payload for hygiene.
   */
  async updateStatus(
    notificationId: string,
    status: 'QUEUED' | 'SENT' | 'FAILED',
    options?: {
      providerMessageId?: string;
      errorMessage?: string;
    }
  ): Promise<void> {
    const conn = await getOracleConnection();
    try {
      const isSent = status === 'SENT';

      // For sent notifications: clean up sensitive encrypted payload and mark messageBody purged
      const sql = isSent
        ? `
          UPDATE NOTIFICATIONS_OUTBOX
          SET 
            STATUS = 'SENT',
            PROVIDER_MESSAGE_ID = :providerMessageId,
            ERROR_MESSAGE = NULL,
            SENT_AT = SYSTIMESTAMP,
            ENCRYPTED_PAYLOAD = CASE WHEN IS_ENCRYPTED = 'Y' THEN NULL ELSE ENCRYPTED_PAYLOAD END,
            ENCRYPTION_IV = CASE WHEN IS_ENCRYPTED = 'Y' THEN NULL ELSE ENCRYPTION_IV END,
            AUTH_TAG = CASE WHEN IS_ENCRYPTED = 'Y' THEN NULL ELSE AUTH_TAG END,
            MESSAGE_BODY = CASE WHEN IS_ENCRYPTED = 'Y' THEN '[DELIVERED_AND_PURGED]' ELSE MESSAGE_BODY END
          WHERE NOTIFICATION_ID = :notificationId
        `
        : `
          UPDATE NOTIFICATIONS_OUTBOX
          SET 
            STATUS = :status,
            PROVIDER_MESSAGE_ID = :providerMessageId,
            ERROR_MESSAGE = :errorMessage,
            RETRY_COUNT = RETRY_COUNT + 1
          WHERE NOTIFICATION_ID = :notificationId
        `;

      const binds: Record<string, any> = {
        notificationId,
        providerMessageId: options?.providerMessageId || null,
      };

      if (!isSent) {
        binds.status = status;
        binds.errorMessage = options?.errorMessage || null;
      }

      await conn.execute(sql, binds, { autoCommit: true });
    } finally {
      await conn.close();
    }
  }

  /**
   * Retrieves sanitized notifications for a service request for audit / history APIs.
   * Redacts sensitive OTP payloads and completely strips ciphertext and cryptographic metadata.
   */
  async listByRequestId(requestId: string): Promise<NotificationOutboxRecord[]> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT 
          NOTIFICATION_ID,
          REQUEST_ID,
          CHANNEL,
          RECIPIENT,
          TEMPLATE_CODE,
          MESSAGE_BODY,
          IS_ENCRYPTED,
          STATUS,
          PROVIDER_MESSAGE_ID,
          ERROR_MESSAGE,
          RETRY_COUNT,
          SENT_AT,
          CREATED_AT
        FROM NOTIFICATIONS_OUTBOX
        WHERE REQUEST_ID = :requestId
        ORDER BY CREATED_AT DESC
      `;

      const result = await conn.execute<any>(sql, { requestId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return (result.rows || []).map((row) => mapRowToNotification(row, true));
    } finally {
      await conn.close();
    }
  }
}

export const notificationRepository = new NotificationRepository();
