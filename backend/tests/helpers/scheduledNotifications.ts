import { expect } from 'vitest';
import { getOracleConnection } from '../../src/database/oraclePool.js';
import { notificationRepository } from '../../src/database/repositories/notificationRepository.js';
import { notificationService } from '../../src/services/notificationService.js';

/**
 * Arrival Happy Code SMS are scheduled for (appointment - 60 minutes) by approved policy.
 * Tests that need the delivered message simulate the clock reaching the scheduled time by moving
 * SCHEDULED_FOR into the past for that single outbox row, then run the real dispatcher on it.
 */
export async function findQueuedNotification(requestId: string, templateCode: string) {
  const listed = await notificationRepository.listByRequestId(requestId);
  const row = listed.find((n) => n.templateCode === templateCode && (n.status === 'QUEUED' || n.status === 'FAILED'));
  return row ? notificationRepository.findById(row.notificationId) : null;
}

export async function deliverScheduledNotification(
  requestId: string,
  templateCode: string,
  options: { expectedAppointment?: Date } = {}
) {
  const queued = await findQueuedNotification(requestId, templateCode);
  expect(queued).toBeTruthy();
  if (options.expectedAppointment) {
    expect(queued!.scheduledFor).toBeDefined();
    const expected = options.expectedAppointment.getTime() - 60 * 60 * 1000;
    expect(Math.abs(queued!.scheduledFor!.getTime() - expected)).toBeLessThan(5000);
  }
  const conn = await getOracleConnection();
  try {
    await conn.execute(
      `UPDATE NOTIFICATIONS_OUTBOX SET SCHEDULED_FOR = SYSTIMESTAMP - INTERVAL '1' SECOND WHERE NOTIFICATION_ID = :id`,
      { id: queued!.notificationId },
      { autoCommit: true }
    );
  } finally {
    await conn.close();
  }
  const due = await notificationRepository.findById(queued!.notificationId);
  await notificationService.processNotification(due!);
  return notificationRepository.findById(queued!.notificationId);
}
