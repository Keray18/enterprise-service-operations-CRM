import { Response } from 'express';
import {
  CallRegisterFilter,
  CallRegisterRow,
  PartConsumptionRow,
  reportingRepository,
  StockValuationRow,
  WarrantyClaimReportRow,
} from '../database/repositories/reportingRepository.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedUser } from '../types/auth.js';

export class ReportingService {
  /**
   * Resolves and enforces role-based scope filters to guarantee data isolation.
   */
  resolveScope(user: AuthenticatedUser, requestedLocationId?: string, requestedBrandId?: string): {
    locationId?: string;
    brandId?: string;
  } {
    const isAsf = user.roles.includes('ASF');
    const isBrand = user.roles.includes('BRAND');
    const isWarehouse = user.roles.includes('WAREHOUSE');

    let locationId = requestedLocationId;
    let brandId = requestedBrandId;

    if (isAsf) {
      if (!user.locationId) {
        throw new AppError('Forbidden: ASF user is not bound to a valid franchise location.', 403, 'FORBIDDEN');
      }
      locationId = user.locationId;
    } else if (isWarehouse) {
      if (!user.locationId) {
        throw new AppError('Forbidden: Warehouse user is not bound to a valid warehouse location.', 403, 'FORBIDDEN');
      }
      locationId = user.locationId;
    }

    if (isBrand) {
      const effectiveBrandId = user.brandId || user.locationId;
      if (!effectiveBrandId) {
        throw new AppError('Forbidden: Brand user is not bound to an authorized brand.', 403, 'FORBIDDEN');
      }
      brandId = effectiveBrandId;
    }

    return { locationId, brandId };
  }

  /**
   * Fetches scoped Call Register records.
   */
  async getCallRegister(filter: CallRegisterFilter, user: AuthenticatedUser): Promise<CallRegisterRow[]> {
    const scope = this.resolveScope(user, filter.locationId, filter.brandId);
    return reportingRepository.getCallRegister({
      ...filter,
      locationId: scope.locationId,
      brandId: scope.brandId,
    });
  }

  /**
   * Fetches scoped Part Consumption records.
   */
  async getPartConsumption(filter: {
    brandId?: string;
    locationId?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }, user: AuthenticatedUser): Promise<PartConsumptionRow[]> {
    const scope = this.resolveScope(user, filter.locationId, filter.brandId);
    return reportingRepository.getPartConsumptionReport({
      ...filter,
      locationId: scope.locationId,
      brandId: scope.brandId,
    });
  }

  /**
   * Fetches scoped Warranty Claims records.
   */
  async getWarrantyClaims(filter: {
    brandId?: string;
    asfLocationId?: string;
    claimYear?: number;
    claimMonth?: number;
    status?: string;
    limit?: number;
  }, user: AuthenticatedUser): Promise<WarrantyClaimReportRow[]> {
    const scope = this.resolveScope(user, filter.asfLocationId, filter.brandId);
    return reportingRepository.getWarrantyClaimsReport({
      ...filter,
      asfLocationId: scope.locationId,
      brandId: scope.brandId,
    });
  }

  /**
   * Fetches scoped Stock Valuation records.
   */
  async getStockValuation(filter: {
    locationId?: string;
    category?: string;
    limit?: number;
  }, user: AuthenticatedUser): Promise<StockValuationRow[]> {
    const scope = this.resolveScope(user, filter.locationId, undefined);
    return reportingRepository.getStockValuationReport({
      ...filter,
      locationId: scope.locationId,
    });
  }

  /**
   * Fetches operational queue KPI metrics.
   */
  async getOperationalQueues(user: AuthenticatedUser): Promise<any> {
    const scope = this.resolveScope(user, undefined, undefined);
    return reportingRepository.getOperationalQueues(scope.locationId, scope.brandId);
  }

