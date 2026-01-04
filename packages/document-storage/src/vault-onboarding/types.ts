/**
 * Vault Onboarding Types
 *
 * Types for the Property Record Vault onboarding workflow.
 */

import { z } from 'zod';

// =============================================================================
// Folder Structure
// =============================================================================

export const VAULT_FOLDERS = {
  OWNERSHIP: ['DEED', 'TITLE_INSURANCE', 'SURVEY', 'PLAT'],
  INSURANCE: ['PROPERTY_INSURANCE', 'LIABILITY', 'FLOOD'],
  PERMITS: ['BUILDING_PERMITS', 'ZONING', 'CO_CERTIFICATE'],
  LEASES: ['ACTIVE_LEASES', 'AMENDMENTS', 'MOVE_IN_DOCS'],
  FINANCIALS: ['TAX_RECORDS', 'ASSESSMENTS', 'APPRAISALS'],
  MAINTENANCE: ['WARRANTIES', 'SERVICE_RECORDS', 'INSPECTIONS'],
} as const;

export type VaultFolder = keyof typeof VAULT_FOLDERS;
export type DocumentCategory = (typeof VAULT_FOLDERS)[VaultFolder][number];

export const ALL_DOCUMENT_CATEGORIES = Object.values(VAULT_FOLDERS).flat();

// =============================================================================
// Property Type Requirements
// =============================================================================

export type PropertyType =
  | 'SINGLE_FAMILY'
  | 'MULTI_FAMILY'
  | 'CONDO'
  | 'TOWNHOUSE'
  | 'COMMERCIAL'
  | 'INDUSTRIAL'
  | 'MIXED_USE'
  | 'LAND'
  | 'OTHER';

export const REQUIRED_DOCS: Record<PropertyType, DocumentCategory[]> = {
  SINGLE_FAMILY: ['DEED', 'PROPERTY_INSURANCE', 'SURVEY'],
  MULTI_FAMILY: ['DEED', 'PROPERTY_INSURANCE', 'SURVEY', 'BUILDING_PERMITS', 'CO_CERTIFICATE'],
  CONDO: ['DEED', 'PROPERTY_INSURANCE'],
  TOWNHOUSE: ['DEED', 'PROPERTY_INSURANCE', 'SURVEY'],
  COMMERCIAL: ['DEED', 'PROPERTY_INSURANCE', 'SURVEY', 'BUILDING_PERMITS', 'ZONING', 'CO_CERTIFICATE'],
  INDUSTRIAL: ['DEED', 'PROPERTY_INSURANCE', 'SURVEY', 'BUILDING_PERMITS', 'ZONING'],
  MIXED_USE: ['DEED', 'PROPERTY_INSURANCE', 'SURVEY', 'BUILDING_PERMITS', 'ZONING', 'CO_CERTIFICATE'],
  LAND: ['DEED', 'SURVEY', 'ZONING'],
  OTHER: ['DEED', 'PROPERTY_INSURANCE'],
};

// =============================================================================
// Onboarding State
// =============================================================================

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed';

export interface VaultOnboardingState {
  propertyId: string;
  vaultId: string;
  status: OnboardingStatus;
  currentStep: number;
  steps: OnboardingStep[];
  missingDocs: DocumentCategory[];
  uploadedDocs: DocumentCategory[];
  completedAt: Date | null;
}

export interface OnboardingStep {
  id: string;
  name: string;
  description: string;
  completed: boolean;
  categories: DocumentCategory[];
}

export const DEFAULT_ONBOARDING_STEPS: Omit<OnboardingStep, 'completed'>[] = [
  {
    id: 'ownership',
    name: 'Ownership Documents',
    description: 'Upload deed, title insurance, and survey documents',
    categories: ['DEED', 'TITLE_INSURANCE', 'SURVEY', 'PLAT'],
  },
  {
    id: 'insurance',
    name: 'Insurance Coverage',
    description: 'Upload property insurance and liability documents',
    categories: ['PROPERTY_INSURANCE', 'LIABILITY', 'FLOOD'],
  },
  {
    id: 'permits',
    name: 'Permits & Compliance',
    description: 'Upload building permits and zoning documents',
    categories: ['BUILDING_PERMITS', 'ZONING', 'CO_CERTIFICATE'],
  },
  {
    id: 'leases',
    name: 'Lease Documents',
    description: 'Upload active leases and amendments',
    categories: ['ACTIVE_LEASES', 'AMENDMENTS', 'MOVE_IN_DOCS'],
  },
];

// =============================================================================
// Zod Schemas
// =============================================================================

export const VaultFolderSchema = z.enum([
  'OWNERSHIP',
  'INSURANCE',
  'PERMITS',
  'LEASES',
  'FINANCIALS',
  'MAINTENANCE',
]);

export const DocumentCategorySchema = z.enum([
  'DEED',
  'TITLE_INSURANCE',
  'SURVEY',
  'PLAT',
  'PROPERTY_INSURANCE',
  'LIABILITY',
  'FLOOD',
  'BUILDING_PERMITS',
  'ZONING',
  'CO_CERTIFICATE',
  'ACTIVE_LEASES',
  'AMENDMENTS',
  'MOVE_IN_DOCS',
  'TAX_RECORDS',
  'ASSESSMENTS',
  'APPRAISALS',
  'WARRANTIES',
  'SERVICE_RECORDS',
  'INSPECTIONS',
]);

export const InitializeVaultSchema = z.object({
  propertyId: z.string().uuid(),
  propertyType: z.enum([
    'SINGLE_FAMILY',
    'MULTI_FAMILY',
    'CONDO',
    'TOWNHOUSE',
    'COMMERCIAL',
    'INDUSTRIAL',
    'MIXED_USE',
    'LAND',
    'OTHER',
  ]),
  enabledFolders: z.array(VaultFolderSchema).optional(),
});

export type InitializeVaultInput = z.infer<typeof InitializeVaultSchema>;

export const UploadVaultDocumentSchema = z.object({
  vaultId: z.string().uuid(),
  documentId: z.string().uuid(),
  folder: VaultFolderSchema,
  category: DocumentCategorySchema,
  tags: z.array(z.string()).optional().default([]),
  description: z.string().optional(),
});

export type UploadVaultDocumentInput = z.infer<typeof UploadVaultDocumentSchema>;

// =============================================================================
// Service Interface
// =============================================================================

export interface IVaultOnboardingService {
  initializeVault(input: InitializeVaultInput, userId: string): Promise<VaultOnboardingState>;
  getVaultStatus(propertyId: string, userId: string): Promise<VaultOnboardingState | null>;
  uploadDocument(input: UploadVaultDocumentInput, userId: string): Promise<void>;
  getMissingDocuments(propertyId: string): Promise<DocumentCategory[]>;
  completeOnboarding(propertyId: string, userId: string): Promise<void>;
}
