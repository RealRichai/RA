import { describe, it, expect, beforeEach } from 'vitest';

import { MockStorageProvider, createMockStorageProvider } from '../providers/mock';

describe('Signed URL Generation', () => {
  let mockProvider: MockStorageProvider;

  beforeEach(() => {
    mockProvider = createMockStorageProvider('test');
    mockProvider.clear();
  });

  describe('MockStorageProvider', () => {
    describe('getSignedReadUrl', () => {
      it('generates a signed URL with correct structure', async () => {
        const result = await mockProvider.getSignedReadUrl({
          key: 'tours/NYC/asset123/output.sog',
        });

        expect(result.url).toContain('https://test.mock.storage/');
        expect(result.url).toContain('tours/NYC/asset123/output.sog');
        expect(result.url).toContain('signature=');
        expect(result.url).toContain('expires=');
        expect(result.key).toBe('tours/NYC/asset123/output.sog');
      });

      it('uses default TTL of 1 hour', async () => {
        const now = Date.now();
        const result = await mockProvider.getSignedReadUrl({
          key: 'test.sog',
        });

        const expectedExpiry = now + 3600 * 1000;
        // Allow 1 second tolerance
        expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 1000);
        expect(result.expiresAt.getTime()).toBeLessThanOrEqual(expectedExpiry + 1000);
      });

      it('respects custom TTL', async () => {
        const now = Date.now();
        const result = await mockProvider.getSignedReadUrl({
          key: 'test.sog',
          expiresIn: 300, // 5 minutes
        });

        const expectedExpiry = now + 300 * 1000;
        expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 1000);
        expect(result.expiresAt.getTime()).toBeLessThanOrEqual(expectedExpiry + 1000);
      });

      it('tracks generated URLs', async () => {
        await mockProvider.getSignedReadUrl({ key: 'file1.sog' });
        await mockProvider.getSignedReadUrl({ key: 'file2.sog' });
        await mockProvider.getSignedReadUrl({ key: 'file3.sog' });

        const urls = mockProvider.getGeneratedSignedUrls();
        expect(urls).toHaveLength(3);
        expect(urls[0].key).toBe('file1.sog');
        expect(urls[1].key).toBe('file2.sog');
        expect(urls[2].key).toBe('file3.sog');
      });
    });

    describe('getSignedWriteUrl', () => {
      it('generates a signed upload URL', async () => {
        const result = await mockProvider.getSignedWriteUrl({
          key: 'uploads/new-file.sog',
          contentType: 'application/octet-stream',
        });

        expect(result.url).toContain('https://test.mock.storage/');
        expect(result.url).toContain('upload=true');
        expect(result.url).toContain('signature=');
        expect(result.key).toBe('uploads/new-file.sog');
      });
    });

    describe('exists', () => {
      it('returns false for non-existent objects', async () => {
        expect(await mockProvider.exists('missing.sog')).toBe(false);
      });

      it('returns true for existing objects', async () => {
        mockProvider.addObject('existing.sog', 'content');

        expect(await mockProvider.exists('existing.sog')).toBe(true);
      });
    });

    describe('delete', () => {
      it('removes objects from storage', async () => {
        mockProvider.addObject('to-delete.sog', 'content');
        expect(await mockProvider.exists('to-delete.sog')).toBe(true);

        await mockProvider.delete('to-delete.sog');

        expect(await mockProvider.exists('to-delete.sog')).toBe(false);
      });
    });

    describe('getMetadata', () => {
      it('returns null for non-existent objects', async () => {
        const metadata = await mockProvider.getMetadata('missing.sog');

        expect(metadata).toBeNull();
      });

      it('returns size and lastModified for existing objects', async () => {
        const content = 'test content';
        mockProvider.addObject('existing.sog', content);

        const metadata = await mockProvider.getMetadata('existing.sog');

        expect(metadata).not.toBeNull();
        expect(metadata!.size).toBe(content.length);
        expect(metadata!.lastModified).toBeInstanceOf(Date);
      });
    });
  });

  describe('URL Expiration', () => {
    it('generates URLs with correct expiration times', async () => {
      const shortTtl = await mockProvider.getSignedReadUrl({
        key: 'short.sog',
        expiresIn: 60, // 1 minute
      });

      const longTtl = await mockProvider.getSignedReadUrl({
        key: 'long.sog',
        expiresIn: 86400, // 24 hours
      });

      // Short URL should expire before long URL
      expect(shortTtl.expiresAt.getTime()).toBeLessThan(longTtl.expiresAt.getTime());

      // Verify approximate TTL
      const now = Date.now();
      expect(shortTtl.expiresAt.getTime()).toBeCloseTo(now + 60000, -3);
      expect(longTtl.expiresAt.getTime()).toBeCloseTo(now + 86400000, -3);
    });
  });

  describe('URL Format', () => {
    it('includes required URL components', async () => {
      const result = await mockProvider.getSignedReadUrl({
        key: 'tours/market/asset/file.sog',
        expiresIn: 3600,
      });

      const url = new URL(result.url);

      // Has correct host
      expect(url.hostname).toBe('test.mock.storage');

      // Has the file path
      expect(url.pathname).toBe('/tours/market/asset/file.sog');

      // Has signature parameter
      expect(url.searchParams.has('signature')).toBe(true);

      // Has expires parameter
      expect(url.searchParams.has('expires')).toBe(true);
    });
  });
});
