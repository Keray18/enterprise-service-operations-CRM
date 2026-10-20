import crypto from 'crypto';
import oracledb from 'oracledb';
import { NotificationOutboxRecord } from '../../types/callCenter.js';
import { getOracleConnection } from '../oraclePool.js';

function mapRowToNotification(row: any): NotificationOutboxRecord {
  return {
    notificationId: row.NOTIFICATION_ID,
    requestId: row.REQUEST_ID || undefined,
    channel: row.CHANNEL,
    recipient: row.RECIPIENT,
    templateCode: row.TEMPLATE_CODE,
    messageBody: row.MESSAGE_BODY,
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
   */
  async enqueueNotification(
    input: {
      requestId?: string;
      channel?: 'SMS' | 'EMAIL' | 'WHATSAPP';
      recipient: string;
      templateCode: string;
      messageBody: string;
    },
    conn: oracledb.Connection
  ): Promise<NotificationOutboxRecord> {
    const notificationId = crypto.randomUUID();
    const channel = input.channel || 'SMS';
    const status = 'QUEUED';

    const sql = `
      INSERT INTO NOTIFICATIONS_OUTBOX (
        NOTIFICATION_ID,
        REQUEST_ID,
        CHANNEL,
        RECIPIENT,
        TEMPLATE_CODE,
        MESSAGE_BODY,
        STATUS,
        RETRY_COUNT
      ) VALUES (
        :notificationId,
        :requestId,
        :channel,
        :recipient,
        :templateCode,
        :messageBody,
        :status,
        0
      )
    `;

    await conn.execute(sql, {
      notificationId,
      requestId: input.requestId || null,
      channel,
      recipient: input.recipient,
      templateCode: input.templateCode,
      messageBody: input.messageBody,
      status,
    });

    return {
      notificationId,
      requestId: input.requestId,
      channel,
      recipient: input.recipient,
      templateCode: input.templateCode,
      messageBody: input.messageBody,
      status,
      retryCount: 0,
      createdAt: new Date(),
    };
  }

  /**
   * Updates dispatch status in the outbox.
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
      const sql = `
        UPDATE NOTIFICATIONS_OUTBOX
        SET 
          STATUS = :status,
          PROVIDER_MESSAGE_ID = :providerMessageId,
          ERROR_MESSAGE = :errorMessage,
          SENT_AT = ${isSent ? 'SYSTIMESTAMP' : 'SENT_AT'},
          RETRY_COUNT = RETRY_COUNT + ${status === 'FAILED' ? 1 : 0}
        WHERE NOTIFICATION_ID = :notificationId
      `;

      await conn.execute(
        sql,
        {
          notificationId,
          status,
          providerMessageId: options?.providerMessageId || null,
          errorMessage: options?.errorMessage || null,
        },
        { autoCommit: true }
      );
    } finally {
      await conn.close();
    }
  }

  /**
   * Retrieves notifications by service request ID.
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

      const result = await conn.execute(sql, { requestId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return (result.rows || []).map(mapRowToNotification);
    } finally {
      await conn.close();
    }
  }
}

export const notificationRepository = new NotificationRepository();
