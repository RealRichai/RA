/**
 * S3/MinIO Client
 *
 * Provides S3-compatible storage operations for document management.
 */

import { createHash } from 'crypto';
import type { Readable } from 'stream';

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { StorageConfig, PresignedUrlResult } from './types';

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_CONFIG: StorageConfig = {
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  region: process.env.S3_REGION || 'us-east-1',
  accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin',
  bucket: process.env.S3_BUCKET || 'realriches-documents',
  forcePathStyle: true, // Required for MinIO
};

// =============================================================================
// S3 Storage Client
// =============================================================================

export class StorageClient {
  private client: S3Client;
  private config: StorageConfig;

  constructor(config: Partial<StorageConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.client = new S3Client({
      endpoint: this.config.endpoint,
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      forcePathStyle: this.config.forcePathStyle,
    });
  }

  get bucket(): string {
    return this.config.bucket;
  }

  /**
   * Generate a unique storage key for a document
   */
  generateKey(prefix: string, filename: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const sanitized = filename.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 100);
    return `${prefix}/${timestamp}-${random}-${sanitized}`;
  }

  /**
   * Calculate checksum of file content
   */
  async calculateChecksum(content: Buffer | Readable): Promise<string> {
    const hash = createHash('sha256');

    if (Buffer.isBuffer(content)) {
      hash.update(content);
    } else {
      for await (const chunk of content) {
        hash.update(chunk);
      }
    }

    return hash.digest('hex');
  }

  /**
   * Upload a file directly
   */
  async upload(
    key: string,
    body: Buffer | Readable,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<{ key: string; etag: string; size: number }> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
      },
    });

    const result = await upload.done();
    const size = Buffer.isBuffer(body) ? body.length : 0;

    return {
      key,
      etag: result.ETag || '',
      size,
    };
  }

  /**
   * Generate a presigned URL for upload
   */
  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 3600
  ): Promise<PresignedUrlResult> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return { url, expiresAt, method: 'PUT' };
  }

  /**
   * Generate a presigned URL for download
   */
  async getPresignedDownloadUrl(
    key: string,
    expiresIn = 3600,
    filename?: string
  ): Promise<PresignedUrlResult> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ResponseContentDisposition: filename
        ? `attachment; filename="${encodeURIComponent(filename)}"`
        : undefined,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return { url, expiresAt, method: 'GET' };
  }

  /**
   * Get file content
   */
  async get(key: string): Promise<{ body: Readable; contentType: string; size: number; metadata: Record<string, string> }> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    return {
      body: response.Body as Readable,
      contentType: response.ContentType || 'application/octet-stream',
      size: response.ContentLength || 0,
      metadata: response.Metadata || {},
    };
  }

  /**
   * Get file metadata without downloading content
   */
  async head(key: string): Promise<{ contentType: string; size: number; metadata: Record<string, string>; lastModified: Date }> {
    const command = new HeadObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    return {
      contentType: response.ContentType || 'application/octet-stream',
      size: response.ContentLength || 0,
      metadata: response.Metadata || {},
      lastModified: response.LastModified || new Date(),
    };
  }

  /**
   * Delete a file
   */
  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  /**
   * Move a file (copy + delete)
   */
  async move(sourceKey: string, destinationKey: string): Promise<void> {
    // Copy to new location
    const copyCommand = new CopyObjectCommand({
      Bucket: this.config.bucket,
      CopySource: `${this.config.bucket}/${sourceKey}`,
      Key: destinationKey,
    });

    await this.client.send(copyCommand);

    // Delete original
    await this.delete(sourceKey);
  }

  /**
   * Move file to quarantine folder
   */
  async quarantine(key: string, reason: string): Promise<string> {
    const quarantineKey = `quarantine/${Date.now()}-${key.split('/').pop()}`;

    // Copy to quarantine with metadata
    const copyCommand = new CopyObjectCommand({
      Bucket: this.config.bucket,
      CopySource: `${this.config.bucket}/${key}`,
      Key: quarantineKey,
      Metadata: {
        quarantineReason: reason,
        originalKey: key,
        quarantinedAt: new Date().toISOString(),
      },
      MetadataDirective: 'REPLACE',
    });

    await this.client.send(copyCommand);
    await this.delete(key);

    return quarantineKey;
  }

  /**
   * List files with prefix
   */
  async list(prefix: string, maxKeys = 1000): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
    const command = new ListObjectsV2Command({
      Bucket: this.config.bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
    });

    const response = await this.client.send(command);

    return (response.Contents || []).map((item) => ({
      key: item.Key || '',
      size: item.Size || 0,
      lastModified: item.LastModified || new Date(),
    }));
  }

  /**
   * Check if file exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      await this.head(key);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the public URL for a file (for public buckets)
   */
  getPublicUrl(key: string): string {
    return `${this.config.endpoint}/${this.config.bucket}/${key}`;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let storageClientInstance: StorageClient | null = null;

export function getStorageClient(config?: Partial<StorageConfig>): StorageClient {
  if (!storageClientInstance || config) {
    storageClientInstance = new StorageClient(config);
  }
  return storageClientInstance;
}
