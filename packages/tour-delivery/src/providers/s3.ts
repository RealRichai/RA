/**
 * S3 Storage Provider
 *
 * Used for PLY file retention (permanent source of truth).
 * PLY files should never be served directly to clients.
 *
 * RETENTION POLICY: PLY files are retained permanently. Delete operations
 * are blocked unless invoked by SUPERADMIN with PLY_DELETE_OVERRIDE=true.
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  getPlyRetentionGuard,
  isPlyKey,
  type RetentionContext,
  type PlyRetentionGuard,
} from '../retention-guard';
import type {
  StorageProvider,
  StorageProviderConfig,
  SignedUrlOptions,
  SignedUrlResult,
} from '../types';

export interface S3StorageProviderOptions {
  config: StorageProviderConfig;
  /** Custom retention guard (for testing) */
  retentionGuard?: PlyRetentionGuard;
  /** Bypass retention guard (DANGEROUS - only for migration scripts) */
  bypassRetentionGuard?: boolean;
}

export class S3StorageProvider implements StorageProvider {
  readonly name = 's3-ply';
  private client: S3Client;
  private bucket: string;
  private retentionGuard: PlyRetentionGuard;
  private bypassRetentionGuard: boolean;

  constructor(config: StorageProviderConfig);
  constructor(options: S3StorageProviderOptions);
  constructor(configOrOptions: StorageProviderConfig | S3StorageProviderOptions) {
    const isOptions = 'config' in configOrOptions;
    const config = isOptions ? configOrOptions.config : configOrOptions;

    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(config.endpoint && { endpoint: config.endpoint }),
    });

    this.retentionGuard = isOptions && configOrOptions.retentionGuard
      ? configOrOptions.retentionGuard
      : getPlyRetentionGuard();
    this.bypassRetentionGuard = isOptions ? (configOrOptions.bypassRetentionGuard ?? false) : false;
  }

  async getSignedReadUrl(options: SignedUrlOptions): Promise<SignedUrlResult> {
    const expiresIn = options.expiresIn ?? 3600;
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: options.key,
      ...(options.contentDisposition && {
        ResponseContentDisposition: options.contentDisposition,
      }),
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return { url, expiresAt, key: options.key };
  }

  async getSignedWriteUrl(options: SignedUrlOptions): Promise<SignedUrlResult> {
    const expiresIn = options.expiresIn ?? 3600;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: options.key,
      ...(options.contentType && { ContentType: options.contentType }),
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return { url, expiresAt, key: options.key };
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Delete a file from S3.
   *
   * RETENTION POLICY: PLY files (.ply) are protected by retention policy.
   * Delete will throw PlyRetentionError unless:
   * - SUPERADMIN role is provided in context
   * - PLY_DELETE_OVERRIDE=true environment variable is set
   *
   * @param key - S3 key to delete
   * @param context - Retention context with actor info (required for PLY files)
   * @throws PlyRetentionError if PLY file deletion is blocked
   */
  async delete(key: string, context?: RetentionContext): Promise<void> {
    // Check if this is a PLY file and retention guard should be applied
    if (isPlyKey(key) && !this.bypassRetentionGuard) {
      this.retentionGuard.guardDelete(key, context ?? {});
    }

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }

  async getMetadata(key: string): Promise<{ size: number; lastModified: Date } | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return {
        size: response.ContentLength ?? 0,
        lastModified: response.LastModified ?? new Date(),
      };
    } catch (error) {
      if ((error as { name?: string }).name === 'NotFound') {
        return null;
      }
      throw error;
    }
  }
}

/**
 * Create an S3 provider for PLY storage
 */
export function createPlyStorageProvider(config?: Partial<StorageProviderConfig>): S3StorageProvider {
  const fullConfig: StorageProviderConfig = {
    name: 's3-ply',
    region: config?.region ?? process.env['AWS_REGION'] ?? 'us-east-1',
    bucket: config?.bucket ?? process.env['PLY_S3_BUCKET'] ?? 'realriches-ply-source',
    accessKeyId: config?.accessKeyId ?? process.env['AWS_ACCESS_KEY_ID'] ?? '',
    secretAccessKey: config?.secretAccessKey ?? process.env['AWS_SECRET_ACCESS_KEY'] ?? '',
    endpoint: config?.endpoint,
  };

  return new S3StorageProvider(fullConfig);
}
