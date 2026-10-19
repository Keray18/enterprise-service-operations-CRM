import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  calculateChecksum,
  loadMigrationFiles,
  splitOracleScript,
} from '../src/database/migrationRunner.js';

describe('Migration Runner Logic', () => {
  describe('calculateChecksum', () => {
    it('should compute deterministic SHA-256 hash', () => {
      const sql1 = 'CREATE TABLE TEST_TABLE (ID NUMBER PRIMARY KEY);';
      const sql2 = 'CREATE TABLE TEST_TABLE (ID NUMBER PRIMARY KEY);';
      expect(calculateChecksum(sql1)).toBe(calculateChecksum(sql2));
    });

    it('should normalize CRLF and LF line endings to avoid OS-dependent mismatch', () => {
      const unixSql = 'CREATE TABLE T (\n  ID NUMBER\n);\n';
      const winSql = 'CREATE TABLE T (\r\n  ID NUMBER\r\n);\r\n';
      expect(calculateChecksum(unixSql)).toBe(calculateChecksum(winSql));
    });

    it('should detect altered content with different hash', () => {
      const original = 'SELECT 1 FROM DUAL;';
      const modified = 'SELECT 2 FROM DUAL;';
      expect(calculateChecksum(original)).not.toBe(calculateChecksum(modified));
    });
  });

  describe('splitOracleScript', () => {
    it('should split standard semicolon-terminated SQL statements', () => {
      const script = `
        CREATE TABLE T1 (ID NUMBER);
        CREATE TABLE T2 (ID NUMBER);
      `;
      const stmts = splitOracleScript(script);
      expect(stmts).toHaveLength(2);
      expect(stmts[0]).toBe('CREATE TABLE T1 (ID NUMBER)');
      expect(stmts[1]).toBe('CREATE TABLE T2 (ID NUMBER)');
    });

    it('should handle PL/SQL blocks terminated by forward slash', () => {
      const script = `
        DECLARE
          v_cnt NUMBER;
        BEGIN
          v_cnt := 1;
        END;
        /
        
        INSERT INTO T1 VALUES (1);
      `;
      const stmts = splitOracleScript(script);
      expect(stmts).toHaveLength(2);
      expect(stmts[0]).toContain('DECLARE');
      expect(stmts[0]).toContain('END;');
      expect(stmts[1]).toBe('INSERT INTO T1 VALUES (1)');
    });
  });

  describe('loadMigrationFiles', () => {
    it('should discover and sort migration files from database/migrations', () => {
      const migrationsDir = path.resolve(process.cwd(), '../database/migrations');
      const files = loadMigrationFiles(migrationsDir);

      expect(files.length).toBeGreaterThanOrEqual(2);
      expect(files[0]?.version).toBe('001');
      expect(files[0]?.description).toBe('init schema history');
      expect(files[1]?.version).toBe('002');
      expect(files[1]?.description).toBe('test connectivity');
      expect(files[0]?.checksum).toHaveLength(64);
    });
  });
});
