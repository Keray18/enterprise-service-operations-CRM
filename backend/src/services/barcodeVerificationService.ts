import oracledb from 'oracledb';
import { getOracleConnection } from '../database/oraclePool.js';
import { systemAuditRepository } from '../database/repositories/systemAuditRepository.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedUser } from '../types/auth.js';

export type CaptureMethod = 'SCANNER' | 'MANUAL';

export interface BarcodeCapture {
  barcode: string;
  captureMethod?: CaptureMethod;
}

/**
 * Normalises scanner / keyboard input: scanners commonly append CR/LF or tabs, and manual entry may
 * include stray spaces. Comparison is case-insensitive because part codes are stored upper-case.
 */
export function normalizeBarcode(raw: string): string {
  return String(raw || '')
    .replace(/[\r\n\t]/g, '')
    .trim()
    .toUpperCase();
}

/**
 * Validates a captured barcode against existing part master data (PART_CODES.PART_CODE or
 * VENDOR_PART_CODE) of the *specific* part required for the replacement. Part codes repeat across
 * brands, so matching is always against the required PART_ID, never a global code lookup.
 *
 * On mismatch nothing is written to custody or inventory; a FAILURE audit event is recorded and a
 * clear operational error is returned.
 */
export async function assertBarcodeMatchesPart(
  partId: string,
  capture: BarcodeCapture | undefined,
  context: { stage: string; replacementId: string; actor: AuthenticatedUser },
  conn?: oracledb.Connection
): Promise<{ barcode: string; captureMethod: CaptureMethod; partCode: string }> {
  const scanned = normalizeBarcode(capture?.barcode || '');
  if (!scanned) {
    throw new AppError(
      `Scan or enter the part barcode to confirm the physical unit at ${context.stage}.`,
      400,
      'BARCODE_REQUIRED'
    );
  }
  if (scanned.length > 100 || !/^[A-Z0-9._\-/]+$/.test(scanned)) {
    throw new AppError('Barcode contains unsupported characters.', 400, 'BARCODE_INVALID_FORMAT');
  }

  const connection = conn || (await getOracleConnection());
  let part: { PART_CODE: string; VENDOR_PART_CODE: string | null; PART_NAME: string } | undefined;
  try {
    const res = await connection.execute<any>(
      `SELECT PART_CODE, VENDOR_PART_CODE, PART_NAME FROM PART_CODES WHERE PART_ID = :partId`,
      { partId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    part = res.rows?.[0];
  } finally {
    if (!conn) await connection.close();
  }
  if (!part) {
    throw new AppError('The replacement has no valid part in master data; barcode cannot be verified.', 400, 'PART_MASTER_MISSING');
  }

  const accepted = [part.PART_CODE, part.VENDOR_PART_CODE].filter(Boolean).map((c) => normalizeBarcode(String(c)));
  if (!accepted.includes(scanned)) {
    await systemAuditRepository.recordEvent({
      actorId: context.actor.userId,
      actorRole: context.actor.roles[0] || null,
      actorUsername: context.actor.username,
      action: 'BARCODE_MISMATCH',
      resource: 'REPLACEMENT_REQUESTS',
      recordIdentifier: context.replacementId,
      outcome: 'FAILURE',
      justification: `Scanned ${scanned} at ${context.stage}; expected ${part.PART_CODE}`,
    });
    throw new AppError(
      `Barcode mismatch at ${context.stage}: scanned '${scanned}' does not match the required part ${part.PART_CODE} (${part.PART_NAME}). No custody or stock movement was recorded.`,
      409,
      'BARCODE_MISMATCH',
      { expectedPartCode: part.PART_CODE, scanned }
    );
  }

  return {
    barcode: scanned,
    captureMethod: capture?.captureMethod === 'SCANNER' ? 'SCANNER' : 'MANUAL',
    partCode: part.PART_CODE,
  };
}
