import oracledb from 'oracledb';
import { getOracleConnection } from '../oraclePool.js';

export const APPROVED_ROLES = ['ADMIN', 'CALL_CENTER', 'ASF', 'ENGINEER', 'WAREHOUSE'] as const;
export type ApprovedRole = (typeof APPROVED_ROLES)[number];
export const DEPRECATED_ROLES = ['SUPER_ADMIN', 'INFRA_OPS', 'FINANCE', 'BRAND', 'DISTRIBUTOR'] as const;

export class RbacRepository {
  async getUserRoles(userId: string): Promise<string[]> {
    const conn = await getOracleConnection();
    try {
      const sql = `
        SELECT r.CODE
        FROM ROLES r
        JOIN USER_ROLES ur ON ur.ROLE_ID = r.ROLE_ID
        WHERE ur.USER_ID = :userId
          AND r.IS_ACTIVE = 'Y'
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
        JOIN ROLES r ON r.ROLE_ID = rp.ROLE_ID
        WHERE ur.USER_ID = :userId
          AND r.IS_ACTIVE = 'Y'
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

  async assignRoleToUser(userId: string, roleCode: string, assignedBy: string, conn?: oracledb.Connection): Promise<void> {
    if (!APPROVED_ROLES.includes(roleCode as any)) {
      throw new Error(`Role with code '${roleCode}' is not an approved active application role.`);
    }

    const shouldClose = !conn;
    const connection = conn || (await getOracleConnection());
    try {
      const findRoleSql = `SELECT ROLE_ID, IS_ACTIVE FROM ROLES WHERE CODE = :roleCode`;
      const roleResult = await connection.execute<any>(
        findRoleSql,
        { roleCode },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (!roleResult.rows || roleResult.rows.length === 0) {
        throw new Error(`Role with code '${roleCode}' does not exist.`);
      }

      if (roleResult.rows[0].IS_ACTIVE !== 'Y') {
        throw new Error(`Role with code '${roleCode}' is inactive and cannot be assigned.`);
      }

      const roleId = roleResult.rows[0].ROLE_ID;

      const assignSql = `
        INSERT INTO USER_ROLES (USER_ID, ROLE_ID, ASSIGNED_AT, ASSIGNED_BY)
        VALUES (:userId, :roleId, SYSTIMESTAMP, :assignedBy)
      `;
      await connection.execute(
        assignSql,
        { userId, roleId, assignedBy },
        { autoCommit: shouldClose }
      );
    } finally {
      if (shouldClose) {
        await connection.close();
      }
    }
  }
}

export const rbacRepository = new RbacRepository();
