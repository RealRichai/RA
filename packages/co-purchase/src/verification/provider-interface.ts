/**
 * Verification Provider Interface
 *
 * Defines the contract for identity verification providers.
 * Store only verification IDs and result hashes - NO PII.
 */

import { createHash } from 'crypto';
import { z } from 'zod';
import { VerificationLevelSchema, type VerificationLevel, type VerificationStatus } from '../types';

// ============================================================================
// Types
// ============================================================================

export type VerificationProviderType = 'mock' | 'persona' | 'plaid_idv' | 'jumio' | 'onfido';

export interface VerificationRequest {
  userId: string;
  groupId: string;
  memberId: string;
  level: VerificationLevel;
  /** First name - used for verification, NOT stored */
  firstName: string;
  /** Last name - used for verification, NOT stored */
  lastName: string;
  /** Email - used for verification, NOT stored */
  email: string;
  /** Phone - used for verification, NOT stored */
  phone?: string;
  /** Date of birth - used for verification, NOT stored */
  dateOfBirth?: string;
  /** Address - used for verification, NOT stored */
  address?: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  /** Callback URL for async verification completion */
  callbackUrl?: string;
}

export interface VerificationResult {
  /** Unique verification ID */
  verificationId: string;
  /** Current status */
  status: VerificationStatus;
  /** Verification level requested */
  level: VerificationLevel;
  /** SHA-256 hash of verification result (for evidence) */
  resultHash: string;
  /** External provider reference ID (NOT the full result) */
  externalRefId?: string;
  /** When verification was completed */
  verifiedAt?: Date;
  /** When verification expires */
  expiresAt?: Date;
  /** Reason for failure (if applicable) */
  failureReason?: string;
}

export interface VerificationResponse {
  /** Provider identifier */
  providerId: VerificationProviderType;
  /** Whether the operation succeeded */
  success: boolean;
  /** Verification result */
  result: VerificationResult;
  /** When the request was sent */
  sentAt: Date;
  /** Duration of the operation in ms */
  durationMs: number;
}

// ============================================================================
// Result Type (Railway-oriented programming)
// ============================================================================

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function success<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function failure<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ============================================================================
// Provider Interface
// ============================================================================

export interface IVerificationProvider {
  /** Provider identifier */
  readonly providerId: VerificationProviderType;

  /** Check if provider is configured and available */
  isAvailable(): boolean;

  /** Validate provider credentials/API keys */
  validateCredentials(): Promise<boolean>;

  /** Initiate a verification request */
  initiateVerification(
    request: VerificationRequest
  ): Promise<Result<VerificationResponse, Error>>;

  /** Check the status of an existing verification */
  checkStatus(verificationId: string): Promise<Result<VerificationResult, Error>>;

  /** Generate verification URL for user redirect (if applicable) */
  getVerificationUrl?(verificationId: string): Promise<Result<string, Error>>;
}

// ============================================================================
// Base Provider Config
// ============================================================================

export interface BaseVerificationProviderConfig {
  enabled: boolean;
  timeoutMs?: number;
  retryAttempts?: number;
}

// ============================================================================
// Provider Errors
// ============================================================================

export class VerificationProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider: VerificationProviderType,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'VerificationProviderError';
    Object.setPrototypeOf(this, VerificationProviderError.prototype);
  }
}

export class VerificationTimeoutError extends VerificationProviderError {
  constructor(provider: VerificationProviderType, timeoutMs: number) {
    super(
      `Verification request timed out after ${timeoutMs}ms`,
      'TIMEOUT',
      provider,
      true
    );
    this.name = 'VerificationTimeoutError';
  }
}

export class VerificationRateLimitError extends VerificationProviderError {
  constructor(provider: VerificationProviderType, retryAfterMs?: number) {
    super(
      `Rate limit exceeded${retryAfterMs ? `, retry after ${retryAfterMs}ms` : ''}`,
      'RATE_LIMIT',
      provider,
      true
    );
    this.name = 'VerificationRateLimitError';
  }
}

// ============================================================================
// Base Provider Class
// ============================================================================

export abstract class BaseVerificationProvider implements IVerificationProvider {
  abstract readonly providerId: VerificationProviderType;

  protected timeoutMs: number;
  protected retryAttempts: number;
  protected isConfigured: boolean = false;

  constructor(config: BaseVerificationProviderConfig) {
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.retryAttempts = config.retryAttempts ?? 3;
  }

  isAvailable(): boolean {
    return this.isConfigured;
  }

  abstract validateCredentials(): Promise<boolean>;
  abstract initiateVerification(
    request: VerificationRequest
  ): Promise<Result<VerificationResponse, Error>>;
  abstract checkStatus(verificationId: string): Promise<Result<VerificationResult, Error>>;

  /**
   * Hash verification result for evidence storage.
   * Store only the hash, not the actual PII.
   */
  protected hashResult(result: Record<string, unknown>): string {
    const normalized = JSON.stringify(result, Object.keys(result).sort());
    return createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Generate a prefixed ID
   */
  protected generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${prefix}_${timestamp}${random}`;
  }

  /**
   * Log with provider context
   */
  protected log(message: string, data?: Record<string, unknown>): void {
    // In production, this would use a proper logger
    console.debug(`[Verification:${this.providerId}] ${message}`, data);
  }
}
