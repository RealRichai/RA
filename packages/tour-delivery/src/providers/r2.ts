/**
 * Cloudflare R2 Storage Provider
 *
 * Used for SOG file distribution (regenerable from PLY source).
 * SOG files are served to clients via signed URLs.
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type {
  StorageProvider,
  StorageProviderConfig,
  SignedUrlOptions,
  SignedUrlResult,
  RetentionContext,
} from '../types';

export class R2StorageProvider implements StorageProvider {
  readonly name = 'r2-sog';
  private client: S3Client;
  private bucket: string;

  constructor(config: StorageProviderConfig) {
    this.bucket = config.bucket;

    // R2 uses S3-compatible API
    this.client = new S3Client({
      region: 'auto', // R2 uses 'auto' for region
      endpoint: config.endpoint ?? `https://${config.region}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
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
   * Delete a file from R2.
   * SOG files are regenerable from PLY source, so no retention guard needed.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async delete(key: string, _context?: RetentionContext): Promise<void> {
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
 * Create an R2 provider for SOG distribution
 */
export function createSogStorageProvider(config?: Partial<StorageProviderConfig>): R2StorageProvider {
  const fullConfig: StorageProviderConfig = {
    name: 'r2-sog',
    region: config?.region ?? process.env['R2_ACCOUNT_ID'] ?? '',
    bucket: config?.bucket ?? process.env['SOG_R2_BUCKET'] ?? 'realriches-sog-dist',
    accessKeyId: config?.accessKeyId ?? process.env['R2_ACCESS_KEY_ID'] ?? '',
    secretAccessKey: config?.secretAccessKey ?? process.env['R2_SECRET_ACCESS_KEY'] ?? '',
    endpoint: config?.endpoint,
  };

  return new R2StorageProvider(fullConfig);
}
