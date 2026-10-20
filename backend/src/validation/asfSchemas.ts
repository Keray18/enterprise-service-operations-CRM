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
  areaType: z.enum(['LOCAL', 'UPCOUNTRY']).optional(),
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

export const asfQueueQuerySchema = z.object({
  view: z
    .enum(['all', 'unacknowledged', 'ready_to_assign', 'scheduled', 'checked_in', 'overdue'])
    .optional()
    .default('all'),
  locationId: z.string().uuid().optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const engineerJobsQuerySchema = z.object({
  status: z.string().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