  /**
   * Helper to format a string safely for CSV.
   */
  escapeCsv(val: any): string {
    if (val == null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * Streams Call Register directly to the HTTP response as CSV to prevent Node memory spikes.
   */
  async streamCallRegisterCsv(filter: CallRegisterFilter, user: AuthenticatedUser, res: Response): Promise<void> {
    const records = await this.getCallRegister({ ...filter, limit: 10000 }, user);

    const filename = `call_register_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const headers = [
      'Job Number',
      'Registered At',
      'Customer Name',
      'Customer Phone',
      'City',
      'State',
      'Brand',
      'Product',
      'Model',
      'Serial Number',
      'Call Type',
      'Status',
      'Assigned Franchise',
      'Assigned Engineer',
      'Acknowledged At',
      'Closed At',
      'Happy Code Verified',
      'TAT (Hours)',
      '48h SLA Breached',
      '168h SLA Breached',
    ];
    res.write(headers.join(',') + '\r\n');

    for (const r of records) {
      const row = [
        this.escapeCsv(r.jobNumber),
        this.escapeCsv(r.registeredAt.toISOString().slice(0, 19).replace('T', ' ')),
        this.escapeCsv(r.customerName),
        this.escapeCsv(r.customerPhone),
        this.escapeCsv(r.customerCity),
        this.escapeCsv(r.customerState),
        this.escapeCsv(r.brandName),
        this.escapeCsv(r.productName),
        this.escapeCsv(r.modelName),
        this.escapeCsv(r.serialNumber),
        this.escapeCsv(r.callType),
        this.escapeCsv(r.status),
        this.escapeCsv(r.assignedLocation),
        this.escapeCsv(r.assignedEngineer),
        this.escapeCsv(r.acknowledgedAt ? r.acknowledgedAt.toISOString().slice(0, 19).replace('T', ' ') : ''),
        this.escapeCsv(r.closedAt ? r.closedAt.toISOString().slice(0, 19).replace('T', ' ') : ''),
        this.escapeCsv(r.isHappyCodeVerified),
        this.escapeCsv(r.tatHours != null ? r.tatHours : ''),
        this.escapeCsv(r.slaBreached48h),
        this.escapeCsv(r.slaBreached168h),
      ];
      res.write(row.join(',') + '\r\n');
    }

    res.end();
  }

  /**
   * Streams Part Consumption Report as CSV.
   */
  async streamPartConsumptionCsv(
    filter: { brandId?: string; locationId?: string; fromDate?: string; toDate?: string },
    user: AuthenticatedUser,
    res: Response
  ): Promise<void> {
    const records = await this.getPartConsumption({ ...filter, limit: 10000 }, user);
    const filename = `parts_consumption_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const headers = [
      'Part Code',
      'Part Name',
      'Brand',
      'Quantity Consumed',
      'Fault Description',
      'Defect Description',
      'Consumed At Location',
      'Total Cost (INR)',
    ];
    res.write(headers.join(',') + '\r\n');

    for (const r of records) {
      const row = [
        this.escapeCsv(r.partCode),
        this.escapeCsv(r.partName),
        this.escapeCsv(r.brandName),
        this.escapeCsv(r.quantityConsumed),
        this.escapeCsv(r.faultDescription),
        this.escapeCsv(r.defectDescription),
        this.escapeCsv(r.consumedAtLocation),
        this.escapeCsv(r.totalCost),
      ];
      res.write(row.join(',') + '\r\n');
    }

    res.end();
  }

  /**
   * Streams Warranty Claims Report as CSV.
   */
  async streamWarrantyClaimsCsv(
    filter: { brandId?: string; asfLocationId?: string; claimYear?: number; claimMonth?: number; status?: string },
    user: AuthenticatedUser,
    res: Response
  ): Promise<void> {
    const records = await this.getWarrantyClaims({ ...filter, limit: 10000 }, user);
    const filename = `warranty_claims_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const headers = [
      'Claim Number',
      'Claim Period',
      'Franchise Name',
      'Brand',
      'Total Jobs',
      'Gross Labor (INR)',
      'Gross Travel (INR)',
      'Net Claim Amount (INR)',
      'Status',
      'Journal Number',
      'Created At',
    ];
    res.write(headers.join(',') + '\r\n');

    for (const r of records) {
      const row = [
        this.escapeCsv(r.claimNumber),
        this.escapeCsv(r.claimPeriod),
        this.escapeCsv(r.asfLocationName),
        this.escapeCsv(r.brandName),
        this.escapeCsv(r.totalJobsCount),
        this.escapeCsv(r.grossLaborAmount),
        this.escapeCsv(r.grossTravelAmount),
        this.escapeCsv(r.netClaimAmount),
        this.escapeCsv(r.status),
        this.escapeCsv(r.journalNumber || ''),
        this.escapeCsv(r.createdAt ? r.createdAt.toISOString().slice(0, 19).replace('T', ' ') : ''),
      ];
      res.write(row.join(',') + '\r\n');
    }

    res.end();
  }

  /**
   * Streams Inventory Stock Valuation Report as CSV.
   */
  async streamStockValuationCsv(
    filter: { locationId?: string; category?: string },
    user: AuthenticatedUser,
    res: Response
  ): Promise<void> {
    const records = await this.getStockValuation({ ...filter, limit: 10000 }, user);
    const filename = `stock_valuation_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const headers = [
      'Location Name',
      'Location Type',
      'Part Code',
      'Part Name',
      'Category',
      'On Hand Qty',
      'Reserved Qty',
      'Available Qty',
      'Unit Price (INR)',
      'Total Valuation (INR)',
      'Last Reconciled At',
    ];
    res.write(headers.join(',') + '\r\n');

    for (const r of records) {
      const row = [
        this.escapeCsv(r.locationName),
        this.escapeCsv(r.locationType),
        this.escapeCsv(r.partCode),
        this.escapeCsv(r.partName),
        this.escapeCsv(r.category),
        this.escapeCsv(r.onHandQuantity),
        this.escapeCsv(r.reservedQuantity),
        this.escapeCsv(r.availableQuantity),
        this.escapeCsv(r.unitCostPrice),
        this.escapeCsv(r.totalValuation),
        this.escapeCsv(r.reconciledAt ? r.reconciledAt.toISOString().slice(0, 19).replace('T', ' ') : ''),
      ];
      res.write(row.join(',') + '\r\n');
    }

    res.end();
  }

  /**
   * Fetches notification outbox telemetry.
   */
  async getNotificationMetrics(): Promise<any> {
    const { notificationService } = await import('./notificationService.js');
    return notificationService.getMetrics();
  }

  /**
   * Triggers the notification outbox retry daemon.
   */
  async retryNotifications(): Promise<any> {
    const { notificationService } = await import('./notificationService.js');
    return notificationService.retryFailedNotifications();
  }
}

export const reportingService = new ReportingService();
