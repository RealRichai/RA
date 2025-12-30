/**
 * Redaction Tests
 *
 * Tests for PII detection and redaction functionality.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { PIIDetector } from '../redaction/detector';
import { Redactor, getRedactor, resetRedactor } from '../redaction/redactor';

describe('PIIDetector', () => {
  let detector: PIIDetector;

  beforeEach(() => {
    detector = new PIIDetector();
  });

  describe('Email Detection', () => {
    it('should detect email addresses', () => {
      const text = 'Contact me at john.doe@example.com for more info.';
      const results = detector.detect(text);

      expect(results).toHaveLength(1);
      expect(results[0]?.type).toBe('email');
      expect(results[0]?.value).toBe('john.doe@example.com');
    });

    it('should detect multiple email addresses', () => {
      const text = 'Email john@test.com or jane@example.org';
      const results = detector.detect(text);

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.type)).toEqual(['email', 'email']);
    });
  });

  describe('Phone Detection', () => {
    it('should detect phone numbers with dashes', () => {
      const text = 'Call me at 555-123-4567';
      const results = detector.detect(text);

      expect(results).toHaveLength(1);
      expect(results[0]?.type).toBe('phone');
      expect(results[0]?.value).toBe('555-123-4567');
    });

    it('should detect phone numbers with dots', () => {
      const text = 'My number is 555.123.4567';
      const results = detector.detect(text);

      expect(results).toHaveLength(1);
      expect(results[0]?.type).toBe('phone');
    });

    it('should detect phone numbers with parentheses', () => {
      const text = 'Call (555) 123-4567';
      const results = detector.detect(text);

      expect(results).toHaveLength(1);
      expect(results[0]?.type).toBe('phone');
    });

    it('should detect phone numbers with country code', () => {
      const text = 'International: +1-555-123-4567';
      const results = detector.detect(text);

      expect(results).toHaveLength(1);
      expect(results[0]?.type).toBe('phone');
    });
  });

  describe('SSN Detection', () => {
    it('should detect SSN with dashes', () => {
      const text = 'SSN: 123-45-6789';
      const results = detector.detect(text);

      expect(results).toHaveLength(1);
      expect(results[0]?.type).toBe('ssn');
      expect(results[0]?.value).toBe('123-45-6789');
    });

    it('should detect SSN without dashes', () => {
      const text = 'SSN 123456789';
      const results = detector.detect(text);

      expect(results).toHaveLength(1);
      expect(results[0]?.type).toBe('ssn');
    });

    it('should not detect invalid SSN patterns', () => {
      // SSN cannot start with 000, 666, or 900-999
      const text = 'Not an SSN: 000-12-3456';
      const results = detector.detect(text);

      expect(results.filter((r) => r.type === 'ssn')).toHaveLength(0);
    });
  });

  describe('Credit Card Detection', () => {
    it('should detect Visa card numbers', () => {
      const text = 'Card: 4111-1111-1111-1111';
      const results = detector.detect(text);

      expect(results).toHaveLength(1);
      expect(results[0]?.type).toBe('credit_card');
    });

    it('should detect Mastercard numbers', () => {
      const text = 'Card: 5500 0000 0000 0004';
      const results = detector.detect(text);

      expect(results).toHaveLength(1);
      expect(results[0]?.type).toBe('credit_card');
    });

    it('should detect Amex card numbers', () => {
      const text = 'Amex: 378282246310005';
      const results = detector.detect(text);

      expect(results).toHaveLength(1);
      expect(results[0]?.type).toBe('credit_card');
    });

    it('should validate with Luhn algorithm', () => {
      // Invalid Luhn checksum
      const text = 'Invalid card: 4111-1111-1111-1112';
      const results = detector.detect(text);

      expect(results.filter((r) => r.type === 'credit_card')).toHaveLength(0);
    });
  });

  describe('Address Detection', () => {
    it('should detect street addresses', () => {
      const text = 'Send to 123 Main Street, New York';
      const results = detector.detect(text);

      expect(results).toHaveLength(1);
      expect(results[0]?.type).toBe('address');
    });

    it('should detect various street suffixes', () => {
      const texts = [
        '456 Oak Avenue',
        '789 Elm Boulevard',
        '101 Pine Road',
        '202 Maple Drive',
      ];

      texts.forEach((text) => {
        const results = detector.detect(text);
        expect(results.some((r) => r.type === 'address')).toBe(true);
      });
    });
  });

  describe('Multiple PII Types', () => {
    it('should detect multiple PII types in same text', () => {
      const text = `
        Contact: John Doe
        Email: john@example.com
        Phone: 555-123-4567
        Address: 123 Main St
        SSN: 123-45-6789
      `;
      const results = detector.detect(text);

      const types = results.map((r) => r.type);
      expect(types).toContain('email');
      expect(types).toContain('phone');
      expect(types).toContain('address');
      expect(types).toContain('ssn');
    });
  });
});

describe('Redactor', () => {
  let redactor: Redactor;

  beforeEach(() => {
    resetRedactor();
    redactor = getRedactor();
  });

  describe('redact()', () => {
    it('should redact email addresses', () => {
      const result = redactor.redact('Email me at john@example.com');

      expect(result.content).toBe('Email me at [EMAIL_REDACTED]');
      expect(result.report.totalRedactions).toBe(1);
      expect(result.report.entries[0]?.type).toBe('email');
    });

    it('should redact phone numbers', () => {
      const result = redactor.redact('Call 555-123-4567');

      expect(result.content).toBe('Call [PHONE_REDACTED]');
      expect(result.report.totalRedactions).toBe(1);
    });

    it('should redact SSN', () => {
      const result = redactor.redact('SSN: 123-45-6789');

      expect(result.content).toBe('SSN: [SSN_REDACTED]');
      expect(result.report.totalRedactions).toBe(1);
    });

    it('should redact credit cards', () => {
      const result = redactor.redact('Card: 4111-1111-1111-1111');

      expect(result.content).toBe('Card: [CREDIT_CARD_REDACTED]');
      expect(result.report.totalRedactions).toBe(1);
    });

    it('should redact addresses', () => {
      const result = redactor.redact('Visit us at 123 Main Street');

      expect(result.content).toBe('Visit us at [ADDRESS_REDACTED]');
      expect(result.report.totalRedactions).toBe(1);
    });

    it('should redact multiple PII instances', () => {
      const result = redactor.redact(
        'Email john@test.com or call 555-123-4567'
      );

      expect(result.content).toBe(
        'Email [EMAIL_REDACTED] or call [PHONE_REDACTED]'
      );
      expect(result.report.totalRedactions).toBe(2);
    });

    it('should generate unique report ID', () => {
      const result1 = redactor.redact('Test email@test.com');
      const result2 = redactor.redact('Test email2@test.com');

      expect(result1.report.id).not.toBe(result2.report.id);
    });

    it('should generate SHA-256 hash of original content', () => {
      const result = redactor.redact('Test email@test.com');

      expect(result.report.originalHash).toBeDefined();
      expect(result.report.originalHash).toHaveLength(64); // SHA-256 hex
    });

    it('should include redacted content in report', () => {
      const result = redactor.redact('Email john@test.com');

      expect(result.report.redactedContent).toBe('Email [EMAIL_REDACTED]');
    });
  });

  describe('redactMessages()', () => {
    it('should redact messages array', () => {
      const messages = [
        { role: 'user', content: 'My email is user@test.com' },
        { role: 'assistant', content: 'I noted your contact information.' },
        { role: 'user', content: 'Call me at 555-123-4567' },
      ];

      const result = redactor.redactMessages(messages);

      expect(result.messages[0]?.content).toBe(
        'My email is [EMAIL_REDACTED]'
      );
      expect(result.messages[2]?.content).toBe(
        'Call me at [PHONE_REDACTED]'
      );
      // Only messages with actual redactions generate reports
      expect(result.reports).toHaveLength(2);
    });

    it('should preserve message roles', () => {
      const messages = [
        { role: 'user', content: 'Test user@test.com' },
        { role: 'assistant', content: 'Test response' },
      ];

      const result = redactor.redactMessages(messages);

      expect(result.messages[0]?.role).toBe('user');
      expect(result.messages[1]?.role).toBe('assistant');
    });
  });

  describe('Configuration', () => {
    it('should respect enabled types configuration', () => {
      resetRedactor();
      const configuredRedactor = getRedactor({
        enableEmailRedaction: true,
        enablePhoneRedaction: false,
        enableSSNRedaction: true,
        enableAddressRedaction: true,
        enableCreditCardRedaction: true,
        enableBankAccountRedaction: true,
      });

      const result = configuredRedactor.redact(
        'Email john@test.com, phone 555-123-4567'
      );

      expect(result.content).toContain('[EMAIL_REDACTED]');
      expect(result.content).toContain('555-123-4567'); // Phone not redacted
    });

    it('should disable email redaction when configured', () => {
      resetRedactor();
      const configuredRedactor = getRedactor({
        enableEmailRedaction: false,
        enablePhoneRedaction: true,
        enableSSNRedaction: true,
        enableAddressRedaction: true,
        enableCreditCardRedaction: true,
        enableBankAccountRedaction: true,
      });

      const result = configuredRedactor.redact('Email john@test.com');

      expect(result.content).toBe('Email john@test.com');
    });
  });
});
