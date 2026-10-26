export type CustomerCategory = 'INDIVIDUAL' | 'COMMERCIAL' | 'CORPORATE';

export interface CustomerRecord {
  customerId: string;
  customerCode: string;
  fullName: string;
  primaryMobile: string;
  normalizedMobile: string;
  alternateMobile?: string;
  residencePhone?: string;
  email?: string;
  customerCategory: CustomerCategory;
  addressLine: string;
  landmark?: string;
  stateId: string;
  cityId: string;
  pincode: string;
  gstNumber?: string;
  isActive: 'Y' | 'N';
  versionNo: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface CustomerWithGeographyRecord extends CustomerRecord {
  stateName: string;
  stateCode: string;
  cityName: string;
}

export interface CreateCustomerInput {
  fullName: string;
  primaryMobile: string;
  alternateMobile?: string;
  residencePhone?: string;
  email?: string;
  customerCategory?: CustomerCategory;
  addressLine: string;
  landmark?: string;
  stateId: string;
  cityId: string;
  pincode: string;
  gstNumber?: string;
  createdBy?: string;
}

export type CallType = 'REPAIR' | 'INSTALLATION' | 'DEMO' | 'MAINTENANCE';
export type ServiceType = 'ON_SITE' | 'CARRY_IN' | 'PICK_UP';
export type WarrantyStatus = 'IN_WARRANTY' | 'OUT_OF_WARRANTY' | 'UNDER_VERIFICATION' | 'AMC' | 'VOID';
export type ServiceRequestStatus =
  | 'REGISTERED'
  | 'ASSIGNED_TO_ASF'
  | 'ACKNOWLEDGED'
  | 'APPOINTMENT_SCHEDULED'
  | 'TECHNICIAN_CHECKED_IN'
  | 'IN_PROGRESS_REPAIR'
  | 'PENDING_SPARE_PART'
  | 'PART_DISPATCHED_TO_ASF'
  | 'PENDING_SPECIAL_PART_ESTIMATE'
  | 'SPECIAL_PART_ESTIMATE_PROVIDED'
  | 'REQUEST_FOR_REPLACEMENT'
  | 'REPLACEMENT_APPROVED'
  | 'REPLACEMENT_DISPATCHED'
  | 'REQUEST_FOR_CANCELLATION'
  | 'CALL_CLOSURE_SUBMITTED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'REPLACED';

export interface VOCRecord {
  vocId: string;
  productId?: string;
  brandId?: string;
  vocCode: string;
  vocDescription: string;
  category: string;
  isActive: 'Y' | 'N';
}

export interface ServiceRequestRecord {
  requestId: string;
  jobNumber: string;
  customerId: string;
  brandId: string;
  productId: string;
  modelId: string;
  serialNumber?: string;
  purchaseDate?: Date;
  invoiceNo?: string;
  dealerName?: string;
  callType: CallType;
  serviceType: ServiceType;
  status: ServiceRequestStatus;
  warrantyStatus: WarrantyStatus;
  assignedLocationId?: string;
  assignedEngineerId?: string;
  vocId?: string;
  vocDescription?: string;
  problemDescription?: string;
  customerAddress?: string;
  customerPincode?: string;
  customerStateId?: string;
  customerCityId?: string;
  customerPhone?: string;
  registeredBy?: string;
  registeredByUsername?: string;
  registeredAt: Date;
  sla48hExpiresAt?: Date;
  acknowledgedAt?: Date;
  appointmentDate?: Date;
  appointmentSlot?: string;
  travelDistanceKm?: number;
  areaType?: 'LOCAL' | 'UPCOUNTRY';
  checkedInAt?: Date;
  slaBreached48h?: 'Y' | 'N';
  slaBreached48hAt?: Date;
  slaBreached168h?: 'Y' | 'N';
  slaBreached168hAt?: Date;
  // Phase 2B additions
  faultId?: string;
  defectId?: string;
  repairCodeId?: string;
  voeDescription?: string;
  observations?: string;
  repairAction?: string;
  repairRemarks?: string;
  repairAt?: 'ON_SITE' | 'IN_HOUSE';
  diagnosedAt?: Date;
  diagnosedBy?: string;
  repairedAt?: Date;
  repairedBy?: string;
  replacementReason?: string;
  replacementRemarks?: string;
  cancellationReason?: string;
  cancellationRemarks?: string;
  specialPartEstimateRemarks?: string;
  specialPartEstimateAmount?: number;
  specialPartApprovedAt?: Date;
  specialPartApprovedBy?: string;
  laborCharge: number;
  partsTotalCharge: number;
  totalEstimateAmount: number;
  // Phase 2C additions
  replacementApprovalNo?: string;
  closedAt?: Date;
  closedBy?: string;
  cancelledAt?: Date;
  cancelledBy?: string;
  supervisorOverrideReason?: string;
  idempotencyKey?: string;
  versionNo: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceRequestWithRelationsRecord extends ServiceRequestRecord {
  customerName: string;
  customerCode: string;
  brandName: string;
  brandCode: string;
  productName: string;
  productCode: string;
  modelName: string;
  modelCode: string;
  assignedLocationName?: string;
  assignedEngineerName?: string;
  assignedEngineerPhone?: string;
  stateName?: string;
  cityName?: string;
  // Phase 2B master relations
  faultCode?: string;
  faultDescription?: string;
  defectCode?: string;
  defectDescription?: string;
  repairCode?: string;
  repairActionDescription?: string;
  diagnosedByName?: string;
  repairedByName?: string;
}

export interface ServiceRequestEventRecord {
  eventId: string;
  requestId: string;
  fromState: string;
  toState: string;
  eventType: string;
  triggeredByUserId: string;
  triggeredByUsername: string;
  triggeredByRole: string;
  remarks?: string;
  metadataJson?: string;
  createdAt: Date;
}

export interface NotificationOutboxRecord {
  notificationId: string;
  requestId?: string;
  channel: 'SMS' | 'EMAIL' | 'WHATSAPP';
  recipient: string;
  templateCode: string;
  messageBody: string;
  isEncrypted?: 'Y' | 'N';
  encryptedPayload?: string;
  encryptionIv?: string;
  authTag?: string;
  keyVersion?: string;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  providerMessageId?: string;
  errorMessage?: string;
  retryCount: number;
  sentAt?: Date;
  createdAt: Date;
}

export interface RegisterComplaintInput {
  // Customer specification: either existing customerId or new customer fields
  customerId?: string;
  newCustomer?: CreateCustomerInput;

  // Product specification
  brandId: string;
  productId: string;
  modelId: string;
  serialNumber?: string;
  purchaseDate?: string;
  invoiceNo?: string;
  dealerName?: string;

  // Complaint & Service specification
  callType: CallType;
  serviceType: ServiceType;
  vocId?: string;
  vocDescription?: string;
  problemDescription?: string;

  // Geographic specification
  stateId: string;
  cityId: string;
  pincode: string;
  addressLine: string;

  // Idempotency token to guard against double submission
  idempotencyKey?: string;
}

export interface PincodeServiceabilityResolution {
  pincode: string;
  isServiceable: boolean;
  stateId: string;
  stateName: string;
  cityId: string;
  cityName: string;
  defaultAsfId?: string;
  defaultAsfName?: string;
  hasDefaultAsf: boolean;
  status: 'SERVICEABLE' | 'SERVICEABLE_NO_ASF' | 'NON_SERVICEABLE' | 'UNKNOWN';
}
