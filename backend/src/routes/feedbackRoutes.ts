import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { feedbackController } from '../controllers/feedbackController.js';

export const feedbackRouter = Router();

// Rate limiter for public feedback endpoints
const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // Limit to 60 requests per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many feedback requests. Please try again in a few minutes.',
    },
  },
});

feedbackRouter.use(feedbackLimiter);

/**
 * GET /api/v1/feedback/:token
 * Public sanitized summary for post-service customer feedback.
 */
feedbackRouter.get('/:token', feedbackController.getFeedback.bind(feedbackController));

/**
 * POST /api/v1/feedback/:token
 * Public customer rating and review submission.
 */
feedbackRouter.post('/:token', feedbackController.submitFeedback.bind(feedbackController));

