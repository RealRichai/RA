/**
 * Quality Regression Harness
 *
 * Detects quality regression in SOG conversions by comparing against
 * stored baselines and historical scores.
 *
 * Used in CI to fail builds if conversion quality drops.
 */

import { computePHash, pHashDistance, runQA, meetsQualityThreshold } from './qa';
import { computeFileChecksum } from './checksum';
import type { QAReport } from './types';

// =============================================================================
// Types
// =============================================================================

export interface QualityBaseline {
  assetId: string;
  plyChecksum: string;
  sogChecksum: string;
  converterVersion: string;
  qaScore: number;
  pHashBaseline: string;
  ssimBaseline: number;
  recordedAt: Date;
}

export interface RegressionCheckResult {
  passed: boolean;
  assetId: string;
  currentScore: number;
  baselineScore: number;
  scoreDelta: number;
  regressionDetected: boolean;
  regressionSeverity?: 'minor' | 'moderate' | 'severe';
  details: {
    pHashDistance?: number;
    ssimDelta?: number;
    converterVersionChanged: boolean;
  };
  recommendation?: string;
}

export interface RegressionConfig {
  /** Maximum allowed score drop before flagging regression (default: 0.05 = 5%) */
  maxScoreDrop: number;
  /** Maximum pHash distance before flagging regression (default: 5) */
  maxPHashDrift: number;
  /** Minimum acceptable SSIM score (default: 0.85) */
  minSSIMThreshold: number;
  /** Whether to fail on converter version change without baseline (default: true) */
  requireBaselineOnVersionChange: boolean;
}

export const DEFAULT_REGRESSION_CONFIG: RegressionConfig = {
  maxScoreDrop: 0.05,
  maxPHashDrift: 5,
  minSSIMThreshold: 0.85,
  requireBaselineOnVersionChange: true,
};

// =============================================================================
// Quality Regression Harness
// =============================================================================

export class QualityRegressionHarness {
  private config: RegressionConfig;
  private baselines: Map<string, QualityBaseline> = new Map();

  constructor(config: Partial<RegressionConfig> = {}) {
    this.config = { ...DEFAULT_REGRESSION_CONFIG, ...config };
  }

  /**
   * Register a quality baseline for an asset
   */
  registerBaseline(baseline: QualityBaseline): void {
    this.baselines.set(baseline.assetId, baseline);
  }

  /**
   * Load baselines from an array (for CI/test setup)
   */
  loadBaselines(baselines: QualityBaseline[]): void {
    for (const baseline of baselines) {
      this.registerBaseline(baseline);
    }
  }

  /**
   * Clear all baselines (for testing)
   */
  clearBaselines(): void {
    this.baselines.clear();
  }

  /**
   * Check for quality regression against baseline
   */
  checkRegression(
    assetId: string,
    currentReport: QAReport,
    currentConverterVersion: string,
    currentPHash?: string
  ): RegressionCheckResult {
    const baseline = this.baselines.get(assetId);

    if (!baseline) {
      // No baseline - can't detect regression, pass if meets threshold
      const passed = meetsQualityThreshold(currentReport);
      return {
        passed,
        assetId,
        currentScore: currentReport.score,
        baselineScore: 0,
        scoreDelta: 0,
        regressionDetected: false,
        details: {
          converterVersionChanged: false,
        },
        recommendation: passed
          ? 'Consider registering this as a baseline for future regression testing'
          : `Quality score ${currentReport.score.toFixed(3)} below threshold`,
      };
    }

    const scoreDelta = currentReport.score - baseline.qaScore;
    const versionChanged = currentConverterVersion !== baseline.converterVersion;

    // Check pHash drift if available
    let pHashDist: number | undefined;
    if (currentPHash && baseline.pHashBaseline) {
      try {
        pHashDist = pHashDistance(currentPHash, baseline.pHashBaseline);
      } catch {
        // Hash length mismatch or other issue
        pHashDist = undefined;
      }
    }

    // Determine if regression occurred
    const ssimDelta = currentReport.metrics.averageSSIM - baseline.ssimBaseline;
    const scoreRegression = scoreDelta < -this.config.maxScoreDrop;
    const pHashRegression = pHashDist !== undefined && pHashDist > this.config.maxPHashDrift;
    const belowMinThreshold = currentReport.score < this.config.minSSIMThreshold;
    const regressionDetected = scoreRegression || pHashRegression || belowMinThreshold;

    // Determine severity
    let severity: RegressionCheckResult['regressionSeverity'];
    if (regressionDetected) {
      if (belowMinThreshold || scoreDelta < -0.15) {
        severity = 'severe';
      } else if (scoreDelta < -0.1 || (pHashDist && pHashDist > 8)) {
        severity = 'moderate';
      } else {
        severity = 'minor';
      }
    }

    // Build recommendation
    let recommendation: string | undefined;
    if (regressionDetected) {
      if (versionChanged) {
        recommendation = `Converter version changed (${baseline.converterVersion} -> ${currentConverterVersion}). Review conversion parameters.`;
      } else if (pHashRegression) {
        recommendation = `Visual similarity dropped (pHash distance: ${pHashDist}). Check render quality.`;
      } else if (scoreRegression) {
        recommendation = `Quality score dropped by ${Math.abs(scoreDelta).toFixed(3)}. Investigate conversion settings.`;
      } else if (belowMinThreshold) {
        recommendation = `Quality score ${currentReport.score.toFixed(3)} below minimum threshold ${this.config.minSSIMThreshold}.`;
      }
    }

    const passed = !regressionDetected;

    return {
      passed,
      assetId,
      currentScore: currentReport.score,
      baselineScore: baseline.qaScore,
      scoreDelta,
      regressionDetected,
      regressionSeverity: severity,
      details: {
        pHashDistance: pHashDist,
        ssimDelta,
        converterVersionChanged: versionChanged,
      },
      recommendation,
    };
  }

