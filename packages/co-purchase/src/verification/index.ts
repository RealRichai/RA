/**
 * Verification module
 *
 * Identity verification adapters for co-purchase group members.
 * Stores only verification IDs and result hashes - NO PII.
 */

export {
  type VerificationProviderType,
  type VerificationRequest,
  type VerificationResult,
  type VerificationResponse,
  type IVerificationProvider,
  type BaseVerificationProviderConfig,
  type Result,
  success,
  failure,
  BaseVerificationProvider,
  VerificationProviderError,
  VerificationTimeoutError,
  VerificationRateLimitError,
} from './provider-interface';

export {
  MockVerificationProvider,
  type MockVerificationProviderConfig,
} from './mock-provider';
