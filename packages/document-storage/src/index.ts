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

// Vault Onboarding
export {
  VaultOnboardingService,
  getVaultOnboardingService,
  VAULT_FOLDERS,
  REQUIRED_DOCS,
  DEFAULT_ONBOARDING_STEPS,
  type VaultOnboardingState,
  type OnboardingStep,
  type DocumentCategory,
  type PropertyType,
  type OnboardingStatus,
  type InitializeVaultInput,
  type UploadVaultDocumentInput,
} from './vault-onboarding';

// Evidence Persistence
export {
  VaultEvidencePersistence,
  getVaultEvidencePersistence,
  persistVaultEvidence,
  queryVaultEvidence,
  SOC2_CONTROL_IDS,
  sanitizeMetadata,
  type VaultEvidenceRecord,
  type StoredVaultEvidence,
  type EvidenceQueryOptions,
  type VaultEvidenceEventType,
  type VaultEvidenceOutcome,
  type SOC2ControlId,
} from './evidence';

// Upsell Triggers
export {
  UpsellTriggerService,
  getUpsellTriggerService,
  detectUpsellTriggers,
  isUpsellEnabledForMarket,
  UPSELL_PARTNER_MAP,
  TRIGGER_PARTNER_MAP,
  MARKET_UPSELL_CONFIGS,
  type UpsellTrigger,
  type UpsellTriggerType,
  type PartnerType,
  type MarketUpsellConfig,
  type CreateUpsellTriggerInput,
} from './upsell';
