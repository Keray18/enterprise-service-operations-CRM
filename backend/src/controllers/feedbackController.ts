import { Request, Response, NextFunction } from 'express';
import { feedbackService } from '../services/feedbackService.js';
import { AppError } from '../middleware/errorHandler.js';

export class FeedbackController {
  /**
   * GET /api/v1/feedback/:token
   * Public endpoint to retrieve sanitized service call details for feedback form.
   */
  async getFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.params.token;
      if (!token) {
        throw new AppError('Invitation token is required', 400, 'TOKEN_REQUIRED');
      }

      const summary = await feedbackService.getPublicFeedbackSummary(token);
      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/feedback/:token
   * Public endpoint to submit customer ratings and comments.
   */
  async submitFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.params.token;
      if (!token) {
        throw new AppError('Invitation token is required', 400, 'TOKEN_REQUIRED');
      }

      const { overallRating, techRating, repairRating, issueResolved, comments } = req.body;

      const result = await feedbackService.submitPublicFeedback(token, {
        overallRating: Number(overallRating),
        techRating: Number(techRating),
        repairRating: Number(repairRating),
        issueResolved,
        comments: typeof comments === 'string' ? comments.trim() : undefined,
      });

      res.status(200).json({
        success: true,
        data: result,
        message: result.message,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const feedbackController = new FeedbackController();

