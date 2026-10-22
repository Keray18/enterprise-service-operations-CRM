export type StockBucket = 'ON_HAND' | 'RESERVED' | 'IN_TRANSIT' | 'DEFECTIVE';

export type InventoryMovementType =
  | 'GRN_RECEIPT'
  | 'RESERVATION_HOLD'
  | 'RESERVATION_RELEASE'
  | 'PART_DISPATCH'
  | 'PART_RECEIPT'
  | 'RETURN_DEFECTIVE'
  | 'RETURN_RESTOCK'
  | 'RETURN_SCRAP'
  | 'STOCK_ADJUSTMENT'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN';

export type ReservationStatus = 'ACTIVE' | 'FULFILLED' | 'RELEASED';

export type GoodsReceiptStatus = 'RECEIVED' | 'CANCELLED';

export type DispatchDocumentType = 'DELIVERY_CHALLAN' | 'GST_TAX_INVOICE';

export type DispatchStatus = 'IN_TRANSIT' | 'ACKNOWLEDGED' | 'CANCELLED';

export type StockReturnStatus = 'IN_QUARANTINE' | 'INSPECTED' | 'DISPOSED_SCRAP' | 'RESTOCKED';

export type ReturnDisposition = 'SCRAP' | 'RESTOCK' | 'RETURN_TO_VENDOR' | 'REJECTED';

export type StockAdjustmentType = 'INCREASE' | 'DECREASE';

export type StockAdjustmentReason =
  | 'PHYSICAL_AUDIT_SURPLUS'
  | 'PHYSICAL_AUDIT_SHRINKAGE'
  | 'DAMAGED_IN_STORAGE'
  | 'CORRECTION'
  | 'SCRAP_WRITE_OFF';

export interface InventoryBalanceRecord {
  balanceId: string;
  locationId: string;
  locationCode?: string;
  locationName?: string;
  partyType?: string;
  partId: string;
  partCode?: string;
  partName?: string;
  partCategory?: string;
  hsnCode?: string;
  unitPrice?: number;
  qtyOnHand: number;
  qtyReserved: number;
  qtyInTransit: number;
  qtyDefective: number;
  qtyAvailable: number; // Computed: qtyOnHand - qtyReserved
  reorderLevel: number;
  versionNo: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryMovementRecord {
  movementId: string;
  locationId: string;
  locationName?: string;
  partId: string;
  partCode?: string;
  partName?: string;
  movementType: InventoryMovementType;
  stockBucket: StockBucket;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string;
  sourceLocationId?: string;
  sourceLocationName?: string;
  destLocationId?: string;
  destLocationName?: string;
  actorId?: string;
  actorUsername: string;
  remarks?: string;
  createdAt: Date;
}

export interface InventoryReservationRecord {
  reservationId: string;
  requestId: string;
  jobNumber?: string;
  customerName?: string;
  partEntryId: string;
  locationId: string;
  locationName?: string;
  partId: string;
  partCode?: string;
  partName?: string;
  quantity: number;
  status: ReservationStatus;
  reservedBy: string;
  reservedByName?: string;
  reservedAt: Date;
  fulfilledAt?: Date;
  releasedAt?: Date;
  releaseReason?: string;
}

export interface GoodsReceiptItemRecord {
  grnItemId: string;
  grnId: string;
  partId: string;
  partCode?: string;
  partName?: string;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  unitPrice: number;
  remarks?: string;
}

export interface GoodsReceiptRecord {
  grnId: string;
  grnNumber: string;
  receivingLocationId: string;
  receivingLocationName?: string;
  supplierName: string;
  supplierInvoiceNo: string;
  supplierInvoiceDate: string;
  poNumber?: string;
  gateEntryNo?: string;
  vehicleNo?: string;
  receivedBy: string;
  receivedByName?: string;
  totalItems: number;
  totalQuantity: number;
  status: GoodsReceiptStatus;
  remarks?: string;
  createdAt: Date;
  items?: GoodsReceiptItemRecord[];
}

export interface DispatchItemRecord {
  dispatchItemId: string;
  dispatchId: string;
  partId: string;
  partCode?: string;
  partName?: string;
  hsnCode?: string;
  quantity: number;
  unitPrice: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
}

export interface StockDispatchRecord {
  dispatchId: string;
  dispatchNumber: string;
  documentType: DispatchDocumentType;
  fromLocationId: string;
  fromLocationName?: string;
  toLocationId: string;
  toLocationName?: string;
  requestId?: string;
  jobNumber?: string;
  courierName: string;
  docketNumber: string;
  dispatchDate: Date;
  dispatchedBy: string;
  dispatchedByName?: string;
  totalQuantity: number;
  subtotalAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  status: DispatchStatus;
  acknowledgedBy?: string;
  acknowledgedByName?: string;
  acknowledgedAt?: Date;
  remarks?: string;
  createdAt: Date;
  items?: DispatchItemRecord[];
}

export interface ReturnItemRecord {
  returnItemId: string;
  returnId: string;
  partId: string;
  partCode?: string;
  partName?: string;
  quantity: number;
  defectiveSerialNo?: string;
  defectReason?: string;
}

export interface StockReturnRecord {
  returnId: string;
  returnNumber: string;
  fromLocationId: string;
  fromLocationName?: string;
  toLocationId: string;
  toLocationName?: string;
  requestId?: string;
  jobNumber?: string;
  status: StockReturnStatus;
  receivedBy: string;
  receivedByName?: string;
  receivedAt: Date;
  inspectedBy?: string;
  inspectedByName?: string;
  inspectedAt?: Date;
  disposition?: ReturnDisposition;
  dispositionRemarks?: string;
  createdAt: Date;
  items?: ReturnItemRecord[];
}

export interface StockAdjustmentRecord {
  adjustmentId: string;
  adjustmentNumber: string;
  locationId: string;
  locationName?: string;
  partId: string;
  partCode?: string;
  partName?: string;
  stockBucket: 'ON_HAND' | 'DEFECTIVE';
  adjustmentType: StockAdjustmentType;
  quantity: number;
  reason: StockAdjustmentReason;
  remarks: string;
  adjustedBy: string;
  adjustedByName?: string;
  createdAt: Date;
}

export interface InventoryReconciliationRecord {
  locationId: string;
  locationName: string;
  partId: string;
  partCode: string;
  partName: string;
  cachedOnHand: number;
  ledgerOnHand: number;
  discrepancyOnHand: number;
  cachedReserved: number;
  activeReserved: number;
  discrepancyReserved: number;
  isReconciled: boolean;
  lastCheckedAt: Date;
}
