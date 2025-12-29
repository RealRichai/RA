/**
 * Document Storage Types
 */

import { z } from 'zod';

// =============================================================================
// Storage Configuration
// =============================================================================

export interface StorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle?: boolean;
}

export interface ClamAVConfig {
  host: string;
  port: number;
  timeout?: number;
}

// =============================================================================
// Document Types
// =============================================================================

export type DocumentEntityType = 'PROPERTY' | 'UNIT' | 'LEASE' | 'APPLICATION';
export type DocumentType = 'LEASE' | 'AMENDMENT' | 'DISCLOSURE' | 'ID' | 'INCOME' | 'OTHER' | 'TEMPLATE';
export type DocumentStatus = 'UPLOADING' | 'SCANNING' | 'ACTIVE' | 'QUARANTINED' | 'DELETED' | 'PENDING_SIGNATURE' | 'SIGNED';
export type ScanStatus = 'PENDING' | 'CLEAN' | 'INFECTED' | 'ERROR';

export interface DocumentMetadata {
  ownerId: string;
  uploadedById: string;
  entityType?: DocumentEntityType;
  entityId?: string;
  documentType: DocumentType;
  checksum: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  scanStatus: ScanStatus;
  scanResult?: ScanResult;
}

export interface UploadResult {
  documentId: string;
  key: string;
  bucket: string;
  url: string;
  size: number;
  mimeType: string;
  checksum: string;
  status: DocumentStatus;
}

export interface PresignedUrlResult {
  url: string;
  expiresAt: Date;
  method: 'GET' | 'PUT';
}

// =============================================================================
// Virus Scanning
// =============================================================================

export interface ScanResult {
  isClean: boolean;
  virusName?: string;
  scannedAt: Date;
  scanDuration: number;
  error?: string;
}

export interface ScanJob {
  documentId: string;
  key: string;
  bucket: string;
  status: 'pending' | 'scanning' | 'completed' | 'failed';
  result?: ScanResult;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Access Control
// =============================================================================

export type UserRole = 'super_admin' | 'admin' | 'landlord' | 'property_manager' | 'agent' | 'tenant' | 'investor' | 'vendor' | 'support' | 'auditor';

export type DocumentAction = 'read' | 'write' | 'delete' | 'share' | 'sign' | 'download';

export interface ACLContext {
  userId: string;
  userRole: UserRole;
  userEmail: string;
}

export interface EntityOwnership {
  propertyOwnerId?: string;
  propertyManagerId?: string;
  unitId?: string;
  leaseId?: string;
  leaseLandlordId?: string;
  leaseTenantId?: string;
  applicationApplicantId?: string;
  documentUploaderId?: string;
  documentOwnerId?: string;
  sharedWithUserIds?: string[];
}

export interface ACLResult {
  allowed: boolean;
  reason?: string;
  auditInfo: {
    action: DocumentAction;
    userId: string;
    userRole: UserRole;
    entityType?: DocumentEntityType;
    entityId?: string;
    documentId?: string;
    timestamp: Date;
  };
}

// =============================================================================
// Zod Schemas
// =============================================================================

export const UploadRequestSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['LEASE', 'AMENDMENT', 'DISCLOSURE', 'ID', 'INCOME', 'OTHER', 'TEMPLATE']),
  entityType: z.enum(['PROPERTY', 'UNIT', 'LEASE', 'APPLICATION']).optional(),
  entityId: z.string().uuid().optional(),
  description: z.string().max(1000).optional(),
  requiresSignature: z.boolean().default(false),
  visibility: z.enum(['private', 'shared', 'public']).default('private'),
  tags: z.array(z.string()).default([]),
});

export type UploadRequest = z.infer<typeof UploadRequestSchema>;

export const PresignedUploadRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
  size: z.number().positive().max(100 * 1024 * 1024), // 100MB max
  metadata: UploadRequestSchema,
});

export type PresignedUploadRequest = z.infer<typeof PresignedUploadRequestSchema>;

// =============================================================================
// Size Limits
// =============================================================================

export const SIZE_LIMITS = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_PDF_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_DOCUMENT_SIZE: 25 * 1024 * 1024, // 25MB
} as const;

export const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  // Text
  'text/plain',
  'text/csv',
] as const;

export type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number];
