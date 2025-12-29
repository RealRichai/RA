/**
 * Document Upload Service
 *
 * Handles file uploads with content-type detection, size validation,
 * virus scanning, and storage.
 */

import { createHash } from 'crypto';
import {
  type UploadResult,
  type PresignedUploadRequest,
  type UploadRequest,
  type ACLContext,
  SIZE_LIMITS,
  ALLOWED_MIME_TYPES,
  UploadRequestSchema,
} from './types';
import { getStorageClient, StorageClient } from './s3-client';
import { getVirusScanner, VirusScanner, ScanQueue } from './virus-scanner';
import { getDocumentACL, DocumentACL } from './acl';

// =============================================================================
// Content Type Detection
// =============================================================================

const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  txt: 'text/plain',
  csv: 'text/csv',
};

/**
 * Detect MIME type from file extension and magic bytes
 */
export async function detectContentType(
  filename: string,
  buffer?: Buffer
): Promise<string> {
  // Try to detect from magic bytes if buffer provided
  if (buffer && buffer.length >= 4) {
    const magicBytes = buffer.slice(0, 4).toString('hex');

    // PDF: %PDF
    if (magicBytes.startsWith('25504446')) {
      return 'application/pdf';
    }
    // PNG
    if (magicBytes === '89504e47') {
      return 'image/png';
    }
    // JPEG
    if (magicBytes.startsWith('ffd8ff')) {
      return 'image/jpeg';
    }
    // GIF
    if (magicBytes.startsWith('47494638')) {
      return 'image/gif';
    }
    // ZIP (including DOCX, XLSX)
    if (magicBytes === '504b0304') {
      // Check for Office Open XML
      const str = buffer.toString('utf8', 0, 100);
      if (str.includes('word/')) {
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }
      if (str.includes('xl/')) {
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      }
      return 'application/zip';
    }
  }

  // Fall back to extension-based detection
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext && EXTENSION_TO_MIME[ext]) {
    return EXTENSION_TO_MIME[ext];
  }

  return 'application/octet-stream';
}

/**
 * Validate file size based on type
 */
export function validateFileSize(size: number, mimeType: string): { valid: boolean; error?: string } {
  if (size > SIZE_LIMITS.MAX_FILE_SIZE) {
    return { valid: false, error: `File size ${size} exceeds maximum of ${SIZE_LIMITS.MAX_FILE_SIZE} bytes` };
  }

  if (mimeType.startsWith('image/') && size > SIZE_LIMITS.MAX_IMAGE_SIZE) {
    return { valid: false, error: `Image size ${size} exceeds maximum of ${SIZE_LIMITS.MAX_IMAGE_SIZE} bytes` };
  }

  if (mimeType === 'application/pdf' && size > SIZE_LIMITS.MAX_PDF_SIZE) {
    return { valid: false, error: `PDF size ${size} exceeds maximum of ${SIZE_LIMITS.MAX_PDF_SIZE} bytes` };
  }

  return { valid: true };
}

/**
 * Validate MIME type is allowed
 */
export function validateMimeType(mimeType: string): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(mimeType as any)) {
    return { valid: false, error: `File type '${mimeType}' is not allowed` };
  }
  return { valid: true };
}

// =============================================================================
// Upload Service
// =============================================================================

export interface UploadServiceConfig {
  enableVirusScan: boolean;
  quarantineOnScanFailure: boolean;
  asyncScan: boolean;
}

const DEFAULT_CONFIG: UploadServiceConfig = {
  enableVirusScan: true,
  quarantineOnScanFailure: true,
  asyncScan: true,
};

export class UploadService {
  private storage: StorageClient;
  private scanner: VirusScanner;
  private scanQueue: ScanQueue;
  // ACL for future permission checks
  private _acl: DocumentACL;
  private config: UploadServiceConfig;

  constructor(config: Partial<UploadServiceConfig> = {}) {
    this.storage = getStorageClient();
    this.scanner = getVirusScanner();
    this._acl = getDocumentACL();
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.scanQueue = new ScanQueue(this.scanner);
    this.setupScanHandlers();
  }

  private setupScanHandlers(): void {
    this.scanQueue.on('complete', async (job, _result) => {
      console.log(`[VirusScan] Document ${job.documentId} is clean`);
      // Update document status in database (handled by caller)
    });

    this.scanQueue.on('quarantine', async (job, result) => {
      console.log(`[VirusScan] Document ${job.documentId} infected with ${result.virusName}, quarantining`);
      if (this.config.quarantineOnScanFailure) {
        await this.storage.quarantine(job.key, `Virus detected: ${result.virusName}`);
      }
    });

    this.scanQueue.on('error', async (job, result) => {
      console.error(`[VirusScan] Error scanning document ${job.documentId}: ${result.error}`);
    });
  }

