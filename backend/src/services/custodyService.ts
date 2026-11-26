import { getOracleConnection } from '../database/oraclePool.js';
import { custodyRepository } from '../database/repositories/custodyRepository.js';
import { replacementRequestRepository } from '../database/repositories/replacementRequestRepository.js';
import { serviceRequestRepository } from '../database/repositories/serviceRequestRepository.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedUser } from '../types/auth.js';
import { PartCustodyHandoverRecord } from '../types/custody.js';

export class CustodyService {
  /**
   * ASF manager creates a physical handover record for an assigned field engineer.
   * Handover creation does NOT prove collection. Status begins as PENDING_COLLECTION.
   */
  async createHandover(
    input: {
      replacementId: string;
      partId: string;
      engineerId: string;
      remarks?: string;
    },
    actor: AuthenticatedUser
  ): Promise<PartCustodyHandoverRecord> {
    const isAsf = actor.roles.includes('ASF');
    const isAdmin = actor.roles.includes('ADMIN');
    if (!isAsf && !isAdmin) {
      throw new AppError('Forbidden: Only ASF managers or administrators can initiate custody handover', 403, 'FORBIDDEN');
    }

    const rep = await replacementRequestRepository.findById(input.replacementId);
    if (!rep) {
      throw new AppError(`Replacement request ${input.replacementId} not found`, 404, 'NOT_FOUND');
    }

    // Cross-ASF check: caller's location must match the responsible ASF location
    const serviceReq = await serviceRequestRepository.findById(rep.requestId);
    const responsibleLocationId = serviceReq?.assignedLocationId || rep.allocatedLocationId;
    if (isAsf && !isAdmin) {
      if (actor.locationId && responsibleLocationId && actor.locationId !== responsibleLocationId) {
        throw new AppError('Forbidden: Cross-ASF access rejected. You can only hand over parts at your assigned ASF center.', 403, 'CROSS_ASF_FORBIDDEN');
      }
    }

    const asfLocationId = rep.allocatedLocationId || actor.locationId;
    if (!asfLocationId) {
      throw new AppError('ASF location must be assigned to replacement before part handover', 400, 'LOCATION_REQUIRED');
    }

    const conn = await getOracleConnection();
    try {
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

      // Advance replacement status to RECEIVED_AT_ASF if currently prior
      if (rep.status === 'OPEN' || rep.status === 'STOCK_RESERVED' || rep.status === 'DISPATCHED_TO_ASF') {
        await replacementRequestRepository.updateStatus(input.replacementId, 'RECEIVED_AT_ASF', conn);
      }

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
   * Field engineer physically acknowledges receipt and collection of the spare part.
   * STRICT GUARD: ONLY the assigned engineer can acknowledge collection.
   * Wrong engineer or administrator override is strictly rejected.
   */
  async acknowledgeCollection(
    handoverId: string,
    remarks: string | undefined,
    actor: AuthenticatedUser
  ): Promise<PartCustodyHandoverRecord> {
    const handover = await custodyRepository.findById(handoverId);
    if (!handover) {
      throw new AppError(`Custody handover record ${handoverId} not found`, 404, 'NOT_FOUND');
    }

    // Strict identity guard: actor MUST be the designated engineer
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
      const updated = await custodyRepository.acknowledgeCollection(handoverId, actor.userId, remarks, conn);

      // Advance replacement status to HANDED_OVER_TO_ENGINEER
      await replacementRequestRepository.updateStatus(handover.replacementId, 'HANDED_OVER_TO_ENGINEER', conn);

      await conn.commit();
      return updated;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Marks handover part as INSTALLED following verified customer installation.
   */
  async markInstalled(
    handoverId: string,
    actor: AuthenticatedUser
  ): Promise<void> {
    const handover = await custodyRepository.findById(handoverId);
    if (!handover) {
      throw new AppError(`Custody handover record ${handoverId} not found`, 404, 'NOT_FOUND');
    }

    if (handover.engineerId !== actor.userId && !actor.roles.includes('ADMIN')) {
      throw new AppError('Forbidden: Only the collecting engineer can mark part installed.', 403, 'FORBIDDEN');
    }

    if (handover.status !== 'COLLECTED') {
      throw new AppError(`Part must be in 'COLLECTED' status to mark installed (current: '${handover.status}')`, 400, 'INVALID_STATUS');
    }

    const conn = await getOracleConnection();
    try {
      await custodyRepository.markInstalled(handoverId, handover.engineerId, conn);
      await conn.commit();
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
