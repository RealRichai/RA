import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  TourConversionService,
  getTourConversionService,
  resetTourConversionService,
} from '../service';
import type { ConversionJobData } from '../types';

describe('TourConversionService', () => {
  let service: TourConversionService;

  beforeEach(() => {
    resetTourConversionService();
    service = new TourConversionService({
      workDir: '/tmp/tour-conversion-test',
    });
  });

  afterEach(() => {
    resetTourConversionService();
  });

  describe('getConverterVersion', () => {
    it('returns a version string', async () => {
      const version = await service.getConverterVersion();
      expect(typeof version).toBe('string');
      expect(version.length).toBeGreaterThan(0);
    });

    it('caches the version', async () => {
      const version1 = await service.getConverterVersion();
      const version2 = await service.getConverterVersion();
      expect(version1).toBe(version2);
    });
  });

  describe('processJob', () => {
    const mockJobData: ConversionJobData = {
      tourAssetId: '123e4567-e89b-12d3-a456-426614174000',
      plyS3Key: 'tours/NYC/123/input.ply',
      market: 'NYC',
      iterations: 1000,
      qualityThreshold: 0.85,
    };

    it('processes a job successfully with mock', async () => {
      const result = await service.processJob(mockJobData, true);

      expect(result.success).toBe(true);
      expect(result.plyChecksum).toBeDefined();
      expect(result.plySizeBytes).toBeGreaterThan(0);
      expect(result.sogS3Key).toBeDefined();
      expect(result.sogChecksum).toBeDefined();
      expect(result.converterVersion).toBeDefined();
      expect(result.iterations).toBe(mockJobData.iterations);
      expect(result.conversionTimeMs).toBeGreaterThan(0);
      expect(result.qaReport).toBeDefined();
    });

    it('includes QA report in result', async () => {
      const result = await service.processJob(mockJobData, true);

      expect(result.qaReport).toBeDefined();
      expect(result.qaReport?.score).toBeGreaterThanOrEqual(0);
      expect(result.qaReport?.score).toBeLessThanOrEqual(1);
      expect(result.qaReport?.frameScores).toBeInstanceOf(Array);
      expect(result.qaReport?.metrics).toBeDefined();
    });

    it('generates correct S3 key', async () => {
      const result = await service.processJob(mockJobData, true);

      expect(result.sogS3Key).toContain(mockJobData.market);
      expect(result.sogS3Key).toContain(mockJobData.tourAssetId);
      expect(result.sogS3Key).toContain('.sog');
    });

    it('computes checksums deterministically', async () => {
      const result1 = await service.processJob(mockJobData, true);
      const result2 = await service.processJob(mockJobData, true);

      expect(result1.plyChecksum).toBe(result2.plyChecksum);
    });

    it('includes provenance metadata', async () => {
      const result = await service.processJob(mockJobData, true);

      expect(result.provenance).toBeDefined();
      expect(result.provenance?.qaMode).toBe('mock');
      // Binary mode can be 'local' (if package installed) or 'npx' (fallback)
      expect(['local', 'npx']).toContain(result.provenance?.binaryMode);
      expect(result.provenance?.binaryPath).toBeDefined();
      expect(result.provenance?.environment).toBeDefined();
      expect(result.provenance?.startedAt).toBeInstanceOf(Date);
      expect(result.provenance?.completedAt).toBeInstanceOf(Date);
    });

    it('provenance environment includes platform info', async () => {
      const result = await service.processJob(mockJobData, true);

      expect(result.provenance?.environment).toContain(process.platform);
      expect(result.provenance?.environment).toContain(process.arch);
      expect(result.provenance?.environment).toContain('node');
    });

    it('provenance timestamps are sequential', async () => {
      const result = await service.processJob(mockJobData, true);

      const startTime = result.provenance?.startedAt?.getTime() ?? 0;
      const endTime = result.provenance?.completedAt?.getTime() ?? 0;
      expect(endTime).toBeGreaterThanOrEqual(startTime);
    });

    it('includes QA mode in QA report', async () => {
      const result = await service.processJob(mockJobData, true);

      expect(result.qaReport?.mode).toBe('mock');
    });
  });

  describe('singleton', () => {
    it('getTourConversionService returns singleton', () => {
      const service1 = getTourConversionService();
      const service2 = getTourConversionService();
      expect(service1).toBe(service2);
    });

    it('resetTourConversionService creates new instance', () => {
      const service1 = getTourConversionService();
      resetTourConversionService();
      const service2 = getTourConversionService();
      expect(service1).not.toBe(service2);
    });
  });
});
