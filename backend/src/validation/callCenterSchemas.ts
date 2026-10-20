import { z } from 'zod';

export const customerSearchSchema = z.object({
  mobile: z.string().optional(),
  code: z.string().optional(),
  name: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const newCustomerSchema = z.object({
  fullName: z.string().min(2, 'Customer full name must be at least 2 characters').max(150),
  primaryMobile: z.string().min(10, 'Mobile number must be at least 10 digits').max(15),
  alternateMobile: z.string().max(15).optional(),
  residencePhone: z.string().max(20).optional(),
  email: z.string().email('Invalid email address format').optional().or(z.literal('')),
  customerCategory: z.enum(['INDIVIDUAL', 'COMMERCIAL', 'CORPORATE']).default('INDIVIDUAL'),
  addressLine: z.string().min(5, 'Address line must be at least 5 characters').max(255),
  landmark: z.string().max(150).optional(),
  stateId: z.string().uuid('Valid State ID is required'),
  cityId: z.string().uuid('Valid City ID is required'),
  pincode: z.string().regex(/^\d{6}$/, 'Pincode must be exactly 6 digits'),
  gstNumber: z.string().max(20).optional(),
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
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
