/**
 * Asset Provenance Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  AssetProvenanceService,
  createAssetProvenanceService,
  getAssetProvenanceService,
  resetAssetProvenanceService,
  verifyFileIntegrity,
  type ProvenanceEmitter,
  type AssetProvenance,
} from '../provenance';
import { computeFileChecksum } from '../checksum';

describe('AssetProvenanceService', () => {
  let testDir: string;

  beforeEach(async () => {
    resetAssetProvenanceService();
    testDir = join(tmpdir(), `provenance-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    resetAssetProvenanceService();
  });

  describe('recordUpload', () => {
    it('should compute checksum and size for uploaded file', async () => {
      const filePath = join(testDir, 'test.ply');
      const content = 'ply\nformat ascii 1.0\nend_header\n';
      await writeFile(filePath, content);

      const service = new AssetProvenanceService();
      const result = await service.recordUpload('asset-123', filePath, {
        listingId: 'listing-456',
        market: 'nyc',
        uploaderId: 'user-789',
        uploaderEmail: 'uploader@example.com',
      });

      expect(result.checksum).toBeDefined();
      expect(result.checksum.length).toBe(64); // SHA256 hex
      expect(result.sizeBytes).toBe(content.length);
    });

    it('should emit upload event with provenance emitter', async () => {
      const filePath = join(testDir, 'test.ply');
      await writeFile(filePath, 'test content');

      const mockEmitter: ProvenanceEmitter = {
        emit: vi.fn(),
      };
      const service = createAssetProvenanceService(mockEmitter);

      await service.recordUpload('asset-123', filePath, {
        listingId: 'listing-456',
        market: 'nyc',
        uploaderId: 'user-789',
      });

      expect(mockEmitter.emit).toHaveBeenCalledTimes(1);
      const record = (mockEmitter.emit as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(record.type).toBe('upload');
      expect(record.assetId).toBe('asset-123');
      expect(record.actorId).toBe('user-789');
      expect(record.details.listingId).toBe('listing-456');
      expect(record.details.market).toBe('nyc');
    });
  });

  describe('recordConversion', () => {
    it('should emit conversion event', () => {
      const mockEmitter: ProvenanceEmitter = {
        emit: vi.fn(),
      };
      const service = createAssetProvenanceService(mockEmitter);

      service.recordConversion('asset-123', {
        sogChecksum: 'abc123',
        sogSizeBytes: 1024,
        converterVersion: '1.0.0',
        iterations: 5000,
        conversionTimeMs: 30000,
      });

      expect(mockEmitter.emit).toHaveBeenCalledTimes(1);
      const record = (mockEmitter.emit as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(record.type).toBe('conversion');
      expect(record.details.sogChecksum).toBe('abc123');
      expect(record.details.converterVersion).toBe('1.0.0');
    });
  });

  describe('recordQAPass', () => {
    it('should emit QA pass event', () => {
      const mockEmitter: ProvenanceEmitter = {
        emit: vi.fn(),
      };
      const service = createAssetProvenanceService(mockEmitter);

      service.recordQAPass('asset-123', 0.92, {
        ssim: 0.92,
        pHashDistance: 5,
      });

      expect(mockEmitter.emit).toHaveBeenCalledTimes(1);
      const record = (mockEmitter.emit as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(record.type).toBe('qa_pass');
      expect(record.details.qaScore).toBe(0.92);
    });
  });

  describe('verifyPlyIntegrity', () => {
    it('should return valid when checksum matches', async () => {
      const filePath = join(testDir, 'test.ply');
      const content = 'ply test content';
      await writeFile(filePath, content);

      const expectedChecksum = await computeFileChecksum(filePath);
      const service = new AssetProvenanceService();

      const result = await service.verifyPlyIntegrity(
        'asset-123',
        filePath,
        expectedChecksum
      );

      expect(result.valid).toBe(true);
      expect(result.checksumMatch).toBe(true);
      expect(result.actualChecksum).toBe(expectedChecksum);
    });

    it('should return invalid when checksum does not match', async () => {
      const filePath = join(testDir, 'test.ply');
      await writeFile(filePath, 'ply test content');

      const service = new AssetProvenanceService();

      const result = await service.verifyPlyIntegrity(
        'asset-123',
        filePath,
        'wrong-checksum-value'
      );

      expect(result.valid).toBe(false);
      expect(result.checksumMatch).toBe(false);
      expect(result.expectedChecksum).toBe('wrong-checksum-value');
      expect(result.actualChecksum).toBeDefined();
    });

    it('should handle file not found', async () => {
      const service = new AssetProvenanceService();

      const result = await service.verifyPlyIntegrity(
        'asset-123',
        '/nonexistent/path.ply',
        'checksum'
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should emit integrity check event', async () => {
      const filePath = join(testDir, 'test.ply');
      await writeFile(filePath, 'test content');
      const checksum = await computeFileChecksum(filePath);

      const mockEmitter: ProvenanceEmitter = {
        emit: vi.fn(),
      };
      const service = createAssetProvenanceService(mockEmitter);

      await service.verifyPlyIntegrity('asset-123', filePath, checksum);

      const record = (mockEmitter.emit as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(record.type).toBe('integrity_check');
      expect(record.details.fileType).toBe('ply');
      expect(record.details.valid).toBe(true);
    });
  });

  describe('verifySogIntegrity', () => {
    it('should verify SOG file checksum', async () => {
      const filePath = join(testDir, 'test.sog');
      await writeFile(filePath, 'sog binary content');

      const expectedChecksum = await computeFileChecksum(filePath);
      const service = new AssetProvenanceService();

      const result = await service.verifySogIntegrity(
        'asset-123',
        filePath,
        expectedChecksum
      );

      expect(result.valid).toBe(true);
      expect(result.checksumMatch).toBe(true);
    });
  });

  describe('verifyProvenance', () => {
    it('should validate complete provenance', () => {
      const service = new AssetProvenanceService();

      const provenance: AssetProvenance = {
        assetId: 'asset-123',
        listingId: 'listing-456',
        market: 'nyc',
        uploaderId: 'user-789',
        uploaderEmail: 'uploader@example.com',
        uploadedAt: new Date(),
        plyS3Key: 'tours/nyc/asset-123/input.ply',
        plyChecksum: 'abc123',
        plySizeBytes: 1024,
        sogS3Key: 'tours/nyc/asset-123/output.sog',
        sogChecksum: 'def456',
        sogSizeBytes: 512,
        converterVersion: '1.0.0',
        iterations: 5000,
        qaScore: 0.92,
        qaPassedAt: new Date(),
      };

      const result = service.verifyProvenance(provenance);

      expect(result.valid).toBe(true);
      expect(result.checks.provenanceComplete).toBe(true);
      expect(result.missingFields).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const service = new AssetProvenanceService();

      const provenance: AssetProvenance = {
        assetId: 'asset-123',
        listingId: 'listing-456',
        market: 'nyc',
        uploadedAt: new Date(),
        plyS3Key: '',
        plyChecksum: '',
        plySizeBytes: 0,
      };

      const result = service.verifyProvenance(provenance);

      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('plyS3Key');
      expect(result.missingFields).toContain('plyChecksum');
    });

    it('should warn about missing uploader info', () => {
      const service = new AssetProvenanceService();

      const provenance: AssetProvenance = {
        assetId: 'asset-123',
        listingId: 'listing-456',
        market: 'nyc',
        uploadedAt: new Date(),
        plyS3Key: 'key',
        plyChecksum: 'checksum',
        plySizeBytes: 1024,
      };

      const result = service.verifyProvenance(provenance);

      expect(result.valid).toBe(true);
      expect(result.checks.provenanceComplete).toBe(false);
      expect(result.warnings.some((w) => w.includes('uploader ID'))).toBe(true);
    });

    it('should warn about missing SOG metadata', () => {
      const service = new AssetProvenanceService();

      const provenance: AssetProvenance = {
        assetId: 'asset-123',
        listingId: 'listing-456',
        market: 'nyc',
        uploaderId: 'user-789',
        uploadedAt: new Date(),
        plyS3Key: 'key',
        plyChecksum: 'checksum',
        plySizeBytes: 1024,
        sogS3Key: 'sog-key', // SOG exists but missing metadata
      };

      const result = service.verifyProvenance(provenance);

      expect(result.valid).toBe(false); // Missing sogChecksum
      expect(result.missingFields).toContain('sogChecksum');
    });
  });

  describe('recordAccess', () => {
    it('should emit access event', () => {
      const mockEmitter: ProvenanceEmitter = {
        emit: vi.fn(),
      };
      const service = createAssetProvenanceService(mockEmitter);

      service.recordAccess('asset-123', 'user-456', 'user@example.com', {
        sessionId: 'session-789',
        ipAddress: '192.168.1.1',
      });

      expect(mockEmitter.emit).toHaveBeenCalledTimes(1);
      const record = (mockEmitter.emit as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(record.type).toBe('access');
      expect(record.assetId).toBe('asset-123');
      expect(record.actorId).toBe('user-456');
      expect(record.details.sessionId).toBe('session-789');
    });
  });

  describe('singleton', () => {
    it('should return same instance from getAssetProvenanceService', () => {
      const service1 = getAssetProvenanceService();
      const service2 = getAssetProvenanceService();
      expect(service1).toBe(service2);
    });

    it('should create new instance after reset', () => {
      const service1 = getAssetProvenanceService();
      resetAssetProvenanceService();
      const service2 = getAssetProvenanceService();
      expect(service1).not.toBe(service2);
    });
  });

  describe('emitter error handling', () => {
    it('should not throw when emitter fails', async () => {
      const mockEmitter: ProvenanceEmitter = {
        emit: vi.fn().mockImplementation(() => {
          throw new Error('Emitter failed');
        }),
      };
      const service = createAssetProvenanceService(mockEmitter);

      // Should not throw
      service.recordConversion('asset-123', {
        sogChecksum: 'abc',
        sogSizeBytes: 100,
        converterVersion: '1.0.0',
        iterations: 5000,
        conversionTimeMs: 1000,
      });

      expect(mockEmitter.emit).toHaveBeenCalledTimes(1);
    });
  });
});

describe('verifyFileIntegrity', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `verify-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should return true when checksum matches', async () => {
    const filePath = join(testDir, 'test.txt');
    await writeFile(filePath, 'test content');
    const checksum = await computeFileChecksum(filePath);

    const result = await verifyFileIntegrity(filePath, checksum);
    expect(result).toBe(true);
  });

  it('should return false when checksum does not match', async () => {
    const filePath = join(testDir, 'test.txt');
    await writeFile(filePath, 'test content');

    const result = await verifyFileIntegrity(filePath, 'wrong-checksum');
    expect(result).toBe(false);
  });
});
