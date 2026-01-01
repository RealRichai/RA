/**
 * Mock Storage Provider for Testing
 *
 * Provides an in-memory storage implementation for tests.
 */

import type {
  StorageProvider,
  SignedUrlOptions,
  SignedUrlResult,
} from '../types';

interface StoredObject {
  data: Buffer;
  metadata: {
    size: number;
    lastModified: Date;
    contentType?: string;
  };
}

export class MockStorageProvider implements StorageProvider {
  readonly name: string;
  private storage = new Map<string, StoredObject>();
  private signedUrls: SignedUrlResult[] = [];

  constructor(name: string = 'mock') {
    this.name = name;
  }

  /**
   * Add a mock object to storage
   */
  addObject(key: string, data: Buffer | string, contentType?: string): void {
    const buffer = typeof data === 'string' ? Buffer.from(data) : data;
    this.storage.set(key, {
      data: buffer,
      metadata: {
        size: buffer.length,
        lastModified: new Date(),
        contentType,
      },
    });
  }

  /**
   * Get all generated signed URLs (for test verification)
   */
  getGeneratedSignedUrls(): SignedUrlResult[] {
    return [...this.signedUrls];
  }

  /**
   * Clear all stored objects and signed URLs
   */
  clear(): void {
    this.storage.clear();
    this.signedUrls = [];
  }

  getSignedReadUrl(options: SignedUrlOptions): Promise<SignedUrlResult> {
    const expiresIn = options.expiresIn ?? 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Generate a mock signed URL
    const url = `https://${this.name}.mock.storage/${options.key}?signature=mock_sig_${Date.now()}&expires=${expiresAt.getTime()}`;

    const result: SignedUrlResult = { url, expiresAt, key: options.key };
    this.signedUrls.push(result);

    return Promise.resolve(result);
  }

  getSignedWriteUrl(options: SignedUrlOptions): Promise<SignedUrlResult> {
    const expiresIn = options.expiresIn ?? 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Generate a mock signed URL for upload
    const url = `https://${this.name}.mock.storage/${options.key}?upload=true&signature=mock_sig_${Date.now()}&expires=${expiresAt.getTime()}`;

    const result: SignedUrlResult = { url, expiresAt, key: options.key };
    this.signedUrls.push(result);

    return Promise.resolve(result);
  }

  exists(key: string): Promise<boolean> {
    return Promise.resolve(this.storage.has(key));
  }

  delete(key: string): Promise<void> {
    this.storage.delete(key);
    return Promise.resolve();
  }

  getMetadata(key: string): Promise<{ size: number; lastModified: Date } | null> {
    const obj = this.storage.get(key);
    if (!obj) return Promise.resolve(null);
    return Promise.resolve({
      size: obj.metadata.size,
      lastModified: obj.metadata.lastModified,
    });
  }
}

/**
 * Create a mock storage provider for testing
 */
export function createMockStorageProvider(name: string = 'mock'): MockStorageProvider {
  return new MockStorageProvider(name);
}
