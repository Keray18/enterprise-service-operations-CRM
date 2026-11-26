export type VerificationPurpose = 'ARRIVAL' | 'COMPLETION';

export interface ReplacementVerificationRecord {
  verificationId: string;
  replacementId: string;
  visitNumber: number;
  appointmentVersion: number;
  assignedEngineerId: string;
  purpose: VerificationPurpose;
  codeHash: string;
  codeSalt: string;
  expiresAt: Date;
  attempts: number;
  verifiedAt?: Date;
  verifiedBy?: string;
  isInvalidated: 'Y' | 'N';
  invalidatedAt?: Date;
  invalidatedReason?: string;
  createdAt: Date;
}

export interface IssueReplacementVerificationInput {
  replacementId: string;
  visitNumber: number;
  appointmentVersion: number;
  assignedEngineerId: string;
  purpose: VerificationPurpose;
  expiresInMinutes?: number;
  plainCode?: string; // Only for deterministic test fixtures; generated securely in production
}

export interface VerifyReplacementVerificationInput {
  replacementId: string;
  visitNumber: number;
  appointmentVersion: number;
  purpose: VerificationPurpose;
  happyCode: string;
}
