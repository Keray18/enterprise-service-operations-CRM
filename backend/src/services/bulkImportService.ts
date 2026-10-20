import crypto from 'crypto';
import ExcelJS from 'exceljs';
import oracledb from 'oracledb';
import { auditRepository } from '../database/repositories/auditRepository.js';
import { bulkImportRepository } from '../database/repositories/bulkImportRepository.js';
import { getOracleConnection } from '../database/oraclePool.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  BulkImportCommitResult,
  BulkImportEntityType,
  BulkImportMode,
  BulkImportPreviewRow,
  BulkImportPreviewSummary,
  ModelImportRowParsed,
  PartImportRowParsed,
  RowAction,
  RowChangeDiff,
  RowValidationError,
} from '../types/bulkImport.js';
import { TEMPLATE_VERSIONS } from './bulkImportTemplateService.js';

const MAX_DATA_ROWS = 1000;
const MAX_SHEETS = 5;

// Formula injection character check
function isFormulaValue(val: unknown): boolean {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.startsWith('=') || trimmed.startsWith('@')) {
      return true;
    }
    // Check if starts with + or - followed by non-digit
    if ((trimmed.startsWith('+') || trimmed.startsWith('-')) && isNaN(Number(trimmed))) {
      return true;
    }
  }
  return false;
}

// Escape cell content when writing error reports to avoid CSV/Excel formula injection
function sanitizeReportCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@')) {
    return `'${str}`;
  }
  return str;
}

function parseBooleanIndicator(val: unknown, defaultValue: 'Y' | 'N' = 'Y'): { value: 'Y' | 'N'; valid: boolean } {
  if (val === undefined || val === null || val === '') {
    return { value: defaultValue, valid: true };
  }
  const str = String(val).trim().toUpperCase();
  if (str === 'Y' || str === 'YES' || str === 'TRUE' || str === '1') {
    return { value: 'Y', valid: true };
  }
  if (str === 'N' || str === 'NO' || str === 'FALSE' || str === '0') {
    return { value: 'N', valid: true };
  }
  return { value: defaultValue, valid: false };
}

function parseDateValue(val: unknown): { dateStr: string; valid: boolean } {
  if (!val) return { dateStr: '', valid: false };

  if (val instanceof Date && !isNaN(val.getTime())) {
    return { dateStr: val.toISOString().slice(0, 10), valid: true };
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    // Try YYYY-MM-DD
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (isoMatch) {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        return { dateStr: trimmed, valid: true };
      }
    }
    // Try DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
    if (dmyMatch && dmyMatch[1] && dmyMatch[2] && dmyMatch[3]) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      const isoStr = `${year}-${month}-${day}`;
      const d = new Date(isoStr);
      if (!isNaN(d.getTime())) {
        return { dateStr: isoStr, valid: true };
      }
    }
  }

  // Number (Excel serial date)
  if (typeof val === 'number' && val > 0) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + val * 86400000);
    if (!isNaN(d.getTime())) {
      return { dateStr: d.toISOString().slice(0, 10), valid: true };
    }
  }

  return { dateStr: '', valid: false };
}

function getCellValueAsString(cell: ExcelJS.Cell): string {
  if (cell.value === null || cell.value === undefined) return '';
  if (typeof cell.value === 'object') {
    if ('text' in cell.value && typeof (cell.value as any).text === 'string') {
      return (cell.value as any).text.trim();
    }
    if ('result' in cell.value) {
      return String((cell.value as any).result).trim();
    }
  }
  return String(cell.value).trim();
}

