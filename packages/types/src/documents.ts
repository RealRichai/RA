import { z } from 'zod';

import { AuditFieldsSchema, UUIDSchema } from './common';

// ============================================================================
// Document & Digital Vault Types
// ============================================================================

export const DocumentTypeSchema = z.enum([
  // Lease documents
  'lease',
  'lease_amendment',
  'lease_renewal',
  'sublease_agreement',
  'roommate_agreement',

  // REBNY forms
  'rebny_lease',
  'rebny_rider',
  'rebny_disclosure',

  // Disclosures
  'lead_paint_disclosure',
  'bedbug_disclosure',
  'mold_disclosure',
  'fare_act_disclosure',
  'window_guard_notice',
  'smoke_detector_notice',

  // Applications
  'rental_application',
  'guarantor_application',
  'credit_authorization',

  // Identity & verification
  'id_document',
  'passport',
  'drivers_license',
  'proof_of_income',
  'pay_stub',
  'tax_return',
  'bank_statement',
  'employment_letter',
  'reference_letter',

  // Property documents
  'deed',
  'title_insurance',
  'property_insurance',
  'hoa_documents',
  'condo_bylaws',
  'building_rules',
  'floor_plan',
  'survey',
  'inspection_report',
  'appraisal',

  // Financial
  'invoice',
  'receipt',
  'security_deposit_receipt',
  'rent_receipt',
  'ledger',
  'payout_statement',

  // Maintenance
  'work_order',
  'maintenance_receipt',
  'warranty_document',
  'contractor_agreement',

  // Legal
  'eviction_notice',
  'notice_to_cure',
  'notice_to_quit',
  'court_filing',
  'settlement_agreement',

  // Marketing
  'flyer',
  'brochure',
  'presentation',
  'video',
  'photo',

  // Other
  'correspondence',
  'other',
]);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

export const DocumentStatusSchema = z.enum([
  'draft',
  'pending_review',
  'approved',
  'pending_signature',
  'partially_signed',
  'signed',
  'rejected',
  'expired',
  'archived',
]);
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

