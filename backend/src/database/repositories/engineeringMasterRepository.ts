import oracledb from 'oracledb';
import { DefectRecord, FaultRecord, RepairCodeRecord } from '../../types/job360.js';
import { getOracleConnection } from '../oraclePool.js';

export class EngineeringMasterRepository {
  async listFaults(filters?: {
    productId?: string;
    brandId?: string;
    activeOnly?: boolean;
  }): Promise<FaultRecord[]> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const where: string[] = ['1=1'];

      if (filters?.activeOnly !== false) {
        where.push("IS_ACTIVE = 'Y'");
      }
      if (filters?.productId) {
        binds.productId = filters.productId;
        where.push('(PRODUCT_ID = :productId OR PRODUCT_ID IS NULL)');
      }
      if (filters?.brandId) {
        binds.brandId = filters.brandId;
        where.push('(BRAND_ID = :brandId OR BRAND_ID IS NULL)');
      }

      const sql = `
        SELECT 
          FAULT_ID, BRAND_ID, PRODUCT_ID, FAULT_CODE, 
          FAULT_DESCRIPTION, CATEGORY, IS_ACTIVE
        FROM FAULT_MASTERS
        WHERE ${where.join(' AND ')}
        ORDER BY FAULT_CODE ASC
      `;

      const result = await conn.execute<any>(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      return (result.rows || []).map((row) => ({
        faultId: row.FAULT_ID,
        brandId: row.BRAND_ID || undefined,
        productId: row.PRODUCT_ID || undefined,
        faultCode: row.FAULT_CODE,
        faultDescription: row.FAULT_DESCRIPTION,
        category: row.CATEGORY,
        isActive: row.IS_ACTIVE,
      }));
    } finally {
      await conn.close();
    }
  }

  async findFaultById(faultId: string, conn?: oracledb.Connection): Promise<FaultRecord | null> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());
    try {
      const sql = `
        SELECT FAULT_ID, BRAND_ID, PRODUCT_ID, FAULT_CODE, FAULT_DESCRIPTION, CATEGORY, IS_ACTIVE
        FROM FAULT_MASTERS
        WHERE FAULT_ID = :faultId
      `;
      const result = await connection.execute<any>(sql, { faultId }, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      if (!result.rows || result.rows.length === 0) return null;
      const row = result.rows[0];
      return {
        faultId: row.FAULT_ID,
        brandId: row.BRAND_ID || undefined,
        productId: row.PRODUCT_ID || undefined,
        faultCode: row.FAULT_CODE,
        faultDescription: row.FAULT_DESCRIPTION,
        category: row.CATEGORY,
        isActive: row.IS_ACTIVE,
      };
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async listDefects(filters?: {
    productId?: string;
    brandId?: string;
    activeOnly?: boolean;
  }): Promise<DefectRecord[]> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const where: string[] = ['1=1'];

      if (filters?.activeOnly !== false) {
        where.push("IS_ACTIVE = 'Y'");
      }
      if (filters?.productId) {
        binds.productId = filters.productId;
        where.push('(PRODUCT_ID = :productId OR PRODUCT_ID IS NULL)');
      }
      if (filters?.brandId) {
        binds.brandId = filters.brandId;
        where.push('(BRAND_ID = :brandId OR BRAND_ID IS NULL)');
      }

      const sql = `
        SELECT DEFECT_ID, BRAND_ID, PRODUCT_ID, DEFECT_CODE, DEFECT_DESCRIPTION, IS_ACTIVE
        FROM DEFECT_MASTERS
        WHERE ${where.join(' AND ')}
        ORDER BY DEFECT_CODE ASC
      `;

      const result = await conn.execute<any>(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      return (result.rows || []).map((row) => ({
        defectId: row.DEFECT_ID,
        brandId: row.BRAND_ID || undefined,
        productId: row.PRODUCT_ID || undefined,
        defectCode: row.DEFECT_CODE,
        defectDescription: row.DEFECT_DESCRIPTION,
        isActive: row.IS_ACTIVE,
      }));
    } finally {
      await conn.close();
    }
  }

  async findDefectById(defectId: string, conn?: oracledb.Connection): Promise<DefectRecord | null> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());
    try {
      const sql = `
        SELECT DEFECT_ID, BRAND_ID, PRODUCT_ID, DEFECT_CODE, DEFECT_DESCRIPTION, IS_ACTIVE
        FROM DEFECT_MASTERS
        WHERE DEFECT_ID = :defectId
      `;
      const result = await connection.execute<any>(sql, { defectId }, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      if (!result.rows || result.rows.length === 0) return null;
      const row = result.rows[0];
      return {
        defectId: row.DEFECT_ID,
        brandId: row.BRAND_ID || undefined,
        productId: row.PRODUCT_ID || undefined,
        defectCode: row.DEFECT_CODE,
        defectDescription: row.DEFECT_DESCRIPTION,
        isActive: row.IS_ACTIVE,
      };
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }

  async listRepairCodes(filters?: {
    productId?: string;
    brandId?: string;
    activeOnly?: boolean;
  }): Promise<RepairCodeRecord[]> {
    const conn = await getOracleConnection();
    try {
      const binds: Record<string, any> = {};
      const where: string[] = ['1=1'];

      if (filters?.activeOnly !== false) {
        where.push("IS_ACTIVE = 'Y'");
      }
      if (filters?.productId) {
        binds.productId = filters.productId;
        where.push('(PRODUCT_ID = :productId OR PRODUCT_ID IS NULL)');
      }
      if (filters?.brandId) {
        binds.brandId = filters.brandId;
        where.push('(BRAND_ID = :brandId OR BRAND_ID IS NULL)');
      }

      const sql = `
        SELECT 
          REPAIR_CODE_ID, BRAND_ID, PRODUCT_ID, REPAIR_CODE, 
          REPAIR_ACTION, IS_PART_REQUIRED, REPAIR_LEVEL, IS_ACTIVE
        FROM REPAIR_CODE_MASTERS
        WHERE ${where.join(' AND ')}
        ORDER BY REPAIR_CODE ASC
      `;

      const result = await conn.execute<any>(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      return (result.rows || []).map((row) => ({
        repairCodeId: row.REPAIR_CODE_ID,
        brandId: row.BRAND_ID || undefined,
        productId: row.PRODUCT_ID || undefined,
        repairCode: row.REPAIR_CODE,
        repairAction: row.REPAIR_ACTION,
        isPartRequired: row.IS_PART_REQUIRED,
        repairLevel: row.REPAIR_LEVEL,
        isActive: row.IS_ACTIVE,
      }));
    } finally {
      await conn.close();
    }
  }

  async findRepairCodeById(repairCodeId: string, conn?: oracledb.Connection): Promise<RepairCodeRecord | null> {
    const isExternalConn = Boolean(conn);
    const connection = conn || (await getOracleConnection());
    try {
      const sql = `
        SELECT 
          REPAIR_CODE_ID, BRAND_ID, PRODUCT_ID, REPAIR_CODE, 
          REPAIR_ACTION, IS_PART_REQUIRED, REPAIR_LEVEL, IS_ACTIVE
        FROM REPAIR_CODE_MASTERS
        WHERE REPAIR_CODE_ID = :repairCodeId
      `;
      const result = await connection.execute<any>(sql, { repairCodeId }, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      if (!result.rows || result.rows.length === 0) return null;
      const row = result.rows[0];
      return {
        repairCodeId: row.REPAIR_CODE_ID,
        brandId: row.BRAND_ID || undefined,
        productId: row.PRODUCT_ID || undefined,
        repairCode: row.REPAIR_CODE,
        repairAction: row.REPAIR_ACTION,
        isPartRequired: row.IS_PART_REQUIRED,
        repairLevel: row.REPAIR_LEVEL,
        isActive: row.IS_ACTIVE,
      };
    } finally {
      if (!isExternalConn) {
        await connection.close();
      }
    }
  }
}

export const engineeringMasterRepository = new EngineeringMasterRepository();
