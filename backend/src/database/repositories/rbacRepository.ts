import oracledb from 'oracledb';
import { getOracleConnection } from '../oraclePool.js';

export class RbacRepository {
  async getUserRoles(userId: string): Promise<string[]> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT r.CODE
        FROM ROLES r
        JOIN USER_ROLES ur ON ur.ROLE_ID = r.ROLE_ID
        WHERE ur.USER_ID = :userId
        ORDER BY r.CODE ASC
      `;
      const result = await conn.execute<any>(
        sql,
        { userId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return (result.rows || []).map((row: any) => String(row.CODE));
    } finally {
      await conn.close();
    }
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT DISTINCT p.CODE
        FROM PERMISSIONS p
        JOIN ROLE_PERMISSIONS rp ON rp.PERMISSION_ID = p.PERMISSION_ID
        JOIN USER_ROLES ur ON ur.ROLE_ID = rp.ROLE_ID
        WHERE ur.USER_ID = :userId
        ORDER BY p.CODE ASC
      `;
      const result = await conn.execute<any>(
        sql,
        { userId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return (result.rows || []).map((row: any) => String(row.CODE));
    } finally {
      await conn.close();
    }
  }

  async assignRoleToUser(userId: string, roleCode: string, assignedBy: string): Promise<void> {
    const conn = await getOracleConnection();
    try {
      const findRoleSql = `SELECT ROLE_ID FROM ROLES WHERE CODE = :roleCode`;
      const roleResult = await conn.execute<any>(
        findRoleSql,
        { roleCode },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (!roleResult.rows || roleResult.rows.length === 0) {
        throw new Error(`Role with code '${roleCode}' does not exist.`);
      }

      const roleId = roleResult.rows[0].ROLE_ID;

      const assignSql = `
        INSERT INTO USER_ROLES (USER_ID, ROLE_ID, ASSIGNED_AT, ASSIGNED_BY)
        VALUES (:userId, :roleId, SYSTIMESTAMP, :assignedBy)
      `;
      await conn.execute(
        assignSql,
        { userId, roleId, assignedBy },
        { autoCommit: true }
      );
    } finally {
      await conn.close();
    }
  }
}

export const rbacRepository = new RbacRepository();
