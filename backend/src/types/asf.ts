import { ServiceRequestWithRelationsRecord } from './callCenter.js';

export interface DispatchComplaintInput {
  requestId: string;
  appointmentDate: string; // ISO 8601 string, e.g. "2026-10-21T10:00:00Z"
  appointmentSlot: string; // e.g. "10:00 AM - 01:00 PM"
  engineerId: string;
  travelDistanceKm?: number;
  areaType?: 'LOCAL' | 'UPCOUNTRY';
  remarks?: string;
  idempotencyKey?: string;
}

export interface DispatchComplaintResponse {
  serviceRequest: ServiceRequestWithRelationsRecord;
  smsQueued: boolean;
}

export interface CheckInComplaintInput {
  requestId: string;
  otp: string; // 6-digit customer OTP
  geocoordinates?: {
    latitude: number;
    longitude: number;
  };
  remarks?: string;
}

export interface CheckInComplaintResponse {
  serviceRequest: ServiceRequestWithRelationsRecord;
  checkedInAt: string;
  verified: boolean;
}

export interface RegenerateOtpInput {
  requestId: string;
  reason?: string;
}

export interface RegenerateOtpResponse {
  success: boolean;
  smsQueued: boolean;
  message: string;
}

export interface AsfQueueFilters {
  view?: 'all' | 'unacknowledged' | 'ready_to_assign' | 'scheduled' | 'checked_in' | 'overdue';
  locationId?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface SlaEvaluationResult {
  evaluatedCount: number;
  newBreachesCount: number;
  breachedRequestIds: string[];
}
