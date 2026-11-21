import { apiClient } from './apiClient';

export interface PublicFeedbackSummary {
  feedbackId: string;
  jobNumber: string;
  productName: string;
  brandName: string;
  serviceDate: string;
  status: 'PENDING' | 'SUBMITTED' | 'EXPIRED';
  isExpired: boolean;
  alreadySubmitted: boolean;
}

export interface SubmitPublicFeedbackInput {
  overallRating: number; // 1-5
  techRating: number; // 1-5
  repairRating: number; // 1-5
  issueResolved: 'Y' | 'N';
  comments?: string;
}

export interface SubmitFeedbackResult {
  success: boolean;
  message: string;
  jobNumber: string;
}

export const feedbackApi = {
  getFeedback: async (token: string): Promise<PublicFeedbackSummary> => {
    return apiClient.get<PublicFeedbackSummary>(`/api/v1/feedback/${token}`);
  },

  submitFeedback: async (
    token: string,
    data: SubmitPublicFeedbackInput
  ): Promise<SubmitFeedbackResult> => {
    return apiClient.post<SubmitFeedbackResult>(`/api/v1/feedback/${token}`, data);
  },
};

