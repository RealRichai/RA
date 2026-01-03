/**
 * Locale-Aware Formatting Tests
 *
 * Tests for currency, date, and number formatting with locale awareness.
 */

import { describe, it, expect } from 'vitest';

import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatRelativeTime,
} from '../lib/formatting';

describe('Formatting Utilities', () => {
  describe('formatCurrency', () => {
    it('should format USD for English locale', () => {
      const result = formatCurrency(1234.56, 'en');
      expect(result).toMatch(/\$1,234\.56/);
    });

    it('should format USD for Spanish locale', () => {
      const result = formatCurrency(1234.56, 'es');
      // Spanish format varies: "1234,56 US$" or "1.234,56 US$"
      expect(result).toMatch(/1\.?234[,.]56.*US\$|US\$.*1\.?234[,.]56/);
    });

    it('should format EUR for French locale', () => {
      const result = formatCurrency(1234.56, 'fr');
      // French uses EUR and formats with space as thousands separator
      expect(result).toMatch(/1[\s\u202f]?234,56\s?€|€\s?1[\s\u202f]?234,56/);
    });

    it('should handle zero amounts', () => {
      expect(formatCurrency(0, 'en')).toMatch(/\$0/);
    });

    it('should handle large amounts', () => {
      const result = formatCurrency(1000000, 'en');
      expect(result).toMatch(/\$1,000,000/);
    });
  });

  describe('formatDate', () => {
    const testDate = new Date('2024-03-15T12:00:00Z');

    it('should format date in English locale', () => {
      const result = formatDate(testDate, 'en');
      expect(result).toMatch(/Mar\s+15,?\s+2024/);
    });

    it('should format date in Spanish locale', () => {
      const result = formatDate(testDate, 'es');
      // Spanish: "15 mar 2024" or similar
      expect(result).toMatch(/15.*mar|mar.*15/i);
    });

    it('should format date in French locale', () => {
      const result = formatDate(testDate, 'fr');
      // French: "15 mars 2024" or similar
      expect(result).toMatch(/15.*mars|mars.*15/i);
    });

    it('should accept custom date options', () => {
      const result = formatDate(testDate, 'en', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
      expect(result).toMatch(/Friday.*March|March.*15/i);
    });

    it('should handle string dates', () => {
      const result = formatDate('2024-03-15', 'en');
      expect(result).toMatch(/Mar\s+1[45],?\s+2024/);
    });
  });

  describe('formatNumber', () => {
    it('should format numbers with English separators', () => {
      const result = formatNumber(1234567.89, 'en');
      expect(result).toBe('1,234,567.89');
    });

    it('should format numbers with Spanish separators', () => {
      const result = formatNumber(1234567.89, 'es');
      // Spanish uses different separators
      expect(result).toMatch(/1[.,]234[.,]567[.,]89/);
    });

    it('should format numbers with French separators', () => {
      const result = formatNumber(1234567.89, 'fr');
      // French uses space as thousands separator and comma for decimal
      expect(result).toMatch(/1[\s\u202f]?234[\s\u202f]?567,89/);
    });

    it('should handle decimal precision options', () => {
      const result = formatNumber(1234.5, 'en', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      expect(result).toBe('1,234.50');
    });
  });

  describe('formatPercent', () => {
    it('should format percentage in English', () => {
      const result = formatPercent(75, 'en');
      expect(result).toMatch(/75%/);
    });

    it('should format percentage in French', () => {
      const result = formatPercent(75, 'fr');
      // French puts space before %
      expect(result).toMatch(/75\s?%/);
    });

    it('should handle decimal percentages', () => {
      const result = formatPercent(33.33, 'en');
      expect(result).toMatch(/33\.3%|33%/);
    });
  });

  describe('formatRelativeTime', () => {
    it('should format recent time as seconds ago', () => {
      const now = new Date();
      const thirtySecondsAgo = new Date(now.getTime() - 30000);
      const result = formatRelativeTime(thirtySecondsAgo, 'en');
      expect(result).toMatch(/second|now/i);
    });

    it('should format as minutes ago', () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const result = formatRelativeTime(fiveMinutesAgo, 'en');
      expect(result).toMatch(/5.*minute|minute.*5/i);
    });

    it('should format as hours ago', () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const result = formatRelativeTime(twoHoursAgo, 'en');
      expect(result).toMatch(/2.*hour|hour.*2/i);
    });

    it('should format in French', () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const result = formatRelativeTime(twoHoursAgo, 'fr');
      expect(result).toMatch(/heure|il y a/i);
    });
  });
});
