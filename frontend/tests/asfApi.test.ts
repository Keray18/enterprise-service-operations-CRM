import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  asfApi,
  AsfQueueItem,
  EligibleEngineer,
  DispatchComplaintPayload,
  DispatchComplaintResponse,
  CheckInComplaintPayload,
  CheckInComplaintResponse,
  RegenerateOtpPayload,
  RegenerateOtpResponse,
  SlaEvaluationResult,
} from '../src/lib/asfApi';
import { apiClient } from '../src/lib/apiClient';

describe('Phase 2A ASF Operations & Dispatch Frontend API Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. ASF Queue Queries & View Filtering', () => {
    it('constructs correct default query params for ASF queue', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      await asfApi.getQueue();

      expect(getSpy).toHaveBeenCalledWith('/api/v1/asf/queue');
    });

    it('constructs query params for view filtering (overdue, location, search)', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 50,
        totalPages: 0,
      });

      await asfApi.getQueue({
        view: 'overdue',
        locationId: 'loc-mum-01',
        q: 'JOB-20261020-0001',
        page: 2,
        limit: 50,
      });

      expect(getSpy).toHaveBeenCalledWith(
        '/api/v1/asf/queue?view=overdue&locationId=loc-mum-01&q=JOB-20261020-0001&page=2&limit=50'
      );
    });

    it('constructs query params for unacknowledged and ready_to_assign tabs', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      await asfApi.getQueue({ view: 'unacknowledged' });
      expect(getSpy).toHaveBeenCalledWith('/api/v1/asf/queue?view=unacknowledged');

      await asfApi.getQueue({ view: 'ready_to_assign' });
      expect(getSpy).toHaveBeenCalledWith('/api/v1/asf/queue?view=ready_to_assign');
    });
  });

  describe('2. Eligible Engineers & Field Visits', () => {
    it('fetches eligible active engineers for an ASF franchise location', async () => {
      const mockEngineers: EligibleEngineer[] = [
        {
          userId: 'eng-01',
          username: 'tech_rajesh',
          fullName: 'Rajesh Kumar',
          phoneNumber: '9876540001',
        },
        {
          userId: 'eng-02',
          username: 'tech_vikram',
          fullName: 'Vikram Singh',
          phoneNumber: '9876540002',
        },
      ];

      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockEngineers);

      const result = await asfApi.getEligibleEngineers('loc-mum-01');

      expect(getSpy).toHaveBeenCalledWith('/api/v1/asf/engineers/loc-mum-01');
      expect(result).toHaveLength(2);
      expect(result[0].fullName).toBe('Rajesh Kumar');
    });

    it('queries field technician assigned jobs via /api/v1/asf/engineer-jobs', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });

      await asfApi.getEngineerJobs({ page: 1, limit: 10, status: 'APPOINTMENT_SCHEDULED' });

      expect(getSpy).toHaveBeenCalledWith(
        '/api/v1/asf/engineer-jobs?page=1&limit=10&status=APPOINTMENT_SCHEDULED'
      );
    });
  });

  describe('3. Single-Commit Dispatch & Appointment Scheduling', () => {
    it('submits atomic single-commit dispatch payload to the correct endpoint', async () => {
      const mockResponse: DispatchComplaintResponse = {
        requestId: 'req-101',
        jobNumber: 'JOB-20261020-0001',
        status: 'APPOINTMENT_SCHEDULED',
        appointmentDate: '2026-10-21',
        appointmentSlot: 'MORNING',
        assignedEngineerId: 'eng-01',
        assignedEngineerName: 'Rajesh Kumar',
        otpExpiresAt: '2026-10-21T18:00:00.000Z',
        smsQueued: true,
        message: 'Dispatch and appointment committed successfully. Check-in OTP generated.',
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockResponse);

      const payload: DispatchComplaintPayload = {
        requestId: 'req-101',
        engineerId: 'eng-01',
        appointmentDate: '2026-10-21',
        appointmentSlot: 'MORNING',
        travelDistanceKm: 8.5,
        areaType: 'URBAN',
        remarks: 'Customer available before 12 PM',
      };

      const result = await asfApi.dispatchComplaint(payload);

      expect(postSpy).toHaveBeenCalledWith('/api/v1/asf/requests/req-101/dispatch', {
        engineerId: 'eng-01',
        appointmentDate: '2026-10-21',
        appointmentSlot: 'MORNING',
        travelDistanceKm: 8.5,
        areaType: 'URBAN',
        remarks: 'Customer available before 12 PM',
      });
      expect(result.status).toBe('APPOINTMENT_SCHEDULED');
      expect(result.smsQueued).toBe(true);
    });
  });

  describe('4. Technician Check-In & OTP Verification', () => {
    it('submits check-in with 6-digit OTP and GPS coordinates', async () => {
      const mockResponse: CheckInComplaintResponse = {
        requestId: 'req-101',
        jobNumber: 'JOB-20261020-0001',
        status: 'TECHNICIAN_CHECKED_IN',
        checkedInAt: '2026-10-21T10:15:00.000Z',
        verifiedByEngineerId: 'eng-01',
        message: 'Technician check-in verified successfully via customer OTP.',
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockResponse);

      const payload: CheckInComplaintPayload = {
        requestId: 'req-101',
        otp: '654321',
        checkInLatitude: 19.076,
        checkInLongitude: 72.8777,
        remarks: 'Arrived at site',
      };

      const result = await asfApi.checkInWithOtp(payload);

      expect(postSpy).toHaveBeenCalledWith('/api/v1/asf/requests/req-101/check-in', {
        otp: '654321',
        checkInLatitude: 19.076,
        checkInLongitude: 72.8777,
        remarks: 'Arrived at site',
      });
      expect(result.status).toBe('TECHNICIAN_CHECKED_IN');
    });

    it('submits OTP regeneration request (SMS 6) to supersede expired OTP', async () => {
      const mockResponse: RegenerateOtpResponse = {
        requestId: 'req-101',
        jobNumber: 'JOB-20261020-0001',
        otpExpiresAt: '2026-10-21T20:00:00.000Z',
        smsQueued: true,
        message: 'New check-in OTP generated and queued for dispatch via SMS 6.',
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockResponse);

      const payload: RegenerateOtpPayload = {
        requestId: 'req-101',
        reason: 'Customer did not receive original SMS',
      };

      const result = await asfApi.regenerateOtp(payload);

      expect(postSpy).toHaveBeenCalledWith('/api/v1/asf/requests/req-101/regenerate-otp', {
        reason: 'Customer did not receive original SMS',
      });
      expect(result.smsQueued).toBe(true);
    });
  });

  describe('5. 48-Hour SLA Evaluation Trigger', () => {
    it('triggers batch SLA evaluation endpoint via /api/v1/asf/sla/evaluate', async () => {
      const mockResult: SlaEvaluationResult = {
        evaluatedCount: 5,
        newBreachesCount: 2,
        breachedRequestIds: ['req-01', 'req-02'],
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockResult);

      const result = await asfApi.evaluateSla();

      expect(postSpy).toHaveBeenCalledWith('/api/v1/asf/sla/evaluate', {});
      expect(result.newBreachesCount).toBe(2);
      expect(result.breachedRequestIds).toEqual(['req-01', 'req-02']);
    });
  });
});
