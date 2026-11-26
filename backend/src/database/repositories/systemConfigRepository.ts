import oracledb from 'oracledb';
import { getOracleConnection } from '../oraclePool.js';

export interface SystemConfigRecord {
  configKey: string;
  configValue: string;
  category: string;
  description?: string;
  isSensitive: 'Y' | 'N';
  updatedBy?: string;
  updatedAt: Date;
}

function mapRow(row: any): SystemConfigRecord {
  return {
    configKey: row.CONFIG_KEY,
    configValue: row.CONFIG_VALUE,
    category: row.CATEGORY,
    description: row.DESCRIPTION || undefined,
    isSensitive: row.IS_SENSITIVE === 'Y' ? 'Y' : 'N',
    updatedBy: row.UPDATED_BY || undefined,
    updatedAt: new Date(row.UPDATED_AT),
  };
}

export class SystemConfigRepository {
  async listAll(): Promise<SystemConfigRecord[]> {
    const conn = await getOracleConnection();
    try {
      const res = await conn.execute<any>(
        `SELECT CONFIG_KEY, CONFIG_VALUE, CATEGORY, DESCRIPTION, IS_SENSITIVE, UPDATED_BY, UPDATED_AT
           FROM SYSTEM_CONFIG
          ORDER BY CATEGORY, CONFIG_KEY`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return (res.rows || []).map(mapRow);
    } finally {
      await conn.close();
    }
  }

  async findByKey(configKey: string, conn?: oracledb.Connection): Promise<SystemConfigRecord | null> {
    const connection = conn || (await getOracleConnection());
    try {
      const res = await connection.execute<any>(
        `SELECT CONFIG_KEY, CONFIG_VALUE, CATEGORY, DESCRIPTION, IS_SENSITIVE, UPDATED_BY, UPDATED_AT
           FROM SYSTEM_CONFIG WHERE CONFIG_KEY = :configKey`,
        { configKey },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return res.rows && res.rows.length > 0 ? mapRow(res.rows[0]) : null;
    } finally {
      if (!conn) await connection.close();
    }
  }

  async updateValue(configKey: string, configValue: string, updatedBy: string, conn: oracledb.Connection): Promise<number> {
    const res = await conn.execute(
      `UPDATE SYSTEM_CONFIG
          SET CONFIG_VALUE = :configValue, UPDATED_BY = :updatedBy, UPDATED_AT = SYSTIMESTAMP
        WHERE CONFIG_KEY = :configKey`,
      { configKey, configValue, updatedBy: updatedBy.slice(0, 100) }
    );
    return res.rowsAffected || 0;
  }
}

export const systemConfigRepository = new SystemConfigRepository();
