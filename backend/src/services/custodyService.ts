import { getOracleConnection } from '../database/oraclePool.js';
import { custodyRepository } from '../database/repositories/custodyRepository.js';
import { replacementCustodyRepository } from '../database/repositories/replacementCustodyRepository.js';
import { replacementRequestRepository } from '../database/repositories/replacementRequestRepository.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedUser } from '../types/auth.js';
import { PartCustodyHandoverRecord } from '../types/custody.js';
import { assertBarcodeMatchesPart, BarcodeCapture } from './barcodeVerificationService.js';
import { replacementService } from './replacementService.js';

/**
 * ASF -> engineer physical handover. The ASF initiates the handover (PENDING_COLLECTION, which does
 * not prove collection); only the designated engineer completes it by scanning the unit.
 */
export class CustodyService {
  async createHandover(
    input: { replacementId: string; partId: string; engineerId: string; remarks?: string },
    actor: AuthenticatedUser
  ): Promise<PartCustodyHandoverRecord> {
    const conn = await getOracleConnection();
    try {
      const rep = await replacementService.requireLocked(input.replacementId, conn);
      replacementService.assertAsfOwnership(actor, rep, 'hand over the replacement unit', 'CROSS_ASF_FORBIDDEN');

      if (!['RECEIVED_AT_ASF', 'APPOINTMENT_SCHEDULED'].includes(rep.status)) {
        throw new AppError(
          `Handover requires the Service Center to have acknowledged receipt of the unit (current status '${rep.status}').`,
          400,
          'INVALID_CUSTODY_TRANSITION'
        );
      }
      if (!rep.requiredPartId || input.partId !== rep.requiredPartId) {
        throw new AppError('Wrong part: the handover part does not match the part required for this replacement.', 409, 'WRONG_PART');
      }
      if (rep.status === 'APPOINTMENT_SCHEDULED' && rep.assignedEngineerId && rep.assignedEngineerId !== input.engineerId) {
        throw new AppError('The unit must be handed to the engineer assigned to the scheduled installation.', 409, 'ENGINEER_CUSTODY_MISMATCH');
      }
      await replacementService.assertActiveEngineer(input.engineerId);

      const existing = await custodyRepository.findByReplacementId(input.replacementId, conn);
      if (existing.some((h) => h.status === 'PENDING_COLLECTION' || h.status === 'COLLECTED' || h.status === 'INSTALLED')) {
        throw new AppError('This replacement unit already has an active custody handover.', 409, 'DUPLICATE_HANDOVER');
      }

      const asfLocationId = rep.assignedLocationId || rep.allocatedLocationId!;
      const handover = await custodyRepository.createHandover(
        {
          replacementId: input.replacementId,
          partId: input.partId,
          asfLocationId,
          engineerId: input.engineerId,
          handedOverBy: actor.userId,
          remarks: input.remarks,
        },
        conn
      );
      await replacementCustodyRepository.recordEvent(
        {
          replacementId: input.replacementId,
          handoverId: handover.handoverId,
          partId: input.partId,
          eventType: 'ENGINEER_HANDOVER_INITIATED',
          custodianType: 'ASF',
          locationId: asfLocationId,
          custodianUserId: input.engineerId,
          actorId: actor.userId,
          actorRole: actor.roles[0] || 'ASF',
          remarks: input.remarks,
        },
        conn
      );
      await conn.commit();
      return handover;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Designated engineer acknowledges physical collection by scanning the unit.
   * Wrong engineer, wrong barcode or a non-pending handover are rejected with no state change.
   */
  async acknowledgeCollection(
    handoverId: string,
    remarks: string | undefined,
    actor: AuthenticatedUser,
    capture?: Partial<BarcodeCapture>
  ): Promise<PartCustodyHandoverRecord> {
    const handover = await custodyRepository.findById(handoverId);
    if (!handover) {
      throw new AppError(`Custody handover record ${handoverId} not found`, 404, 'NOT_FOUND');
    }
    if (handover.engineerId !== actor.userId) {
      throw new AppError(
        'Forbidden: Only the specifically designated field engineer can physically acknowledge collection of this part.',
        403,
        'WRONG_ENGINEER_COLLECTION'
      );
    }
    if (handover.collectionAcknowledged === 'Y' || handover.status !== 'PENDING_COLLECTION') {
      throw new AppError('Part collection has already been acknowledged for this handover.', 409, 'ALREADY_ACKNOWLEDGED');
    }

    const conn = await getOracleConnection();
    try {
      const rep = await replacementService.requireLocked(handover.replacementId, conn);
      if (!['RECEIVED_AT_ASF', 'APPOINTMENT_SCHEDULED'].includes(rep.status)) {
        throw new AppError(`Collection is not possible in replacement status '${rep.status}'.`, 400, 'INVALID_CUSTODY_TRANSITION');
      }
      const scan = await assertBarcodeMatchesPart(
        handover.partId,
        capture?.barcode ? { barcode: capture.barcode, captureMethod: capture.captureMethod } : undefined,
        { stage: 'engineer collection', replacementId: handover.replacementId, actor },
        conn
      );
      const updated = await custodyRepository.acknowledgeCollection(handoverId, actor.userId, remarks, conn);
      await replacementRequestRepository.updateStatus(handover.replacementId, 'HANDED_OVER_TO_ENGINEER', conn);
      await replacementCustodyRepository.recordEvent(
        {
          replacementId: handover.replacementId,
          handoverId,
          partId: handover.partId,
          eventType: 'ENGINEER_COLLECTION',
          custodianType: 'ENGINEER',
          locationId: handover.asfLocationId,
          custodianUserId: actor.userId,
          scannedBarcode: scan.barcode,
          captureMethod: scan.captureMethod,
          actorId: actor.userId,
          actorRole: 'ENGINEER',
          remarks,
        },
        conn
      );
      await conn.commit();
      return updated;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  async getHandoversForReplacement(replacementId: string): Promise<PartCustodyHandoverRecord[]> {
    return custodyRepository.findByReplacementId(replacementId);
  }
}

export const custodyService = new CustodyService();
