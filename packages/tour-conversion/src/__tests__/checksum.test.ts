import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  computeFileChecksum,
  computeBufferChecksum,
  getFileSize,
  computeFileMetadata,
  verifyChecksum,
} from '../checksum';

describe('Checksum Utilities', () => {
  const testDir = join('/tmp', 'tour-conversion-test-checksum');
  const testFile = join(testDir, 'test.txt');
  const testContent = 'Hello, World!';
  const expectedChecksum = 'dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f';

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await writeFile(testFile, testContent);
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('computeBufferChecksum', () => {
    it('computes correct SHA256 hash for buffer', () => {
      const buffer = Buffer.from(testContent);
      const checksum = computeBufferChecksum(buffer);
      expect(checksum).toBe(expectedChecksum);
    });

    it('produces different hashes for different content', () => {
      const buffer1 = Buffer.from('content1');
      const buffer2 = Buffer.from('content2');
      expect(computeBufferChecksum(buffer1)).not.toBe(computeBufferChecksum(buffer2));
    });

    it('produces same hash for same content', () => {
      const buffer1 = Buffer.from('same content');
      const buffer2 = Buffer.from('same content');
      expect(computeBufferChecksum(buffer1)).toBe(computeBufferChecksum(buffer2));
    });
  });

  describe('computeFileChecksum', () => {
    it('computes correct SHA256 hash for file', async () => {
      const checksum = await computeFileChecksum(testFile);
      expect(checksum).toBe(expectedChecksum);
    });

    it('throws for non-existent file', async () => {
      await expect(computeFileChecksum('/nonexistent/file')).rejects.toThrow();
    });
  });

  describe('getFileSize', () => {
    it('returns correct file size', async () => {
      const size = await getFileSize(testFile);
      expect(size).toBe(Buffer.from(testContent).length);
    });

    it('throws for non-existent file', async () => {
      await expect(getFileSize('/nonexistent/file')).rejects.toThrow();
    });
  });

  describe('computeFileMetadata', () => {
    it('returns checksum and size', async () => {
      const metadata = await computeFileMetadata(testFile);
      expect(metadata.checksum).toBe(expectedChecksum);
      expect(metadata.sizeBytes).toBe(Buffer.from(testContent).length);
    });
  });

  describe('verifyChecksum', () => {
    it('returns true for matching checksum', async () => {
      const result = await verifyChecksum(testFile, expectedChecksum);
      expect(result).toBe(true);
    });

    it('returns false for non-matching checksum', async () => {
      const result = await verifyChecksum(testFile, 'wrongchecksum');
      expect(result).toBe(false);
    });
  });
});
