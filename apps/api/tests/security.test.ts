/**
 * Security Tests
 *
 * Baseline security tests for the API:
 * - Audit logging verification
 * - Response envelope conformance
 * - Sensitive data sanitization
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sanitizeForAuditTest, extractEntityInfoTest } from './helpers/audit-helpers';
import { success, error, ErrorCodes } from '../src/lib/response';

describe('Response Envelope', () => {
  describe('success()', () => {
    it('should create a success response with data', () => {
      const data = { id: 1, name: 'Test' };
      const response = success(data);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response).not.toHaveProperty('error');
    });

    it('should include meta when provided', () => {
      const data = [{ id: 1 }];
      const meta = { page: 1, limit: 10, total: 100 };
      const response = success(data, meta);

      expect(response.success).toBe(true);
      expect(response.meta).toEqual(meta);
    });

    it('should handle null data', () => {
      const response = success(null);

      expect(response.success).toBe(true);
      expect(response.data).toBeNull();
    });
  });

  describe('error()', () => {
    it('should create an error response with code and message', () => {
      const response = error('TEST_ERROR', 'Something went wrong');

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('TEST_ERROR');
      expect(response.error.message).toBe('Something went wrong');
      expect(response.timestamp).toBeDefined();
    });

    it('should include details when provided', () => {
      const details = { field: 'email', reason: 'invalid format' };
      const response = error('VALIDATION_ERROR', 'Invalid input', details);

      expect(response.error.details).toEqual(details);
    });

    it('should not include stack in production', () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';

      const response = error('ERROR', 'message', undefined, 'stack trace');

      expect(response.error.stack).toBeUndefined();

      process.env['NODE_ENV'] = originalEnv;
    });
  });

  describe('ErrorCodes', () => {
    it('should have required authentication error codes', () => {
      expect(ErrorCodes.AUTH_REQUIRED).toBe('AUTH_REQUIRED');
      expect(ErrorCodes.AUTH_TOKEN_INVALID).toBe('AUTH_TOKEN_INVALID');
      expect(ErrorCodes.AUTH_TOKEN_EXPIRED).toBe('AUTH_TOKEN_EXPIRED');
      expect(ErrorCodes.FORBIDDEN).toBe('FORBIDDEN');
    });

    it('should have required resource error codes', () => {
      expect(ErrorCodes.RESOURCE_NOT_FOUND).toBe('RESOURCE_NOT_FOUND');
      expect(ErrorCodes.RESOURCE_CONFLICT).toBe('RESOURCE_CONFLICT');
    });

    it('should have required business logic error codes', () => {
      expect(ErrorCodes.COMPLIANCE_VIOLATION).toBe('COMPLIANCE_VIOLATION');
      expect(ErrorCodes.MARKET_NOT_ENABLED).toBe('MARKET_NOT_ENABLED');
    });
  });
});

describe('Audit Logging Security', () => {
  describe('sanitizeForAudit()', () => {
    it('should redact password fields', () => {
      const data = {
        email: 'user@example.com',
        password: 'secret123',
        name: 'John',
      };
      const sanitized = sanitizeForAuditTest(data);

      expect(sanitized?.email).toBe('user@example.com');
      expect(sanitized?.password).toBe('[REDACTED]');
      expect(sanitized?.name).toBe('John');
    });

    it('should redact all sensitive field patterns', () => {
      const sensitiveData = {
        passwordHash: 'hash123',
        currentPassword: 'old',
        newPassword: 'new',
        confirmPassword: 'new',
        token: 'jwt-token',
        accessToken: 'access',
        refreshToken: 'refresh',
        secret: 'shhh',
        apiKey: 'key-123',
        ssn: '123-45-6789',
        creditCard: '4111111111111111',
        bankAccount: '123456789',
        encryptionKey: 'enc-key',
        mfaSecret: 'totp-secret',
        mfaCode: '123456',
      };
      const sanitized = sanitizeForAuditTest(sensitiveData);

      // All fields should be redacted
      Object.keys(sensitiveData).forEach((key) => {
        expect(sanitized?.[key]).toBe('[REDACTED]');
      });
    });

    it('should handle nested objects', () => {
      const data = {
        user: {
          email: 'test@example.com',
          password: 'secret',
        },
        metadata: {
          source: 'web',
        },
      };
      const sanitized = sanitizeForAuditTest(data);

      expect((sanitized?.user as Record<string, unknown>)?.email).toBe('test@example.com');
      expect((sanitized?.user as Record<string, unknown>)?.password).toBe('[REDACTED]');
      expect((sanitized?.metadata as Record<string, unknown>)?.source).toBe('web');
    });

    it('should handle null and undefined', () => {
      expect(sanitizeForAuditTest(null)).toBeNull();
      expect(sanitizeForAuditTest(undefined)).toBeNull();
    });

    it('should preserve non-sensitive data', () => {
      const data = {
        id: 'uuid-123',
        email: 'user@example.com',
        createdAt: '2024-01-01T00:00:00Z',
        status: 'active',
        amount: 1000,
        isActive: true,
      };
      const sanitized = sanitizeForAuditTest(data);

      expect(sanitized).toEqual(data);
    });
  });

  describe('extractEntityInfo()', () => {
    it('should extract entity type from API URL', () => {
      const result = extractEntityInfoTest('/api/v1/properties/123', { id: '123' }, {});

      expect(result?.entityType).toBe('properties');
      expect(result?.entityId).toBe('123');
    });

    it('should use "new" for POST without ID', () => {
      const result = extractEntityInfoTest('/api/v1/users', {}, { email: 'new@user.com' });

      expect(result?.entityType).toBe('users');
      expect(result?.entityId).toBe('new');
    });

    it('should return null for non-v1 URLs', () => {
      const result = extractEntityInfoTest('/health', {}, {});

      expect(result).toBeNull();
    });
  });
});

describe('Security Headers', () => {
  it('should define expected security error codes', () => {
    // Verify all OWASP-related error codes exist
    expect(ErrorCodes.AUTH_REQUIRED).toBeDefined();
    expect(ErrorCodes.FORBIDDEN).toBeDefined();
    expect(ErrorCodes.RATE_LIMIT_EXCEEDED).toBeDefined();
    expect(ErrorCodes.VALIDATION_ERROR).toBeDefined();
  });
});
