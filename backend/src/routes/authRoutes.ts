import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import { requireAuth, requireCsrf } from '../middleware/authMiddleware.js';
import { sendSuccess } from '../middleware/errorHandler.js';
import { authService } from '../services/authService.js';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Max 15 attempts per IP per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts. Please try again in a few minutes.',
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  },
});

const loginSchema = z.object({
  username: z.string().min(1, 'Username or email is required').max(100),
  password: z.string().min(1, 'Password is required').max(128),
});

export const authRouter = Router();

authRouter.post('/login', loginLimiter, async (req: Request, res: Response, next) => {
  try {
    const validated = loginSchema.parse(req.body);
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await authService.login(
      validated.username,
      validated.password,
      ipAddress,
      userAgent
    );

    // Set HttpOnly session cookie
    res.cookie('crm_session', result.sessionToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: result.expiresAt,
    });

    // Set client-readable CSRF cookie
    res.cookie('crm_csrf', result.csrfToken, {
      httpOnly: false,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: result.expiresAt,
    });

    sendSuccess(res, {
      user: result.user,
      csrfToken: result.csrfToken,
      expiresAt: result.expiresAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', requireAuth, requireCsrf, async (req: Request, res: Response, next) => {
  try {
    const sessionToken = req.cookies?.['crm_session'] || req.headers.authorization?.slice(7);
    await authService.logout(sessionToken);

    res.clearCookie('crm_session', { path: '/' });
    res.clearCookie('crm_csrf', { path: '/' });

    sendSuccess(res, { message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, async (req: Request, res: Response, next) => {
  try {
    sendSuccess(res, {
      user: req.user,
      csrfToken: req.sessionContext?.csrfToken,
    });
  } catch (err) {
    next(err);
  }
});
