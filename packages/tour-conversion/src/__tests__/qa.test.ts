import sharp from 'sharp';
import { describe, it, expect } from 'vitest';

import {
  computePHash,
  pHashDistance,
  computeSSIM,
  runQA,
  meetsQualityThreshold,
} from '../qa';
import { CANONICAL_CAMERA_PATH } from '../types';

describe('QA System', () => {
  describe('computePHash', () => {
    it('computes hash for image buffer', async () => {
      const image = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
      }).png().toBuffer();

      const hash = await computePHash(image);
      expect(hash).toHaveLength(16); // 64-bit hash as hex
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('produces same hash for identical images', async () => {
      const image1 = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 128, g: 128, b: 128 } },
      }).png().toBuffer();

      const image2 = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 128, g: 128, b: 128 } },
      }).png().toBuffer();

      const hash1 = await computePHash(image1);
      const hash2 = await computePHash(image2);
      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different images', async () => {
      const image1 = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
      }).png().toBuffer();

      const image2 = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 255 } },
      }).png().toBuffer();

      const hash1 = await computePHash(image1);
      const hash2 = await computePHash(image2);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('pHashDistance', () => {
    it('returns 0 for identical hashes', () => {
      expect(pHashDistance('abcd1234abcd1234', 'abcd1234abcd1234')).toBe(0);
    });

    it('returns non-zero for different hashes', () => {
      expect(pHashDistance('0000000000000000', 'ffffffffffffffff')).toBeGreaterThan(0);
    });

    it('throws for mismatched lengths', () => {
      expect(() => pHashDistance('abc', 'abcd')).toThrow('Hash lengths must match');
    });
  });

  describe('computeSSIM', () => {
    it('returns 1 for identical images', async () => {
      const image = await sharp({
        create: { width: 64, height: 64, channels: 3, background: { r: 128, g: 128, b: 128 } },
      }).png().toBuffer();

      const ssim = await computeSSIM(image, image);
      expect(ssim).toBeCloseTo(1, 2);
    });

    it('returns lower score for different images', async () => {
      const image1 = await sharp({
        create: { width: 64, height: 64, channels: 3, background: { r: 255, g: 255, b: 255 } },
      }).png().toBuffer();

      const image2 = await sharp({
        create: { width: 64, height: 64, channels: 3, background: { r: 0, g: 0, b: 0 } },
      }).png().toBuffer();

      const ssim = await computeSSIM(image1, image2);
      expect(ssim).toBeLessThan(1);
    });

    it('returns value between 0 and 1', async () => {
      const image1 = await sharp({
        create: { width: 64, height: 64, channels: 3, background: { r: 100, g: 150, b: 200 } },
      }).png().toBuffer();

      const image2 = await sharp({
        create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 100, b: 50 } },
      }).png().toBuffer();

      const ssim = await computeSSIM(image1, image2);
      expect(ssim).toBeGreaterThanOrEqual(0);
      expect(ssim).toBeLessThanOrEqual(1);
    });
  });

  describe('runQA', () => {
    it('runs QA on mock PLY and SOG files', async () => {
      const report = await runQA('/mock/input.ply', '/mock/output.sog');

      expect(report).toHaveProperty('passed');
      expect(report).toHaveProperty('score');
      expect(report).toHaveProperty('frameScores');
      expect(report).toHaveProperty('metrics');
      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('duration');

      expect(report.frameScores).toHaveLength(CANONICAL_CAMERA_PATH.length);
      expect(report.metrics.framesRendered).toBe(CANONICAL_CAMERA_PATH.length);
    });

    it('generates deterministic results', async () => {
      const report1 = await runQA('/mock/input.ply', '/mock/output.sog');
      const report2 = await runQA('/mock/input.ply', '/mock/output.sog');

      expect(report1.score).toBe(report2.score);
      expect(report1.frameScores.map(f => f.ssimScore)).toEqual(
        report2.frameScores.map(f => f.ssimScore)
      );
    });

    it('uses custom camera path when provided', async () => {
      const customPath = [
        { x: 0, y: 0, z: 1, pitch: 0, yaw: 0 },
        { x: 0, y: 0, z: 2, pitch: 0, yaw: 0 },
      ];

      const report = await runQA('/mock/input.ply', '/mock/output.sog', customPath);
      expect(report.frameScores).toHaveLength(2);
    });
  });

  describe('meetsQualityThreshold', () => {
    it('returns true for high-quality report', () => {
      const report = {
        passed: true,
        score: 0.95,
        frameScores: [],
        metrics: {
          averageSSIM: 0.95,
          minSSIM: 0.9,
          maxSSIM: 1,
          averagePHashDistance: 2,
          framesRendered: 10,
          framesPassed: 10,
          renderTimeMs: 100,
        },
        generatedAt: new Date(),
        duration: 100,
      };

      expect(meetsQualityThreshold(report)).toBe(true);
    });

    it('returns false for low-quality report', () => {
      const report = {
        passed: false,
        score: 0.5,
        frameScores: [],
        metrics: {
          averageSSIM: 0.5,
          minSSIM: 0.3,
          maxSSIM: 0.7,
          averagePHashDistance: 20,
          framesRendered: 10,
          framesPassed: 3,
          renderTimeMs: 100,
        },
        generatedAt: new Date(),
        duration: 100,
      };

      expect(meetsQualityThreshold(report)).toBe(false);
    });

    it('respects custom threshold', () => {
      const report = {
        passed: true,
        score: 0.9,
        frameScores: [],
        metrics: {
          averageSSIM: 0.9,
          minSSIM: 0.85,
          maxSSIM: 0.95,
          averagePHashDistance: 5,
          framesRendered: 10,
          framesPassed: 9,
          renderTimeMs: 100,
        },
        generatedAt: new Date(),
        duration: 100,
      };

      expect(meetsQualityThreshold(report, 0.85)).toBe(true);
      expect(meetsQualityThreshold(report, 0.95)).toBe(false);
    });
  });
});
