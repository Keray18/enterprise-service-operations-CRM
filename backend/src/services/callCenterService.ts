import { getOracleConnection } from '../database/oraclePool.js';
import { customerRepository } from '../database/repositories/customerRepository.js';
import { modelRepository } from '../database/repositories/modelRepository.js';
import { notificationRepository } from '../database/repositories/notificationRepository.js';
import { pincodeRepository } from '../database/repositories/pincodeRepository.js';
import { serviceRequestEventRepository } from '../database/repositories/serviceRequestEventRepository.js';
import { serviceRequestRepository } from '../database/repositories/serviceRequestRepository.js';
import { vocRepository } from '../database/repositories/vocRepository.js';
import { logger } from '../logging/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedUser } from '../types/auth.js';
import {
  CustomerWithGeographyRecord,
  PincodeServiceabilityResolution,
  RegisterComplaintInput,
  ServiceRequestWithRelationsRecord,
  VOCRecord,
  WarrantyStatus,
} from '../types/callCenter.js';
import { PaginatedResult } from '../types/catalog.js';
import { isValidIndianMobile } from '../utils/phoneUtils.js';
import { notificationService } from './notificationService.js';

export class CallCenterService {
  /**
   * Search customers by mobile, customer code, or full name.
   */
  async searchCustomers(options: {
    mobile?: string;
    code?: string;
    name?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<CustomerWithGeographyRecord>> {
    return customerRepository.searchCustomers(options);
  }

  /**
   * Retrieves single customer by ID with state and city names.
   */
  async getCustomerById(customerId: string): Promise<CustomerWithGeographyRecord> {
    const customer = await customerRepository.findById(customerId);
    if (!customer) {
      throw new AppError('Customer not found', 404, 'CUSTOMER_NOT_FOUND');
    }
    return customer;
  }

  /**
   * Resolves pincode geography and serviceability status.
   */
  async resolvePincode(pincode: string): Promise<PincodeServiceabilityResolution> {
    const cleanPincode = pincode.trim();
    if (!/^\d{6}$/.test(cleanPincode)) {
      throw new AppError('Invalid pincode format. Must be exactly 6 digits.', 400, 'INVALID_PINCODE');
    }

    const lookup = await pincodeRepository.lookupPincode(cleanPincode);
    if (!lookup) {
      return {
        pincode: cleanPincode,
        isServiceable: false,
        stateId: '',
        stateName: '',
        cityId: '',
        cityName: '',
        hasDefaultAsf: false,
        status: 'UNKNOWN',
      };
    }

    const isServiceable = lookup.isServiceable === 'Y';
    const hasDefaultAsf = Boolean(lookup.defaultAsfId);

    let status: PincodeServiceabilityResolution['status'] = 'NON_SERVICEABLE';
    if (isServiceable) {
      status = hasDefaultAsf ? 'SERVICEABLE' : 'SERVICEABLE_NO_ASF';
    }

    return {
      pincode: cleanPincode,
      isServiceable,
      stateId: lookup.stateId,
      stateName: lookup.stateName,
      cityId: lookup.cityId,
      cityName: lookup.cityName,
      defaultAsfId: lookup.defaultAsfId,
      defaultAsfName: lookup.defaultAsfName,
      hasDefaultAsf,
      status,
    };
  }

  /**
   * List active Voice of Customer complaints matching product/brand.
   */
  async listVOCs(productId?: string, brandId?: string): Promise<VOCRecord[]> {
    return vocRepository.listActiveVOCs(productId, brandId);
  }

  /**
   * Determines warranty status using model policy and purchase date.
   */
  calculateWarranty(customerWarrantyDays: number, purchaseDateStr?: string): WarrantyStatus {
    if (!purchaseDateStr) {
      return 'UNDER_VERIFICATION';
    }

    const purchaseDate = new Date(purchaseDateStr);
    if (isNaN(purchaseDate.getTime())) {
      return 'UNDER_VERIFICATION';
    }

    const now = new Date();
    const elapsedDays = Math.floor((now.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));

    if (elapsedDays < 0) {
      throw new AppError('Purchase date cannot be in the future', 400, 'INVALID_PURCHASE_DATE');
    }

    return elapsedDays <= customerWarrantyDays ? 'IN_WARRANTY' : 'OUT_OF_WARRANTY';
  }

  /**
   * Atomic Fast Call Registration.
   * Persists within a single Oracle transaction:
   * 1. Customer creation (if registering a new customer)
   * 2. Service Request in REGISTERED state with atomic Job Number
   * 3. Initial transition event in SERVICE_REQUEST_EVENTS
   * 4. SMS 1 notification in NOTIFICATIONS_OUTBOX
   *
   * Triggers SMS 1 delivery after transaction commit.
   */
  async registerServiceRequest(
    input: RegisterComplaintInput,
    user: AuthenticatedUser
  ): Promise<{
    serviceRequest: ServiceRequestWithRelationsRecord;
    customer: CustomerWithGeographyRecord;
    smsQueued: boolean;
  }> {
    // 1. Idempotency Check: if client submitted an idempotency key and it already exists, return existing request.
    if (input.idempotencyKey && input.idempotencyKey.trim()) {
      const existing = await serviceRequestRepository.findByIdempotencyKey(input.idempotencyKey.trim());
      if (existing) {
        const cust = await customerRepository.findById(existing.customerId);
        logger.info(`Idempotent service request retrieved: ${existing.jobNumber} for key: ${input.idempotencyKey}`);
        return {
          serviceRequest: existing,
          customer: cust!,
          smsQueued: true,
        };
      }
    }

    // 2. Authoritative Model & Brand/Product Validation
    const model = await modelRepository.findById(input.modelId);
    if (!model) {
      throw new AppError('Selected product model does not exist', 404, 'MODEL_NOT_FOUND');
    }
    if (model.isActive !== 'Y') {
      throw new AppError('Selected model is inactive', 400, 'MODEL_INACTIVE');
    }
    if (model.isJobCreationAllowed !== 'Y') {
      throw new AppError('Service request registration is not allowed for this model', 400, 'JOB_CREATION_DISABLED');
    }
    if (model.brandId !== input.brandId) {
      throw new AppError('Model does not belong to the selected brand', 400, 'BRAND_MODEL_MISMATCH');
    }
    if (model.productId !== input.productId) {
      throw new AppError('Model does not belong to the selected product category', 400, 'PRODUCT_MODEL_MISMATCH');
    }

    // 3. Serial Number Validation driven by Model Master Configuration
    const trimmedSerial = input.serialNumber?.trim() || '';
    if (model.checkSerialNumber === 'Y') {
      if (!trimmedSerial) {
        throw new AppError(
          `Product serial number is mandatory for model ${model.modelCode}`,
          400,
          'SERIAL_NUMBER_REQUIRED'
        );
      }
      if (trimmedSerial.length !== model.serialNumberLength) {
        throw new AppError(
          `Serial number length must be exactly ${model.serialNumberLength} characters for model ${model.modelCode} (got ${trimmedSerial.length})`,
          400,
          'INVALID_SERIAL_LENGTH'
        );
      }
    }

    // 4. Geography and Serviceability Validation
    const serviceability = await this.resolvePincode(input.pincode);
    if (serviceability.status === 'UNKNOWN') {
      throw new AppError(`Pincode ${input.pincode} is not recognized in geography master`, 400, 'PINCODE_NOT_FOUND');
    }
    if (!serviceability.isServiceable) {
      throw new AppError(
        `Service is currently unavailable for pincode ${input.pincode} (${serviceability.cityName}, ${serviceability.stateName})`,
        400,
        'NON_SERVICEABLE_PINCODE'
      );
    }

    // Determine assigned location (Default ASF) or retain unassigned state
    const assignedLocationId = serviceability.defaultAsfId || undefined;

    // 5. Warranty Calculation
    const warrantyStatus = this.calculateWarranty(model.customerWarrantyDays, input.purchaseDate);

    // 6. Begin Atomic Oracle Database Transaction
    const conn = await getOracleConnection();
    let committed = false;
    let outboxNotification: any = null;

    try {
      // Step A: Resolve or Create Customer
      let customer: CustomerWithGeographyRecord;

      if (input.customerId) {
        const found = await customerRepository.findById(input.customerId, conn);
        if (!found) {
          throw new AppError(`Customer with ID ${input.customerId} not found`, 404, 'CUSTOMER_NOT_FOUND');
        }
        customer = found;
      } else if (input.newCustomer) {
        if (!isValidIndianMobile(input.newCustomer.primaryMobile)) {
          throw new AppError('A valid 10-digit Indian mobile number is required', 400, 'INVALID_MOBILE');
        }
        if (!input.newCustomer.fullName.trim()) {
          throw new AppError('Customer full name is required', 400, 'CUSTOMER_NAME_REQUIRED');
        }
        if (!input.newCustomer.addressLine.trim()) {
          throw new AppError('Customer address line is required', 400, 'ADDRESS_REQUIRED');
        }

        customer = await customerRepository.createCustomer(
          {
            ...input.newCustomer,
            createdBy: user.username,
          },
          conn
        );
      } else {
        throw new AppError(
          'Either an existing customerId or newCustomer details must be provided',
          400,
          'MISSING_CUSTOMER_DATA'
        );
      }

      // Step B: Generate Concurrency-Safe Job Number
      const jobNumber = await serviceRequestRepository.generateJobNumber(
        model.brandCode,
        model.productCode,
        conn
      );

      // Step C: Calculate SLA Timers (48h acknowledgment timer)
      const sla48hExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

      // Step D: Insert Service Request (Initial State: REGISTERED)
      const serviceRequest = await serviceRequestRepository.createServiceRequest(
        {
          jobNumber,
          customerId: customer.customerId,
          brandId: model.brandId,
          productId: model.productId,
          modelId: model.modelId,
          serialNumber: trimmedSerial || undefined,
          purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : undefined,
          invoiceNo: input.invoiceNo?.trim() || undefined,
          dealerName: input.dealerName?.trim() || undefined,
          callType: input.callType,
          serviceType: input.serviceType,
          status: 'REGISTERED',
          warrantyStatus,
          assignedLocationId,
          vocId: input.vocId || undefined,
          vocDescription: input.vocDescription?.trim() || undefined,
          problemDescription: input.problemDescription?.trim() || undefined,
          customerAddress: input.addressLine.trim() || customer.addressLine,
          customerPincode: input.pincode.trim() || customer.pincode,
          customerStateId: input.stateId || customer.stateId,
          customerCityId: input.cityId || customer.cityId,
          customerPhone: customer.primaryMobile,
          registeredBy: user.userId,
          registeredByUsername: user.username,
          sla48hExpiresAt,
          idempotencyKey: input.idempotencyKey?.trim() || undefined,
        },
        conn
      );

      // Step E: Create Immutable Initial Event in History
      await serviceRequestEventRepository.createEvent(
        {
          requestId: serviceRequest.requestId,
          fromState: 'NONE',
          toState: 'REGISTERED',
          eventType: 'CALL_REGISTERED',
          triggeredByUserId: user.userId,
          triggeredByUsername: user.username,
          triggeredByRole: user.roles[0] || 'CALL_CENTER',
          remarks: 'Complaint registered via Call Center Fast Intake Console',
          metadataJson: {
            jobNumber,
            customerMobile: customer.primaryMobile,
            modelCode: model.modelCode,
            serialNumber: trimmedSerial || null,
            warrantyStatus,
            pincode: input.pincode,
            assignedLocationId: assignedLocationId || null,
          },
        },
        conn
      );

      // Step F: Enqueue SMS 1 in Notifications Outbox
      const smsBody = notificationService.buildSms1Message(jobNumber);
      outboxNotification = await notificationRepository.enqueueNotification(
        {
          requestId: serviceRequest.requestId,
          channel: 'SMS',
          recipient: customer.primaryMobile,
          templateCode: 'SMS_1_REGISTRATION',
          messageBody: smsBody,
        },
        conn
      );

      // Step G: Commit Transaction Atomically
      await conn.commit();
      committed = true;

      logger.info(
        `Service Request registered successfully: ${jobNumber} (RequestID: ${serviceRequest.requestId}) for Customer: ${customer.customerCode}`
      );

      // Step H: Post-Commit Asynchronous SMS Dispatch
      // Failures at the SMS gateway do not impact the committed ticket
      setImmediate(async () => {
        try {
          await notificationService.processNotification(outboxNotification);
        } catch (smsErr) {
          logger.error(`SMS 1 post-commit dispatch error for job ${jobNumber}: ${smsErr}`);
        }
      });

      return {
        serviceRequest,
        customer,
        smsQueued: true,
      };
    } catch (err) {
      if (!committed) {
        try {
          await conn.rollback();
        } catch (rbErr) {
          logger.error(`Rollback error during service request registration: ${rbErr}`);
        }
      }
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Search service requests by job number, customer mobile, or product serial number.
   */
  async searchRequests(options: {
    q?: string;
    jobNumber?: string;
    mobile?: string;
    serialNumber?: string;
    customerId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<ServiceRequestWithRelationsRecord>> {
    return serviceRequestRepository.searchRequests(options);
  }

  /**
   * Retrieve single service request by Job Number.
   */
  async getRequestByJobNumber(jobNumber: string): Promise<ServiceRequestWithRelationsRecord> {
    const request = await serviceRequestRepository.findByJobNumber(jobNumber);
    if (!request) {
      throw new AppError(`Service request with Job Number ${jobNumber} not found`, 404, 'NOT_FOUND');
    }
    return request;
  }

  /**
   * Retrieve single service request by ID.
   */
  async getRequestById(requestId: string): Promise<ServiceRequestWithRelationsRecord> {
    const request = await serviceRequestRepository.findById(requestId);
    if (!request) {
      throw new AppError(`Service request with ID ${requestId} not found`, 404, 'NOT_FOUND');
    }
    return request;
  }

  /**
   * List recent complaints lodged.
   */
  async listRecentRequests(options?: {
    limit?: number;
    customerId?: string;
    status?: string;
  }): Promise<ServiceRequestWithRelationsRecord[]> {
    return serviceRequestRepository.listRecent(options);
  }

  /**
   * Get audit event history for a service request.
   */
  async getRequestEvents(requestId: string) {
    return serviceRequestEventRepository.listEventsByRequestId(requestId);
  }

  /**
   * Get notifications outbox entries for a service request.
   */
  async getRequestNotifications(requestId: string) {
    return notificationRepository.listByRequestId(requestId);
  }
}

export const callCenterService = new CallCenterService();
