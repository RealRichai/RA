/**
 * Quality Regression Harness Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  QualityRegressionHarness,
  createQualityRegressionHarness,
  getQualityRegressionHarness,
  resetQualityRegressionHarness,
  DEFAULT_REGRESSION_CONFIG,
  type QualityBaseline,
} from '../quality-regression';
import type { QAReport, QAMetrics } from '../types';

function createMockQAReport(
  score: number,
  passed: boolean = true,
  overrides: Partial<QAReport> = {}
): QAReport {
  const metrics: QAMetrics = {
    averageSSIM: score,
    minSSIM: score - 0.02,
    maxSSIM: score + 0.02,
    averagePHashDistance: 3,
    framesRendered: 12,
    framesPassed: passed ? 12 : 6,
    renderTimeMs: 1500,
  };

  return {
    passed,
    score,
    frameScores: Array.from({ length: 12 }, (_, i) => ({
      frameIndex: i,
      cameraPosition: { x: 0, y: 0, z: i },
      ssimScore: score,
      pHashDistance: 3,
      passed,
    })),
    metrics,
    generatedAt: new Date(),
    duration: 1500,
    mode: 'mock',
    ...overrides,
  };
}

function createMockBaseline(
  assetId: string,
  qaScore: number = 0.92,
  overrides: Partial<QualityBaseline> = {}
): QualityBaseline {
  return {
    assetId,
    plyChecksum: 'abc123',
    sogChecksum: 'def456',
    converterVersion: '1.0.0',
    qaScore,
    pHashBaseline: 'baseline_hash_0000',
    ssimBaseline: qaScore,
    recordedAt: new Date(),
    ...overrides,
  };
}

describe('QualityRegressionHarness', () => {
  beforeEach(() => {
    resetQualityRegressionHarness();
  });

  describe('baseline management', () => {
    it('should register and retrieve baselines', () => {
      const harness = new QualityRegressionHarness();
      const baseline = createMockBaseline('asset-123');

      harness.registerBaseline(baseline);
      const report = createMockQAReport(0.92);
      const result = harness.checkRegression('asset-123', report, '1.0.0');

      expect(result.baselineScore).toBe(0.92);
    });

    it('should load multiple baselines', () => {
      const harness = new QualityRegressionHarness();
      const baselines = [
        createMockBaseline('asset-1', 0.90),
        createMockBaseline('asset-2', 0.95),
        createMockBaseline('asset-3', 0.88),
      ];

      harness.loadBaselines(baselines);

      const report = createMockQAReport(0.90);
      const result1 = harness.checkRegression('asset-1', report, '1.0.0');
      const result2 = harness.checkRegression('asset-2', report, '1.0.0');

      expect(result1.baselineScore).toBe(0.90);
      expect(result2.baselineScore).toBe(0.95);
    });

    it('should clear baselines', () => {
      const harness = new QualityRegressionHarness();
      harness.registerBaseline(createMockBaseline('asset-123'));
      harness.clearBaselines();

      const report = createMockQAReport(0.92);
      const result = harness.checkRegression('asset-123', report, '1.0.0');

      expect(result.baselineScore).toBe(0);
    });
  });

  describe('regression detection', () => {
    it('should pass when no baseline exists and quality meets threshold', () => {
      const harness = new QualityRegressionHarness();
      const report = createMockQAReport(0.92, true);

      const result = harness.checkRegression('asset-123', report, '1.0.0');

      expect(result.passed).toBe(true);
      expect(result.regressionDetected).toBe(false);
      expect(result.recommendation).toContain('baseline');
    });

    it('should fail when no baseline exists and quality below threshold', () => {
      const harness = new QualityRegressionHarness();
      const report = createMockQAReport(0.80, false);

      const result = harness.checkRegression('asset-123', report, '1.0.0');

      expect(result.passed).toBe(false);
      expect(result.recommendation).toContain('below threshold');
    });

    it('should pass when quality matches baseline', () => {
      const harness = new QualityRegressionHarness();
      harness.registerBaseline(createMockBaseline('asset-123', 0.92));
      const report = createMockQAReport(0.92, true);

      const result = harness.checkRegression('asset-123', report, '1.0.0');

      expect(result.passed).toBe(true);
      expect(result.regressionDetected).toBe(false);
      expect(result.scoreDelta).toBe(0);
    });

    it('should pass when quality improves', () => {
      const harness = new QualityRegressionHarness();
      harness.registerBaseline(createMockBaseline('asset-123', 0.90));
      const report = createMockQAReport(0.95, true);

      const result = harness.checkRegression('asset-123', report, '1.0.0');

      expect(result.passed).toBe(true);
      expect(result.regressionDetected).toBe(false);
      expect(result.scoreDelta).toBeCloseTo(0.05, 5);
    });

    it('should detect minor regression', () => {
      const harness = new QualityRegressionHarness();
      harness.registerBaseline(createMockBaseline('asset-123', 0.92));
      const report = createMockQAReport(0.86, true);

      const result = harness.checkRegression('asset-123', report, '1.0.0');

      expect(result.passed).toBe(false);
      expect(result.regressionDetected).toBe(true);
      expect(result.regressionSeverity).toBe('minor');
      expect(result.scoreDelta).toBeCloseTo(-0.06, 5);
    });

    it('should detect moderate regression', () => {
      const harness = new QualityRegressionHarness();
      harness.registerBaseline(createMockBaseline('asset-123', 0.98));
      const report = createMockQAReport(0.86, true); // 0.86 > 0.85 min, but -0.12 drop

      const result = harness.checkRegression('asset-123', report, '1.0.0');

      expect(result.passed).toBe(false);
      expect(result.regressionDetected).toBe(true);
      expect(result.regressionSeverity).toBe('moderate');
    });

    it('should detect severe regression', () => {
      const harness = new QualityRegressionHarness();
      harness.registerBaseline(createMockBaseline('asset-123', 0.95));
      const report = createMockQAReport(0.78, false);

      const result = harness.checkRegression('asset-123', report, '1.0.0');

      expect(result.passed).toBe(false);
      expect(result.regressionDetected).toBe(true);
      expect(result.regressionSeverity).toBe('severe');
    });

    it('should flag converter version change', () => {
      const harness = new QualityRegressionHarness();
      harness.registerBaseline(createMockBaseline('asset-123', 0.92));
      const report = createMockQAReport(0.85, true);

      const result = harness.checkRegression('asset-123', report, '2.0.0');

      expect(result.details.converterVersionChanged).toBe(true);
      expect(result.recommendation).toContain('Converter version changed');
    });

    it('should detect pHash regression', () => {
      const harness = new QualityRegressionHarness();
      harness.registerBaseline(
        createMockBaseline('asset-123', 0.92, {
          pHashBaseline: '0000000000000000',
        })
      );
      const report = createMockQAReport(0.92, true);

      // Simulate pHash with high distance (many differing bits)
      const result = harness.checkRegression(
        'asset-123',
        report,
        '1.0.0',
        'ffffffffffffffff' // Max distance from all zeros
      );

      expect(result.passed).toBe(false);
      expect(result.regressionDetected).toBe(true);
      expect(result.details.pHashDistance).toBeGreaterThan(5);
      expect(result.recommendation).toContain('Visual similarity dropped');
    });
  });

  describe('config', () => {
    it('should use default config', () => {
      const harness = new QualityRegressionHarness();
      const config = harness.getConfig();

      expect(config.maxScoreDrop).toBe(DEFAULT_REGRESSION_CONFIG.maxScoreDrop);
      expect(config.minSSIMThreshold).toBe(DEFAULT_REGRESSION_CONFIG.minSSIMThreshold);
    });

    it('should accept custom config', () => {
      const harness = createQualityRegressionHarness({
        maxScoreDrop: 0.1,
        minSSIMThreshold: 0.80,
      });

      const config = harness.getConfig();
      expect(config.maxScoreDrop).toBe(0.1);
      expect(config.minSSIMThreshold).toBe(0.80);
    });

    it('should allow config updates', () => {
      const harness = new QualityRegressionHarness();
      harness.updateConfig({ maxScoreDrop: 0.15 });

      const config = harness.getConfig();
      expect(config.maxScoreDrop).toBe(0.15);
    });

    it('should respect custom threshold in regression check', () => {
      const harness = createQualityRegressionHarness({
        maxScoreDrop: 0.1, // More lenient
        minSSIMThreshold: 0.80, // Lower minimum to allow 0.86 to pass
      });
      harness.registerBaseline(createMockBaseline('asset-123', 0.95));
      const report = createMockQAReport(0.86, true);

      const result = harness.checkRegression('asset-123', report, '1.0.0');

      // 0.95 - 0.86 = 0.09, which is less than 0.1, so should pass
      // Also 0.86 > 0.80 minSSIMThreshold
      expect(result.passed).toBe(true);
    });
  });

  describe('createBaseline', () => {
    it('should create and register a baseline', () => {
      const harness = new QualityRegressionHarness();
      const report = createMockQAReport(0.94, true);

      const baseline = harness.createBaseline(
        'asset-123',
        'ply-checksum',
        'sog-checksum',
        '1.0.0',
        report
      );

      expect(baseline.assetId).toBe('asset-123');
      expect(baseline.qaScore).toBe(0.94);
      expect(baseline.converterVersion).toBe('1.0.0');

      // Should be registered
      const result = harness.checkRegression('asset-123', report, '1.0.0');
      expect(result.baselineScore).toBe(0.94);
    });

    it('should use provided pHash', () => {
      const harness = new QualityRegressionHarness();
      const report = createMockQAReport(0.94, true);

      const baseline = harness.createBaseline(
        'asset-123',
        'ply-checksum',
        'sog-checksum',
        '1.0.0',
        report,
        'custom_phash_value'
      );

      expect(baseline.pHashBaseline).toBe('custom_phash_value');
    });
  });

  describe('singleton', () => {
    it('should return same instance from getQualityRegressionHarness', () => {
      const harness1 = getQualityRegressionHarness();
      const harness2 = getQualityRegressionHarness();
      expect(harness1).toBe(harness2);
    });

    it('should create new instance after reset', () => {
      const harness1 = getQualityRegressionHarness();
      resetQualityRegressionHarness();
      const harness2 = getQualityRegressionHarness();
      expect(harness1).not.toBe(harness2);
    });
  });
});
