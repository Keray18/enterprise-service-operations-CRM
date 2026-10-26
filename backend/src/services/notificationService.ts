import { logger } from '../logging/logger.js';
import { notificationRepository } from '../database/repositories/notificationRepository.js';
import { NotificationOutboxRecord } from '../types/callCenter.js';
import { decryptNotificationPayload } from '../utils/cryptoUtils.js';

export interface SmsProviderResponse {
  success: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}

/**
 * Interface for SMS Gateway Adapters.
 * In local/dev/test environments, uses MockSmsAdapter.
 * In production, integrates with DLT-compliant Indian telecom gateways (e.g. Gupshup, ValueFirst, Airtel IQ).
 */
export interface ISmsAdapter {
  sendSms(recipient: string, messageBody: string, templateCode: string): Promise<SmsProviderResponse>;
}

export class MockSmsAdapter implements ISmsAdapter {
  private sentMessages: Array<{ recipient: string; messageBody: string; templateCode: string; timestamp: Date }> = [];
  private failNext = false;
  private alwaysFail = false;

  setFailNext(fail: boolean): void {
    this.failNext = fail;
  }

  setAlwaysFail(fail: boolean): void {
    this.alwaysFail = fail;
  }

  getSentMessages(): Array<{ recipient: string; messageBody: string; templateCode: string; timestamp: Date }> {
    return [...this.sentMessages];
  }

  clear(): void {
    this.sentMessages = [];
    this.failNext = false;
    this.alwaysFail = false;
  }

  async sendSms(recipient: string, messageBody: string, templateCode: string): Promise<SmsProviderResponse> {
    if (this.alwaysFail || this.failNext) {
      this.failNext = false;
      return {
        success: false,
        errorMessage: 'SIMULATED_GATEWAY_TIMEOUT: Mock SMS provider simulated failure',
      };
    }

    const providerMessageId = `MOCK-SMS-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    this.sentMessages.push({
      recipient,
      messageBody,
      templateCode,
      timestamp: new Date(),
    });

    const maskedPhone = recipient.length >= 4 
      ? recipient.slice(0, 2) + '******' + recipient.slice(-2) 
      : '******';

    logger.info(`[SMS ADAPTER] Dispatched ${templateCode} to ${maskedPhone}. ProviderMsgId: ${providerMessageId}`);

    return {
      success: true,
      providerMessageId,
    };
  }
}

export const mockSmsAdapter = new MockSmsAdapter();

export class NotificationService {
  private smsAdapter: ISmsAdapter = mockSmsAdapter;

  /**
   * Generates the approved SMS 1 Complaint Registration template.
   */
  buildSms1Message(jobNumber: string): string {
    return `Dear Customer, We have registered your service request #${jobNumber}. You will receive a call from our service technician soon.`;
  }

  /**
   * Generates the approved SMS 2 Appointment & Check-In OTP template.
   */
  buildSms2Message(params: {
    jobNumber: string;
    techName: string;
    techMobile: string;
    appointmentDatetime: string;
    checkinOtp: string;
  }): string {
    return `Dear Customer, Service Request #${params.jobNumber} has been assigned to ${params.techName} Mob no ${params.techMobile} and your appointment is scheduled for ${params.appointmentDatetime}. Please keep the required documents ready and kindly share the OTP ${params.checkinOtp}, at the time of Visit.`;
  }

  /**
   * Generates the approved SMS 3 Product Replaced template.
   */
  buildSms3Message(params: { jobNumber: string }): string {
    return `Dear Customer, Your product has been replaced against Service Request #${params.jobNumber}. If not satisfied, Please contact us.`;
  }

  /**
   * Generates the approved SMS 4 Call Closure Summary & Happy Code template.
   */
  buildSms4Message(params: { jobNumber: string; happyCode: string }): string {
    return `Dear Customer, Your service Request #${params.jobNumber} is closed. If you are satisfied with our service, Kindly share happy code #${params.happyCode} to our technician.`;
  }

  /**
   * Generates the approved SMS 5 Happy Code Regeneration template.
   */
  buildSms5Message(params: { jobNumber: string; happyCode: string }): string {
    return `Dear Customer, Your happy code is ${params.happyCode} against your service request #${params.jobNumber} please share the same with the service executive.`;
  }

  /**
   * Generates the approved SMS 6 Check-In OTP Regeneration template.
   */
  buildSms6Message(params: { jobNumber: string; checkinOtp: string }): string {
    return `Dear Customer, Please share OTP ${params.checkinOtp} against your service request #${params.jobNumber} at the time of technician visit.`;
  }

  /**
   * Generates the approved SMS 7 Service Request Cancelled template.
   */
  buildSms7Message(params: { jobNumber: string }): string {
    return `Dear Customer, Service Request #${params.jobNumber} has been cancelled. If not satisfied, Please contact us.`;
  }