export const DocumentSchema = z.object({
  id: UUIDSchema,
  organizationId: UUIDSchema.optional(),
  uploadedBy: UUIDSchema,
  ownerId: UUIDSchema.optional(), // The entity this belongs to

  // Document info
  name: z.string().max(255),
  description: z.string().max(1000).optional(),
  type: DocumentTypeSchema,
  status: DocumentStatusSchema,

  // File info
  filename: z.string(),
  originalFilename: z.string(),
  mimeType: z.string(),
  size: z.number().int().positive(), // bytes
  extension: z.string(),

  // Storage
  storageProvider: z.enum(['s3', 'azure', 'gcs', 'local']),
  bucket: z.string(),
  key: z.string(),
  url: z.string().optional(), // Signed URL, if generated
  urlExpiresAt: z.coerce.date().optional(),

  // Encryption (for sensitive documents)
  isEncrypted: z.boolean().default(false),
  encryptionKeyId: z.string().optional(),

  // Checksums
  md5: z.string().optional(),
  sha256: z.string().optional(),

  // Entity references
  entityType: z.enum([
    'property',
    'unit',
    'listing',
    'lease',
    'application',
    'user',
    'payment',
    'maintenance',
    'vendor',
  ]).optional(),
  entityId: UUIDSchema.optional(),

  // Versioning
  version: z.number().int().min(1).default(1),
  previousVersionId: UUIDSchema.optional(),
  isLatestVersion: z.boolean().default(true),

  // Expiration
  expiresAt: z.coerce.date().optional(),
  expirationNotificationSent: z.boolean().default(false),

  // Access control
  visibility: z.enum(['private', 'organization', 'shared', 'public']).default('private'),
  sharedWith: z.array(z.object({
    userId: UUIDSchema.optional(),
    email: z.string().email().optional(),
    role: z.enum(['viewer', 'editor', 'signer']),
    expiresAt: z.coerce.date().optional(),
  })).default([]),

  // AI processing
  aiProcessed: z.boolean().default(false),
  aiExtractedData: z.record(z.unknown()).optional(),
  aiSummary: z.string().optional(),

  // Tags and search
  tags: z.array(z.string()).default([]),
  searchableText: z.string().optional(), // Extracted text for search

  // Audit
  downloadCount: z.number().int().default(0),
  lastAccessedAt: z.coerce.date().optional(),
  lastAccessedBy: UUIDSchema.optional(),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type Document = z.infer<typeof DocumentSchema>;

// Digital Vault (secure document storage per entity)
export const DigitalVaultSchema = z.object({
  id: UUIDSchema,
  ownerId: UUIDSchema,
  ownerType: z.enum(['user', 'property', 'organization']),

  // Vault info
  name: z.string(),
  description: z.string().optional(),

  // Organization
  folders: z.array(z.object({
    id: UUIDSchema,
    name: z.string(),
    parentId: UUIDSchema.optional(),
    documentCount: z.number().int().default(0),
    color: z.string().optional(),
    icon: z.string().optional(),
  })).default([]),

  // Stats
  totalDocuments: z.number().int().default(0),
  totalSize: z.number().int().default(0), // bytes
  usedQuota: z.number().int().default(0),
  maxQuota: z.number().int().optional(), // null = unlimited

  // Security
  isLocked: z.boolean().default(false),
  lockReason: z.string().optional(),
  require2FA: z.boolean().default(false),

  // Sharing settings
  defaultVisibility: z.enum(['private', 'organization']).default('private'),
  allowExternalSharing: z.boolean().default(false),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type DigitalVault = z.infer<typeof DigitalVaultSchema>;

// Document signature
export const DocumentSignatureSchema = z.object({
  id: UUIDSchema,
  documentId: UUIDSchema,
  signerId: UUIDSchema.optional(),
  signerEmail: z.string().email(),
  signerName: z.string(),
  signerRole: z.string(),

  // Signature details
  status: z.enum(['pending', 'viewed', 'signed', 'declined', 'expired']),
  signedAt: z.coerce.date().optional(),
  declinedAt: z.coerce.date().optional(),
  declineReason: z.string().optional(),

  // Signature data
  signatureType: z.enum(['drawn', 'typed', 'uploaded']).optional(),
  signatureImageUrl: z.string().optional(),
  typedSignature: z.string().optional(),

  // Verification
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  geolocation: z.object({
    latitude: z.number(),
    longitude: z.number(),
    accuracy: z.number().optional(),
  }).optional(),

  // Reminders
  remindersSent: z.number().int().default(0),
  lastReminderAt: z.coerce.date().optional(),

  // Order
  order: z.number().int().min(0),

  expiresAt: z.coerce.date().optional(),
}).merge(AuditFieldsSchema);
export type DocumentSignature = z.infer<typeof DocumentSignatureSchema>;

// Signing request (for e-signatures)
export const SigningRequestSchema = z.object({
  id: UUIDSchema,
  documentId: UUIDSchema,
  requestedBy: UUIDSchema,

  // Request info
  name: z.string(),
  message: z.string().optional(),

  // Status
  status: z.enum(['draft', 'sent', 'in_progress', 'completed', 'expired', 'cancelled']),

  // Signers
  signers: z.array(z.object({
    signatureId: UUIDSchema,
    order: z.number().int(),
    required: z.boolean().default(true),
  })),

  // Signing order
  enforceOrder: z.boolean().default(false),
  currentSignerOrder: z.number().int().default(0),

  // Completion
  completedAt: z.coerce.date().optional(),
  signedDocumentId: UUIDSchema.optional(), // Final signed PDF

  // Expiration
  expiresAt: z.coerce.date(),
  reminderFrequency: z.number().int().optional(), // Days

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type SigningRequest = z.infer<typeof SigningRequestSchema>;

// Document template
export const DocumentTemplateSchema = z.object({
  id: UUIDSchema,
  organizationId: UUIDSchema.optional(),
  createdBy: UUIDSchema,

  name: z.string(),
  description: z.string().optional(),
  type: DocumentTypeSchema,
  category: z.string().optional(),

  // Template content
  format: z.enum(['pdf', 'docx', 'html']),
  templateUrl: z.string(),
  thumbnailUrl: z.string().optional(),

  // Variables/placeholders
  variables: z.array(z.object({
    key: z.string(),
    label: z.string(),
    type: z.enum(['text', 'number', 'date', 'boolean', 'signature', 'initial', 'checkbox']),
    required: z.boolean().default(false),
    defaultValue: z.unknown().optional(),
    description: z.string().optional(),
  })).default([]),

  // Signature fields
  signatureFields: z.array(z.object({
    role: z.string(),
    page: z.number().int(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    required: z.boolean().default(true),
  })).default([]),

  // Market/compliance
  marketId: z.string().optional(),
  isComplianceRequired: z.boolean().default(false),
  complianceTypes: z.array(z.string()).default([]),

  // Usage
  usageCount: z.number().int().default(0),
  isPublic: z.boolean().default(false),
  isSystem: z.boolean().default(false), // System-provided template

  // Versioning
  version: z.string(),
  previousVersionId: UUIDSchema.optional(),

  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type DocumentTemplate = z.infer<typeof DocumentTemplateSchema>;

// Document search/filter
export const DocumentFilterSchema = z.object({
  search: z.string().optional(),
  type: DocumentTypeSchema.optional(),
  types: z.array(DocumentTypeSchema).optional(),
  status: DocumentStatusSchema.optional(),
  entityType: z.string().optional(),
  entityId: UUIDSchema.optional(),
  uploadedBy: UUIDSchema.optional(),
  ownerId: UUIDSchema.optional(),
  tags: z.array(z.string()).optional(),
  expiringBefore: z.coerce.date().optional(),
  createdAfter: z.coerce.date().optional(),
  createdBefore: z.coerce.date().optional(),
});
export type DocumentFilter = z.infer<typeof DocumentFilterSchema>;
