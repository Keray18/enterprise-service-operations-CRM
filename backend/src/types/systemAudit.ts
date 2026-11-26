export interface SystemAuditRecord {
  eventId: string;
  actorId: string | null;
  actorRole: string | null;
  actorUsername: string | null;
  action: string;
  resource: string;
  recordIdentifier: string | null;
  outcome: 'SUCCESS' | 'FAILURE';
  correlationId: string | null;
  changesJson?: string;
  changes?: Record<string, any>;
  justification?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface CreateSystemAuditInput {
  actorId?: string | null;
  actorRole?: string | null;
  actorUsername?: string | null;
  action: string;
  resource: string;
  recordIdentifier?: string | null;
  outcome: 'SUCCESS' | 'FAILURE';
  correlationId?: string | null;
  changes?: Record<string, any> | null;
  justification?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface SystemAuditQueryOptions {
  actorId?: string;
  actorRole?: string;
  action?: string;
  resource?: string;
  outcome?: 'SUCCESS' | 'FAILURE';
  startDate?: string;
  endDate?: string;
  correlationId?: string;
  search?: string;
  page?: number;
  limit?: number;
}
