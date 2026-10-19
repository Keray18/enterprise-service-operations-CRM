import crypto from 'crypto';
import fs from 'fs';
import oracledb from 'oracledb';
import path from 'path';
import { logger } from '../logging/logger.js';
import { getOracleConnection } from './oraclePool.js';

export interface MigrationFile {
  version: string;
  description: string;
  filename: string;
  fullPath: string;
  checksum: string;
}

export interface AppliedMigration {
  installedRank: number;
  version: string;
  description: string;
  script: string;
  checksum: string;
  installedOn: Date;
  executionTimeMs: number;
  success: string;
}

export interface MigrationResult {
  appliedCount: number;
  pendingCount: number;
  appliedVersions: string[];
  durationMs: number;
}

/**
 * Computes SHA-256 checksum of file contents.
 */
export function calculateChecksum(content: string): string {
  // Normalize Windows/Unix line endings to ensure consistent checksum across OS platforms
  const normalized = content.replace(/\r\n/g, '\n').trim();
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Parses and sorts all versioned migration files in the migrations directory.
 */
export function loadMigrationFiles(migrationsDir: string): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found at: ${migrationsDir}`);
  }

  const files = fs.readdirSync(migrationsDir);
  const migrationFiles: MigrationFile[] = [];

  for (const file of files) {
    if (!file.endsWith('.sql')) continue;

    // Pattern: V<version>__<description>.sql
    const match = file.match(/^V(\d+)__(.+)\.sql$/i);
    if (!match || !match[1] || !match[2]) {
      logger.warn(`Skipping non-conforming SQL file: ${file}`);
      continue;
    }

    const version = match[1];
    const description = match[2].replace(/_/g, ' ');
    const fullPath = path.join(migrationsDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const checksum = calculateChecksum(content);

    migrationFiles.push({
      version,
      description,
      filename: file,
      fullPath,
      checksum,
    });
  }

  // Sort strictly by numeric version
  return migrationFiles.sort((a, b) => parseInt(a.version, 10) - parseInt(b.version, 10));
}

/**
 * Retrieves applied migrations from the CRM_SCHEMA_HISTORY table.
 */
export async function getAppliedMigrations(conn: oracledb.Connection): Promise<AppliedMigration[]> {
  const checkTableSql = `
    SELECT COUNT(*) AS TBL_COUNT 
    FROM user_tables 
    WHERE table_name = 'CRM_SCHEMA_HISTORY'
  `;

  const checkResult = await conn.execute<{ TBL_COUNT: number }>(
    checkTableSql,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const tableExists = (checkResult.rows?.[0]?.TBL_COUNT ?? 0) > 0;
  if (!tableExists) {
    return [];
  }

  const querySql = `
    SELECT 
      INSTALLED_RANK,
      VERSION,
      DESCRIPTION,
      SCRIPT,
      CHECKSUM,
      INSTALLED_ON,
      EXECUTION_TIME_MS,
      SUCCESS
    FROM CRM_SCHEMA_HISTORY
    ORDER BY INSTALLED_RANK ASC
  `;

  const result = await conn.execute<any>(querySql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });

  return (result.rows || []).map((row: any) => ({
    installedRank: Number(row.INSTALLED_RANK),
    version: String(row.VERSION),
    description: String(row.DESCRIPTION),
    script: String(row.SCRIPT),
    checksum: String(row.CHECKSUM),
    installedOn: new Date(row.INSTALLED_ON),
    executionTimeMs: Number(row.EXECUTION_TIME_MS),
    success: String(row.SUCCESS),
  }));
}

/**
 * Splits Oracle SQL script content into discrete executable DDL/DML/PL-SQL blocks.
 */
export function splitOracleScript(content: string): string[] {
  // Normalize line endings
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const statements: string[] = [];
  let currentBlock: string[] = [];
  let inPlsqlBlock = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    // Check for comment-only line
    if (trimmed.startsWith('--') && !inPlsqlBlock) {
      continue;
    }

    // Detect start of PL/SQL block
    if (!inPlsqlBlock && /^(DECLARE|BEGIN|CREATE\s+OR\s+REPLACE\s+(PACKAGE|PROCEDURE|FUNCTION|TRIGGER))/i.test(trimmed)) {
      inPlsqlBlock = true;
    }

    // PL/SQL termination by forward slash on its own line
    if (inPlsqlBlock && trimmed === '/') {
      const stmt = currentBlock.join('\n').trim();
      if (stmt) statements.push(stmt);
      currentBlock = [];
      inPlsqlBlock = false;
      continue;
    }

    // Strip trailing inline comment for standard SQL
    const lineWithoutComment = inPlsqlBlock ? rawLine : rawLine.replace(/--.*$/, '');
    const trimmedCode = lineWithoutComment.trim();

    if (!inPlsqlBlock && trimmedCode.length === 0) {
      continue;
    }

    // Standard SQL termination by semicolon
    if (!inPlsqlBlock && trimmedCode.endsWith(';')) {
      currentBlock.push(lineWithoutComment.slice(0, lineWithoutComment.lastIndexOf(';')));
      const stmt = currentBlock.join('\n').trim();
      if (stmt) statements.push(stmt);
      currentBlock = [];
      continue;
    }

    currentBlock.push(inPlsqlBlock ? rawLine : lineWithoutComment);
  }

  const leftover = currentBlock.join('\n').trim();
  if (leftover && leftover !== '/') {
    statements.push(leftover);
  }

  return statements.filter((s) => s.length > 0);
}

/**
 * Runs pending migrations against the Oracle database with strict integrity checking.
 */
export async function runMigrations(migrationsDir: string): Promise<MigrationResult> {
  const startTime = Date.now();
  logger.info(`Scanning for migrations in: ${migrationsDir}`);

  const availableMigrations = loadMigrationFiles(migrationsDir);
  logger.info(`Found ${availableMigrations.length} migration file(s) on disk`);

  const conn = await getOracleConnection();
  try {
    const applied = await getAppliedMigrations(conn);
    const appliedMap = new Map<string, AppliedMigration>();
    for (const m of applied) {
      appliedMap.set(m.version, m);
    }

    // Integrity Check: verify existing migrations were not tampered with
    for (const file of availableMigrations) {
      const historical = appliedMap.get(file.version);
      if (historical) {
        if (historical.checksum !== file.checksum) {
          throw new Error(
            `CHECKSUM MISMATCH for migration ${file.filename} (Version ${file.version}). ` +
            `Applied checksum: ${historical.checksum}, File checksum: ${file.checksum}. ` +
            `Historical migrations must never be altered! Follow the forward-fix policy.`
          );
        }
      }
    }

    // Identify pending migrations
    const pending = availableMigrations.filter((m) => !appliedMap.has(m.version));
    logger.info(`Applied: ${applied.length}, Pending: ${pending.length}`);

    if (pending.length === 0) {
      logger.info('Database schema is already up to date. No pending migrations.');
      return {
        appliedCount: 0,
        pendingCount: 0,
        appliedVersions: [],
        durationMs: Date.now() - startTime,
      };
    }

    const appliedVersions: string[] = [];

    // Apply pending migrations sequentially
    for (const migration of pending) {
      const migStart = Date.now();
      logger.info(`Applying migration V${migration.version}: ${migration.description} (${migration.filename})...`);

      const fileContent = fs.readFileSync(migration.fullPath, 'utf8');
      const statements = splitOracleScript(fileContent);

      try {
        for (const statement of statements) {
          await conn.execute(statement);
        }

        const executionDuration = Date.now() - migStart;

        // Record successful execution in CRM_SCHEMA_HISTORY
        const recordSql = `
          INSERT INTO CRM_SCHEMA_HISTORY (
            VERSION,
            DESCRIPTION,
            TYPE,
            SCRIPT,
            CHECKSUM,
            INSTALLED_BY,
            EXECUTION_TIME_MS,
            SUCCESS
          ) VALUES (
            :version,
            :description,
            'SQL',
            :script,
            :checksum,
            USER,
            :executionTime,
            'Y'
          )
        `;

        await conn.execute(
          recordSql,
          {
            version: migration.version,
            description: migration.description,
            script: migration.filename,
            checksum: migration.checksum,
            executionTime: executionDuration,
          },
          { autoCommit: true }
        );

        appliedVersions.push(migration.version);
        logger.info(`Migration V${migration.version} successfully applied in ${executionDuration}ms`);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`FAILED migration V${migration.version} (${migration.filename}): ${errorMsg}`);
        throw new Error(`Migration ${migration.filename} failed: ${errorMsg}`);
      }
    }

    return {
      appliedCount: appliedVersions.length,
      pendingCount: 0,
      appliedVersions,
      durationMs: Date.now() - startTime,
    };
  } finally {
    await conn.close();
  }
}
