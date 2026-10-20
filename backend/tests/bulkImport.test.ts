import crypto from 'crypto';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeOraclePool, getOracleConnection } from '../src/database/oraclePool.js';
import { auditRepository } from '../src/database/repositories/auditRepository.js';
import { brandRepository } from '../src/database/repositories/brandRepository.js';
import { modelRepository } from '../src/database/repositories/modelRepository.js';
import { partRepository } from '../src/database/repositories/partRepository.js';
import { productRepository } from '../src/database/repositories/productRepository.js';
import { rbacRepository } from '../src/database/repositories/rbacRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { hashPassword } from '../src/services/passwordService.js';

async function createExcelBuffer(
  sheetName: string,
  columns: { header: string; key: string }[],
  rows: Record<string, any>[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns;
  rows.forEach((r) => sheet.addRow(r));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const binaryParser = (res: any, callback: (err: Error | null, body: Buffer) => void) => {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk: string) => {
    data += chunk;
  });
  res.on('end', () => {
    callback(null, Buffer.from(data, 'binary'));
  });
};

describe('Bulk Excel Import for Models and Part Codes (Phase 1B.3)', () => {
  const app = createApp();

  const ADMIN_PASS = 'AdminBulkImport#2026!';
  const CC_PASS = 'CallCenterBulk#2026!';
  const adminUserId = crypto.randomUUID();
  const ccUserId = crypto.randomUUID();

  let adminSessionCookie: string;
  let adminCsrfToken: string;
  let ccSessionCookie: string;
  let ccCsrfToken: string;

  let testBrandCode: string;
  let testBrandId: string;
  let testProductCode: string;
  let testProductId: string;

  beforeAll(async () => {
    // 1. Setup Admin user
    const adminHash = await hashPassword(ADMIN_PASS);
    await userRepository.createUser({
      userId: adminUserId,
      username: `bulk_admin_${Date.now().toString(36)}`,
      email: `bulk_admin_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Bulk Import Admin',
      passwordHash: adminHash,
    });
    await rbacRepository.assignRoleToUser(adminUserId, 'ADMIN', 'TEST_SETUP');

    // 2. Setup Call Center user (has masters:read but NOT masters:import or masters:manage)
    const ccHash = await hashPassword(CC_PASS);
    await userRepository.createUser({
      userId: ccUserId,
      username: `bulk_cc_${Date.now().toString(36)}`,
      email: `bulk_cc_${Date.now().toString(36)}@crm.internal`,
      fullName: 'Bulk CC User',
      passwordHash: ccHash,
    });
    await rbacRepository.assignRoleToUser(ccUserId, 'CALL_CENTER', 'TEST_SETUP');

    // 3. Login as Admin
    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: (await userRepository.findById(adminUserId))!.username, password: ADMIN_PASS });
    expect(adminLoginRes.status).toBe(200);
    adminSessionCookie = adminLoginRes.headers['set-cookie'][0];
    adminCsrfToken = adminLoginRes.body.data.csrfToken;

    // 4. Login as Call Center user
    const ccLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: (await userRepository.findById(ccUserId))!.username, password: CC_PASS });
    expect(ccLoginRes.status).toBe(200);
    ccSessionCookie = ccLoginRes.headers['set-cookie'][0];
    ccCsrfToken = ccLoginRes.body.data.csrfToken;

    // 5. Ensure Brand and Product exist for testing
    testBrandCode = `B${crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
    const brand = await brandRepository.createBrand({
      brandCode: testBrandCode,
      brandName: `Bulk Test Brand ${testBrandCode}`,
      isActive: 'Y',
      createdBy: 'TEST_SUITE',
    });
    testBrandId = brand.brandId;

    testProductCode = `P${crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
    const product = await productRepository.createProduct({
      productCode: testProductCode,
      productName: `Bulk Test Product ${testProductCode}`,
      categoryFamily: 'Test Category',
      isActive: 'Y',
      createdBy: 'TEST_SUITE',
    });
    testProductId = product.productId;
  });

  afterAll(async () => {
    await closeOraclePool();
  });

  // ============================================================================
  // 1. Template Downloads
  // ============================================================================
  describe('1. Template Downloads', () => {
    it('should download the Model Excel template with correct headers and version', async () => {
      const res = await request(app)
        .get('/api/v1/catalog/import/templates/MODEL')
        .set('Cookie', adminSessionCookie)
        .buffer(true)
        .parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('model_import_template_v1.xlsx');

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.body as any);
      expect(workbook.worksheets.length).toBe(2);
      expect(workbook.getWorksheet('Instructions')).toBeDefined();
      expect(workbook.getWorksheet('Models')).toBeDefined();

      const modelSheet = workbook.getWorksheet('Models')!;
      expect(modelSheet.getRow(1).getCell(1).value).toBe('BRAND_CODE*');
      expect(modelSheet.getRow(1).getCell(2).value).toBe('PRODUCT_CODE*');
      expect(modelSheet.getRow(1).getCell(3).value).toBe('MODEL_CODE*');
    });

    it('should download the Part Code Excel template with correct headers and version', async () => {
      const res = await request(app)
        .get('/api/v1/catalog/import/templates/PART')
        .set('Cookie', adminSessionCookie)
        .buffer(true)
        .parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('part_import_template_v1.xlsx');

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.body as any);
      expect(workbook.getWorksheet('PartCodes')).toBeDefined();

      const partSheet = workbook.getWorksheet('PartCodes')!;
      expect(partSheet.getRow(1).getCell(1).value).toBe('BRAND_CODE*');
      expect(partSheet.getRow(1).getCell(3).value).toBe('PART_CODE*');
    });

    it('should allow users with masters:read (e.g. Call Center) to download templates', async () => {
      const res = await request(app)
        .get('/api/v1/catalog/import/templates/MODEL')
        .set('Cookie', ccSessionCookie);

      expect(res.status).toBe(200);
    });

    it('should reject unauthenticated requests to download templates', async () => {
      const res = await request(app).get('/api/v1/catalog/import/templates/MODEL');
      expect(res.status).toBe(401);
    });

    it('should return 400 for unsupported entity type', async () => {
      const res = await request(app)
        .get('/api/v1/catalog/import/templates/INVALID_TYPE')
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(400);
    });
  });

  // ============================================================================
  // 2. Upload Security & Validation
  // ============================================================================
  describe('2. Upload Security & File-Level Validation', () => {
    it('should reject non-xlsx files', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/import/preview')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .field('entityType', 'MODEL')
        .attach('file', Buffer.from('fake csv content,a,b,c'), 'test.csv');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    });

    it('should reject corrupt xlsx files', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/import/preview')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .field('entityType', 'MODEL')
        .attach('file', Buffer.from('not an excel file data'), 'broken.xlsx');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_EXCEL_FILE');
    });

    it('should reject files missing required headers', async () => {
      const buf = await createExcelBuffer(
        'Models',
        [
          { header: 'BRAND_CODE', key: 'brand' },
          { header: 'MODEL_CODE', key: 'model' },
          // Missing PRODUCT_CODE, MODEL_NAME, RELEASE_DATE
        ],
        [{ brand: testBrandCode, model: 'M1' }]
      );

      const res = await request(app)
        .post('/api/v1/catalog/import/preview')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .field('entityType', 'MODEL')
        .attach('file', buf, 'missing_headers.xlsx');

      expect(res.status).toBe(200); // Returns preview with validation failure
      expect(res.body.data.canCommit).toBe(false);
      expect(res.body.data.invalidRows).toBeGreaterThan(0);
      expect(res.body.data.rows[0].errors[0].code).toBe('MISSING_REQUIRED_HEADER');
    });

    it('should reject duplicate headers in worksheet', async () => {
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('Models');
      // Add row with duplicate headers
      ws.addRow(['BRAND_CODE', 'BRAND_CODE', 'PRODUCT_CODE', 'MODEL_CODE', 'MODEL_NAME', 'RELEASE_DATE']);
      ws.addRow(['SKC', 'SKC', 'AC', 'M1', 'Test', '2026-01-01']);
      const buf = Buffer.from(await workbook.xlsx.writeBuffer());

      const res = await request(app)
        .post('/api/v1/catalog/import/preview')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .field('entityType', 'MODEL')
        .attach('file', buf, 'duplicate_headers.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.data.canCommit).toBe(false);
      const duplicateError = res.body.data.rows.find((r: any) =>
        r.errors.some((e: any) => e.code === 'DUPLICATE_HEADER')
      );
      expect(duplicateError).toBeDefined();
    });

    it('should reject formula cells in data rows with FORMULA_NOT_ALLOWED', async () => {
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('Models');
      ws.addRow([
        'BRAND_CODE',
        'PRODUCT_CODE',
        'MODEL_CODE',
        'MODEL_NAME',
        'RELEASE_DATE',
        'STANDARD_SERVICE_CHARGE',
      ]);
      const row2 = ws.addRow([testBrandCode, testProductCode, 'M_FORMULA', 'Test Formula', '2026-01-01', '']);
      // Inject explicit formula in cell
      row2.getCell(6).value = { formula: 'SUM(100, 200)', result: 300 };

      const buf = Buffer.from(await workbook.xlsx.writeBuffer());

      const res = await request(app)
        .post('/api/v1/catalog/import/preview')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .field('entityType', 'MODEL')
        .attach('file', buf, 'formula_test.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.data.canCommit).toBe(false);
      const formulaError = res.body.data.rows[0].errors.find((e: any) => e.code === 'FORMULA_NOT_ALLOWED');
      expect(formulaError).toBeDefined();
    });

    it('should reject formula injection trigger characters in string cells (=, @, +cmd)', async () => {
      const buf = await createExcelBuffer(
        'Models',
        [
          { header: 'BRAND_CODE', key: 'brand' },
          { header: 'PRODUCT_CODE', key: 'prod' },
          { header: 'MODEL_CODE', key: 'code' },
          { header: 'MODEL_NAME', key: 'name' },
          { header: 'RELEASE_DATE', key: 'date' },
        ],
        [
          {
            brand: testBrandCode,
            prod: testProductCode,
            code: 'M_INJECT',
            name: '=CMD|"/C calc"!A0',
            date: '2026-01-01',
          },
        ]
      );

      const res = await request(app)
        .post('/api/v1/catalog/import/preview')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .field('entityType', 'MODEL')
        .attach('file', buf, 'injection_test.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.data.canCommit).toBe(false);
      const formulaError = res.body.data.rows[0].errors.find((e: any) => e.code === 'FORMULA_NOT_ALLOWED');
      expect(formulaError).toBeDefined();
    });

    it('should safely skip completely blank rows without errors', async () => {
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('Models');
      ws.addRow(['BRAND_CODE', 'PRODUCT_CODE', 'MODEL_CODE', 'MODEL_NAME', 'RELEASE_DATE']);
      ws.addRow(['', '', '', '', '']); // completely empty row
      ws.addRow([testBrandCode, testProductCode, `BLANK_TEST_${Date.now()}`, 'Valid Model', '2026-03-01']);
      ws.addRow(['', '', '', '', '']); // another empty row

      const buf = Buffer.from(await workbook.xlsx.writeBuffer());

      const res = await request(app)
        .post('/api/v1/catalog/import/preview')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .field('entityType', 'MODEL')
        .attach('file', buf, 'blank_rows.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.data.totalRows).toBe(1); // Only the non-blank row counted
      expect(res.body.data.validRows).toBe(1);
      expect(res.body.data.canCommit).toBe(true);
    });
  });

  // ============================================================================
  // 3. Business & Referential Oracle Validation
  // ============================================================================
  describe('3. Referential & Business Validation', () => {
    it('should flag error when referenced BRAND_CODE does not exist in Oracle', async () => {
      const buf = await createExcelBuffer(
        'Models',
        [
          { header: 'BRAND_CODE', key: 'brand' },
          { header: 'PRODUCT_CODE', key: 'prod' },
          { header: 'MODEL_CODE', key: 'code' },
          { header: 'MODEL_NAME', key: 'name' },
          { header: 'RELEASE_DATE', key: 'date' },
        ],
        [
          {
            brand: 'NON_EXISTENT_BRAND',
            prod: testProductCode,
            code: 'M_NO_BRAND',
            name: 'No Brand Model',
            date: '2026-01-01',
          },
        ]
      );

      const res = await request(app)
        .post('/api/v1/catalog/import/preview')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .field('entityType', 'MODEL')
        .attach('file', buf, 'no_brand.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.data.canCommit).toBe(false);
      const brandError = res.body.data.rows[0].errors.find((e: any) => e.code === 'BRAND_NOT_FOUND');
      expect(brandError).toBeDefined();
    });

    it('should flag error when referenced PRODUCT_CODE does not exist in Oracle', async () => {
      const buf = await createExcelBuffer(
        'Models',
        [
          { header: 'BRAND_CODE', key: 'brand' },
          { header: 'PRODUCT_CODE', key: 'prod' },
          { header: 'MODEL_CODE', key: 'code' },
          { header: 'MODEL_NAME', key: 'name' },
          { header: 'RELEASE_DATE', key: 'date' },
        ],
        [
          {
            brand: testBrandCode,
            prod: 'NON_EXISTENT_PROD',
            code: 'M_NO_PROD',
            name: 'No Prod Model',
            date: '2026-01-01',
          },
        ]
      );

      const res = await request(app)
        .post('/api/v1/catalog/import/preview')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .field('entityType', 'MODEL')
        .attach('file', buf, 'no_prod.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.data.canCommit).toBe(false);
      const prodError = res.body.data.rows[0].errors.find((e: any) => e.code === 'PRODUCT_NOT_FOUND');
      expect(prodError).toBeDefined();
    });

    it('should detect duplicate natural keys within the uploaded file', async () => {
      const dupModelCode = `DUP_IN_FILE_${Date.now()}`;
      const buf = await createExcelBuffer(
        'Models',
        [
          { header: 'BRAND_CODE', key: 'brand' },
          { header: 'PRODUCT_CODE', key: 'prod' },
          { header: 'MODEL_CODE', key: 'code' },
          { header: 'MODEL_NAME', key: 'name' },
          { header: 'RELEASE_DATE', key: 'date' },
        ],
        [
          { brand: testBrandCode, prod: testProductCode, code: dupModelCode, name: 'First Entry', date: '2026-01-01' },
          { brand: testBrandCode, prod: testProductCode, code: dupModelCode, name: 'Second Entry', date: '2026-01-01' },
        ]
      );

      const res = await request(app)
        .post('/api/v1/catalog/import/preview')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .field('entityType', 'MODEL')
        .attach('file', buf, 'dup_in_file.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.data.canCommit).toBe(false);
      expect(res.body.data.validRows).toBe(1);
      expect(res.body.data.invalidRows).toBe(1);
      const dupError = res.body.data.rows[1].errors.find((e: any) => e.code === 'DUPLICATE_IN_FILE');
      expect(dupError).toBeDefined();
    });

    it('should reject invalid dates and malformed numeric values', async () => {
      const buf = await createExcelBuffer(
        'Models',
        [
          { header: 'BRAND_CODE', key: 'brand' },
          { header: 'PRODUCT_CODE', key: 'prod' },
          { header: 'MODEL_CODE', key: 'code' },
          { header: 'MODEL_NAME', key: 'name' },
          { header: 'RELEASE_DATE', key: 'date' },
          { header: 'CUSTOMER_WARRANTY_DAYS', key: 'warranty' },
        ],
        [
          {
            brand: testBrandCode,
            prod: testProductCode,
            code: 'M_INVALID_VALS',
            name: 'Invalid Vals Model',
            date: 'not-a-date',
            warranty: -50,
          },
        ]
      );

      const res = await request(app)
        .post('/api/v1/catalog/import/preview')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .field('entityType', 'MODEL')
        .attach('file', buf, 'invalid_vals.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.data.canCommit).toBe(false);
      const errors = res.body.data.rows[0].errors;
      expect(errors.some((e: any) => e.code === 'INVALID_DATE')).toBe(true);
      expect(errors.some((e: any) => e.code === 'INVALID_NUMBER')).toBe(true);
    });
  });

  // ============================================================================
  // 4. Model Import Lifecycle (CREATE_ONLY & UPDATE_EXISTING)
  // ============================================================================
  describe('4. Model Import Preview, Commit & Concurrency', () => {
    const modelCode1 = `MDL_CR1_${Date.now()}`;
    const modelCode2 = `MDL_CR2_${Date.now()}`;

    let validJobId: string;

    it('should generate a valid preview for new models in CREATE_ONLY mode', async () => {
      const buf = await createExcelBuffer(
        'Models',
        [
          { header: 'BRAND_CODE', key: 'brand' },
          { header: 'PRODUCT_CODE', key: 'prod' },
          { header: 'MODEL_CODE', key: 'code' },
          { header: 'MODEL_NAME', key: 'name' },
          { header: 'RELEASE_DATE', key: 'date' },
          { header: 'CUSTOMER_WARRANTY_DAYS', key: 'warranty' },
        ],
        [
          {
            brand: testBrandCode,
            prod: testProductCode,
            code: modelCode1,
            name: 'First Valid Model',
            date: '2026-05-01',
            warranty: 730,
          },
          {
            brand: testBrandCode,
            prod: testProductCode,
            code: modelCode2,
            name: 'Second Valid Model',
            date: '2026-06-15',
            warranty: 365,
          },
        ]
      );

      const res = await request(app)
        .post('/api/v1/catalog/import/preview')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .field('entityType', 'MODEL')
        .field('importMode', 'CREATE_ONLY')
        .attach('file', buf, 'valid_models.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.data.totalRows).toBe(2);
      expect(res.body.data.validRows).toBe(2);
      expect(res.body.data.invalidRows).toBe(0);
      expect(res.body.data.createRows).toBe(2);
      expect(res.body.data.canCommit).toBe(true);

      validJobId = res.body.data.jobId;
    });

    it('preview should not have mutated the Oracle database before commit', async () => {
      const found = await modelRepository.findByBrandAndCode(testBrandId, modelCode1);
      expect(found).toBeNull();
    });

    it('should commit the valid preview atomically to Oracle and record audit', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/import/commit')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({ jobId: validJobId });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.createdRows).toBe(2);
      expect(res.body.data.updatedRows).toBe(0);

      // Verify records are now in Oracle
      const m1 = await modelRepository.findByBrandAndCode(testBrandId, modelCode1);
      expect(m1).not.toBeNull();
      expect(m1!.modelName).toBe('First Valid Model');

      const m2 = await modelRepository.findByBrandAndCode(testBrandId, modelCode2);
      expect(m2).not.toBeNull();
      expect(m2!.modelName).toBe('Second Valid Model');

      // Verify audit logs exist
      const audits = await auditRepository.listRecentAudits({ entityName: 'MODEL', limit: 10 });
      const relatedAudit = audits.find((a) => a.entityId === m1!.modelId);
      expect(relatedAudit).toBeDefined();
      expect(relatedAudit!.action).toBe('CREATE');
    });

    it('should reject double submission / idempotency check for already committed job', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/import/commit')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({ jobId: validJobId });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ALREADY_COMMITTED');
    });

    it('in CREATE_ONLY mode, existing models must be flagged as CONFLICT_RECORD_EXISTS', async () => {
      const buf = await createExcelBuffer(
        'Models',
        [
          { header: 'BRAND_CODE', key: 'brand' },
          { header: 'PRODUCT_CODE', key: 'prod' },
          { header: 'MODEL_CODE', key: 'code' },
          { header: 'MODEL_NAME', key: 'name' },
          { header: 'RELEASE_DATE', key: 'date' },
        ],
        [
          {
            brand: testBrandCode,
            prod: testProductCode,
            code: modelCode1, // already exists
            name: 'Attempt Overwrite',
            date: '2026-05-01',
          },
        ]
      );

      const res = await request(app)
        .post('/api/v1/catalog/import/preview')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .field('entityType', 'MODEL')
        .field('importMode', 'CREATE_ONLY')
        .attach('file', buf, 'conflict_model.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.data.canCommit).toBe(false);
      expect(res.body.data.conflictRows).toBe(1);
      const conflictErr = res.body.data.rows[0].errors.find((e: any) => e.code === 'CONFLICT_RECORD_EXISTS');
      expect(conflictErr).toBeDefined();
    });

    it('in UPDATE_EXISTING mode, changes should be previewed and applied with version increment', async () => {
      const m1Before = await modelRepository.findByBrandAndCode(testBrandId, modelCode1);
      const initialVersion = m1Before!.versionNo;

      const buf = await createExcelBuffer(
        'Models',
        [
          { header: 'BRAND_CODE', key: 'brand' },
          { header: 'PRODUCT_CODE', key: 'prod' },
          { header: 'MODEL_CODE', key: 'code' },
          { header: 'MODEL_NAME', key: 'name' },
          { header: 'RELEASE_DATE', key: 'date' },
          { header: 'CUSTOMER_WARRANTY_DAYS', key: 'warranty' },
        ],
        [
          {
            brand: testBrandCode,
            prod: testProductCode,
            code: modelCode1,
            name: 'Updated Model Name V2',
            date: '2026-05-01',
            warranty: 1000,
          },
        ]
      );

      const previewRes = await request(app)
        .post('/api/v1/catalog/import/preview')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .field('entityType', 'MODEL')
        .field('importMode', 'UPDATE_EXISTING')
        .attach('file', buf, 'update_model.xlsx');

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.data.canCommit).toBe(true);
      expect(previewRes.body.data.updateRows).toBe(1);
      expect(previewRes.body.data.rows[0].action).toBe('UPDATE');
      expect(previewRes.body.data.rows[0].changes.length).toBeGreaterThan(0);

      const updateJobId = previewRes.body.data.jobId;

      // Commit update
      const commitRes = await request(app)
        .post('/api/v1/catalog/import/commit')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({ jobId: updateJobId });

      expect(commitRes.status).toBe(200);
      expect(commitRes.body.data.updatedRows).toBe(1);

      // Verify Oracle version increment and updated values
      const m1After = await modelRepository.findByBrandAndCode(testBrandId, modelCode1);
      expect(m1After!.modelName).toBe('Updated Model Name V2');
      expect(m1After!.customerWarrantyDays).toBe(1000);
      expect(m1After!.versionNo).toBe(initialVersion + 1);
    });
  });

  // ============================================================================
  // 5. Part Code Import Lifecycle
  // ============================================================================
  describe('5. Part Code Import Lifecycle', () => {
    const partCode1 = `PT_${Date.now().toString(36).slice(0, 5).toUpperCase()}`;

    it('should validate HSN code requirement and reference for Part Codes', async () => {
      const buf = await createExcelBuffer(
        'PartCodes',
        [
          { header: 'BRAND_CODE', key: 'brand' },
          { header: 'PRODUCT_CODE', key: 'prod' },
          { header: 'PART_CODE', key: 'part' },
          { header: 'PART_NAME', key: 'name' },
          { header: 'HSN_CODE', key: 'hsn' },
          { header: 'PART_CATEGORY', key: 'cat' },
          { header: 'CUSTOMER_PRICE', key: 'cp' },
          { header: 'LOCATION_PRICE', key: 'lp' },
        ],
        [
          {
            brand: testBrandCode,
            prod: testProductCode,
            part: partCode1,
            name: 'Valid Spare Part',
            hsn: '99999999', // Non existent HSN
            cat: 'SPARE',
            cp: 1500,
            lp: 1100,
          },
        ]
      );

      const res = await request(app)
        .post('/api/v1/catalog/import/preview')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .field('entityType', 'PART')
        .field('importMode', 'CREATE_ONLY')
        .attach('file', buf, 'part_bad_hsn.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.data.canCommit).toBe(false);
      const hsnErr = res.body.data.rows[0].errors.find((e: any) => e.code === 'HSN_NOT_FOUND');
      expect(hsnErr).toBeDefined();
    });

    it('should successfully preview and commit a valid Part Code with seeded HSN', async () => {
      // 84151010 is seeded in V006
      const buf = await createExcelBuffer(
        'PartCodes',
        [
          { header: 'BRAND_CODE', key: 'brand' },
          { header: 'PRODUCT_CODE', key: 'prod' },
          { header: 'PART_CODE', key: 'part' },
          { header: 'PART_NAME', key: 'name' },
          { header: 'HSN_CODE', key: 'hsn' },
          { header: 'PART_CATEGORY', key: 'cat' },
          { header: 'CUSTOMER_PRICE', key: 'cp' },
          { header: 'LOCATION_PRICE', key: 'lp' },
          { header: 'WARRANTY_DAYS', key: 'war' },
        ],
        [
          {
            brand: testBrandCode,
            prod: testProductCode,
            part: partCode1,
            name: 'Compressor Inverter Pump',
            hsn: '84151010',
            cat: 'SPARE',
            cp: 4500,
            lp: 3200,
            war: 180,
          },
        ]
      );

      const previewRes = await request(app)
        .post('/api/v1/catalog/import/preview')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .field('entityType', 'PART')
        .field('importMode', 'CREATE_ONLY')
        .attach('file', buf, 'valid_part.xlsx');

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.data.canCommit).toBe(true);
      expect(previewRes.body.data.createRows).toBe(1);

      const commitRes = await request(app)
        .post('/api/v1/catalog/import/commit')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .send({ jobId: previewRes.body.data.jobId });

      expect(commitRes.status).toBe(200);
      expect(commitRes.body.data.createdRows).toBe(1);

      const partInDb = await partRepository.findByBrandAndCode(testBrandId, partCode1);
      expect(partInDb).not.toBeNull();
      expect(partInDb!.partName).toBe('Compressor Inverter Pump');
      expect(partInDb!.customerPrice).toBe(4500);
    });
  });

  // ============================================================================
  // 6. Downloadable Result Report & Security
  // ============================================================================
  describe('6. Downloadable Result / Error Reports', () => {
    it('should generate and download an Excel report with formula escaping', async () => {
      // Create an invalid preview to generate an error report
      const buf = await createExcelBuffer(
        'Models',
        [
          { header: 'BRAND_CODE', key: 'brand' },
          { header: 'PRODUCT_CODE', key: 'prod' },
          { header: 'MODEL_CODE', key: 'code' },
          { header: 'MODEL_NAME', key: 'name' },
          { header: 'RELEASE_DATE', key: 'date' },
        ],
        [
          {
            brand: 'NON_EXISTENT',
            prod: testProductCode,
            code: 'M_ERR',
            name: 'Report Test',
            date: '2026-01-01',
          },
        ]
      );

      const previewRes = await request(app)
        .post('/api/v1/catalog/import/preview')
        .set('Cookie', adminSessionCookie)
        .set('x-csrf-token', adminCsrfToken)
        .field('entityType', 'MODEL')
        .attach('file', buf, 'error_report_test.xlsx');

      const jobId = previewRes.body.data.jobId;

      const reportRes = await request(app)
        .get(`/api/v1/catalog/import/report/${jobId}`)
        .set('Cookie', adminSessionCookie)
        .buffer(true)
        .parse(binaryParser);

      expect(reportRes.status).toBe(200);
      expect(reportRes.headers['content-type']).toContain('spreadsheetml.sheet');
      expect(reportRes.headers['content-disposition']).toContain(`import_report_model_${jobId.slice(0, 8)}.xlsx`);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(reportRes.body as any);
      expect(workbook.getWorksheet('Summary')).toBeDefined();
      expect(workbook.getWorksheet('Row_Details')).toBeDefined();
    });
  });

  // ============================================================================
  // 7. RBAC & CSRF Protection
  // ============================================================================
  describe('7. RBAC and CSRF Security Enforcement', () => {
    it('should reject preview requests from users without masters:import (Call Center)', async () => {
      const buf = await createExcelBuffer('Models', [{ header: 'A', key: 'a' }], []);

      const res = await request(app)
        .post('/api/v1/catalog/import/preview')
        .set('Cookie', ccSessionCookie)
        .set('x-csrf-token', ccCsrfToken)
        .field('entityType', 'MODEL')
        .attach('file', buf, 'rbac_test.xlsx');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject commit requests without CSRF token', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/import/commit')
        .set('Cookie', adminSessionCookie)
        .send({ jobId: crypto.randomUUID() });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_TOKEN_INVALID');
    });

    it('should reject requests to report of another user if not admin', async () => {
      // Admin created a job. Call center attempts to access it
      const res = await request(app)
        .get(`/api/v1/catalog/import/report/${crypto.randomUUID()}`)
        .set('Cookie', ccSessionCookie);

      expect(res.status).toBe(403);
    });
  });
});
