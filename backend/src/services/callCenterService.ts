import { getOracleConnection } from '../database/oraclePool.js';
import { customerRepository } from '../database/repositories/customerRepository.js';
import { locationRepository } from '../database/repositories/locationRepository.js';
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
  ServiceRequestStatus,
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
    if (serviceability.status !== 'UNKNOWN') {
      if (serviceability.stateId && input.stateId && input.stateId !== serviceability.stateId) {
        throw new AppError(
          `Geographic mismatch: Pincode ${input.pincode} belongs to ${serviceability.stateName}, not the selected State.`,
          400,
          'GEOGRAPHY_MISMATCH'
        );
      }
      if (serviceability.cityId && input.cityId && input.cityId !== serviceability.cityId) {
        throw new AppError(
          `Geographic mismatch: Pincode ${input.pincode} belongs to ${serviceability.cityName}, not the selected City.`,
          400,
          'GEOGRAPHY_MISMATCH'
        );
      }
    }

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
        if (input.newCustomer.alternateMobile && input.newCustomer.alternateMobile.trim() && !isValidIndianMobile(input.newCustomer.alternateMobile)) {
          throw new AppError(
            'Alternate mobile number must be a valid 10-digit Indian mobile number',
            400,
            'INVALID_ALTERNATE_MOBILE'
          );
        }
        if (input.newCustomer.email && input.newCustomer.email.trim()) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(input.newCustomer.email.trim())) {
            throw new AppError('Invalid customer email address format', 400, 'INVALID_EMAIL');
          }
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

      // Step B: Resolve Service Center assignment (Pincode priority -> Default fallback if permitted)
      let assignedLocationId: string | undefined = undefined;
      let assignedLocationName: string | undefined = undefined;
      let initialStatus: ServiceRequestStatus = 'REGISTERED';
      let assignmentSource: 'GEOGRAPHIC_PINCODE' | 'AUTOMATIC_DEFAULT_ASF' | 'UNASSIGNED_PENDING' = 'UNASSIGNED_PENDING';
      let assignmentFailedReason: string | undefined = undefined;

      const targetPincode = (input.pincode?.trim() || customer.pincode?.trim() || '');

      // Priority 1: Geographic Pincode Lookup
      if (targetPincode) {
        const pincodeMapping = await pincodeRepository.lookupPincode(targetPincode, conn);
        if (pincodeMapping) {
          if (pincodeMapping.isServiceable !== 'Y') {
            assignmentFailedReason = `Customer service pincode ${targetPincode} is marked as unserviceable`;
            logger.warn(`Pincode ${targetPincode} is unserviceable. Complaint will remain unassigned in REGISTERED.`);
          } else if (pincodeMapping.defaultAsfId) {
            const mappedAsf = await locationRepository.findById(pincodeMapping.defaultAsfId, conn);
            if (mappedAsf && mappedAsf.isActive === 'Y' && mappedAsf.partyType === 'ASF') {
              assignedLocationId = mappedAsf.locationId;
              assignedLocationName = mappedAsf.locationName;
              initialStatus = 'ASSIGNED_TO_ASF';
              assignmentSource = 'GEOGRAPHIC_PINCODE';
            } else {
              assignmentFailedReason = `Mapped Service Center (${pincodeMapping.defaultAsfName || pincodeMapping.defaultAsfId}) for pincode ${targetPincode} is inactive or invalid`;
              logger.warn(`Mapped ASF for pincode ${targetPincode} is inactive or invalid. Complaint will remain unassigned.`);
            }
          } else {
            assignmentFailedReason = `No primary Service Center mapped to pincode ${targetPincode}`;
            logger.warn(`No primary Service Center mapped to pincode ${targetPincode}. Complaint will remain unassigned.`);
          }
        } else {
          assignmentFailedReason = `Customer service pincode ${targetPincode} not found in pincode master`;
          logger.warn(`Pincode ${targetPincode} not found in pincode directory. Complaint will remain unassigned.`);
        }
      } else {
        assignmentFailedReason = 'No customer service pincode provided';
      }

      // Priority 2: Fallback to Global Default ASF ONLY WHEN EXPLICITLY PERMITTED
      if (!assignedLocationId && process.env['ALLOW_GLOBAL_DEFAULT_FALLBACK'] === 'true') {
        const configuredDefaults = await locationRepository.findDefaultAsfs(conn);
        if (configuredDefaults.length > 1) {
          assignmentFailedReason = 'Multiple default ASFs configured (ambiguous default ASF configuration)';
          logger.warn(`Ambiguous default ASF configuration: found ${configuredDefaults.length} default ASFs. Complaint will remain unassigned in REGISTERED.`);
        } else if (configuredDefaults.length === 1 && configuredDefaults[0]) {
          assignedLocationId = configuredDefaults[0].locationId;
          assignedLocationName = configuredDefaults[0].locationName;
          initialStatus = 'ASSIGNED_TO_ASF';
          assignmentSource = 'AUTOMATIC_DEFAULT_ASF';
        } else {
          const fallbackCode = process.env['DEFAULT_ASF_CODE'] || 'ASF_8441';
          const fallbackAsf = await locationRepository.findByCode(fallbackCode, conn);
          if (fallbackAsf && fallbackAsf.isActive === 'Y' && fallbackAsf.partyType === 'ASF') {
            assignedLocationId = fallbackAsf.locationId;
            assignedLocationName = fallbackAsf.locationName;
            initialStatus = 'ASSIGNED_TO_ASF';
            assignmentSource = 'AUTOMATIC_DEFAULT_ASF';
          } else {
            assignmentFailedReason = `Default fallback ASF (${fallbackCode}) not configured or inactive`;
            logger.warn(`Default ASF (${fallbackCode}) not found or inactive. Complaint will remain unassigned in REGISTERED.`);
          }
        }
      }

      // Step C: Generate Concurrency-Safe Job Number
      const jobNumber = await serviceRequestRepository.generateJobNumber(
        model.brandCode,
        model.productCode,
        conn
      );

      // Step D: Calculate SLA Timers (48h acknowledgment timer)
      const sla48hExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

      // Step E: Insert Service Request (Initial State: ASSIGNED_TO_ASF or REGISTERED)
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
          status: initialStatus,
          warrantyStatus,
          assignedLocationId,
          assignmentSource,
          assignmentFailedReason,
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

      // Step F: Create Immutable Initial Event in History (CALL_REGISTERED)
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
            assignmentSource,
            assignmentFailedReason: assignmentFailedReason || null,
          },
        },
        conn
      );

      // Step G: If assigned to ASF at registration, create CALL_ASSIGNED_TO_ASF event
      if (initialStatus === 'ASSIGNED_TO_ASF' && assignedLocationId) {
        await serviceRequestEventRepository.createEvent(
          {
            requestId: serviceRequest.requestId,
            fromState: 'REGISTERED',
            toState: 'ASSIGNED_TO_ASF',
            eventType: 'CALL_ASSIGNED_TO_ASF',
            triggeredByUserId: user.userId,
            triggeredByUsername: user.username,
            triggeredByRole: user.roles[0] || 'CALL_CENTER',
            remarks:
              assignmentSource === 'GEOGRAPHIC_PINCODE'
                ? `Automatically assigned to Service Center ${assignedLocationName || assignedLocationId} based on customer service pincode ${targetPincode}`
                : `Automatically assigned to default Service Center (${assignedLocationName || assignedLocationId}) at registration`,
            metadataJson: {
              assignedLocationId,
              assignedLocationName: assignedLocationName || null,
              assignmentSource,
              pincode: targetPincode || null,
            },
          },
          conn
        );
      }

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
    tab?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<ServiceRequestWithRelationsRecord>> {
    return serviceRequestRepository.searchRequests(options);
  }

  /**
   * Checks for duplicate open complaints by customer mobile, serial number, or customer ID.
   */
  async checkDuplicateComplaints(params: {
    mobile?: string;
    serialNumber?: string;
    customerId?: string;
    modelId?: string;
  }): Promise<{
    hasDuplicates: boolean;
    duplicates: ServiceRequestWithRelationsRecord[];
  }> {
    const duplicates = await serviceRequestRepository.findDuplicateComplaints(params);
    return {
      hasDuplicates: duplicates.length > 0,
      duplicates,
    };
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
