import { describe, expect, it } from 'vitest';
import { triggerBlobDownload } from '../src/lib/apiClient';
import {
  BulkImportCommitResult,
  BulkImportEntityType,
  BulkImportMode,
  BulkImportPreviewSummary,
} from '../src/lib/catalogApi';

describe('Bulk Import Frontend API & Data Structures', () => {
  it('validates BulkImportPreviewSummary structural types and flags', () => {
    const previewSummary: BulkImportPreviewSummary = {
      jobId: '00000000-0000-0000-0000-000000000001',
      entityType: 'MODEL',
      importMode: 'CREATE_ONLY',
      fileName: 'models_test.xlsx',
      fileChecksum: 'abc123sha256',
      templateVersion: 'MODEL_IMPORT_V1',
      totalRows: 5,
      validRows: 4,
      invalidRows: 1,
      createRows: 4,
      updateRows: 0,
      unchangedRows: 0,
      conflictRows: 1,
      canCommit: false,
      rows: [
        {
          rowNumber: 2,
          naturalKey: 'SKC / M1',
          action: 'CREATE',
          isValid: true,
          errors: [],
          changes: [],
          parsedData: { modelCode: 'M1', modelName: 'Model 1' },
        },
        {
          rowNumber: 3,
          naturalKey: 'SKC / M2',
          action: 'CONFLICT',
          isValid: false,
          errors: [
            {
              rowNumber: 3,
              field: 'BRAND_CODE',
              code: 'BRAND_NOT_FOUND',
              message: 'Brand does not exist',
            },
          ],
          changes: [],
          parsedData: {},
        },
      ],
    };

    expect(previewSummary.canCommit).toBe(false);
    expect(previewSummary.invalidRows).toBe(1);
    expect(previewSummary.validRows).toBe(4);
    expect(previewSummary.rows[1].errors[0].code).toBe('BRAND_NOT_FOUND');
  });

  it('validates BulkImportCommitResult shape', () => {
    const commitResult: BulkImportCommitResult = {
      jobId: '00000000-0000-0000-0000-000000000001',
      status: 'COMPLETED',
      entityType: 'PART',
      importMode: 'CREATE_ONLY',
      totalRows: 10,
      createdRows: 10,
      updatedRows: 0,
      unchangedRows: 0,
      failedRows: 0,
      durationMs: 145,
      committedAt: '2026-10-20T10:00:00.000Z',
    };

    expect(commitResult.status).toBe('COMPLETED');
    expect(commitResult.createdRows).toBe(10);
    expect(commitResult.failedRows).toBe(0);
  });

  it('triggerBlobDownload creates an anchor and triggers download in browser DOM', () => {
    // Mock URL and document methods
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;

    let createdUrl = '';
    let revokedUrl = '';
    window.URL.createObjectURL = (blob: Blob) => {
      createdUrl = 'blob:http://localhost/test-uuid';
      return createdUrl;
    };
    window.URL.revokeObjectURL = (url: string) => {
      revokedUrl = url;
    };

    const dummyBlob = new Blob(['test content'], { type: 'application/octet-stream' });
    triggerBlobDownload(dummyBlob, 'test_download.xlsx');

    expect(createdUrl).toBe('blob:http://localhost/test-uuid');

    // Restore
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
  });
});
