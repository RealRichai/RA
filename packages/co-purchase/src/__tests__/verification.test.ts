/**
 * Verification Adapter Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MockVerificationProvider,
  type VerificationRequest,
} from '../verification';

describe('MockVerificationProvider', () => {
  let provider: MockVerificationProvider;

  beforeEach(() => {
    provider = new MockVerificationProvider({ enabled: true });
    provider.clearResults();
  });

  describe('isAvailable', () => {
    it('should return true when enabled', () => {
      expect(provider.isAvailable()).toBe(true);
    });

    it('should return false when disabled', () => {
      const disabledProvider = new MockVerificationProvider({ enabled: false });
      expect(disabledProvider.isAvailable()).toBe(false);
    });
  });

  describe('validateCredentials', () => {
    it('should always return true for mock provider', async () => {
      const result = await provider.validateCredentials();
      expect(result).toBe(true);
    });
  });

  describe('initiateVerification', () => {
    const mockRequest: VerificationRequest = {
      userId: 'user-123',
      groupId: 'group-456',
      memberId: 'member-789',
      level: 'standard',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
    };

    it('should return success result by default', async () => {
      const result = await provider.initiateVerification(mockRequest);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.providerId).toBe('mock');
        expect(result.value.success).toBe(true);
        expect(result.value.result.status).toBe('verified');
        expect(result.value.result.verificationId).toMatch(/^verif_/);
      }
    });

    it('should generate result hash', async () => {
      const result = await provider.initiateVerification(mockRequest);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.result.resultHash).toBeDefined();
        expect(result.value.result.resultHash.length).toBe(64); // SHA-256 hex
      }
    });

    it('should set verified timestamp', async () => {
      const result = await provider.initiateVerification(mockRequest);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.result.verifiedAt).toBeInstanceOf(Date);
      }
    });

    it('should set expiry date', async () => {
      const result = await provider.initiateVerification(mockRequest);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.result.expiresAt).toBeInstanceOf(Date);
        // Should be about 1 year in the future
        const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        const expiryDiff = Math.abs(
          result.value.result.expiresAt!.getTime() - oneYearFromNow.getTime()
        );
        expect(expiryDiff).toBeLessThan(60000); // Within 1 minute
      }
    });

    it('should record duration', async () => {
      const result = await provider.initiateVerification(mockRequest);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle simulated failure', async () => {
      provider.setSimulateFailure(true);
      const result = await provider.initiateVerification(mockRequest);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(false);
        expect(result.value.result.status).toBe('failed');
        expect(result.value.result.failureReason).toBeDefined();
      }
    });

    it('should handle simulated pending', async () => {
      provider.setSimulatePending(true);
      const result = await provider.initiateVerification(mockRequest);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.result.status).toBe('pending');
        expect(result.value.result.verifiedAt).toBeUndefined();
      }
    });
  });

  describe('checkStatus', () => {
    it('should return stored result', async () => {
      const request: VerificationRequest = {
        userId: 'user-123',
        groupId: 'group-456',
        memberId: 'member-789',
        level: 'standard',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      };

      const initResult = await provider.initiateVerification(request);
      expect(initResult.ok).toBe(true);
      if (!initResult.ok) return;

      const verificationId = initResult.value.result.verificationId;
      const statusResult = await provider.checkStatus(verificationId);

      expect(statusResult.ok).toBe(true);
      if (statusResult.ok) {
        expect(statusResult.value.verificationId).toBe(verificationId);
        expect(statusResult.value.status).toBe('verified');
      }
    });

    it('should return error for unknown verification', async () => {
      const result = await provider.checkStatus('unknown-id');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not found');
      }
    });

    it('should transition pending to verified on check', async () => {
      provider.setSimulatePending(true);

      const request: VerificationRequest = {
        userId: 'user-123',
        groupId: 'group-456',
        memberId: 'member-789',
        level: 'standard',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      };

      const initResult = await provider.initiateVerification(request);
      expect(initResult.ok).toBe(true);
      if (!initResult.ok) return;

      expect(initResult.value.result.status).toBe('pending');

      const verificationId = initResult.value.result.verificationId;
      const statusResult = await provider.checkStatus(verificationId);

      expect(statusResult.ok).toBe(true);
      if (statusResult.ok) {
        expect(statusResult.value.status).toBe('verified');
        expect(statusResult.value.verifiedAt).toBeInstanceOf(Date);
      }
    });
  });

  describe('getVerificationUrl', () => {
    it('should return mock verification URL', async () => {
      const request: VerificationRequest = {
        userId: 'user-123',
        groupId: 'group-456',
        memberId: 'member-789',
        level: 'standard',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      };

      const initResult = await provider.initiateVerification(request);
      expect(initResult.ok).toBe(true);
      if (!initResult.ok) return;

      const urlResult = await provider.getVerificationUrl(
        initResult.value.result.verificationId
      );

      expect(urlResult.ok).toBe(true);
      if (urlResult.ok) {
        expect(urlResult.value).toContain('verify.mock.realriches.com');
        expect(urlResult.value).toContain('sandbox');
      }
    });

    it('should return error for unknown verification', async () => {
      const result = await provider.getVerificationUrl('unknown-id');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not found');
      }
    });
  });

  describe('No PII Storage', () => {
    /**
     * CRITICAL: Verification results should NOT store any PII.
     * Only IDs and hashes should be stored.
     */
    it('should not store firstName in result', async () => {
      const request: VerificationRequest = {
        userId: 'user-123',
        groupId: 'group-456',
        memberId: 'member-789',
        level: 'standard',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        dateOfBirth: '1990-01-01',
      };

      const result = await provider.initiateVerification(request);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const stored = provider.getStoredResult(result.value.result.verificationId);
      expect(stored).toBeDefined();

      // Result should NOT contain any PII fields
      const resultJson = JSON.stringify(stored);
      expect(resultJson).not.toContain('John');
      expect(resultJson).not.toContain('Doe');
      expect(resultJson).not.toContain('john@example.com');
      expect(resultJson).not.toContain('555-1234');
      expect(resultJson).not.toContain('1990-01-01');
    });
  });
});
