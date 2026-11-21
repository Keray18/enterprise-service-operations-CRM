import { z } from 'zod';

export const engineerJobsQuerySchema = z.object({
  tab: z
    .enum(['today', 'upcoming', 'in_progress', 'waiting_parts', 'awaiting_closure', 'completed', 'all'])
    .optional()
    .default('today'),
  status: z.string().max(50).optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminEngineerQuerySchema = z.object({
  q: z.string().max(100).optional(),
  locationId: z.string().max(36).optional(),
  status: z.enum(['ALL', 'ACTIVE', 'INACTIVE']).optional().default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createEngineerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name cannot exceed 100 characters'),
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username cannot exceed 50 characters')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username must contain only letters, numbers, underscores, dashes, or dots'),
  phoneNumber: z
    .string()
    .trim()
    .min(10, 'Phone number must be at least 10 digits')
    .max(20, 'Phone number cannot exceed 20 characters'),
  email: z.string().trim().email('Invalid email address format').optional().or(z.literal('')),
  homeLocationId: z.string().min(1, 'Valid Service Center ID is required').max(36),
  isActive: z.enum(['Y', 'N']).optional().default('Y'),
});

export const updateEngineerStatusSchema = z.object({
  isActive: z.enum(['Y', 'N']),
  reassignToEngineerId: z.string().max(36, 'Replacement technician must be a valid ID').optional(),
});

export const updateEngineerLocationSchema = z.object({
  homeLocationId: z.string().min(1, 'Valid Service Center ID is required').max(36),
});
