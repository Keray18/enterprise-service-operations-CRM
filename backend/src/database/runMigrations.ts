import path from 'path';
import { logger } from '../logging/logger.js';
import { getAppliedMigrations, loadMigrationFiles, runMigrations } from './migrationRunner.js';
import { closeOraclePool, getOracleConnection } from './oraclePool.js';

async function main(): Promise<void> {
  const isStatusOnly = process.argv.includes('--status');
  const migrationsDir = path.resolve(process.cwd(), '../database/migrations');

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
        for (const f of files) {
          const a = appliedMap.get(f.version);
          const status = a ? 'APPLIED' : 'PENDING';
          const installedOn = a ? a.installedOn.toISOString().slice(0, 19).replace('T', ' ') : '                   ';
          const checksumPreview = f.checksum.slice(0, 8);
          console.log(
            `V${f.version.padEnd(6)} | ${f.description.padEnd(30)} | ${status.padEnd(9)} | ${installedOn} | ${checksumPreview}...`
          );
        }
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
