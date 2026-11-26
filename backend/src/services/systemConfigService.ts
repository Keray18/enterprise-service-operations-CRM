import { getOracleConnection } from '../database/oraclePool.js';
import { systemConfigRepository, SystemConfigRecord } from '../database/repositories/systemConfigRepository.js';
import { systemAuditRepository } from '../database/repositories/systemAuditRepository.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuditContext } from '../types/accounts.js';
import { AuthenticatedUser } from '../types/auth.js';

/**
 * Provider-level configuration managed by SUPER_ADMIN.
 *
 * Only keys listed here are editable, and each has a real runtime effect:
 *  - security.*                 -> enforced by AuthService on login / session creation
 *  - notifications.max_retries  -> used by the notification outbox retry worker
 *  - app.maintenance_mode       -> blocks client (non-provider) sign-in and API access
 * Any other key (e.g. notifications.sms_provider) is displayed read-only because the
 * application does not switch behaviour on it.
 */
type ConfigRule =
  | { type: 'int'; min: number; max: number }
  | { type: 'boolean' };

export const EDITABLE_CONFIG_RULES: Record<string, ConfigRule> = {
  'security.max_failed_logins': { type: 'int', min: 3, max: 10 },
  'security.lockout_minutes': { type: 'int', min: 5, max: 1440 },
  'security.session_timeout_minutes': { type: 'int', min: 30, max: 1440 },
  'notifications.max_retries': { type: 'int', min: 1, max: 10 },
  'app.maintenance_mode': { type: 'boolean' },
};

export interface RuntimeSecurityPolicy {
  maxFailedLogins: number;
  lockoutMinutes: number;
  sessionTimeoutMinutes: number;
}

const DEFAULTS: Record<string, string> = {
  'security.max_failed_logins': '5',
  'security.lockout_minutes': '15',
  'security.session_timeout_minutes': '480',
  'notifications.max_retries': '3',
  'app.maintenance_mode': 'false',
};

const CACHE_TTL_MS = 15_000;

export class SystemConfigService {
  private cache: { values: Map<string, string>; loadedAt: number } | null = null;

  invalidateCache(): void {
    this.cache = null;
  }

  private async loadValues(): Promise<Map<string, string>> {
    if (this.cache && Date.now() - this.cache.loadedAt < CACHE_TTL_MS) {
      return this.cache.values;
    }
    const values = new Map<string, string>();
    try {
      const rows = await systemConfigRepository.listAll();
      rows.forEach((r) => values.set(r.configKey, r.configValue));
    } catch {
      // Configuration store unreachable: fall back to the documented defaults.
    }
    this.cache = { values, loadedAt: Date.now() };
    return values;
  }

  private parseInt(values: Map<string, string>, key: string): number {
    const rule = EDITABLE_CONFIG_RULES[key] as { type: 'int'; min: number; max: number };
    const raw = Number.parseInt(values.get(key) ?? DEFAULTS[key]!, 10);
    if (!Number.isFinite(raw) || raw < rule.min || raw > rule.max) {
      return Number.parseInt(DEFAULTS[key]!, 10);
    }
    return raw;
  }

  async getSecurityPolicy(): Promise<RuntimeSecurityPolicy> {
    const values = await this.loadValues();
    return {
      maxFailedLogins: this.parseInt(values, 'security.max_failed_logins'),
      lockoutMinutes: this.parseInt(values, 'security.lockout_minutes'),
      sessionTimeoutMinutes: this.parseInt(values, 'security.session_timeout_minutes'),
    };
  }

  async getNotificationMaxRetries(): Promise<number> {
    const values = await this.loadValues();
    return this.parseInt(values, 'notifications.max_retries');
  }

  async isMaintenanceMode(): Promise<boolean> {
    const values = await this.loadValues();
    return (values.get('app.maintenance_mode') ?? 'false') === 'true';
  }

  async listForProvider(): Promise<Array<SystemConfigRecord & { editable: boolean; rule?: ConfigRule }>> {
    const rows = await systemConfigRepository.listAll();
    return rows.map((r) => ({
      ...r,
      configValue: r.isSensitive === 'Y' ? '********' : r.configValue,
      editable: r.isSensitive !== 'Y' && Boolean(EDITABLE_CONFIG_RULES[r.configKey]),
      rule: EDITABLE_CONFIG_RULES[r.configKey],
    }));
  }

  async updateValue(
    configKey: string,
    rawValue: string,
    actor: AuthenticatedUser,
    context: AuditContext = {}
  ): Promise<SystemConfigRecord> {
    const rule = EDITABLE_CONFIG_RULES[configKey];
    if (!rule) {
      throw new AppError(`Configuration key '${configKey}' is not provider-editable.`, 400, 'CONFIG_KEY_NOT_EDITABLE');
    }
    const value = String(rawValue).trim();
    if (rule.type === 'int') {
      if (!/^\d+$/.test(value)) {
        throw new AppError(`'${configKey}' must be a whole number.`, 400, 'INVALID_CONFIG_VALUE');
      }
      const n = Number.parseInt(value, 10);
      if (n < rule.min || n > rule.max) {
        throw new AppError(`'${configKey}' must be between ${rule.min} and ${rule.max}.`, 400, 'INVALID_CONFIG_VALUE');
      }
    } else if (value !== 'true' && value !== 'false') {
      throw new AppError(`'${configKey}' must be 'true' or 'false'.`, 400, 'INVALID_CONFIG_VALUE');
    }

    const conn = await getOracleConnection();
    try {
      const existing = await systemConfigRepository.findByKey(configKey, conn);
      if (!existing) {
        throw new AppError(`Configuration key '${configKey}' not found.`, 404, 'CONFIG_KEY_NOT_FOUND');
      }
      if (existing.isSensitive === 'Y') {
        throw new AppError('Sensitive configuration cannot be edited through the application.', 403, 'CONFIG_SENSITIVE');
      }
      await systemConfigRepository.updateValue(configKey, value, actor.username, conn);
      await systemAuditRepository.recordEvent(
        {
          actorId: actor.userId,
          actorRole: 'SUPER_ADMIN',
          actorUsername: actor.username,
          action: 'CONFIG_UPDATE',
          resource: 'SYSTEM_CONFIG',
          recordIdentifier: configKey,
          outcome: 'SUCCESS',
          correlationId: context.correlationId,
          changes: { from: existing.configValue, to: value },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        conn
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.close();
    }
    this.invalidateCache();
    return (await systemConfigRepository.findByKey(configKey))!;
  }
}

export const systemConfigService = new SystemConfigService();
