import fs from 'fs';
import path from 'path';
import { logger } from '../logging/logger.js';
import { getAppliedMigrations, loadMigrationFiles, runMigrations } from './migrationRunner.js';
import { closeOraclePool, getOracleConnection } from './oraclePool.js';

async function main(): Promise<void> {
  const isStatusOnly = process.argv.includes('--status');
  const rootMigrationsDir = path.resolve(process.cwd(), 'database/migrations');
  const parentMigrationsDir = path.resolve(process.cwd(), '../database/migrations');
  const migrationsDir = fs.existsSync(rootMigrationsDir) ? rootMigrationsDir : parentMigrationsDir;

  try {
    if (isStatusOnly) {
      logger.info('--- MIGRATION STATUS INSPECTION ---');
      const files = loadMigrationFiles(migrationsDir);
      const conn = await getOracleConnection();
      try {
        const applied = await getAppliedMigrations(conn);
        const appliedMap = new Map(applied.map((a) => [a.version, a]));

        console.log('\n========================================================================================');
        console.log('Version | Description                    | Status    | Applied On          | Checksum');
        console.log('----------------------------------------------------------------------------------------');
        const fileVersions = new Set(files.map((f) => f.version));
        const rows: Array<{ version: string; line: string }> = [];
        for (const f of files) {
          const a = appliedMap.get(f.version);
          let status = a ? (a.success === 'Y' ? 'APPLIED' : 'FAILED') : 'PENDING';
          if (a && a.checksum !== f.checksum) status = 'MISMATCH';
          const installedOn = a ? a.installedOn.toISOString().slice(0, 19).replace('T', ' ') : '                   ';
          const checksumPreview = f.checksum.slice(0, 8);
          rows.push({
            version: f.version,
            line: `V${f.version.padEnd(6)} | ${f.description.padEnd(30)} | ${status.padEnd(9)} | ${installedOn} | ${checksumPreview}...`,
          });
        }
        // Applied history rows whose source file is absent (e.g. V031/V032, reconciled by V033)
        for (const a of applied) {
          if (fileVersions.has(a.version)) continue;
          const installedOn = a.installedOn.toISOString().slice(0, 19).replace('T', ' ');
          rows.push({
            version: a.version,
            line: `V${a.version.padEnd(6)} | ${a.description.padEnd(30)} | ${'NO_SOURCE'.padEnd(9)} | ${installedOn} | ${a.checksum.slice(0, 8)}...`,
          });
        }
        rows.sort((x, y) => parseInt(x.version, 10) - parseInt(y.version, 10)).forEach((r) => console.log(r.line));
        console.log('========================================================================================\n');
      } finally {
        await conn.close();
      }
    } else {
      console.log('>>> Running pending database migrations...');
      logger.info('--- RUNNING PENDING DATABASE MIGRATIONS ---');
      const result = await runMigrations(migrationsDir);
      if (result.appliedCount === 0) {
        console.log('>>> Schema is already up to date. No pending migrations.');
      } else {
        console.log(`>>> Successfully applied ${result.appliedCount} migration(s) in ${result.durationMs}ms:`);
        result.appliedVersions.forEach((v) => console.log(`    - V${v}`));
      }
      logger.info(`Migrations finished: ${result.appliedCount} applied in ${result.durationMs}ms`);
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`\n[FATAL] Migration runner failed: ${errorMsg}\n`);
    logger.error(`Migration runner terminated with error: ${errorMsg}`);
    process.exitCode = 1;
  } finally {
    await closeOraclePool();
  }
}

main();
