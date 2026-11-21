import { z } from 'zod';
import { normalizeIndianMobile } from '../utils/phoneUtils.js';

export const customerSearchSchema = z.object({
  mobile: z.string().optional(),
  code: z.string().optional(),
  name: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const newCustomerSchema = z.object({
  fullName: z
    .string({ required_error: 'Customer full name is required' })
    .trim()
    .min(2, 'Customer full name must be at least 2 characters')
    .max(150),
  primaryMobile: z
    .string({ required_error: 'Primary mobile number is required' })
    .trim()
    .transform((val) => normalizeIndianMobile(val))
    .refine(
      (val) => /^[6-9]\d{9}$/.test(val),
      (val) => ({
        message: !val
          ? 'Primary mobile number is required'
          : val.length !== 10
            ? `Mobile number must be exactly 10 digits (currently ${val.length})`
            : `Indian mobile number must begin with 6, 7, 8, or 9 (entered number begins with ${val[0]})`,
      })
    ),
  alternateMobile: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((val) => (val ? normalizeIndianMobile(val) : ''))
    .refine(
      (val) => !val || /^[6-9]\d{9}$/.test(val),
      (val) => ({
        message:
          val && val.length !== 10
            ? `Alternate mobile must be exactly 10 digits (currently ${val.length})`
            : `Alternate mobile must begin with 6, 7, 8, or 9 (entered number begins with ${val?.[0]})`,
      })
    ),
  residencePhone: z.string().trim().max(20).optional().or(z.literal('')),
  email: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine(
      (val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
      'Invalid email address format (e.g. name@example.com)'
    ),
  customerCategory: z.enum(['INDIVIDUAL', 'COMMERCIAL', 'CORPORATE']).default('INDIVIDUAL'),
  addressLine: z
    .string({ required_error: 'Address line is required' })
    .trim()
    .min(5, 'Address line must be at least 5 characters')
    .max(255),
  landmark: z.string().trim().max(150).optional().or(z.literal('')),
  stateId: z.string({ required_error: 'State selection is required' }).uuid('Valid State ID is required'),
  cityId: z.string({ required_error: 'City selection is required' }).uuid('Valid City ID is required'),
  pincode: z
    .string({ required_error: 'Pincode is required' })
    .trim()
    .regex(/^\d{6}$/, 'Pincode must be exactly 6 digits'),
  gstNumber: z.string().trim().max(20).optional().or(z.literal('')),
});

export const registerComplaintSchema = z
  .object({
    customerId: z.string().uuid('Invalid Customer ID').optional(),
    newCustomer: newCustomerSchema.optional(),

    brandId: z.string().uuid('Valid Brand ID is required'),
    productId: z.string().uuid('Valid Product ID is required'),
    modelId: z.string().uuid('Valid Model ID is required'),
    serialNumber: z.string().max(60).optional(),
    purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Purchase date must be in YYYY-MM-DD format').optional().or(z.literal('')),
    invoiceNo: z.string().max(50).optional(),
    dealerName: z.string().max(150).optional(),

    callType: z.enum(['REPAIR', 'INSTALLATION', 'DEMO', 'MAINTENANCE']),
    serviceType: z.enum(['ON_SITE', 'CARRY_IN', 'PICK_UP']).default('ON_SITE'),
    vocId: z.string().uuid('Invalid VOC ID').optional(),
    vocDescription: z.string().max(255).optional(),
    problemDescription: z.string().max(1000).optional(),

    stateId: z.string().uuid('Valid State ID is required'),
    cityId: z.string().uuid('Valid City ID is required'),
    pincode: z.string().regex(/^\d{6}$/, 'Pincode must be exactly 6 digits'),
    addressLine: z.string().min(5, 'Address must be at least 5 characters').max(255),

    idempotencyKey: z.string().max(100).optional(),
  })
  .refine((data) => data.customerId || data.newCustomer, {
    message: 'Either an existing customerId or newCustomer details must be provided',
    path: ['customerId'],
  });

export const searchRequestsSchema = z.object({
  q: z.string().optional(),
  jobNumber: z.string().optional(),
  mobile: z.string().optional(),
  serialNumber: z.string().optional(),
  customerId: z.string().uuid().optional(),
  status: z.string().optional(),
  tab: z.enum(['all', 'new_registered', 'assigned_asf', 'in_progress', 'closed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const checkDuplicatesSchema = z.object({
  mobile: z.string().optional(),
  serialNumber: z.string().optional(),
  customerId: z.string().uuid().optional(),
  modelId: z.string().uuid().optional(),
});
