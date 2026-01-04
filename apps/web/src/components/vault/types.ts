/**
 * Vault UI Types
 *
 * Shared types for vault components.
 */

export type VaultFolder =
  | 'OWNERSHIP'
  | 'INSURANCE'
  | 'PERMITS'
  | 'LEASES'
  | 'FINANCIALS'
  | 'MAINTENANCE';

export type DocumentCategory =
  | 'DEED'
  | 'TITLE_INSURANCE'
  | 'SURVEY'
  | 'PLAT'
  | 'PROPERTY_INSURANCE'
  | 'LIABILITY'
  | 'FLOOD'
  | 'BUILDING_PERMITS'
  | 'ZONING'
  | 'CO_CERTIFICATE'
  | 'ACTIVE_LEASES'
  | 'AMENDMENTS'
  | 'MOVE_IN_DOCS'
  | 'TAX_RECORDS'
  | 'ASSESSMENTS'
  | 'APPRAISALS'
  | 'WARRANTIES'
  | 'SERVICE_RECORDS'
  | 'INSPECTIONS';

export type VaultStatus = 'not_started' | 'in_progress' | 'completed';

export interface OnboardingStep {
  id: string;
  name: string;
  description: string;
  categories: string[];
  completed: boolean;
}

export interface VaultOnboardingState {
  propertyId: string;
  vaultId: string;
  status: VaultStatus;
  currentStep: number;
  steps: OnboardingStep[];
  missingDocs: DocumentCategory[];
  uploadedDocs: DocumentCategory[];
  completedAt: Date | null;
}

export interface UpsellTrigger {
  id: string;
  triggerType: string;
  missingCategories: DocumentCategory[];
  eligiblePartners: string[];
  priority: number;
  market: string;
  dismissed: boolean;
}

export interface VaultDocument {
  id: string;
  documentId: string;
  folder: VaultFolder;
  category: DocumentCategory;
  tags: string[];
  description?: string;
  isRequired: boolean;
  uploadedAt: Date;
}

export interface EvidenceRecord {
  id: string;
  eventType: string;
  eventOutcome: string;
  controlId: string;
  actorEmail: string;
  actorRole: string;
  resourcePath: string;
  timestamp: Date;
}

export const VAULT_FOLDER_LABELS: Record<VaultFolder, string> = {
  OWNERSHIP: 'Ownership',
  INSURANCE: 'Insurance',
  PERMITS: 'Permits & Compliance',
  LEASES: 'Leases',
  FINANCIALS: 'Financials',
  MAINTENANCE: 'Maintenance',
};

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  DEED: 'Deed',
  TITLE_INSURANCE: 'Title Insurance',
  SURVEY: 'Survey',
  PLAT: 'Plat',
  PROPERTY_INSURANCE: 'Property Insurance',
  LIABILITY: 'Liability Insurance',
  FLOOD: 'Flood Insurance',
  BUILDING_PERMITS: 'Building Permits',
  ZONING: 'Zoning Certificate',
  CO_CERTIFICATE: 'Certificate of Occupancy',
  ACTIVE_LEASES: 'Active Leases',
  AMENDMENTS: 'Lease Amendments',
  MOVE_IN_DOCS: 'Move-in Documents',
  TAX_RECORDS: 'Tax Records',
  ASSESSMENTS: 'Property Assessments',
  APPRAISALS: 'Appraisals',
  WARRANTIES: 'Warranties',
  SERVICE_RECORDS: 'Service Records',
  INSPECTIONS: 'Inspection Reports',
};

export const PARTNER_LABELS: Record<string, string> = {
  LEMONADE: 'Lemonade',
  ASSURANT: 'Assurant',
  SURE: 'Sure',
  LEASELOCK: 'LeaseLock',
  RHINO: 'Rhino',
  JETTY: 'Jetty',
  INSURENT: 'Insurent',
  LEAP: 'Leap',
};
