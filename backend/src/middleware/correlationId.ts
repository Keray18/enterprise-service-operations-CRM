import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';

interface RequestContext {
  correlationId: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getCorrelationId(): string {
  const store = requestContext.getStore();
  return store?.correlationId || 'system-init';
}

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingHeader = req.headers['x-correlation-id'];
  const correlationId = typeof incomingHeader === 'string' && incomingHeader.trim()
    ? incomingHeader.trim()
    : crypto.randomUUID();

  // Expose back to client response header
  res.setHeader('x-correlation-id', correlationId);

  requestContext.run({ correlationId }, () => {
    next();
  });
}
