import { z } from 'zod';

export const dispatchComplaintSchema = z.object({
  appointmentDate: z
    .string()
    .min(1, 'Appointment date is required')
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid appointment date format' }),
  appointmentSlot: z
    .string()
    .trim()
    .min(1, 'Appointment slot is required')
    .max(50, 'Appointment slot cannot exceed 50 characters'),
  engineerId: z.string().uuid('Valid field engineer user UUID is required'),
  travelDistanceKm: z.number().min(0, 'Distance cannot be negative').max(9999).optional(),
  areaType: z
    .enum(['LOCAL', 'UPCOUNTRY', 'URBAN', 'RURAL'])
    .transform((v) => (v === 'URBAN' ? 'LOCAL' : v === 'RURAL' ? 'UPCOUNTRY' : v) as 'LOCAL' | 'UPCOUNTRY')
    .optional(),
  remarks: z.string().max(1000, 'Remarks cannot exceed 1000 characters').optional(),
  idempotencyKey: z.string().max(100).optional(),
});

export const checkInComplaintSchema = z.object({
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Check-In OTP must be exactly 6 digits'),
  geocoordinates: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
  remarks: z.string().max(500).optional(),
});

export const regenerateOtpSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const acknowledgeComplaintSchema = z.object({
  remarks: z.string().max(1000).optional(),
});

export const rejectAssignmentSchema = z.object({
  reason: z.enum(['UNSUPPORTED_PRODUCT', 'INCORRECT_ASSIGNMENT', 'CAPACITY_EXCEEDED', 'OUT_OF_TERRITORY', 'OTHER']),
  remarks: z.string().min(1, 'Rejection remarks are mandatory').max(1000),
});

export const reassignComplaintSchema = z.object({
  newLocationId: z.string().uuid('Valid target Service Center UUID is required'),
  remarks: z.string().max(1000).optional(),
  preserveAssignment: z.boolean().optional(),
});

export const asfQueueQuerySchema = z.object({
  view: z
    .enum([
      'all',
      'unacknowledged',
      'ready_to_assign',
      'today_appointments',
      'assigned_technicians',
      'scheduled',
      'awaiting_checkin',
      'checked_in',
      'diagnosis_repair',
      'parts_pending',
      'parts_dispatched',
      'awaiting_verification',
      'overdue',
      'assignment_required',
    ])
    .optional()
    .default('all'),
  locationId: z.string().uuid().optional(),
  assignedEngineerId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  status: z.string().max(50).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const engineerJobsQuerySchema = z.object({
  status: z.string().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const acceptEscalationSchema = z.object({
  reasonCode: z.enum([
    'REASON_1',
    'REASON_2',
    'REASON_3',
    'REASON_4',
    'REASON_5',
    'REASON_6',
  ]),
  reasonDescription: z.string().max(500).optional(),
  technicianRemarks: z.string().max(1000).optional(),
  requiredPartId: z.string().uuid().optional(),
  warrantyType: z.enum(['IN_WARRANTY', 'OUT_OF_WARRANTY']).optional(),
  quotationAmount: z.coerce.number().nonnegative().optional(),
});

export const prepareQuotationSchema = z.object({
  amount: z.coerce.number().positive('Quotation amount must be greater than zero'),
  remarks: z.string().max(500).optional(),
});

export const quotationDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'DECLINED']),
  quotationVersion: z.coerce.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
});

export const custodyHandoverSchema = z.object({
  partId: z.string().uuid(),
  engineerId: z.string().uuid(),
  remarks: z.string().max(1000).optional(),
});

export const acknowledgeCollectionSchema = z.object({
  handoverId: z.string().uuid(),
  remarks: z.string().max(1000).optional(),
});

export const verifyReplacementHappyCodeSchema = z.object({
  visitNumber: z.coerce.number().int().min(1).default(1),
  appointmentVersion: z.coerce.number().int().min(1).default(1),
  purpose: z.enum(['ARRIVAL', 'COMPLETION']),
  happyCode: z.string().regex(/^\d{6}$/, 'Happy Code must be a 6-digit numeric code'),
});

export const allocateReplacementStockSchema = z.object({
  warehouseId: z.string().uuid('Valid warehouse location UUID is required'),
});

export const dispatchReplacementStockSchema = z.object({
  courierName: z.string().trim().min(1, 'Courier name is required').max(100),
  docketNumber: z.string().trim().min(1, 'Docket number is required').max(100),
  remarks: z.string().max(1000).optional(),
});

export const scheduleInstallationSchema = z.object({
  engineerId: z.string().uuid('Valid field engineer user UUID is required'),
  appointmentDate: z
    .string()
    .min(1, 'Appointment date is required')
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid appointment date format' }),
  appointmentSlot: z.string().trim().min(1, 'Appointment slot is required').max(50),
  remarks: z.string().max(1000).optional(),
});

export const completeInstallationSchema = z.object({
  completionCode: z.string().regex(/^\d{6}$/, 'Completion Happy Code must be a 6-digit numeric code'),
  targetSerialNo: z.string().max(100).optional(),
  remarks: z.string().max(1000).optional(),
});
