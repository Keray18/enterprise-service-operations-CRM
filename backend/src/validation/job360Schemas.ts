import { z } from 'zod';

export const recordDiagnosisSchema = z.object({
  voeDescription: z
    .string()
    .trim()
    .min(2, 'Voice of Engineer / Diagnosis description is required')
    .max(1000, 'Description cannot exceed 1000 characters'),
  faultId: z.string().uuid('Valid Fault Master UUID is required'),
  defectId: z.string().uuid('Valid Defect Master UUID is required').optional().or(z.literal('')),
  observations: z.string().max(1000, 'Observations cannot exceed 1000 characters').optional(),
  physicalSerialVerified: z.boolean().optional().default(true),
});

export const recordRepairSchema = z
  .object({
    repairCodeId: z.string().uuid('Valid Repair Code Master UUID is required'),
    repairAction: z.enum([
      'REPAIRED_WITHOUT_PART',
      'REPAIRED_WITH_PART',
      'REPAIRED_WITH_CONSUMABLE',
      'PENDING_SPARE_PART',
      'PENDING_SPECIAL_PART_ESTIMATE',
      'REQUEST_REPLACEMENT',
      'REQUEST_CANCELLATION',
    ]),
    repairRemarks: z.string().max(1000, 'Remarks cannot exceed 1000 characters').optional(),
    repairAt: z.enum(['ON_SITE', 'IN_HOUSE']).default('ON_SITE'),
    replacementReason: z.string().max(100).optional(),
    replacementRemarks: z.string().max(1000).optional(),
    cancellationReason: z.string().max(100).optional(),
    cancellationRemarks: z.string().max(1000).optional(),
    specialPartRemarks: z.string().max(1000).optional(),
  })
  .refine(
    (data) => {
      if (data.repairAction === 'REQUEST_REPLACEMENT') {
        return Boolean(data.replacementReason && data.replacementReason.trim().length > 0);
      }
      return true;
    },
    { message: 'Replacement reason is mandatory when requesting replacement', path: ['replacementReason'] }
  )
  .refine(
    (data) => {
      if (data.repairAction === 'REQUEST_CANCELLATION') {
        return Boolean(data.cancellationReason && data.cancellationReason.trim().length > 0);
      }
      return true;
    },
    { message: 'Cancellation reason is mandatory when requesting cancellation', path: ['cancellationReason'] }
  );

export const addPartSchema = z.object({
  partId: z.string().uuid('Valid Part Code UUID is required'),
  quantity: z.coerce.number().int().positive('Quantity must be greater than zero').default(1),
  entryType: z.enum(['USED', 'REQUIRED_PNA', 'REQUIRED_SPECIAL_ESTIMATE']).default('USED'),
  isChargeableToCustomer: z.boolean().default(false),
  partConsumptionNo: z.string().max(50).optional(),
  defectiveSerialNo: z.string().max(50).optional(),
  newPartSerialNo: z.string().max(50).optional(),
  remarks: z.string().max(500).optional(),
});

export const provideSpecialPartEstimateSchema = z.object({
  estimateAmount: z.coerce.number().positive('Estimate amount must be positive'),
  remarks: z.string().max(1000).optional(),
});

export const customerEstimateDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  customerRemarks: z.string().max(500).optional(),
});

export const uploadAttachmentSchema = z.object({
  attachmentType: z.enum([
    'SERIAL_NUMBER_PLATE',
    'PART_FRONT',
    'PART_BACK',
    'PRODUCT_PHOTO',
    'SIGNED_JOBSHEET',
    'INVOICE_COPY',
    'REPLACEMENT_TAG',
    'OTHER_EVIDENCE',
  ]),
});

// ==========================================
// Phase 2C Validation Schemas
// ==========================================

export const initiateClosureSchema = z.object({
  remarks: z.string().max(1000).optional(),
});

export const verifyHappyCodeSchema = z
  .object({
    happyCode: z.string().regex(/^\d{6}$/, 'Happy Code must be a 6-digit numerical code').optional(),
    isSupervisorOverride: z.boolean().optional().default(false),
    overrideReason: z.string().max(1000).optional(),
    feedback: z
      .object({
        rating: z.coerce.number().int().min(1, 'Rating must be between 1 and 5').max(5, 'Rating must be between 1 and 5'),
        feedbackRemarks: z.string().max(1000).optional(),
        qualityAnalysis: z.string().max(1000).optional(),
      })
      .optional(),
  })
  .refine(
    (data) => {
      if (data.isSupervisorOverride) {
        return Boolean(data.overrideReason && data.overrideReason.trim().length >= 10);
      }
      return Boolean(data.happyCode && data.happyCode.trim().length === 6);
    },
    {
      message: 'Either a valid 6-digit Happy Code or a written Supervisor Override Reason (min 10 chars) is required',
      path: ['happyCode'],
    }
  );

export const submitFeedbackSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Rating must be between 1 and 5').max(5, 'Rating must be between 1 and 5'),
  feedbackRemarks: z.string().max(1000).optional(),
  qualityAnalysis: z.string().max(1000).optional(),
});

export const createReplacementRequestSchema = z.object({
  reasonCode: z.enum([
    'REASON_1',
    'REASON_2',
    'REASON_3',
    'REASON_4',
    'REASON_5',
    'REASON_6',
  ]),
  technicianRemarks: z.string().max(1000).optional(),
});

export const reviewReplacementRequestSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reviewRemarks: z.string().max(1000).optional(),
});

export const createCancellationRequestSchema = z.object({
  reasonCode: z.enum(['REASON_1', 'REASON_2', 'REASON_3']),
  remarks: z.string().max(1000).optional(),
});

export const reviewCancellationRequestSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reviewRemarks: z.string().max(1000).optional(),
});