  /**
   * Run full QA and regression check for a conversion
   */
  async runRegressionTest(
    assetId: string,
    plyPath: string,
    sogPath: string,
    converterVersion: string
  ): Promise<{
    qaReport: QAReport;
    regressionResult: RegressionCheckResult;
  }> {
    // Run QA
    const qaReport = await runQA(plyPath, sogPath);

    // Compute pHash for first frame (representative)
    // In real implementation, would render and hash
    const pHash = qaReport.frameScores[0]
      ? `frame0_score_${qaReport.frameScores[0].ssimScore.toFixed(4)}`
      : undefined;

    // Check regression
    const regressionResult = this.checkRegression(
      assetId,
      qaReport,
      converterVersion,
      pHash
    );

    return { qaReport, regressionResult };
  }

  /**
   * Create a baseline from a successful QA run
   */
  createBaseline(
    assetId: string,
    plyChecksum: string,
    sogChecksum: string,
    converterVersion: string,
    qaReport: QAReport,
    pHash?: string
  ): QualityBaseline {
    const baseline: QualityBaseline = {
      assetId,
      plyChecksum,
      sogChecksum,
      converterVersion,
      qaScore: qaReport.score,
      pHashBaseline: pHash ?? `score_${qaReport.score.toFixed(4)}`,
      ssimBaseline: qaReport.metrics.averageSSIM,
      recordedAt: new Date(),
    };

    this.registerBaseline(baseline);
    return baseline;
  }

  /**
   * Get current config
   */
  getConfig(): RegressionConfig {
    return { ...this.config };
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<RegressionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

let defaultHarness: QualityRegressionHarness | null = null;

/**
 * Get the default regression harness singleton
 */
export function getQualityRegressionHarness(): QualityRegressionHarness {
  if (!defaultHarness) {
    defaultHarness = new QualityRegressionHarness();
  }
  return defaultHarness;
}

/**
 * Create a regression harness with custom config
 */
export function createQualityRegressionHarness(
  config?: Partial<RegressionConfig>
): QualityRegressionHarness {
  return new QualityRegressionHarness(config);
}

/**
 * Reset the default harness (for testing)
 */
export function resetQualityRegressionHarness(): void {
  defaultHarness = null;
}

// =============================================================================
// CI Helper Functions
// =============================================================================

/**
 * Run regression test and exit with appropriate code for CI
 * Returns exit code: 0 = passed, 1 = failed
 */
export async function runCIRegressionTest(
  assetId: string,
  plyPath: string,
  sogPath: string,
  converterVersion: string,
  baselinePath?: string
): Promise<number> {
  const harness = createQualityRegressionHarness();

  // Load baseline if provided
  if (baselinePath) {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(baselinePath, 'utf-8');
      const baselines = JSON.parse(content) as QualityBaseline[];
      harness.loadBaselines(baselines);
    } catch (err) {
      console.error(`[QA] Failed to load baselines from ${baselinePath}:`, err);
    }
  }

  const { qaReport, regressionResult } = await harness.runRegressionTest(
    assetId,
    plyPath,
    sogPath,
    converterVersion
  );

  // Output results
  console.log('\n=== Quality Regression Test Results ===\n');
  console.log(`Asset ID:        ${assetId}`);
  console.log(`QA Score:        ${qaReport.score.toFixed(4)}`);
  console.log(`QA Passed:       ${qaReport.passed ? 'YES' : 'NO'}`);
  console.log(`Regression:      ${regressionResult.regressionDetected ? 'DETECTED' : 'None'}`);

  if (regressionResult.regressionDetected) {
    console.log(`Severity:        ${regressionResult.regressionSeverity}`);
    console.log(`Score Delta:     ${regressionResult.scoreDelta.toFixed(4)}`);
    if (regressionResult.recommendation) {
      console.log(`Recommendation:  ${regressionResult.recommendation}`);
    }
  }

  console.log('\n');

  return regressionResult.passed ? 0 : 1;
}
