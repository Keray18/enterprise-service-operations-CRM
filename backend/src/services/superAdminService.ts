import fs from 'fs';
import oracledb from 'oracledb';
import path from 'path';
import { env } from '../config/env.js';
import { getAppliedMigrations, loadMigrationFiles } from '../database/migrationRunner.js';
import { checkDatabaseReadiness, getOracleConnection } from '../database/oraclePool.js';
import { systemAuditRepository } from '../database/repositories/systemAuditRepository.js';
import { SystemAuditQueryOptions } from '../types/systemAudit.js';
import { backgroundScheduler } from '../workers/backgroundScheduler.js';

/** Masks a phone/email recipient so provider monitoring never exposes customer contact data. */
export function maskRecipient(recipient: string | null | undefined): string {
  if (!recipient) return '';
  const r = String(recipient);
  if (r.includes('@')) {
    const [name, domain] = r.split('@');
    return `${(name || '').slice(0, 1)}***@${domain}`;
  }
  return r.length > 4 ? `${r.slice(0, 2)}******${r.slice(-2)}` : '******';
}

/** Strips anything that could carry a secret (credentials, connect strings, payloads) from error text. */
function sanitizeError(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  return String(text)
    .replace(/password\s*[=:]\s*\S+/gi, 'password=[REDACTED]')
    .replace(/\b\d{6}\b/g, '[CODE]')
    .slice(0, 300);
}

function resolveMigrationsDir(): string | null {
  const candidates = [path.resolve(process.cwd(), 'database/migrations'), path.resolve(process.cwd(), '../database/migrations')];
  return candidates.find((c) => fs.existsSync(c)) || null;
}

