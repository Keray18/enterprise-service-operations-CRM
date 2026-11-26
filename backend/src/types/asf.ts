import { ServiceRequestWithRelationsRecord } from './callCenter.js';

export interface EligibleEngineerRecord {
  userId: string;
  username: string;
  fullName: string;
  phoneNumber?: string;
  email?: string;
  isActive: 'Y' | 'N';
  homeLocationId?: string;
  homeLocationCode?: string;
  homeLocationName?: string;
  openJobCount: number;
  availabilityStatus: 'AVAILABLE' | 'ACTIVE' | 'BUSY';
}

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
  devOtpPreview?: string;
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
  /** The separate Completion Happy Code is issued to the customer on successful arrival verification. */
  completionHappyCodeIssued?: boolean;
  /** Development-only preview (non-production with ENABLE_DEV_OTP_PREVIEW=true). */
  devHappyCodePreview?: string;
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
  devOtpPreview?: string;
}

export interface AcknowledgeComplaintInput {
  requestId: string;
  remarks?: string;
}

export interface AcknowledgeComplaintResponse {
  serviceRequest: ServiceRequestWithRelationsRecord;
  acknowledgedAt: string;
  acknowledgedBy: string;
}

export interface RejectAssignmentInput {
  requestId: string;
  reason: 'UNSUPPORTED_PRODUCT' | 'INCORRECT_ASSIGNMENT' | 'CAPACITY_EXCEEDED' | 'OUT_OF_TERRITORY' | 'OTHER';
  remarks: string;
}

export interface RejectAssignmentResponse {
  serviceRequest: ServiceRequestWithRelationsRecord;
  reassignmentRequested: boolean;
  message: string;
}

export interface ReassignComplaintInput {
  requestId: string;
  newLocationId: string;
  remarks?: string;
  preserveAssignment?: boolean;
}

export interface ReassignComplaintResponse {
  serviceRequest: ServiceRequestWithRelationsRecord;
  assignedLocationId: string;
  message: string;
}

export interface AsfQueueFilters {
  view?:
    | 'all'
    | 'unacknowledged'
    | 'ready_to_assign'
    | 'today_appointments'
    | 'assigned_technicians'
    | 'scheduled'
    | 'awaiting_checkin'
    | 'checked_in'
    | 'diagnosis_repair'
    | 'parts_pending'
    | 'parts_dispatched'
    | 'awaiting_verification'
    | 'overdue'
    | 'assignment_required';
  locationId?: string;
  assignedEngineerId?: string;
  productId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface SlaEvaluationResult {
  evaluatedCount: number;
  newBreachesCount: number;
  breachedRequestIds: string[];
}
