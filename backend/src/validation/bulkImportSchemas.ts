import { z } from 'zod';

export const entityTypeParamSchema = z
  .string()
  .transform((val) => val.toUpperCase())
  .refine((val): val is 'MODEL' | 'PART' => ['MODEL', 'PART'].includes(val), {
    message: "entityType must be either 'MODEL' or 'PART'",
  });

export const importModeSchema = z.enum(['CREATE_ONLY', 'UPDATE_EXISTING']);

export const commitImportSchema = z.object({
  jobId: z.string().uuid('Invalid job ID format. Must be a UUID.'),
});