  /**
   * Generates the approved SMS 8 Replacement Approved template.
   */
  buildSms8Message(params: { jobNumber: string; replacementApprovalNo: string }): string {
    return `Dear Customer, Request for product replacement against Service Request #${params.jobNumber} has been approved. Kindly share replacement approval no. #${params.replacementApprovalNo} at the time of replacement.`;
  }

  /**
   * Asynchronously attempts delivery for an enqueued outbox notification.
   * Gateway errors update the outbox status to FAILED without throwing errors back to caller.
   */
  async processNotification(notification: NotificationOutboxRecord): Promise<void> {
    try {
      if (notification.channel === 'SMS') {
        let textToSend = notification.messageBody;

        if (notification.isEncrypted === 'Y') {
          // Fetch full outbox record to ensure ciphertext, IV, and auth tag are present
          let fullRecord = notification;
          if (!fullRecord.encryptedPayload || !fullRecord.encryptionIv || !fullRecord.authTag) {
            const fetched = await notificationRepository.findById(notification.notificationId);
            if (!fetched) {
              throw new Error(`Notification record ${notification.notificationId} not found in outbox`);
            }
            fullRecord = fetched;
          }

          if (!fullRecord.encryptedPayload || !fullRecord.encryptionIv || !fullRecord.authTag) {
            throw new Error('ENCRYPTED_PAYLOAD_MISSING: Missing ciphertext, IV, or authentication tag in outbox');
          }

          // Authenticated AES-256-GCM decryption
          textToSend = decryptNotificationPayload({
            encryptedPayload: fullRecord.encryptedPayload,
            iv: fullRecord.encryptionIv,
            authTag: fullRecord.authTag,
            keyVersion: fullRecord.keyVersion,
          });
        }

        const res = await this.smsAdapter.sendSms(
          notification.recipient,
          textToSend,
          notification.templateCode
        );

        if (res.success) {
          await notificationRepository.updateStatus(notification.notificationId, 'SENT', {
            providerMessageId: res.providerMessageId,
          });
        } else {
          await notificationRepository.updateStatus(notification.notificationId, 'FAILED', {
            errorMessage: res.errorMessage,
          });
        }
      }
    } catch (err: any) {
      // Do not log the decrypted message or sensitive payload
      logger.error(`[NOTIFICATION PROCESSOR] Failed to dispatch notification ${notification.notificationId}: ${err?.message || err}`);
      try {
        await notificationRepository.updateStatus(notification.notificationId, 'FAILED', {
          errorMessage: err?.message || 'UNKNOWN_DISPATCH_ERROR',
        });
      } catch (dbErr) {
        logger.error(`[NOTIFICATION PROCESSOR] Failed to record notification failure: ${dbErr}`);
      }
    }
  }

  /**
   * Scans and processes pending or failed notifications with retry daemon.
   * If retries reach maxRetries, escalates to DEAD_LETTER for supervisor intervention.
   */
  async retryFailedNotifications(maxRetries = 3): Promise<{
    processedCount: number;
    succeededCount: number;
    failedCount: number;
    escalatedCount: number;
  }> {
    const pending = await notificationRepository.findPendingRetries(maxRetries);
    let succeededCount = 0;
    let failedCount = 0;
    let escalatedCount = 0;

    for (const item of pending) {
      if (item.retryCount >= maxRetries - 1) {
        try {
          await this.processNotification(item);
          const check = await notificationRepository.findById(item.notificationId);
          if (check?.status === 'SENT') {
            succeededCount++;
          } else {
            await notificationRepository.markExhausted(item.notificationId);
            escalatedCount++;
            logger.warn(`[NOTIFICATION DAEMON] Notification ${item.notificationId} exhausted max retries (${maxRetries}). Escalated to dead-letter.`);
          }
        } catch {
          await notificationRepository.markExhausted(item.notificationId);
          escalatedCount++;
        }
      } else {
        try {
          await this.processNotification(item);
          const check = await notificationRepository.findById(item.notificationId);
          if (check?.status === 'SENT') {
            succeededCount++;
          } else {
            failedCount++;
          }
        } catch {
          failedCount++;
        }
      }
    }

    return {
      processedCount: pending.length,
      succeededCount,
      failedCount,
      escalatedCount,
    };
  }

  async getMetrics(): Promise<{
    queued: number;
    sent: number;
    failed: number;
    deadLetter: number;
    total: number;
  }> {
    return notificationRepository.getOutboxMetrics();
  }

  setSmsAdapter(adapter: ISmsAdapter): void {
    this.smsAdapter = adapter;
  }
}

export const notificationService = new NotificationService();
