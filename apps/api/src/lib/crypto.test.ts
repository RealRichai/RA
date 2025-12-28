import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  hashWithSalt,
  verifyHash,
  generateToken,
  generateOTP,
  maskEmail,
  maskPhone,
  maskSSN,
  redactPII
} from './crypto.js';

describe('crypto', () => {
  describe('hashPassword', () => {
    it('should hash a password and return salt:hash format', async () => {
      const password = 'TestPassword123!';
      const result = await hashPassword(password);

      expect(result).toBeDefined();
      expect(result).toContain(':');

      const parts = result.split(':');
      expect(parts).toHaveLength(2);
      expect(parts[0].length).toBeGreaterThan(0); // salt
      expect(parts[1].length).toBeGreaterThan(0); // hash
    });

    it('should produce different hashes for same password (different salts)', async () => {
      const password = 'TestPassword123!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'TestPassword123!';
      const storedHash = await hashPassword(password);

      const isValid = await verifyPassword(password, storedHash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'TestPassword123!';
      const storedHash = await hashPassword(password);

      const isValid = await verifyPassword('WrongPassword!', storedHash);
      expect(isValid).toBe(false);
    });

    it('should return false for invalid hash format', async () => {
      const isValid = await verifyPassword('password', 'invalid-hash');
      expect(isValid).toBe(false);
    });
  });

  describe('hashWithSalt', () => {
    it('should hash text with generated salt', () => {
      const result = hashWithSalt('test');

      expect(result.hash).toBeDefined();
      expect(result.salt).toBeDefined();
      expect(result.hash.length).toBeGreaterThan(0);
      expect(result.salt.length).toBeGreaterThan(0);
    });

    it('should hash text with provided salt', () => {
      const salt = 'mysalt';
      const result = hashWithSalt('test', salt);

      expect(result.salt).toBe(salt);
      expect(result.hash).toBeDefined();
    });

    it('should produce same hash for same text and salt', () => {
      const salt = 'consistentsalt';
      const result1 = hashWithSalt('test', salt);
      const result2 = hashWithSalt('test', salt);

      expect(result1.hash).toBe(result2.hash);
    });
  });

  describe('verifyHash', () => {
    it('should verify correct hash', () => {
      const { hash, salt } = hashWithSalt('test');
      const isValid = verifyHash('test', hash, salt);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect text', () => {
      const { hash, salt } = hashWithSalt('test');
      const isValid = verifyHash('wrong', hash, salt);

      expect(isValid).toBe(false);
    });
  });

  describe('generateToken', () => {
    it('should generate token with default length', () => {
      const token = generateToken();
      expect(token.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('should generate token with custom length', () => {
      const token = generateToken(16);
      expect(token.length).toBe(32); // 16 bytes = 32 hex chars
    });

    it('should generate unique tokens', () => {
      const token1 = generateToken();
      const token2 = generateToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('generateOTP', () => {
    it('should generate OTP with default length', () => {
      const otp = generateOTP();
      expect(otp.length).toBe(6);
      expect(/^\d+$/.test(otp)).toBe(true);
    });

    it('should generate OTP with custom length', () => {
      const otp = generateOTP(8);
      expect(otp.length).toBe(8);
      expect(/^\d+$/.test(otp)).toBe(true);
    });
  });

  describe('maskEmail', () => {
    it('should mask email address', () => {
      expect(maskEmail('john@example.com')).toMatch(/^j\*+n@example.com$/);
      expect(maskEmail('ab@test.com')).toMatch(/^a\*@test.com$/);
    });

    it('should handle invalid email gracefully', () => {
      expect(maskEmail('invalid')).toBe('invalid');
    });
  });

  describe('maskPhone', () => {
    it('should mask phone number showing last 4 digits', () => {
      expect(maskEmail('+1234567890')).toBeDefined();
      const masked = maskPhone('+1234567890');
      expect(masked.endsWith('7890')).toBe(true);
    });

    it('should handle short numbers', () => {
      expect(maskPhone('123')).toBe('123');
    });
  });

  describe('maskSSN', () => {
    it('should mask SSN showing last 4 digits', () => {
      const masked = maskSSN('123-45-6789');
      expect(masked).toBe('***-**-6789');
    });
  });

  describe('redactPII', () => {
    it('should redact email addresses', () => {
      const text = 'Contact john@example.com for info';
      expect(redactPII(text)).toBe('Contact [EMAIL] for info');
    });

    it('should redact phone numbers', () => {
      const text = 'Call 555-123-4567';
      expect(redactPII(text)).toBe('Call [PHONE]');
    });

    it('should redact SSNs', () => {
      const text = 'SSN: 123-45-6789';
      expect(redactPII(text)).toBe('SSN: [SSN]');
    });

    it('should redact credit card numbers', () => {
      const text = 'Card: 1234 5678 9012 3456';
      expect(redactPII(text)).toBe('Card: [CARD]');
    });
  });
});
