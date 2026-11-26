export type CustodyStatus = 'PENDING_COLLECTION' | 'COLLECTED' | 'INSTALLED' | 'RETURNED';

export interface PartCustodyHandoverRecord {
  handoverId: string;
  replacementId: string;
  partId: string;
  partCode?: string;
  partName?: string;
  asfLocationId: string;
  engineerId: string;
  engineerName?: string;
  handedOverBy: string;
  handedOverByName?: string;
  handedOverAt: Date;
  collectionAcknowledged: 'Y' | 'N';
  collectedAt?: Date;
  status: CustodyStatus;
  remarks?: string;
  createdAt: Date;
}

export interface CreateCustodyHandoverInput {
  replacementId: string;
  partId: string;
  engineerId: string;
  remarks?: string;
}

export interface AcknowledgeCollectionInput {
  handoverId: string;
  remarks?: string;
}
