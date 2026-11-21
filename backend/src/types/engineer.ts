export interface EngineerKpisRecord {
  myActiveJobs: number;
  todayVisits: number;
  awaitingCheckIn: number;
  repairsInProgress: number;
  waitingParts: number;
  awaitingHappyCode: number;
}

export type EngineerJobTab =
  | 'today'
  | 'upcoming'
  | 'in_progress'
  | 'waiting_parts'
  | 'awaiting_closure'
  | 'completed'
  | 'all';

export interface EngineerJobsParams {
  tab?: EngineerJobTab;
  status?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface AdminEngineerRecord {
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
  createdAt: Date;
  lastLoginAt?: Date;
}

export interface CreateEngineerInput {
  fullName: string;
  username: string;
  phoneNumber: string;
  email?: string;
  homeLocationId: string;
  isActive?: 'Y' | 'N';
}

export interface CreateEngineerResponse {
  user: AdminEngineerRecord;
  temporaryPassword: string;
}

export interface AdminEngineerQueryParams {
  q?: string;
  locationId?: string;
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
  page?: number;
  limit?: number;
}

export interface AdminEngineerListResult {
  engineers: AdminEngineerRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ReassignEngineerJobsResult {
  reassignedCount: number;
  affectedRequestIds: string[];
}