  /**
   * Upload a file directly
   */
  async upload(
    context: ACLContext,
    request: UploadRequest,
    file: { buffer: Buffer; filename: string; mimetype?: string }
  ): Promise<UploadResult> {
    // Validate request
    const validated = UploadRequestSchema.parse(request);

    // Detect/validate content type
    const mimeType = file.mimetype || await detectContentType(file.filename, file.buffer);
    const mimeValidation = validateMimeType(mimeType);
    if (!mimeValidation.valid) {
      throw new Error(mimeValidation.error);
    }

    // Validate size
    const sizeValidation = validateFileSize(file.buffer.length, mimeType);
    if (!sizeValidation.valid) {
      throw new Error(sizeValidation.error);
    }

    // Calculate checksum
    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    // Generate storage key
    const prefix = validated.entityType
      ? `${validated.entityType.toLowerCase()}/${validated.entityId}`
      : `users/${context.userId}`;
    const key = this.storage.generateKey(prefix, file.filename);

    // Upload to storage
    await this.storage.upload(key, file.buffer, mimeType, {
      uploaderId: context.userId,
      uploaderRole: context.userRole,
      documentType: validated.type,
      entityType: validated.entityType || '',
      entityId: validated.entityId || '',
      checksum,
    });

    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Queue for virus scan if enabled
    if (this.config.enableVirusScan) {
      if (this.config.asyncScan) {
        // Async scan - document is accessible but marked as scanning
        await this.scanQueue.enqueue(documentId, key, this.storage.bucket);
      } else {
        // Sync scan - block until complete
        const scanResult = await this.scanner.scanBuffer(file.buffer);
        if (!scanResult.isClean) {
          if (scanResult.virusName) {
            await this.storage.quarantine(key, `Virus detected: ${scanResult.virusName}`);
            throw new Error(`File contains malware: ${scanResult.virusName}`);
          }
          if (scanResult.error) {
            throw new Error(`Virus scan failed: ${scanResult.error}`);
          }
        }
      }
    }

    return {
      documentId,
      key,
      bucket: this.storage.bucket,
      url: this.storage.getPublicUrl(key),
      size: file.buffer.length,
      mimeType,
      checksum,
      status: this.config.enableVirusScan && this.config.asyncScan ? 'SCANNING' : 'ACTIVE',
    };
  }

  /**
   * Get a presigned URL for direct upload
   */
  async getPresignedUploadUrl(
    context: ACLContext,
    request: PresignedUploadRequest
  ): Promise<{ uploadUrl: string; key: string; expiresAt: Date }> {
    // Validate request
    const validated = UploadRequestSchema.parse(request.metadata);

    // Validate content type
    const mimeValidation = validateMimeType(request.contentType);
    if (!mimeValidation.valid) {
      throw new Error(mimeValidation.error);
    }

    // Validate size
    const sizeValidation = validateFileSize(request.size, request.contentType);
    if (!sizeValidation.valid) {
      throw new Error(sizeValidation.error);
    }

    // Generate storage key
    const prefix = validated.entityType
      ? `${validated.entityType.toLowerCase()}/${validated.entityId}`
      : `users/${context.userId}`;
    const key = this.storage.generateKey(prefix, request.filename);

    // Get presigned URL
    const { url, expiresAt } = await this.storage.getPresignedUploadUrl(
      key,
      request.contentType,
      3600 // 1 hour
    );

    return { uploadUrl: url, key, expiresAt };
  }

  /**
   * Complete an upload that was done via presigned URL
   */
  async completePresignedUpload(
    _context: ACLContext,
    key: string,
    _request: UploadRequest
  ): Promise<UploadResult> {
    // Verify the file exists
    const exists = await this.storage.exists(key);
    if (!exists) {
      throw new Error('File not found in storage');
    }

    // Get file info
    const { contentType, size } = await this.storage.head(key);

    // Calculate checksum from stored file
    const { body } = await this.storage.get(key);
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    const checksum = createHash('sha256').update(buffer).digest('hex');

    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Queue for virus scan if enabled
    if (this.config.enableVirusScan) {
      await this.scanQueue.enqueue(documentId, key, this.storage.bucket);
    }

    return {
      documentId,
      key,
      bucket: this.storage.bucket,
      url: this.storage.getPublicUrl(key),
      size,
      mimeType: contentType,
      checksum,
      status: this.config.enableVirusScan ? 'SCANNING' : 'ACTIVE',
    };
  }

  /**
   * Get a presigned URL for download
   */
  async getDownloadUrl(
    _context: ACLContext,
    key: string,
    filename?: string
  ): Promise<{ url: string; expiresAt: Date }> {
    const { url, expiresAt } = await this.storage.getPresignedDownloadUrl(
      key,
      3600,
      filename
    );
    return { url, expiresAt };
  }

  /**
   * Delete a document
   */
  async delete(_context: ACLContext, key: string): Promise<void> {
    await this.storage.delete(key);
  }

  /**
   * Get scan queue status
   */
  getScanQueueStatus() {
    return this.scanQueue.getStatus();
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let uploadServiceInstance: UploadService | null = null;

export function getUploadService(config?: Partial<UploadServiceConfig>): UploadService {
  if (!uploadServiceInstance || config) {
    uploadServiceInstance = new UploadService(config);
  }
  return uploadServiceInstance;
}
