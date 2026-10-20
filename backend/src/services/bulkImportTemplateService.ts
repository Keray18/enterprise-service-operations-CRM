import ExcelJS from 'exceljs';
import { BulkImportEntityType } from '../types/bulkImport.js';

export const TEMPLATE_VERSIONS = {
  MODEL: 'MODEL_IMPORT_V1',
  PART: 'PART_IMPORT_V1',
} as const;

export class BulkImportTemplateService {
  async generateModelTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Enterprise After-Sales Service CRM';
    workbook.created = new Date();

    // Sheet 1: Instructions
    const instructionsSheet = workbook.addWorksheet('Instructions');
    instructionsSheet.columns = [
      { header: 'Item', key: 'item', width: 25 },
      { header: 'Specification / Instruction', key: 'spec', width: 75 },
    ];

    instructionsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    instructionsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1976D2' },
    };

    const instructionsData = [
      { item: 'Template Version', spec: TEMPLATE_VERSIONS.MODEL },
      { item: 'Target Entity', spec: 'Catalog Models Master' },
      { item: 'Required Columns (*)', spec: 'BRAND_CODE, PRODUCT_CODE, MODEL_CODE, MODEL_NAME, RELEASE_DATE' },
      { item: 'Natural Key', spec: 'BRAND_CODE + MODEL_CODE (Must be unique within brand)' },
      { item: 'Date Format', spec: 'YYYY-MM-DD (e.g. 2026-03-15)' },
      { item: 'Boolean Indicators', spec: 'Y or N for CHECK_SERIAL_NUMBER, IS_JOB_CREATION_ALLOWED, IS_DOA_ALLOWED, IS_REPAIRABLE, IS_REPLACEMENT_ALLOWED, IS_OUT_OF_WARRANTY_SERVICED, IS_ACTIVE' },
      { item: 'Numeric Defaults', spec: 'SERIAL_NUMBER_LENGTH (15), CUSTOMER_WARRANTY_DAYS (365), REPAIR_WARRANTY_DAYS (90), REPLACEMENT_WINDOW_DAYS (30), DOA_DAYS (7), AMC_DAYS (0), AMC_AMOUNT (0.00), STANDARD_SERVICE_CHARGE (0.00)' },
      { item: 'Important Security Note', spec: 'Formulas and macros are strictly forbidden and will cause the upload to be rejected.' },
      { item: 'Row Limit', spec: 'Maximum 1,000 data rows per upload.' },
      { item: 'Sample Data', spec: 'See the "Models" sheet. The sample row is for illustration and should be replaced with real data.' },
    ];

    instructionsData.forEach((row) => instructionsSheet.addRow(row));

    // Sheet 2: Data Sheet
    const dataSheet = workbook.addWorksheet('Models');
    dataSheet.columns = [
      { header: 'BRAND_CODE*', key: 'brandCode', width: 16 },
      { header: 'PRODUCT_CODE*', key: 'productCode', width: 16 },
      { header: 'MODEL_CODE*', key: 'modelCode', width: 24 },
      { header: 'MODEL_NAME*', key: 'modelName', width: 32 },
      { header: 'TECHNICAL_NAME', key: 'technicalName', width: 24 },
      { header: 'SOFTWARE_VERSION', key: 'softwareVersion', width: 18 },
      { header: 'SERIAL_NUMBER_LENGTH', key: 'serialNumberLength', width: 22 },
      { header: 'CHECK_SERIAL_NUMBER', key: 'checkSerialNumber', width: 22 },
      { header: 'IS_JOB_CREATION_ALLOWED', key: 'isJobCreationAllowed', width: 26 },
      { header: 'IS_DOA_ALLOWED', key: 'isDoaAllowed', width: 18 },
      { header: 'IS_REPAIRABLE', key: 'isRepairable', width: 16 },
      { header: 'IS_REPLACEMENT_ALLOWED', key: 'isReplacementAllowed', width: 26 },
      { header: 'CUSTOMER_WARRANTY_DAYS', key: 'customerWarrantyDays', width: 26 },
      { header: 'REPAIR_WARRANTY_DAYS', key: 'repairWarrantyDays', width: 22 },
      { header: 'REPLACEMENT_WINDOW_DAYS', key: 'replacementWindowDays', width: 26 },
      { header: 'DOA_DAYS', key: 'doaDays', width: 14 },
      { header: 'AMC_DAYS', key: 'amcDays', width: 14 },
      { header: 'AMC_AMOUNT', key: 'amcAmount', width: 16 },
      { header: 'IS_OUT_OF_WARRANTY_SERVICED', key: 'isOutOfWarrantyServiced', width: 30 },
      { header: 'STANDARD_SERVICE_CHARGE', key: 'standardServiceCharge', width: 26 },
      { header: 'RELEASE_DATE*', key: 'releaseDate', width: 18 },
      { header: 'IS_ACTIVE', key: 'isActive', width: 14 },
    ];

    dataSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    dataSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1976D2' },
    };

    // Add illustrative example row (clearly marked as example)
    const exampleRow = dataSheet.addRow({
      brandCode: 'SKC',
      productCode: 'AC',
      modelCode: 'SAMPLE-AC-2026',
      modelName: '[EXAMPLE] Skatercat Eco 1.5T Split AC',
      technicalName: 'SKC-ECO-INV-15',
      softwareVersion: 'v2.1',
      serialNumberLength: 15,
      checkSerialNumber: 'Y',
      isJobCreationAllowed: 'Y',
      isDoaAllowed: 'Y',
      isRepairable: 'Y',
      isReplacementAllowed: 'Y',
      customerWarrantyDays: 365,
      repairWarrantyDays: 90,
      replacementWindowDays: 30,
      doaDays: 7,
      amcDays: 0,
      amcAmount: 0.0,
      isOutOfWarrantyServiced: 'Y',
      standardServiceCharge: 350.0,
      releaseDate: '2026-01-15',
      isActive: 'Y',
    });
    exampleRow.font = { italic: true, color: { argb: 'FF757575' } };

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async generatePartTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Enterprise After-Sales Service CRM';
    workbook.created = new Date();

    // Sheet 1: Instructions
    const instructionsSheet = workbook.addWorksheet('Instructions');
    instructionsSheet.columns = [
      { header: 'Item', key: 'item', width: 25 },
      { header: 'Specification / Instruction', key: 'spec', width: 75 },
    ];

    instructionsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    instructionsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2E7D32' },
    };

    const instructionsData = [
      { item: 'Template Version', spec: TEMPLATE_VERSIONS.PART },
      { item: 'Target Entity', spec: 'Part Codes Master' },
      { item: 'Required Columns (*)', spec: 'BRAND_CODE, PRODUCT_CODE, PART_CODE, PART_NAME, HSN_CODE, PART_CATEGORY, CUSTOMER_PRICE, LOCATION_PRICE' },
      { item: 'Natural Key', spec: 'BRAND_CODE + PART_CODE (Must be unique within brand)' },
      { item: 'Part Category Values', spec: 'SPARE, CONSUMABLE, ACCESSORY' },
      { item: 'Price Formats', spec: 'Decimal numbers >= 0.00 (e.g. 1500.00, 250.50)' },
      { item: 'Faulty Part Dispatch To', spec: 'Destination facility code or identifier (default: WAREHOUSE)' },
      { item: 'Warranty Days', spec: 'Integer >= 0 (default: 90)' },
      { item: 'Boolean Indicators', spec: 'Y or N for IS_ACTIVE (default: Y)' },
      { item: 'Important Security Note', spec: 'Formulas and macros are strictly forbidden and will cause the upload to be rejected.' },
      { item: 'Row Limit', spec: 'Maximum 1,000 data rows per upload.' },
      { item: 'Sample Data', spec: 'See the "PartCodes" sheet. The sample row is for illustration and should be replaced with real data.' },
    ];

    instructionsData.forEach((row) => instructionsSheet.addRow(row));

    // Sheet 2: Data Sheet
    const dataSheet = workbook.addWorksheet('PartCodes');
    dataSheet.columns = [
      { header: 'BRAND_CODE*', key: 'brandCode', width: 16 },
      { header: 'PRODUCT_CODE*', key: 'productCode', width: 16 },
      { header: 'PART_CODE*', key: 'partCode', width: 20 },
      { header: 'VENDOR_PART_CODE', key: 'vendorPartCode', width: 22 },
      { header: 'PART_NAME*', key: 'partName', width: 32 },
      { header: 'PART_DESCRIPTION', key: 'partDescription', width: 36 },
      { header: 'HSN_CODE*', key: 'hsnCode', width: 16 },
      { header: 'PART_CATEGORY*', key: 'partCategory', width: 20 },
      { header: 'PART_FOR', key: 'partFor', width: 18 },
      { header: 'CUSTOMER_PRICE*', key: 'customerPrice', width: 20 },
      { header: 'LOCATION_PRICE*', key: 'locationPrice', width: 20 },
      { header: 'FAULTY_PART_DISPATCH_TO', key: 'faultyPartDispatchTo', width: 28 },
      { header: 'WARRANTY_DAYS', key: 'warrantyDays', width: 18 },
      { header: 'IS_ACTIVE', key: 'isActive', width: 14 },
    ];

    dataSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    dataSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2E7D32' },
    };

    // Add illustrative example row
    const exampleRow = dataSheet.addRow({
      brandCode: 'SKC',
      productCode: 'AC',
      partCode: 'SAMPLE-PART-01',
      vendorPartCode: 'VEND-PCB-99',
      partName: '[EXAMPLE] PCB Main Control Board',
      partDescription: 'Microcontroller main control board assembly for inverter AC',
      hsnCode: '84151010',
      partCategory: 'SPARE',
      partFor: 'PCB',
      customerPrice: 3200.0,
      locationPrice: 2400.0,
      faultyPartDispatchTo: 'WAREHOUSE',
      warrantyDays: 90,
      isActive: 'Y',
    });
    exampleRow.font = { italic: true, color: { argb: 'FF757575' } };

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async getTemplate(entityType: BulkImportEntityType): Promise<{ buffer: Buffer; fileName: string }> {
    if (entityType === 'MODEL') {
      const buffer = await this.generateModelTemplate();
      return { buffer, fileName: 'model_import_template_v1.xlsx' };
    }
    if (entityType === 'PART') {
      const buffer = await this.generatePartTemplate();
      return { buffer, fileName: 'part_import_template_v1.xlsx' };
    }
    throw new Error(`Unsupported entity type: ${entityType}`);
  }
}

export const bulkImportTemplateService = new BulkImportTemplateService();
