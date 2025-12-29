/**
 * Document Storage Package
 *
 * Comprehensive document management for the RealRiches Digital Vault:
 * - S3/MinIO file storage with presigned URLs
 * - ClamAV virus scanning with quarantine
 * - Role-based access control (ACL)
 * - Template rendering (HTML to PDF/DOCX)
 * - Signature request management with email queue
 */

// Types
export * from './types';

// Storage
export {
  StorageClient,
  getStorageClient,
} from './s3-client';

// Virus Scanning
export {
  VirusScanner,
  ScanQueue,
  getVirusScanner,
  type ScanQueueConfig,
} from './virus-scanner';

// Access Control
export {
  DocumentACL,
  getDocumentACL,
  canAccessDocumentType,
  DOCUMENT_TYPE_POLICIES,
  type DocumentTypePolicy,
} from './acl';

// Upload Service
export {
  UploadService,
  getUploadService,
  detectContentType,
  validateFileSize,
  validateMimeType,
  type UploadServiceConfig,
} from './upload-service';

// Template Engine
export {
  TemplateEngine,
  getTemplateEngine,
  interpolateVariables,
  renderHtmlToPdf,
  renderHtmlToDocx,
  REBNY_LEASE_TEMPLATE,
  FARE_ACT_DISCLOSURE_TEMPLATE,
  SYSTEM_TEMPLATES,
  type Template,
  type TemplateVariable,
  type RenderOptions,
  type RenderResult,
} from './template-engine';

// Signature Service
export {
  SignatureService,
  getSignatureService,
  EmailQueue,
  NotificationQueue,
  type SignatureRequest,
  type SignatureRequestInput,
  type SignatureCompletionInput,
  type EmailJob,
  type NotificationJob,
} from './signature-service';