export class SuperAdminService {
  /**
   * Application, database, worker and notification health in one provider view.
   * No credentials, connect strings or encryption material are included.
   */
  async getHealth() {
    const db = await checkDatabaseReadiness();
    const mem = process.memoryUsage();

    let migrations: { applied: number; pending: number; failed: number; missingSource: string[]; checksumMismatches: string[] } | null = null;
    let schemaError: string | undefined;
    if (db.isReady) {
      try {
        const dir = resolveMigrationsDir();
        const files = dir ? loadMigrationFiles(dir) : [];
        const conn = await getOracleConnection();
        try {
          const applied = await getAppliedMigrations(conn);
          const appliedMap = new Map(applied.map((a) => [a.version, a]));
          const fileVersions = new Set(files.map((f) => f.version));
          migrations = {
            applied: applied.filter((a) => a.success === 'Y').length,
            failed: applied.filter((a) => a.success !== 'Y').length,
            pending: files.filter((f) => !appliedMap.has(f.version)).length,
            missingSource: applied.filter((a) => !fileVersions.has(a.version)).map((a) => `V${a.version}`),
            checksumMismatches: files
              .filter((f) => appliedMap.has(f.version) && appliedMap.get(f.version)!.checksum !== f.checksum)
              .map((f) => `V${f.version}`),
          };
        } finally {
          await conn.close();
        }
      } catch (err) {
        schemaError = err instanceof Error ? err.message.slice(0, 200) : 'Schema history unavailable';
      }
    }

    const stats = backgroundScheduler.stats;
    const workerView = (key: 'sla48h' | 'sla168h' | 'notifRetry', label: string) => {
      const s = stats[key];
      const intervalMs = backgroundScheduler.activeIntervalsMs?.[key];
      const staleAfterMs = intervalMs ? intervalMs * 3 : undefined;
      let state: 'NOT_RUNNING' | 'HEALTHY' | 'DEGRADED' | 'STALE' = 'NOT_RUNNING';
      if (backgroundScheduler.startedAt) {
        state = 'HEALTHY';
        if (s.lastErrorAt && (!s.lastSuccessAt || s.lastErrorAt > s.lastSuccessAt)) state = 'DEGRADED';
        const lastActivity = s.lastRunAt || backgroundScheduler.startedAt;
        if (staleAfterMs && Date.now() - lastActivity.getTime() > staleAfterMs) state = 'STALE';
      }
      return {
        key,
        label,
        state,
        intervalMs: intervalMs ?? null,
        totalRuns: s.totalRuns,
        itemsProcessed: s.itemsProcessed,
        lastRunAt: s.lastRunAt ?? null,
        lastSuccessAt: s.lastSuccessAt ?? null,
        lastErrorAt: s.lastErrorAt ?? null,
        lastErrorMessage: sanitizeError(s.lastErrorMessage) ?? null,
      };
    };

    return {
      application: {
        status: 'UP',
        environment: env.NODE_ENV,
        nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime()),
        memory: {
          rssMb: Math.round(mem.rss / 1048576),
          heapUsedMb: Math.round(mem.heapUsed / 1048576),
          heapTotalMb: Math.round(mem.heapTotal / 1048576),
        },
        checkedAt: new Date().toISOString(),
      },
      database: {
        connected: db.isReady,
        latencyMs: db.latencyMs ?? null,
        error: db.isReady ? undefined : 'Database connectivity check failed',
        pool: db.isReady
          ? {
              connectionsOpen: db.details?.poolConnectionsOpen ?? null,
              connectionsInUse: db.details?.poolConnectionsInUse ?? null,
              poolMax: env.ORACLE_POOL_MAX,
            }
          : null,
        migrations,
        schemaError,
      },
      workers: {
        schedulerStartedAt: backgroundScheduler.startedAt ?? null,
        jobs: [
          workerView('sla48h', '48h acknowledgement SLA evaluator'),
          workerView('sla168h', '168h closure SLA evaluator'),
          workerView('notifRetry', 'Notification outbox dispatcher & retry'),
        ],
      },
      notifications: db.isReady ? await this.getNotificationSummary() : null,
    };
  }

  async getNotificationSummary() {
    const conn = await getOracleConnection();
    try {
      const byStatus = await conn.execute<any>(
        `SELECT STATUS, COUNT(*) AS C FROM NOTIFICATIONS_OUTBOX GROUP BY STATUS`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const counts: Record<string, number> = {};
      (byStatus.rows || []).forEach((r: any) => (counts[String(r.STATUS)] = Number(r.C)));

      const backlogRes = await conn.execute<any>(
        `SELECT
            COUNT(CASE WHEN STATUS IN ('QUEUED','FAILED') AND (SCHEDULED_FOR IS NULL OR SCHEDULED_FOR <= SYSTIMESTAMP)
                        AND (NEXT_RETRY_AT IS NULL OR NEXT_RETRY_AT <= SYSTIMESTAMP) THEN 1 END) AS DUE_NOW,
            COUNT(CASE WHEN STATUS = 'QUEUED' AND SCHEDULED_FOR > SYSTIMESTAMP THEN 1 END) AS SCHEDULED_FUTURE,
            COUNT(CASE WHEN STATUS IN ('FAILED','DEAD_LETTER') AND UPDATED_AT >= SYSTIMESTAMP - INTERVAL '1' DAY THEN 1 END) AS FAILURES_24H,
            COUNT(CASE WHEN STATUS = 'PROCESSING' AND UPDATED_AT < SYSTIMESTAMP - INTERVAL '5' MINUTE THEN 1 END) AS STUCK_PROCESSING
         FROM NOTIFICATIONS_OUTBOX`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const b = backlogRes.rows?.[0] || {};
      return {
        countsByStatus: counts,
        dueNow: Number(b.DUE_NOW || 0),
        scheduledFuture: Number(b.SCHEDULED_FUTURE || 0),
        failuresLast24h: Number(b.FAILURES_24H || 0),
        stuckProcessing: Number(b.STUCK_PROCESSING || 0),
      };
    } finally {
      await conn.close();
    }
  }

  /**
   * Recent notification delivery failures. Message bodies and encrypted payloads are never
   * returned; recipients are masked.
   */
  async listNotificationFailures(params: { status?: 'FAILED' | 'DEAD_LETTER'; page?: number; limit?: number }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 25));
    const statuses = params.status ? [params.status] : ['FAILED', 'DEAD_LETTER'];
    const binds: Record<string, any> = {};
    const inList = statuses.map((s, i) => {
      binds[`s${i}`] = s;
      return `:s${i}`;
    });
    const conn = await getOracleConnection();
    try {
      const total = await conn.execute<any>(
        `SELECT COUNT(*) AS T FROM NOTIFICATIONS_OUTBOX WHERE STATUS IN (${inList.join(',')})`,
        binds,
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const rows = await conn.execute<any>(
        `SELECT n.NOTIFICATION_ID, n.TEMPLATE_CODE, n.CHANNEL, n.RECIPIENT, n.STATUS, n.RETRY_COUNT,
                n.ERROR_MESSAGE, n.NEXT_RETRY_AT, n.CREATED_AT, n.UPDATED_AT, sr.JOB_NUMBER
           FROM NOTIFICATIONS_OUTBOX n
           LEFT JOIN SERVICE_REQUESTS sr ON sr.REQUEST_ID = n.REQUEST_ID
          WHERE n.STATUS IN (${inList.join(',')})
          ORDER BY n.UPDATED_AT DESC
          OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
        { ...binds, offset: (page - 1) * limit, limit },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return {
        total: Number(total.rows?.[0]?.T || 0),
        page,
        limit,
        items: (rows.rows || []).map((r: any) => ({
          notificationId: r.NOTIFICATION_ID,
          templateCode: r.TEMPLATE_CODE,
          channel: r.CHANNEL,
          recipient: maskRecipient(r.RECIPIENT),
          status: r.STATUS,
          retryCount: Number(r.RETRY_COUNT || 0),
          errorMessage: sanitizeError(r.ERROR_MESSAGE) ?? null,
          nextRetryAt: r.NEXT_RETRY_AT ? new Date(r.NEXT_RETRY_AT) : null,
          jobNumber: r.JOB_NUMBER || null,
          createdAt: new Date(r.CREATED_AT),
          updatedAt: r.UPDATED_AT ? new Date(r.UPDATED_AT) : null,
        })),
      };
    } finally {
      await conn.close();
    }
  }

  async getDashboardSummary() {
    const conn = await getOracleConnection();
    try {
      const res = await conn.execute<any>(
        `SELECT r.CODE AS ROLE_CODE,
                COUNT(DISTINCT u.USER_ID) AS TOTAL,
                COUNT(DISTINCT CASE WHEN u.IS_ACTIVE = 'Y' THEN u.USER_ID END) AS ACTIVE,
                COUNT(DISTINCT CASE WHEN u.MUST_CHANGE_PASSWORD = 'Y' AND u.IS_ACTIVE = 'Y' THEN u.USER_ID END) AS PENDING_FIRST_LOGIN
           FROM ROLES r
           LEFT JOIN USER_ROLES ur ON ur.ROLE_ID = r.ROLE_ID
           LEFT JOIN APP_USERS u ON u.USER_ID = ur.USER_ID
          WHERE r.IS_ACTIVE = 'Y'
          GROUP BY r.CODE
          ORDER BY r.CODE`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const sessions = await conn.execute<any>(
        `SELECT COUNT(*) AS C FROM USER_SESSIONS WHERE REVOKED_AT IS NULL AND EXPIRES_AT > SYSTIMESTAMP`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const failedLogins = await conn.execute<any>(
        `SELECT COUNT(*) AS C FROM APP_USERS WHERE LOCKED_UNTIL > SYSTIMESTAMP`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return {
        accountsByRole: (res.rows || []).map((r: any) => ({
          role: String(r.ROLE_CODE),
          total: Number(r.TOTAL || 0),
          active: Number(r.ACTIVE || 0),
          pendingFirstLogin: Number(r.PENDING_FIRST_LOGIN || 0),
        })),
        activeSessions: Number(sessions.rows?.[0]?.C || 0),
        lockedAccounts: Number(failedLogins.rows?.[0]?.C || 0),
        audit: await systemAuditRepository.getAuditStats(),
      };
    } finally {
      await conn.close();
    }
  }

  async getAuditLogs(options: SystemAuditQueryOptions) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(200, Math.max(1, options.limit || 50));
    const [logs, total] = await Promise.all([
      systemAuditRepository.queryLogs({ ...options, page, limit }),
      systemAuditRepository.countLogs(options),
    ]);
    return { logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
  }
}

export const superAdminService = new SuperAdminService();
