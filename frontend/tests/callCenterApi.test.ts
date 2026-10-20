import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  callCenterApi,
  CustomerWithGeography,
  PincodeResolution,
  RegisterComplaintPayload,
  RegisterComplaintResponse,
  ServiceRequest,
} from '../src/lib/callCenterApi';
import { apiClient } from '../src/lib/apiClient';

describe('Phase 1C Call Center Frontend API & Workflow Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Customer Lookup & Search API', () => {
    it('constructs correct query params for customer mobile search', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });

      await callCenterApi.searchCustomers({ mobile: '9876543210' });

      expect(getSpy).toHaveBeenCalledWith('/api/v1/customers/search?mobile=9876543210');
    });

    it('constructs correct query params for customer code & name search with pagination', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
        items: [],
        total: 0,
        page: 2,
        limit: 25,
        totalPages: 0,
      });

      await callCenterApi.searchCustomers({ code: 'CUST-001', name: 'John', page: 2, limit: 25 });

      expect(getSpy).toHaveBeenCalledWith(
        '/api/v1/customers/search?code=CUST-001&name=John&page=2&limit=25'
      );
    });

    it('fetches customer by ID and past service requests', async () => {
      const dummyCustomer: CustomerWithGeography = {
        customerId: 'cust-123',
        customerCode: 'CUST-0001',
        fullName: 'Jane Doe',
        primaryMobile: '9876543210',
        normalizedMobile: '+919876543210',
        customerCategory: 'INDIVIDUAL',
        addressLine: '123 MG Road',
        stateId: 'state-mh',
        cityId: 'city-mum',
        pincode: '400001',
        isActive: 'Y',
        versionNo: 1,
        createdAt: '2026-10-20T10:00:00Z',
        updatedAt: '2026-10-20T10:00:00Z',
        stateName: 'Maharashtra',
        stateCode: 'MH',
        cityName: 'Mumbai',
      };

      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(dummyCustomer);

      const customer = await callCenterApi.getCustomerById('cust-123');
      expect(getSpy).toHaveBeenCalledWith('/api/v1/customers/cust-123');
      expect(customer.fullName).toBe('Jane Doe');
      expect(customer.cityName).toBe('Mumbai');
    });
  });

  describe('Pincode Resolution & Serviceability', () => {
    it('resolves pincode serviceability status', async () => {
      const resolution: PincodeResolution = {
        pincode: '400001',
        isServiceable: true,
        stateId: 'state-mh',
        stateName: 'Maharashtra',
        cityId: 'city-mum',
        cityName: 'Mumbai',
        defaultAsfId: 'asf-001',
        defaultAsfName: 'Mumbai Central ASF',
        hasDefaultAsf: true,
        status: 'SERVICEABLE',
      };

      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(resolution);

      const result = await callCenterApi.resolvePincode('400001');
      expect(getSpy).toHaveBeenCalledWith('/api/v1/call-center/serviceability/400001');
      expect(result.status).toBe('SERVICEABLE');
      expect(result.hasDefaultAsf).toBe(true);
      expect(result.defaultAsfName).toBe('Mumbai Central ASF');
    });

    it('identifies unserviceable pincodes correctly', async () => {
      const resolution: PincodeResolution = {
        pincode: '999999',
        isServiceable: false,
        stateId: '',
        stateName: '',
        cityId: '',
        cityName: '',
        hasDefaultAsf: false,
        status: 'NON_SERVICEABLE',
      };

      vi.spyOn(apiClient, 'get').mockResolvedValue(resolution);
      const result = await callCenterApi.resolvePincode('999999');
      expect(result.isServiceable).toBe(false);
      expect(result.status).toBe('NON_SERVICEABLE');
    });
  });

  describe('Complaint Registration Payload & Workflow', () => {
    it('posts complaint payload with new customer and returns job number & SMS status', async () => {
      const payload: RegisterComplaintPayload = {
        newCustomer: {
          fullName: 'Arun Patel',
          primaryMobile: '9876543210',
          customerCategory: 'INDIVIDUAL',
          addressLine: '45 Lake View',
          stateId: 'state-gj',
          cityId: 'city-ahd',
          pincode: '380001',
        },
        brandId: 'brand-voltas',
        productId: 'prod-split-ac',
        modelId: 'model-15ton',
        serialNumber: 'SN1234567890',
        callType: 'REPAIR',
        serviceType: 'ON_SITE',
        vocDescription: 'Cooling not sufficient',
        problemDescription: 'AC runs but does not cool room',
        stateId: 'state-gj',
        cityId: 'city-ahd',
        pincode: '380001',
        addressLine: '45 Lake View',
        idempotencyKey: 'idemp-xyz-001',
      };

      const mockResponse: RegisterComplaintResponse = {
        serviceRequest: {
          requestId: 'req-001',
          jobNumber: 'TTAC2610200001',
          customerId: 'cust-new-1',
          brandId: 'brand-voltas',
          productId: 'prod-split-ac',
          modelId: 'model-15ton',
          serialNumber: 'SN1234567890',
          callType: 'REPAIR',
          serviceType: 'ON_SITE',
          status: 'REGISTERED',
          warrantyStatus: 'UNDER_VERIFICATION',
          vocDescription: 'Cooling not sufficient',
          problemDescription: 'AC runs but does not cool room',
          customerAddress: '45 Lake View',
          customerPincode: '380001',
          registeredAt: '2026-10-20T10:00:00Z',
          versionNo: 1,
          createdAt: '2026-10-20T10:00:00Z',
          updatedAt: '2026-10-20T10:00:00Z',
          customerName: 'Arun Patel',
          customerCode: 'CUST-0002',
          brandName: 'Voltas',
          brandCode: 'VOL',
          productName: 'Split AC',
          productCode: 'AC',
          modelName: '1.5 Ton Inverter',
          modelCode: 'SAC15T',
        },
        customer: {
          customerId: 'cust-new-1',
          customerCode: 'CUST-0002',
          fullName: 'Arun Patel',
          primaryMobile: '9876543210',
          normalizedMobile: '+919876543210',
          customerCategory: 'INDIVIDUAL',
          addressLine: '45 Lake View',
          stateId: 'state-gj',
          cityId: 'city-ahd',
          pincode: '380001',
          isActive: 'Y',
          versionNo: 1,
          createdAt: '2026-10-20T10:00:00Z',
          updatedAt: '2026-10-20T10:00:00Z',
          stateName: 'Gujarat',
          stateCode: 'GJ',
          cityName: 'Ahmedabad',
        },
        smsQueued: true,
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockResponse);

      const result = await callCenterApi.registerComplaint(payload);

      expect(postSpy).toHaveBeenCalledWith('/api/v1/call-center/complaints', payload);
      expect(result.serviceRequest.jobNumber).toBe('TTAC2610200001');
      expect(result.serviceRequest.status).toBe('REGISTERED');
      expect(result.smsQueued).toBe(true);
      expect(result.customer.fullName).toBe('Arun Patel');
    });

    it('fetches service request details by human-readable job number', async () => {
      const mockReq: Partial<ServiceRequest> = {
        requestId: 'req-001',
        jobNumber: 'TTWM2610200042',
        status: 'REGISTERED',
      };

      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockReq);

      const res = await callCenterApi.getRequestByJobNumber('TTWM2610200042');
      expect(getSpy).toHaveBeenCalledWith('/api/v1/call-center/requests/job/TTWM2610200042');
      expect(res.jobNumber).toBe('TTWM2610200042');
    });

    it('fetches service request lifecycle events and notification outbox', async () => {
      const mockEvents = [
        {
          eventId: 'evt-1',
          requestId: 'req-001',
          fromState: 'NONE',
          toState: 'REGISTERED',
          eventType: 'INITIAL_REGISTRATION',
          triggeredByUserId: 'usr-1',
          triggeredByUsername: 'agent1',
          triggeredByRole: 'CALL_CENTER',
          createdAt: '2026-10-20T10:00:00Z',
        },
      ];

      const mockNotifications = [
        {
          notificationId: 'notif-1',
          requestId: 'req-001',
          channel: 'SMS' as const,
          recipient: '+919876543210',
          templateCode: 'SMS_01_REGISTRATION',
          messageBody: 'Dear Customer, We have registered your service request #TTWM2610200042.',
          status: 'SENT' as const,
          retryCount: 0,
          createdAt: '2026-10-20T10:00:00Z',
        },
      ];

      vi.spyOn(apiClient, 'get')
        .mockResolvedValueOnce(mockEvents)
        .mockResolvedValueOnce(mockNotifications);

      const events = await callCenterApi.getRequestEvents('req-001');
      const notifications = await callCenterApi.getRequestNotifications('req-001');

      expect(events).toHaveLength(1);
      expect(events[0].fromState).toBe('NONE');
      expect(events[0].toState).toBe('REGISTERED');

      expect(notifications).toHaveLength(1);
      expect(notifications[0].status).toBe('SENT');
      expect(notifications[0].templateCode).toBe('SMS_01_REGISTRATION');
    });
  });
});
