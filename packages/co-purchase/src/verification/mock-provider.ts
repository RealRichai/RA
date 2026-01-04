/**
 * Mock Verification Provider
 *
 * For development and testing. Does not perform real verification.
 * Stores only hashes and IDs - no PII.
 */

import type { VerificationStatus } from '../types';

import {
  BaseVerificationProvider,
  failure,
  success,
  type BaseVerificationProviderConfig,
  type IVerificationProvider,
  type Result,
  type VerificationRequest,
  type VerificationResponse,
  type VerificationResult,
} from './provider-interface';

// ============================================================================
// Mock Provider Configuration
// ============================================================================

export interface MockVerificationProviderConfig extends BaseVerificationProviderConfig {
  /** Simulate failure for testing */
  simulateFailure?: boolean;
  /** Simulate pending status (async verification) */
  simulatePending?: boolean;
  /** Delay in ms for simulating async operations */
  simulatedDelayMs?: number;
}

// ============================================================================
// Mock Provider Implementation
// ============================================================================

export class MockVerificationProvider
  extends BaseVerificationProvider
  implements IVerificationProvider
{
  readonly providerId = 'mock' as const;

  private mockResults: Map<string, VerificationResult> = new Map();
  private simulateFailure: boolean;
  private simulatePending: boolean;
  private simulatedDelayMs: number;

  constructor(config: MockVerificationProviderConfig = { enabled: true }) {
    super(config);
    this.isConfigured = config.enabled;
    this.simulateFailure = config.simulateFailure ?? false;
    this.simulatePending = config.simulatePending ?? false;
    this.simulatedDelayMs = config.simulatedDelayMs ?? 0;
  }

  validateCredentials(): Promise<boolean> {
    // Mock provider is always valid
    return Promise.resolve(true);
  }

  async initiateVerification(
    request: VerificationRequest
  ): Promise<Result<VerificationResponse, Error>> {
    const startTime = Date.now();

    // Simulate async delay if configured
    if (this.simulatedDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulatedDelayMs));
    }

    const verificationId = this.generateId('verif');

    // Determine status based on configuration
    let status: VerificationStatus;
    let failureReason: string | undefined;

    if (this.simulateFailure) {
      status = 'failed';
      failureReason = 'Simulated verification failure for testing';
    } else if (this.simulatePending) {
      status = 'pending';
    } else {
      status = 'verified';
    }

    // Create result hash from non-PII data only
    const result: VerificationResult = {
      verificationId,
      status,
      level: request.level,
      resultHash: this.hashResult({
        verificationId,
        userId: request.userId,
        groupId: request.groupId,
        level: request.level,
        status,
        timestamp: new Date().toISOString(),
      }),
      externalRefId: `mock_${verificationId}`,
      verifiedAt: status === 'verified' ? new Date() : undefined,
      expiresAt:
        status === 'verified'
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
          : undefined,
      failureReason,
    };

    // Store for later status checks
    this.mockResults.set(verificationId, result);

    this.log('Initiated mock verification', {
      verificationId,
      level: request.level,
      status,
    });

    return success({
      providerId: this.providerId,
      success: status !== 'failed',
      result,
      sentAt: new Date(),
      durationMs: Date.now() - startTime,
    });
  }

  checkStatus(verificationId: string): Promise<Result<VerificationResult, Error>> {
    const result = this.mockResults.get(verificationId);

    if (!result) {
      return Promise.resolve(
        failure(new Error(`Verification ${verificationId} not found in mock provider`))
      );
    }

    // If pending, simulate completion after first check
    if (result.status === 'pending' && !this.simulateFailure) {
      const updatedResult: VerificationResult = {
        ...result,
        status: 'verified',
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        resultHash: this.hashResult({
          ...result,
          status: 'verified',
          verifiedAt: new Date().toISOString(),
        }),
      };
      this.mockResults.set(verificationId, updatedResult);
      return Promise.resolve(success(updatedResult));
    }

    return Promise.resolve(success(result));
  }

  getVerificationUrl(verificationId: string): Promise<Result<string, Error>> {
    const result = this.mockResults.get(verificationId);

    if (!result) {
      return Promise.resolve(
        failure(new Error(`Verification ${verificationId} not found in mock provider`))
      );
    }

    // Return a mock URL that would redirect to verification flow
    return Promise.resolve(
      success(`https://verify.mock.realriches.com/v/${verificationId}?mode=sandbox`)
    );
  }

  // ============================================================================
  // Test Helpers
  // ============================================================================

  /**
   * Clear all stored mock results (for testing)
   */
  clearResults(): void {
    this.mockResults.clear();
  }

  /**
   * Set failure simulation (for testing)
   */
  setSimulateFailure(value: boolean): void {
    this.simulateFailure = value;
  }

  /**
   * Set pending simulation (for testing)
   */
  setSimulatePending(value: boolean): void {
    this.simulatePending = value;
  }

  /**
   * Get stored result by ID (for testing)
   */
  getStoredResult(verificationId: string): VerificationResult | undefined {
    return this.mockResults.get(verificationId);
  }
}
