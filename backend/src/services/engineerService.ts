import { AuthenticatedUser } from '../types/auth.js';
import { EngineerJobsParams, EngineerKpisRecord } from '../types/engineer.js';
import { serviceRequestRepository } from '../database/repositories/serviceRequestRepository.js';
import { logger } from '../logging/logger.js';

export class EngineerService {
  async getDashboardKpis(actor: AuthenticatedUser): Promise<EngineerKpisRecord> {
    logger.debug(`[ENGINEER SERVICE] Fetching KPIs for technician ${actor.username} (${actor.userId})`);
    return serviceRequestRepository.getEngineerKpis(actor.userId);
  }

  async getMyJobs(actor: AuthenticatedUser, params: EngineerJobsParams) {
    logger.debug(
      `[ENGINEER SERVICE] Querying assigned jobs for technician ${actor.username} (${actor.userId}) with tab=${params.tab || 'today'}`
    );
    return serviceRequestRepository.findEngineerJobs(actor.userId, params);
  }
}

export const engineerService = new EngineerService();

