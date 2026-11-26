import { systemAuditRepository } from '../database/repositories/systemAuditRepository.js';
import {
  CreateSystemAuditInput,
  SystemAuditQueryOptions,
  SystemAuditRecord,
} from '../types/systemAudit.js';

export class SystemAuditService {
  async recordEvent(input: CreateSystemAuditInput): Promise<string> {
    return systemAuditRepository.recordEvent(input);
  }

  async getAuditLogs(options: SystemAuditQueryOptions = {}): Promise<{
    logs: SystemAuditRecord[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(200, Math.max(1, options.limit || 50));

    const [logs, total] = await Promise.all([
      systemAuditRepository.queryLogs({ ...options, page, limit }),
      systemAuditRepository.countLogs(options),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getAuditStats() {
    return systemAuditRepository.getAuditStats();
  }

  async exportLogsToCsv(
    options: SystemAuditQueryOptions,
    actor: { userId: string; username: string; role?: string },
    ipAddress?: string,
    userAgent?: string
  ): Promise<string> {
    // Audit the export action itself!
    await this.recordEvent({
      actorId: actor.userId,
      actorRole: actor.role || 'SUPER_ADMIN',
      actorUsername: actor.username,
      action: 'AUDIT_EXPORT',
      resource: 'SYSTEM_AUDIT_LOGS',
      outcome: 'SUCCESS',
      recordIdentifier: `EXPORT_${Date.now()}`,
      justification: 'Compliance audit log export requested',
      ipAddress,
      userAgent,
      changes: { filterOptions: options },
    });

    const logs = await systemAuditRepository.queryLogs({
      ...options,
      page: 1,
      limit: 1000, // Export up to 1000 records
    });

    const headers = [
      'Event ID',
      'Timestamp',
      'Actor Username',
      'Actor Role',
      'Action',
      'Resource',
      'Record Identifier',
      'Outcome',
      'Correlation ID',
      'IP Address',
      'User Agent',
      'Changes / Details',
    ];

    const sanitizeForCsv = (val: any): string => {
      if (val === null || val === undefined) return '""';
      let str = String(val);
      // CWE-1236: Prevent CSV Formula Injection
      // Neutralize formulas by prepending single quote if value begins with =, +, -, @, \t, \r
      if (/^[\s]*[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const rows = logs.map((log) => [
      sanitizeForCsv(log.eventId),
      sanitizeForCsv(log.createdAt.toISOString()),
      sanitizeForCsv(log.actorUsername),
      sanitizeForCsv(log.actorRole),
      sanitizeForCsv(log.action),
      sanitizeForCsv(log.resource),
      sanitizeForCsv(log.recordIdentifier),
      sanitizeForCsv(log.outcome),
      sanitizeForCsv(log.correlationId),
      sanitizeForCsv(log.ipAddress),
      sanitizeForCsv(log.userAgent),
      sanitizeForCsv(log.changesJson || ''),
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  }
}

export const systemAuditService = new SystemAuditService();