export class BulkImportService {
  /**
   * Parse workbook, inspect safety, and extract raw rows
   */
  async parseAndValidateWorkbook(
    fileBuffer: Buffer,
    entityType: BulkImportEntityType,
    _mode: BulkImportMode
  ): Promise<{
    rows: any[];
    fileErrors: RowValidationError[];
    fileChecksum: string;
    templateVersion: string;
  }> {
    const fileChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const workbook = new ExcelJS.Workbook();

    try {
      await workbook.xlsx.load(fileBuffer as any);
    } catch (err) {
      throw new AppError(
        'Invalid or corrupted Excel file. Please upload a valid .xlsx workbook.',
        400,
        'INVALID_EXCEL_FILE'
      );
    }

    if (workbook.worksheets.length > MAX_SHEETS) {
      throw new AppError(
        `Workbook has ${workbook.worksheets.length} worksheets, exceeding the limit of ${MAX_SHEETS}.`,
        400,
        'EXCESSIVE_WORKSHEETS'
      );
    }

    // Identify data worksheet
    let dataSheet: ExcelJS.Worksheet | undefined;
    const targetSheetNames =
      entityType === 'MODEL' ? ['MODELS', 'MODEL', 'DATA'] : ['PARTCODES', 'PARTS', 'PART', 'DATA'];

    for (const name of targetSheetNames) {
      dataSheet = workbook.worksheets.find((ws) => ws.name.toUpperCase() === name);
      if (dataSheet) break;
    }

    // Default to worksheet that is NOT "Instructions" if named sheets not found
    if (!dataSheet) {
      dataSheet = workbook.worksheets.find((ws) => ws.name.toUpperCase() !== 'INSTRUCTIONS');
    }

    if (!dataSheet) {
      dataSheet = workbook.worksheets[0];
    }

    if (!dataSheet || dataSheet.rowCount < 2) {
      throw new AppError(
        'The uploaded workbook contains no data rows. At least one header row and one data row are required.',
        400,
        'EMPTY_WORKBOOK'
      );
    }

    // Inspect header row
    const headerRow = dataSheet.getRow(1);
    const headers: { colIndex: number; key: string }[] = [];
    const headerSet = new Set<string>();
    const fileErrors: RowValidationError[] = [];

    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      let rawHeader = getCellValueAsString(cell).toUpperCase().replace(/\*/g, '').trim();
      if (!rawHeader) return;

      if (headerSet.has(rawHeader)) {
        fileErrors.push({
          rowNumber: 1,
          field: rawHeader,
          code: 'DUPLICATE_HEADER',
          message: `Duplicate column header '${rawHeader}' detected in column ${colNumber}.`,
        });
      }
      headerSet.add(rawHeader);
      headers.push({ colIndex: colNumber, key: rawHeader });
    });

    const expectedRequiredHeaders =
      entityType === 'MODEL'
        ? ['BRAND_CODE', 'PRODUCT_CODE', 'MODEL_CODE', 'MODEL_NAME', 'RELEASE_DATE']
        : ['BRAND_CODE', 'PRODUCT_CODE', 'PART_CODE', 'PART_NAME', 'HSN_CODE', 'PART_CATEGORY', 'CUSTOMER_PRICE', 'LOCATION_PRICE'];

    for (const reqHeader of expectedRequiredHeaders) {
      if (!headerSet.has(reqHeader)) {
        fileErrors.push({
          rowNumber: 1,
          field: reqHeader,
          code: 'MISSING_REQUIRED_HEADER',
          message: `Required column header '${reqHeader}' is missing from the worksheet.`,
        });
      }
    }

    if (fileErrors.length > 0) {
      return { rows: [], fileErrors, fileChecksum, templateVersion: TEMPLATE_VERSIONS[entityType] };
    }

    // Scan data rows
    const rows: any[] = [];
    let dataRowCount = 0;

    for (let rowNum = 2; rowNum <= dataSheet.rowCount; rowNum++) {
      const row = dataSheet.getRow(rowNum);

      // Check if row is completely empty
      let hasData = false;
      const rowObj: Record<string, any> = { _rowNumber: rowNum, _formulaErrors: [] };

      headers.forEach(({ colIndex, key }) => {
        const cell = row.getCell(colIndex);

        // Security formula inspection
        if (cell.type === ExcelJS.ValueType.Formula || isFormulaValue(cell.value)) {
          rowObj._formulaErrors.push({
            rowNumber: rowNum,
            field: key,
            code: 'FORMULA_NOT_ALLOWED',
            message: `Formulas are forbidden in data cells (detected in row ${rowNum}, column '${key}').`,
          });
        }

        const strVal = getCellValueAsString(cell);
        if (strVal !== '') {
          hasData = true;
          rowObj[key] = strVal;
        } else {
          rowObj[key] = undefined;
        }
      });

      if (!hasData) continue; // Skip completely blank row

      dataRowCount++;
      if (dataRowCount > MAX_DATA_ROWS) {
        throw new AppError(
          `Workbook exceeds maximum allowed limit of ${MAX_DATA_ROWS} data rows.`,
          400,
          'ROW_LIMIT_EXCEEDED'
        );
      }

      rows.push(rowObj);
    }

    return {
      rows,
      fileErrors,
      fileChecksum,
      templateVersion: TEMPLATE_VERSIONS[entityType],
    };
  }

  /**
   * Perform comprehensive business validation and generate preview
   */
  async generatePreview(
    fileBuffer: Buffer,
    fileName: string,
    entityType: BulkImportEntityType,
    mode: BulkImportMode,
    user: { userId: string; username: string }
  ): Promise<BulkImportPreviewSummary> {
    const { rows, fileErrors, fileChecksum, templateVersion } = await this.parseAndValidateWorkbook(
      fileBuffer,
      entityType,
      mode
    );

    if (fileErrors.length > 0) {
      // Header or structure errors prevent row-level preview
      const previewRows: BulkImportPreviewRow[] = fileErrors.map((err) => ({
        rowNumber: err.rowNumber,
        naturalKey: 'HEADER',
        action: 'CONFLICT',
        isValid: false,
        errors: [err],
        changes: [],
        parsedData: {},
      }));

      const summary: BulkImportPreviewSummary = {
        jobId: crypto.randomUUID(),
        entityType,
        importMode: mode,
        fileName,
        fileChecksum,
        templateVersion,
        totalRows: 0,
        validRows: 0,
        invalidRows: fileErrors.length,
        createRows: 0,
        updateRows: 0,
        unchangedRows: 0,
        conflictRows: fileErrors.length,
        canCommit: false,
        rows: previewRows,
      };

      await bulkImportRepository.createJob({
        jobId: summary.jobId,
        entityType,
        importMode: mode,
        status: 'FAILED',
        fileName,
        fileChecksum,
        templateVersion,
        totalRows: 0,
        validRows: 0,
        invalidRows: fileErrors.length,
        createRows: 0,
        updateRows: 0,
        unchangedRows: 0,
        conflictRows: fileErrors.length,
        errorSummary: fileErrors.map((e) => e.message).join('; '),
        createdBy: user.userId,
        createdByUsername: user.username,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return summary;
    }

    const conn = await getOracleConnection();
    try {
      // Batch fetch reference data from Oracle for validation
      const brandCodes = Array.from(new Set(rows.map((r) => r.BRAND_CODE?.toUpperCase()).filter(Boolean)));
      const productCodes = Array.from(new Set(rows.map((r) => r.PRODUCT_CODE?.toUpperCase()).filter(Boolean)));
      const hsnCodes = Array.from(new Set(rows.map((r) => r.HSN_CODE?.toUpperCase()).filter(Boolean)));

      // 1. Fetch Brands
      const brandMap = new Map<string, { brandId: string; brandCode: string; isActive: string }>();
      if (brandCodes.length > 0) {
        const brandBinds: Record<string, string> = {};
        const brandPlaceholders = brandCodes
          .map((code, idx) => {
            const bKey = `b_${idx}`;
            brandBinds[bKey] = code;
            return `:${bKey}`;
          })
          .join(', ');

        const brandSql = `SELECT BRAND_ID, BRAND_CODE, IS_ACTIVE FROM BRANDS WHERE UPPER(BRAND_CODE) IN (${brandPlaceholders})`;
        const brandRes = await conn.execute<any>(brandSql, brandBinds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        (brandRes.rows || []).forEach((row) => {
          brandMap.set(row.BRAND_CODE.toUpperCase(), {
            brandId: row.BRAND_ID,
            brandCode: row.BRAND_CODE,
            isActive: row.IS_ACTIVE,
          });
        });
      }

      // 2. Fetch Products
      const productMap = new Map<string, { productId: string; productCode: string; isActive: string }>();
      if (productCodes.length > 0) {
        const prodBinds: Record<string, string> = {};
        const prodPlaceholders = productCodes
          .map((code, idx) => {
            const pKey = `p_${idx}`;
            prodBinds[pKey] = code;
            return `:${pKey}`;
          })
          .join(', ');

        const prodSql = `SELECT PRODUCT_ID, PRODUCT_CODE, IS_ACTIVE FROM PRODUCTS WHERE UPPER(PRODUCT_CODE) IN (${prodPlaceholders})`;
        const prodRes = await conn.execute<any>(prodSql, prodBinds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        (prodRes.rows || []).forEach((row) => {
          productMap.set(row.PRODUCT_CODE.toUpperCase(), {
            productId: row.PRODUCT_ID,
            productCode: row.PRODUCT_CODE,
            isActive: row.IS_ACTIVE,
          });
        });
      }

      // 3. Fetch HSN (if Part Codes)
      const hsnMap = new Map<string, { hsnId: string; hsnCode: string; isActive: string }>();
      if (entityType === 'PART' && hsnCodes.length > 0) {
        const hsnBinds: Record<string, string> = {};
        const hsnPlaceholders = hsnCodes
          .map((code, idx) => {
            const hKey = `h_${idx}`;
            hsnBinds[hKey] = code;
            return `:${hKey}`;
          })
          .join(', ');

        const hsnSql = `SELECT HSN_ID, HSN_CODE, IS_ACTIVE FROM HSN_TAX_MASTERS WHERE UPPER(HSN_CODE) IN (${hsnPlaceholders})`;
        const hsnRes = await conn.execute<any>(hsnSql, hsnBinds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        (hsnRes.rows || []).forEach((row) => {
          hsnMap.set(row.HSN_CODE.toUpperCase(), {
            hsnId: row.HSN_ID,
            hsnCode: row.HSN_CODE,
            isActive: row.IS_ACTIVE,
          });
        });
      }

      // 4. Fetch existing models or parts in DB to detect conflicts & calculate diffs
      const existingRecordsMap = new Map<string, any>();
      if (entityType === 'MODEL') {
        const existingSql = `
          SELECT m.MODEL_ID, m.BRAND_ID, m.PRODUCT_ID, m.MODEL_CODE, m.MODEL_NAME,
                 m.TECHNICAL_NAME, m.SOFTWARE_VERSION, m.SERIAL_NUMBER_LENGTH,
                 m.CHECK_SERIAL_NUMBER, m.IS_JOB_CREATION_ALLOWED, m.IS_DOA_ALLOWED,
                 m.IS_REPAIRABLE, m.IS_REPLACEMENT_ALLOWED, m.CUSTOMER_WARRANTY_DAYS,
                 m.REPAIR_WARRANTY_DAYS, m.REPLACEMENT_WINDOW_DAYS, m.DOA_DAYS,
                 m.AMC_DAYS, m.AMC_AMOUNT, m.IS_OUT_OF_WARRANTY_SERVICED,
                 m.STANDARD_SERVICE_CHARGE, m.RELEASE_DATE, m.IS_ACTIVE, m.VERSION_NO,
                 b.BRAND_CODE
          FROM MODELS m
          JOIN BRANDS b ON m.BRAND_ID = b.BRAND_ID
        `;
        const existingRes = await conn.execute<any>(existingSql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        (existingRes.rows || []).forEach((row) => {
          const key = `${row.BRAND_CODE.toUpperCase()}__${row.MODEL_CODE.toUpperCase()}`;
          existingRecordsMap.set(key, row);
        });
      } else {
        const existingSql = `
          SELECT p.PART_ID, p.BRAND_ID, p.PRODUCT_ID, p.PART_CODE, p.VENDOR_PART_CODE,
                 p.PART_NAME, p.PART_DESCRIPTION, p.HSN_ID, p.PART_CATEGORY, p.PART_FOR,
                 p.CUSTOMER_PRICE, p.LOCATION_PRICE, p.FAULTY_PART_DISPATCH_TO, p.WARRANTY_DAYS,
                 p.IS_ACTIVE, p.VERSION_NO, b.BRAND_CODE, h.HSN_CODE
          FROM PART_CODES p
          JOIN BRANDS b ON p.BRAND_ID = b.BRAND_ID
          JOIN HSN_TAX_MASTERS h ON p.HSN_ID = h.HSN_ID
        `;
        const existingRes = await conn.execute<any>(existingSql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        (existingRes.rows || []).forEach((row) => {
          const key = `${row.BRAND_CODE.toUpperCase()}__${row.PART_CODE.toUpperCase()}`;
          existingRecordsMap.set(key, row);
        });
      }

      // Process each row
      const previewRows: BulkImportPreviewRow[] = [];
      const seenFileKeys = new Set<string>();

      let validCount = 0;
      let invalidCount = 0;
      let createCount = 0;
      let updateCount = 0;
      let unchangedCount = 0;
      let conflictCount = 0;

      for (const row of rows) {
        const rowNumber = row._rowNumber;
        const rowErrors: RowValidationError[] = [...(row._formulaErrors || [])];
        const changes: RowChangeDiff[] = [];

        if (entityType === 'MODEL') {
          const brandCode = row.BRAND_CODE?.trim().toUpperCase();
          const productCode = row.PRODUCT_CODE?.trim().toUpperCase();
          const modelCode = row.MODEL_CODE?.trim().toUpperCase();
          const modelName = row.MODEL_NAME?.trim();
          const technicalName = row.TECHNICAL_NAME?.trim() || undefined;
          const softwareVersion = row.SOFTWARE_VERSION?.trim() || undefined;
          const releaseDateRaw = row.RELEASE_DATE;

          const naturalKey = brandCode && modelCode ? `${brandCode} / ${modelCode}` : `Row ${rowNumber}`;
          const internalKey = `${brandCode || ''}__${modelCode || ''}`;

          // Required field checks
          if (!brandCode) {
            rowErrors.push({
              rowNumber,
              field: 'BRAND_CODE',
              code: 'REQUIRED_FIELD',
              message: 'Brand code is required.',
            });
          }
          if (!productCode) {
            rowErrors.push({
              rowNumber,
              field: 'PRODUCT_CODE',
              code: 'REQUIRED_FIELD',
              message: 'Product code is required.',
            });
          }
          if (!modelCode) {
            rowErrors.push({
              rowNumber,
              field: 'MODEL_CODE',
              code: 'REQUIRED_FIELD',
              message: 'Model code is required.',
            });
          }
          if (!modelName) {
            rowErrors.push({
              rowNumber,
              field: 'MODEL_NAME',
              code: 'REQUIRED_FIELD',
              message: 'Model name is required.',
            });
          }

          // Date check
          const parsedDate = parseDateValue(releaseDateRaw);
          if (!parsedDate.valid) {
            rowErrors.push({
              rowNumber,
              field: 'RELEASE_DATE',
              code: 'INVALID_DATE',
              message: 'Release date must be a valid date in YYYY-MM-DD format.',
              suggestedCorrection: 'Use YYYY-MM-DD format (e.g. 2026-03-15).',
            });
          }

          // Reference checks
          const brandRec = brandCode ? brandMap.get(brandCode) : undefined;
          if (brandCode && !brandRec) {
            rowErrors.push({
              rowNumber,
              field: 'BRAND_CODE',
              code: 'BRAND_NOT_FOUND',
              message: `Brand code '${brandCode}' does not exist in master catalog.`,
            });
          } else if (brandRec && brandRec.isActive !== 'Y') {
            rowErrors.push({
              rowNumber,
              field: 'BRAND_CODE',
              code: 'INACTIVE_BRAND',
              message: `Brand '${brandCode}' is currently deactivated.`,
            });
          }

          const prodRec = productCode ? productMap.get(productCode) : undefined;
          if (productCode && !prodRec) {
            rowErrors.push({
              rowNumber,
              field: 'PRODUCT_CODE',
              code: 'PRODUCT_NOT_FOUND',
              message: `Product code '${productCode}' does not exist in master catalog.`,
            });
          } else if (prodRec && prodRec.isActive !== 'Y') {
            rowErrors.push({
              rowNumber,
              field: 'PRODUCT_CODE',
              code: 'INACTIVE_PRODUCT',
              message: `Product '${productCode}' is currently deactivated.`,
            });
          }

          // Duplicate in file check
          if (brandCode && modelCode) {
            if (seenFileKeys.has(internalKey)) {
              rowErrors.push({
                rowNumber,
                field: 'MODEL_CODE',
                code: 'DUPLICATE_IN_FILE',
                message: `Duplicate natural key '${brandCode} + ${modelCode}' found in this upload.`,
              });
            } else {
              seenFileKeys.add(internalKey);
            }
          }

          // Numeric and boolean fields
          const serialLength = row.SERIAL_NUMBER_LENGTH ? Number(row.SERIAL_NUMBER_LENGTH) : 15;
          if (isNaN(serialLength) || serialLength < 1 || serialLength > 50) {
            rowErrors.push({
              rowNumber,
              field: 'SERIAL_NUMBER_LENGTH',
              code: 'INVALID_NUMBER',
              message: 'Serial number length must be an integer between 1 and 50.',
            });
          }

          const checkSerial = parseBooleanIndicator(row.CHECK_SERIAL_NUMBER, 'Y');
          const isJobCreation = parseBooleanIndicator(row.IS_JOB_CREATION_ALLOWED, 'Y');
          const isDoa = parseBooleanIndicator(row.IS_DOA_ALLOWED, 'Y');
          const isRepair = parseBooleanIndicator(row.IS_REPAIRABLE, 'Y');
          const isReplacement = parseBooleanIndicator(row.IS_REPLACEMENT_ALLOWED, 'Y');
          const isOow = parseBooleanIndicator(row.IS_OUT_OF_WARRANTY_SERVICED, 'Y');
          const isActive = parseBooleanIndicator(row.IS_ACTIVE, 'Y');

          const custWarranty = row.CUSTOMER_WARRANTY_DAYS ? Number(row.CUSTOMER_WARRANTY_DAYS) : 365;
          const repairWarranty = row.REPAIR_WARRANTY_DAYS ? Number(row.REPAIR_WARRANTY_DAYS) : 90;
          const replWindow = row.REPLACEMENT_WINDOW_DAYS ? Number(row.REPLACEMENT_WINDOW_DAYS) : 30;
          const doaDays = row.DOA_DAYS ? Number(row.DOA_DAYS) : 7;
          const amcDays = row.AMC_DAYS ? Number(row.AMC_DAYS) : 0;
          const amcAmount = row.AMC_AMOUNT ? Number(row.AMC_AMOUNT) : 0.0;
          const stdServiceCharge = row.STANDARD_SERVICE_CHARGE ? Number(row.STANDARD_SERVICE_CHARGE) : 0.0;

          if (isNaN(custWarranty) || custWarranty < 0) {
            rowErrors.push({ rowNumber, field: 'CUSTOMER_WARRANTY_DAYS', code: 'INVALID_NUMBER', message: 'Customer warranty days must be >= 0.' });
          }
          if (isNaN(repairWarranty) || repairWarranty < 0) {
            rowErrors.push({ rowNumber, field: 'REPAIR_WARRANTY_DAYS', code: 'INVALID_NUMBER', message: 'Repair warranty days must be >= 0.' });
          }
          if (isNaN(amcAmount) || amcAmount < 0) {
            rowErrors.push({ rowNumber, field: 'AMC_AMOUNT', code: 'INVALID_NUMBER', message: 'AMC amount must be >= 0.' });
          }
          if (isNaN(stdServiceCharge) || stdServiceCharge < 0) {
            rowErrors.push({ rowNumber, field: 'STANDARD_SERVICE_CHARGE', code: 'INVALID_NUMBER', message: 'Standard service charge must be >= 0.' });
          }

          const parsedModel: ModelImportRowParsed = {
            rowNumber,
            brandCode,
            productCode,
            modelCode,
            modelName,
            technicalName,
            softwareVersion,
            serialNumberLength: serialLength,
            checkSerialNumber: checkSerial.value,
            isJobCreationAllowed: isJobCreation.value,
            isDoaAllowed: isDoa.value,
            isRepairable: isRepair.value,
            isReplacementAllowed: isReplacement.value,
            customerWarrantyDays: custWarranty,
            repairWarrantyDays: repairWarranty,
            replacementWindowDays: replWindow,
            doaDays,
            amcDays,
            amcAmount,
            isOutOfWarrantyServiced: isOow.value,
            standardServiceCharge: stdServiceCharge,
            releaseDate: parsedDate.dateStr,
            isActive: isActive.value,
          };

          // Compare against DB record
          const existing = existingRecordsMap.get(internalKey);
          let action: RowAction = 'CREATE';

          if (existing) {
            if (mode === 'CREATE_ONLY') {
              action = 'CONFLICT';
              rowErrors.push({
                rowNumber,
                field: 'MODEL_CODE',
                code: 'CONFLICT_RECORD_EXISTS',
                message: `Model '${modelCode}' already exists for brand '${brandCode}'. Cannot overwrite in Create-Only mode.`,
                suggestedCorrection: 'Use Update/Merge mode or remove this row from the template.',
              });
            } else {
              // UPDATE_EXISTING mode -> compute diff
              action = 'UPDATE';

              const compareField = (field: string, oldVal: any, newVal: any) => {
                const sOld = oldVal === null || oldVal === undefined ? '' : String(oldVal);
                const sNew = newVal === null || newVal === undefined ? '' : String(newVal);
                if (sOld !== sNew) {
                  changes.push({ field, oldValue: oldVal, newValue: newVal });
                }
              };

              compareField('MODEL_NAME', existing.MODEL_NAME, parsedModel.modelName);
              compareField('TECHNICAL_NAME', existing.TECHNICAL_NAME, parsedModel.technicalName);
              compareField('SOFTWARE_VERSION', existing.SOFTWARE_VERSION, parsedModel.softwareVersion);
              compareField('SERIAL_NUMBER_LENGTH', Number(existing.SERIAL_NUMBER_LENGTH), parsedModel.serialNumberLength);
              compareField('CHECK_SERIAL_NUMBER', existing.CHECK_SERIAL_NUMBER, parsedModel.checkSerialNumber);
              compareField('IS_JOB_CREATION_ALLOWED', existing.IS_JOB_CREATION_ALLOWED, parsedModel.isJobCreationAllowed);
              compareField('IS_DOA_ALLOWED', existing.IS_DOA_ALLOWED, parsedModel.isDoaAllowed);
              compareField('IS_REPAIRABLE', existing.IS_REPAIRABLE, parsedModel.isRepairable);
              compareField('IS_REPLACEMENT_ALLOWED', existing.IS_REPLACEMENT_ALLOWED, parsedModel.isReplacementAllowed);
              compareField('CUSTOMER_WARRANTY_DAYS', Number(existing.CUSTOMER_WARRANTY_DAYS), parsedModel.customerWarrantyDays);
              compareField('REPAIR_WARRANTY_DAYS', Number(existing.REPAIR_WARRANTY_DAYS), parsedModel.repairWarrantyDays);
              compareField('REPLACEMENT_WINDOW_DAYS', Number(existing.REPLACEMENT_WINDOW_DAYS), parsedModel.replacementWindowDays);
              compareField('DOA_DAYS', Number(existing.DOA_DAYS), parsedModel.doaDays);
              compareField('AMC_DAYS', Number(existing.AMC_DAYS), parsedModel.amcDays);
              compareField('AMC_AMOUNT', Number(existing.AMC_AMOUNT), parsedModel.amcAmount);
              compareField('IS_OUT_OF_WARRANTY_SERVICED', existing.IS_OUT_OF_WARRANTY_SERVICED, parsedModel.isOutOfWarrantyServiced);
              compareField('STANDARD_SERVICE_CHARGE', Number(existing.STANDARD_SERVICE_CHARGE), parsedModel.standardServiceCharge);

              const dbDate = existing.RELEASE_DATE ? new Date(existing.RELEASE_DATE).toISOString().slice(0, 10) : '';
              compareField('RELEASE_DATE', dbDate, parsedModel.releaseDate);
              compareField('IS_ACTIVE', existing.IS_ACTIVE, parsedModel.isActive);

              if (changes.length === 0) {
                action = 'UNCHANGED';
              }
            }
          }

          const isValid = rowErrors.length === 0;
          if (isValid) {
            validCount++;
            if (action === 'CREATE') createCount++;
            else if (action === 'UPDATE') updateCount++;
            else if (action === 'UNCHANGED') unchangedCount++;
          } else {
            invalidCount++;
            conflictCount++;
            action = 'CONFLICT';
          }

          previewRows.push({
            rowNumber,
            naturalKey,
            action,
            isValid,
            errors: rowErrors,
            changes,
            parsedData: {
              ...parsedModel,
              brandId: brandRec?.brandId,
              productId: prodRec?.productId,
            },
            targetRecordId: existing?.MODEL_ID,
            targetVersionNo: existing ? Number(existing.VERSION_NO) : undefined,
          });
        } else {
          // PART CODES
          const brandCode = row.BRAND_CODE?.trim().toUpperCase();
          const productCode = row.PRODUCT_CODE?.trim().toUpperCase();
          const partCode = row.PART_CODE?.trim().toUpperCase();
          const vendorPartCode = row.VENDOR_PART_CODE?.trim() || undefined;
          const partName = row.PART_NAME?.trim();
          const partDescription = row.PART_DESCRIPTION?.trim() || undefined;
          const hsnCode = row.HSN_CODE?.trim().toUpperCase();
          const partCategoryRaw = row.PART_CATEGORY?.trim().toUpperCase();
          const partFor = row.PART_FOR?.trim() || undefined;
          const faultyDispatch = row.FAULTY_PART_DISPATCH_TO?.trim() || 'WAREHOUSE';

          const naturalKey = brandCode && partCode ? `${brandCode} / ${partCode}` : `Row ${rowNumber}`;
          const internalKey = `${brandCode || ''}__${partCode || ''}`;

          if (!brandCode) {
            rowErrors.push({ rowNumber, field: 'BRAND_CODE', code: 'REQUIRED_FIELD', message: 'Brand code is required.' });
          }
          if (!productCode) {
            rowErrors.push({ rowNumber, field: 'PRODUCT_CODE', code: 'REQUIRED_FIELD', message: 'Product code is required.' });
          }
          if (!partCode) {
            rowErrors.push({ rowNumber, field: 'PART_CODE', code: 'REQUIRED_FIELD', message: 'Part code is required.' });
          }
          if (!partName) {
            rowErrors.push({ rowNumber, field: 'PART_NAME', code: 'REQUIRED_FIELD', message: 'Part name is required.' });
          }
          if (!hsnCode) {
            rowErrors.push({ rowNumber, field: 'HSN_CODE', code: 'REQUIRED_FIELD', message: 'HSN code is required.' });
          }

          const allowedCategories = ['SPARE', 'CONSUMABLE', 'ACCESSORY'];
          if (!partCategoryRaw || !allowedCategories.includes(partCategoryRaw)) {
            rowErrors.push({
              rowNumber,
              field: 'PART_CATEGORY',
              code: 'INVALID_CATEGORY',
              message: `Part category must be one of: ${allowedCategories.join(', ')}.`,
              suggestedCorrection: 'Use SPARE, CONSUMABLE, or ACCESSORY.',
            });
          }

          const custPrice = row.CUSTOMER_PRICE ? Number(row.CUSTOMER_PRICE) : NaN;
          const locPrice = row.LOCATION_PRICE ? Number(row.LOCATION_PRICE) : NaN;
          const warrantyDays = row.WARRANTY_DAYS ? Number(row.WARRANTY_DAYS) : 90;
          const isActive = parseBooleanIndicator(row.IS_ACTIVE, 'Y');

          if (isNaN(custPrice) || custPrice < 0) {
            rowErrors.push({ rowNumber, field: 'CUSTOMER_PRICE', code: 'INVALID_PRICE', message: 'Customer price must be a valid number >= 0.' });
          }
          if (isNaN(locPrice) || locPrice < 0) {
            rowErrors.push({ rowNumber, field: 'LOCATION_PRICE', code: 'INVALID_PRICE', message: 'Location price must be a valid number >= 0.' });
          }
          if (isNaN(warrantyDays) || warrantyDays < 0) {
            rowErrors.push({ rowNumber, field: 'WARRANTY_DAYS', code: 'INVALID_NUMBER', message: 'Warranty days must be an integer >= 0.' });
          }

          // References
          const brandRec = brandCode ? brandMap.get(brandCode) : undefined;
          if (brandCode && !brandRec) {
            rowErrors.push({ rowNumber, field: 'BRAND_CODE', code: 'BRAND_NOT_FOUND', message: `Brand code '${brandCode}' does not exist.` });
          } else if (brandRec && brandRec.isActive !== 'Y') {
            rowErrors.push({ rowNumber, field: 'BRAND_CODE', code: 'INACTIVE_BRAND', message: `Brand '${brandCode}' is deactivated.` });
          }

          const prodRec = productCode ? productMap.get(productCode) : undefined;
          if (productCode && !prodRec) {
            rowErrors.push({ rowNumber, field: 'PRODUCT_CODE', code: 'PRODUCT_NOT_FOUND', message: `Product code '${productCode}' does not exist.` });
          } else if (prodRec && prodRec.isActive !== 'Y') {
            rowErrors.push({ rowNumber, field: 'PRODUCT_CODE', code: 'INACTIVE_PRODUCT', message: `Product '${productCode}' is deactivated.` });
          }

          const hsnRec = hsnCode ? hsnMap.get(hsnCode) : undefined;
          if (hsnCode && !hsnRec) {
            rowErrors.push({ rowNumber, field: 'HSN_CODE', code: 'HSN_NOT_FOUND', message: `HSN code '${hsnCode}' does not exist in HSN tax masters.` });
          } else if (hsnRec && hsnRec.isActive !== 'Y') {
            rowErrors.push({ rowNumber, field: 'HSN_CODE', code: 'INACTIVE_HSN', message: `HSN code '${hsnCode}' is deactivated.` });
          }

          // Duplicate in file check
          if (brandCode && partCode) {
            if (seenFileKeys.has(internalKey)) {
              rowErrors.push({
                rowNumber,
                field: 'PART_CODE',
                code: 'DUPLICATE_IN_FILE',
                message: `Duplicate natural key '${brandCode} + ${partCode}' found in this upload.`,
              });
            } else {
              seenFileKeys.add(internalKey);
            }
          }

          const parsedPart: PartImportRowParsed = {
            rowNumber,
            brandCode,
            productCode,
            partCode,
            vendorPartCode,
            partName,
            partDescription,
            hsnCode,
            partCategory: (partCategoryRaw as any) || 'SPARE',
            partFor,
            customerPrice: isNaN(custPrice) ? 0 : custPrice,
            locationPrice: isNaN(locPrice) ? 0 : locPrice,
            faultyPartDispatchTo: faultyDispatch,
            warrantyDays,
            isActive: isActive.value,
          };

          const existing = existingRecordsMap.get(internalKey);
          let action: RowAction = 'CREATE';

          if (existing) {
            if (mode === 'CREATE_ONLY') {
              action = 'CONFLICT';
              rowErrors.push({
                rowNumber,
                field: 'PART_CODE',
                code: 'CONFLICT_RECORD_EXISTS',
                message: `Part '${partCode}' already exists for brand '${brandCode}'. Cannot overwrite in Create-Only mode.`,
                suggestedCorrection: 'Use Update/Merge mode or remove this row from the template.',
              });
            } else {
              action = 'UPDATE';

              const compareField = (field: string, oldVal: any, newVal: any) => {
                const sOld = oldVal === null || oldVal === undefined ? '' : String(oldVal);
                const sNew = newVal === null || newVal === undefined ? '' : String(newVal);
                if (sOld !== sNew) {
                  changes.push({ field, oldValue: oldVal, newValue: newVal });
                }
              };

              compareField('VENDOR_PART_CODE', existing.VENDOR_PART_CODE, parsedPart.vendorPartCode);
              compareField('PART_NAME', existing.PART_NAME, parsedPart.partName);
              compareField('PART_DESCRIPTION', existing.PART_DESCRIPTION, parsedPart.partDescription);
              compareField('HSN_CODE', existing.HSN_CODE, parsedPart.hsnCode);
              compareField('PART_CATEGORY', existing.PART_CATEGORY, parsedPart.partCategory);
              compareField('PART_FOR', existing.PART_FOR, parsedPart.partFor);
              compareField('CUSTOMER_PRICE', Number(existing.CUSTOMER_PRICE), parsedPart.customerPrice);
              compareField('LOCATION_PRICE', Number(existing.LOCATION_PRICE), parsedPart.locationPrice);
              compareField('FAULTY_PART_DISPATCH_TO', existing.FAULTY_PART_DISPATCH_TO, parsedPart.faultyPartDispatchTo);
              compareField('WARRANTY_DAYS', Number(existing.WARRANTY_DAYS), parsedPart.warrantyDays);
              compareField('IS_ACTIVE', existing.IS_ACTIVE, parsedPart.isActive);

              if (changes.length === 0) {
                action = 'UNCHANGED';
              }
            }
          }

          const isValid = rowErrors.length === 0;
          if (isValid) {
            validCount++;
            if (action === 'CREATE') createCount++;
            else if (action === 'UPDATE') updateCount++;
            else if (action === 'UNCHANGED') unchangedCount++;
          } else {
            invalidCount++;
            conflictCount++;
            action = 'CONFLICT';
          }

          previewRows.push({
            rowNumber,
            naturalKey,
            action,
            isValid,
            errors: rowErrors,
            changes,
            parsedData: {
              ...parsedPart,
              brandId: brandRec?.brandId,
              productId: prodRec?.productId,
              hsnId: hsnRec?.hsnId,
            },
            targetRecordId: existing?.PART_ID,
            targetVersionNo: existing ? Number(existing.VERSION_NO) : undefined,
          });
        }
      }

      const jobId = crypto.randomUUID();
      const canCommit = invalidCount === 0 && conflictCount === 0 && previewRows.length > 0;

      const summary: BulkImportPreviewSummary = {
        jobId,
        entityType,
        importMode: mode,
        fileName,
        fileChecksum,
        templateVersion,
        totalRows: previewRows.length,
        validRows: validCount,
        invalidRows: invalidCount,
        createRows: createCount,
        updateRows: updateCount,
        unchangedRows: unchangedCount,
        conflictRows: conflictCount,
        canCommit,
        rows: previewRows,
      };

      // Persist Job and Preview state in Oracle
      await bulkImportRepository.createJob({
        jobId,
        entityType,
        importMode: mode,
        status: 'PREVIEW_READY',
        fileName,
        fileChecksum,
        templateVersion,
        totalRows: previewRows.length,
        validRows: validCount,
        invalidRows: invalidCount,
        createRows: createCount,
        updateRows: updateCount,
        unchangedRows: unchangedCount,
        conflictRows: conflictCount,
        previewPayload: JSON.stringify(summary),
        errorSummary: invalidCount > 0 ? `${invalidCount} row(s) failed validation.` : undefined,
        createdBy: user.userId,
        createdByUsername: user.username,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return summary;
    } finally {
      await conn.close();
    }
  }

  /**
   * Transactional commit: all-or-nothing execution with rollback on any failure
   */
  async commitImport(
    jobId: string,
    user: { userId: string; username: string; ipAddress?: string; userAgent?: string }
  ): Promise<BulkImportCommitResult> {
    const job = await bulkImportRepository.findById(jobId);
    if (!job) {
      throw new AppError('Import job not found.', 404, 'JOB_NOT_FOUND');
    }

    if (job.status !== 'PREVIEW_READY') {
      if (job.status === 'COMPLETED') {
        throw new AppError('This import job has already been committed.', 409, 'ALREADY_COMMITTED');
      }
      if (job.status === 'COMMITTING') {
        throw new AppError('This import job is currently being processed.', 409, 'JOB_IN_PROGRESS');
      }
      throw new AppError(`Cannot commit import job in state: ${job.status}`, 400, 'INVALID_JOB_STATE');
    }

    // Authorization guard: job must belong to user or user must have admin/import authority
    if (job.createdBy !== user.userId) {
      // In production, we permit admins to commit, but reject unauthorized cross-user commits
      // We will check in controller/middleware
    }

    if (!job.previewPayload) {
      throw new AppError('Preview data is missing for this job.', 400, 'PREVIEW_DATA_MISSING');
    }

    const previewSummary: BulkImportPreviewSummary = JSON.parse(job.previewPayload);
    if (!previewSummary.canCommit || previewSummary.invalidRows > 0 || previewSummary.conflictRows > 0) {
      throw new AppError(
        'Cannot commit import because it contains unresolved validation errors or conflicts. All rows must be valid.',
        400,
        'COMMIT_BLOCKED_BY_ERRORS'
      );
    }

    const startTime = Date.now();
    await bulkImportRepository.updateJob(jobId, { status: 'COMMITTING' });

    const conn = await getOracleConnection();
    try {
      let createdRows = 0;
      let updatedRows = 0;
      let unchangedRows = 0;

      if (job.entityType === 'MODEL') {
        for (const row of previewSummary.rows) {
          const data = row.parsedData;
          if (row.action === 'CREATE') {
            const modelId = crypto.randomUUID();
            const sql = `
              INSERT INTO MODELS (
                MODEL_ID, BRAND_ID, PRODUCT_ID, MODEL_CODE, MODEL_NAME, TECHNICAL_NAME,
                SOFTWARE_VERSION, SERIAL_NUMBER_LENGTH, CHECK_SERIAL_NUMBER,
                IS_JOB_CREATION_ALLOWED, IS_DOA_ALLOWED, IS_REPAIRABLE, IS_REPLACEMENT_ALLOWED,
                CUSTOMER_WARRANTY_DAYS, REPAIR_WARRANTY_DAYS, REPLACEMENT_WINDOW_DAYS, DOA_DAYS,
                AMC_DAYS, AMC_AMOUNT, IS_OUT_OF_WARRANTY_SERVICED, STANDARD_SERVICE_CHARGE,
                RELEASE_DATE, IS_ACTIVE, VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
              ) VALUES (
                :modelId, :brandId, :productId, :modelCode, :modelName, :technicalName,
                :softwareVersion, :serialNumberLength, :checkSerialNumber,
                :isJobCreationAllowed, :isDoaAllowed, :isRepairable, :isReplacementAllowed,
                :customerWarrantyDays, :repairWarrantyDays, :replacementWindowDays, :doaDays,
                :amcDays, :amcAmount, :isOutOfWarrantyServiced, :standardServiceCharge,
                TO_DATE(:releaseDate, 'YYYY-MM-DD'), :isActive, 1, SYSTIMESTAMP, SYSTIMESTAMP, :createdBy, :createdBy
              )
            `;

            await conn.execute(
              sql,
              {
                modelId,
                brandId: data.brandId,
                productId: data.productId,
                modelCode: data.modelCode,
                modelName: data.modelName,
                technicalName: data.technicalName || null,
                softwareVersion: data.softwareVersion || null,
                serialNumberLength: data.serialNumberLength,
                checkSerialNumber: data.checkSerialNumber,
                isJobCreationAllowed: data.isJobCreationAllowed,
                isDoaAllowed: data.isDoaAllowed,
                isRepairable: data.isRepairable,
                isReplacementAllowed: data.isReplacementAllowed,
                customerWarrantyDays: data.customerWarrantyDays,
                repairWarrantyDays: data.repairWarrantyDays,
                replacementWindowDays: data.replacementWindowDays,
                doaDays: data.doaDays,
                amcDays: data.amcDays,
                amcAmount: data.amcAmount,
                isOutOfWarrantyServiced: data.isOutOfWarrantyServiced,
                standardServiceCharge: data.standardServiceCharge,
                releaseDate: data.releaseDate,
                isActive: data.isActive,
                createdBy: user.username,
              },
              { autoCommit: false }
            );

            await auditRepository.recordCatalogAudit(
              {
                entityName: 'MODEL',
                entityId: modelId,
                action: 'CREATE',
                performedBy: user.userId,
                performedByUsername: user.username,
                changes: {
                  importJobId: jobId,
                  mode: job.importMode,
                  modelCode: data.modelCode,
                  modelName: data.modelName,
                },
                ipAddress: user.ipAddress,
                userAgent: user.userAgent,
              },
              conn
            );

            createdRows++;
          } else if (row.action === 'UPDATE') {
            // Concurrency check: verify VERSION_NO
            const modelId = row.targetRecordId!;
            const expectedVersion = row.targetVersionNo!;

            const updateSql = `
              UPDATE MODELS
              SET MODEL_NAME = :modelName,
                  TECHNICAL_NAME = :technicalName,
                  SOFTWARE_VERSION = :softwareVersion,
                  SERIAL_NUMBER_LENGTH = :serialNumberLength,
                  CHECK_SERIAL_NUMBER = :checkSerialNumber,
                  IS_JOB_CREATION_ALLOWED = :isJobCreationAllowed,
                  IS_DOA_ALLOWED = :isDoaAllowed,
                  IS_REPAIRABLE = :isRepairable,
                  IS_REPLACEMENT_ALLOWED = :isReplacementAllowed,
                  CUSTOMER_WARRANTY_DAYS = :customerWarrantyDays,
                  REPAIR_WARRANTY_DAYS = :repairWarrantyDays,
                  REPLACEMENT_WINDOW_DAYS = :replacementWindowDays,
                  DOA_DAYS = :doaDays,
                  AMC_DAYS = :amcDays,
                  AMC_AMOUNT = :amcAmount,
                  IS_OUT_OF_WARRANTY_SERVICED = :isOutOfWarrantyServiced,
                  STANDARD_SERVICE_CHARGE = :standardServiceCharge,
                  RELEASE_DATE = TO_DATE(:releaseDate, 'YYYY-MM-DD'),
                  IS_ACTIVE = :isActive,
                  VERSION_NO = VERSION_NO + 1,
                  UPDATED_AT = SYSTIMESTAMP,
                  UPDATED_BY = :updatedBy
              WHERE MODEL_ID = :modelId
                AND VERSION_NO = :expectedVersion
            `;

            const updateRes = await conn.execute(
              updateSql,
              {
                modelId,
                expectedVersion,
                modelName: data.modelName,
                technicalName: data.technicalName || null,
                softwareVersion: data.softwareVersion || null,
                serialNumberLength: data.serialNumberLength,
                checkSerialNumber: data.checkSerialNumber,
                isJobCreationAllowed: data.isJobCreationAllowed,
                isDoaAllowed: data.isDoaAllowed,
                isRepairable: data.isRepairable,
                isReplacementAllowed: data.isReplacementAllowed,
                customerWarrantyDays: data.customerWarrantyDays,
                repairWarrantyDays: data.repairWarrantyDays,
                replacementWindowDays: data.replacementWindowDays,
                doaDays: data.doaDays,
                amcDays: data.amcDays,
                amcAmount: data.amcAmount,
                isOutOfWarrantyServiced: data.isOutOfWarrantyServiced,
                standardServiceCharge: data.standardServiceCharge,
                releaseDate: data.releaseDate,
                isActive: data.isActive,
                updatedBy: user.username,
              },
              { autoCommit: false }
            );

            if (updateRes.rowsAffected === 0) {
              throw new AppError(
                `Concurrent modification conflict: Model '${data.modelCode}' was modified by another transaction after preview. Import aborted to prevent data loss.`,
                409,
                'CONCURRENCY_CONFLICT'
              );
            }

            await auditRepository.recordCatalogAudit(
              {
                entityName: 'MODEL',
                entityId: modelId,
                action: 'UPDATE',
                performedBy: user.userId,
                performedByUsername: user.username,
                changes: {
                  importJobId: jobId,
                  changes: row.changes,
                },
                ipAddress: user.ipAddress,
                userAgent: user.userAgent,
              },
              conn
            );

            updatedRows++;
          } else if (row.action === 'UNCHANGED') {
            unchangedRows++;
          }
        }
      } else {
        // PART CODES COMMIT
        for (const row of previewSummary.rows) {
          const data = row.parsedData;
          if (row.action === 'CREATE') {
            const partId = crypto.randomUUID();
            const sql = `
              INSERT INTO PART_CODES (
                PART_ID, BRAND_ID, PRODUCT_ID, PART_CODE, VENDOR_PART_CODE,
                PART_NAME, PART_DESCRIPTION, HSN_ID, PART_CATEGORY, PART_FOR,
                CUSTOMER_PRICE, LOCATION_PRICE, FAULTY_PART_DISPATCH_TO, WARRANTY_DAYS,
                IS_ACTIVE, VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY, UPDATED_BY
              ) VALUES (
                :partId, :brandId, :productId, :partCode, :vendorPartCode,
                :partName, :partDescription, :hsnId, :partCategory, :partFor,
                :customerPrice, :locationPrice, :faultyPartDispatchTo, :warrantyDays,
                :isActive, 1, SYSTIMESTAMP, SYSTIMESTAMP, :createdBy, :createdBy
              )
            `;

            await conn.execute(
              sql,
              {
                partId,
                brandId: data.brandId,
                productId: data.productId,
                partCode: data.partCode,
                vendorPartCode: data.vendorPartCode || null,
                partName: data.partName,
                partDescription: data.partDescription || null,
                hsnId: data.hsnId,
                partCategory: data.partCategory,
                partFor: data.partFor || null,
                customerPrice: data.customerPrice,
                locationPrice: data.locationPrice,
                faultyPartDispatchTo: data.faultyPartDispatchTo || 'WAREHOUSE',
                warrantyDays: data.warrantyDays,
                isActive: data.isActive,
                createdBy: user.username,
              },
              { autoCommit: false }
            );

            await auditRepository.recordCatalogAudit(
              {
                entityName: 'PART',
                entityId: partId,
                action: 'CREATE',
                performedBy: user.userId,
                performedByUsername: user.username,
                changes: {
                  importJobId: jobId,
                  mode: job.importMode,
                  partCode: data.partCode,
                  partName: data.partName,
                },
                ipAddress: user.ipAddress,
                userAgent: user.userAgent,
              },
              conn
            );

            createdRows++;
          } else if (row.action === 'UPDATE') {
            const partId = row.targetRecordId!;
            const expectedVersion = row.targetVersionNo!;

            const updateSql = `
              UPDATE PART_CODES
              SET VENDOR_PART_CODE = :vendorPartCode,
                  PART_NAME = :partName,
                  PART_DESCRIPTION = :partDescription,
                  HSN_ID = :hsnId,
                  PART_CATEGORY = :partCategory,
                  PART_FOR = :partFor,
                  CUSTOMER_PRICE = :customerPrice,
                  LOCATION_PRICE = :locationPrice,
                  FAULTY_PART_DISPATCH_TO = :faultyPartDispatchTo,
                  WARRANTY_DAYS = :warrantyDays,
                  IS_ACTIVE = :isActive,
                  VERSION_NO = VERSION_NO + 1,
                  UPDATED_AT = SYSTIMESTAMP,
                  UPDATED_BY = :updatedBy
              WHERE PART_ID = :partId
                AND VERSION_NO = :expectedVersion
            `;

            const updateRes = await conn.execute(
              updateSql,
              {
                partId,
                expectedVersion,
                vendorPartCode: data.vendorPartCode || null,
                partName: data.partName,
                partDescription: data.partDescription || null,
                hsnId: data.hsnId,
                partCategory: data.partCategory,
                partFor: data.partFor || null,
                customerPrice: data.customerPrice,
                locationPrice: data.locationPrice,
                faultyPartDispatchTo: data.faultyPartDispatchTo || 'WAREHOUSE',
                warrantyDays: data.warrantyDays,
                isActive: data.isActive,
                updatedBy: user.username,
              },
              { autoCommit: false }
            );

            if (updateRes.rowsAffected === 0) {
              throw new AppError(
                `Concurrent modification conflict: Part '${data.partCode}' was modified by another transaction after preview. Import aborted to prevent data loss.`,
                409,
                'CONCURRENCY_CONFLICT'
              );
            }

            await auditRepository.recordCatalogAudit(
              {
                entityName: 'PART',
                entityId: partId,
                action: 'UPDATE',
                performedBy: user.userId,
                performedByUsername: user.username,
                changes: {
                  importJobId: jobId,
                  changes: row.changes,
                },
                ipAddress: user.ipAddress,
                userAgent: user.userAgent,
              },
              conn
            );

            updatedRows++;
          } else if (row.action === 'UNCHANGED') {
            unchangedRows++;
          }
        }
      }

      const durationMs = Date.now() - startTime;
      const committedAt = new Date();

      const commitResult: BulkImportCommitResult = {
        jobId,
        status: 'COMPLETED',
        entityType: job.entityType,
        importMode: job.importMode,
        totalRows: previewSummary.totalRows,
        createdRows,
        updatedRows,
        unchangedRows,
        failedRows: 0,
        durationMs,
        committedAt: committedAt.toISOString(),
      };

      // Update BULK_IMPORT_JOBS inside the same transaction
      await bulkImportRepository.updateJob(
        jobId,
        {
          status: 'COMPLETED',
          committedAt,
          resultPayload: JSON.stringify(commitResult),
        },
        conn
      );

      // Commit the transaction
      await conn.commit();

      return commitResult;
    } catch (err) {
      await conn.rollback();
      const errMsg = err instanceof Error ? err.message : String(err);
      await bulkImportRepository.updateJob(jobId, {
        status: 'FAILED',
        errorSummary: errMsg.slice(0, 1000),
      });
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Generate downloadable result/error Excel report
   */
  async generateResultReport(jobId: string): Promise<{ buffer: Buffer; fileName: string }> {
    const job = await bulkImportRepository.findById(jobId);
    if (!job) {
      throw new AppError('Import job not found.', 404, 'JOB_NOT_FOUND');
    }

    if (!job.previewPayload) {
      throw new AppError('Report data is not available for this job.', 400, 'REPORT_DATA_MISSING');
    }

    const preview: BulkImportPreviewSummary = JSON.parse(job.previewPayload);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Enterprise After-Sales Service CRM';
    workbook.created = new Date();

    // Summary Sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Attribute', key: 'attr', width: 25 },
      { header: 'Value', key: 'val', width: 50 },
    ];
    summarySheet.getRow(1).font = { bold: true };

    summarySheet.addRows([
      { attr: 'Job ID', val: job.jobId },
      { attr: 'Entity Type', val: job.entityType },
      { attr: 'Import Mode', val: job.importMode },
      { attr: 'Final Status', val: job.status },
      { attr: 'Original File', val: job.fileName },
      { attr: 'File SHA-256 Checksum', val: job.fileChecksum },
      { attr: 'Total Rows', val: job.totalRows },
      { attr: 'Valid Rows', val: job.validRows },
      { attr: 'Invalid Rows', val: job.invalidRows },
      { attr: 'Created Rows', val: job.createRows },
      { attr: 'Updated Rows', val: job.updateRows },
      { attr: 'Unchanged Rows', val: job.unchangedRows },
      { attr: 'Initiated By', val: job.createdByUsername },
      { attr: 'Created At', val: job.createdAt.toISOString() },
      { attr: 'Committed At', val: job.committedAt ? job.committedAt.toISOString() : 'N/A' },
      { attr: 'Error Summary', val: job.errorSummary || 'None' },
    ]);

    // Row Details Sheet
    const detailsSheet = workbook.addWorksheet('Row_Details');
    detailsSheet.columns = [
      { header: 'Row #', key: 'rowNumber', width: 10 },
      { header: 'Natural Key', key: 'naturalKey', width: 30 },
      { header: 'Status / Action', key: 'action', width: 18 },
      { header: 'Is Valid', key: 'isValid', width: 12 },
      { header: 'Error Codes', key: 'errorCodes', width: 25 },
      { header: 'Error Details / Suggested Correction', key: 'errorDetails', width: 55 },
      { header: 'Changes Applied (Field Diff)', key: 'changes', width: 50 },
    ];

    detailsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    detailsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: job.status === 'COMPLETED' ? 'FF2E7D32' : 'FFC62828' },
    };

    for (const r of preview.rows) {
      const errorCodes = r.errors.map((e) => e.code).join(', ');
      const errorDetails = r.errors
        .map((e) => `${e.field}: ${e.message}${e.suggestedCorrection ? ` (${e.suggestedCorrection})` : ''}`)
        .join(' | ');

      const changesSummary = r.changes.map((c) => `${c.field}: ${c.oldValue} -> ${c.newValue}`).join('; ');

      const sheetRow = detailsSheet.addRow({
        rowNumber: r.rowNumber,
        naturalKey: sanitizeReportCell(r.naturalKey),
        action: sanitizeReportCell(r.action),
        isValid: r.isValid ? 'YES' : 'NO',
        errorCodes: sanitizeReportCell(errorCodes),
        errorDetails: sanitizeReportCell(errorDetails),
        changes: sanitizeReportCell(changesSummary),
      });

      if (!r.isValid) {
        sheetRow.font = { color: { argb: 'FFD32F2F' } };
      }
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const fileName = `import_report_${job.entityType.toLowerCase()}_${job.jobId.slice(0, 8)}.xlsx`;
    return { buffer, fileName };
  }
}

export const bulkImportService = new BulkImportService();
