/**
 * PII Detector
 *
 * Detects personally identifiable information in text using regex patterns.
 */

import type { RedactionType, DetectedPII } from './types';

// =============================================================================
// Regex Patterns for PII Detection
// =============================================================================

const PATTERNS: Record<string, RegExp> = {
  // Email addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  // Phone numbers (various US formats)
  phone:
    /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,

  // Social Security Numbers (with validation to exclude invalid patterns)
  // SSN cannot start with 000, 666, or 9xx; middle cannot be 00; last cannot be 0000
  ssn: /\b(?!000|666|9\d{2})\d{3}[-\s]?(?!00)\d{2}[-\s]?(?!0000)\d{4}\b/g,

  // Credit card numbers (Visa, MasterCard, Amex, Discover, etc.) - with optional separators
  credit_card:
    /\b(?:4[0-9]{3}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}|4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{2}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}|5[1-5][0-9]{14}|3[47][0-9]{2}[-\s]?[0-9]{6}[-\s]?[0-9]{5}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12}|3(?:0[0-5]|[68][0-9])[0-9]{11}|(?:2131|1800|35\d{3})\d{11})\b/g,

  // Bank account numbers (8-17 digits, basic pattern)
  bank_account: /\b[0-9]{8,17}\b/g,

  // Date of birth (MM/DD/YYYY or MM-DD-YYYY formats)
  date_of_birth:
    /\b(?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12][0-9]|3[01])[-/](?:19|20)\d{2}\b/g,

  // Street addresses (simplified pattern)
  address:
    /\b\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|circle|cir|place|pl)\.?\s*(?:,?\s*(?:apt|apartment|suite|ste|unit|#)\.?\s*\d+)?(?:,?\s*[\w\s]+,?\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?)?/gi,
};

// =============================================================================
// PII Detector Class
// =============================================================================

/**
 * Detects PII in text using pattern matching.
 */
export class PIIDetector {
  private customPatterns: Map<string, RegExp> = new Map();

  /**
   * Add a custom pattern for detection.
   */
  addCustomPattern(name: string, pattern: RegExp): void {
    this.customPatterns.set(name, pattern);
  }

  /**
   * Remove a custom pattern.
   */
  removeCustomPattern(name: string): boolean {
    return this.customPatterns.delete(name);
  }

  /**
   * Detect all PII in the given text.
   */
  detect(text: string): DetectedPII[] {
    const results: DetectedPII[] = [];

    // Check standard patterns
    for (const [type, pattern] of Object.entries(PATTERNS)) {
      const matches = this.findMatches(text, pattern, type as RedactionType);
      results.push(...matches);
    }

    // Check custom patterns
    for (const [name, pattern] of this.customPatterns) {
      const matches = this.findMatches(text, pattern, 'custom', name);
      results.push(...matches);
    }

    // Sort by start index and remove overlaps
    return this.removeOverlaps(
      results.sort((a, b) => a.startIndex - b.startIndex)
    );
  }

  /**
   * Detect specific types of PII.
   */
  detectTypes(text: string, types: RedactionType[]): DetectedPII[] {
    const results: DetectedPII[] = [];

    for (const type of types) {
      if (type === 'custom') {
        // Handle custom patterns
        for (const [, pattern] of this.customPatterns) {
          const matches = this.findMatches(text, pattern, 'custom');
          results.push(...matches);
        }
      } else {
        const pattern = PATTERNS[type];
        if (pattern) {
          const matches = this.findMatches(text, pattern, type);
          results.push(...matches);
        }
      }
    }

    return this.removeOverlaps(
      results.sort((a, b) => a.startIndex - b.startIndex)
    );
  }

  /**
   * Find all matches for a pattern in text.
   */
  private findMatches(
    text: string,
    pattern: RegExp,
    type: RedactionType,
    _customName?: string
  ): DetectedPII[] {
    const results: DetectedPII[] = [];
    // Create a new regex to avoid lastIndex issues
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Validate the match based on type
      if (this.validateMatch(type, match[0])) {
        results.push({
          type,
          value: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          confidence: this.calculateConfidence(type, match[0]),
        });
      }
    }

    return results;
  }

  /**
   * Validate a match based on its type.
   */
  private validateMatch(type: RedactionType, value: string): boolean {
    switch (type) {
      case 'credit_card':
        // Validate with Luhn algorithm
        return this.luhnCheck(value.replace(/\D/g, ''));
      case 'ssn':
        // Additional SSN validation
        return this.validateSSN(value);
      case 'bank_account': {
        // Filter out common false positives (too short or likely other numbers)
        const digits = value.replace(/\D/g, '');
        return digits.length >= 8 && digits.length <= 17;
      }
      default:
        return true;
    }
  }

  /**
   * Validate SSN format.
   */
  private validateSSN(value: string): boolean {
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 9) return false;

    // Area number (first 3 digits) cannot be 000, 666, or 900-999
    const area = parseInt(digits.slice(0, 3), 10);
    if (area === 0 || area === 666 || area >= 900) return false;

    // Group number (middle 2 digits) cannot be 00
    const group = parseInt(digits.slice(3, 5), 10);
    if (group === 0) return false;

    // Serial number (last 4 digits) cannot be 0000
    const serial = parseInt(digits.slice(5, 9), 10);
    if (serial === 0) return false;

    return true;
  }

  /**
   * Calculate confidence score for a match.
   */
  private calculateConfidence(type: RedactionType, value: string): number {
    switch (type) {
      case 'email':
        // Higher confidence for well-formed emails
        return 0.95;
      case 'ssn':
        // Higher confidence if formatted with dashes
        return value.includes('-') ? 0.95 : 0.85;
      case 'credit_card':
        // Higher confidence if Luhn check passes
        return this.luhnCheck(value.replace(/\D/g, '')) ? 0.95 : 0.7;
      case 'phone':
        // Higher confidence for formatted numbers
        return /\(\d{3}\)|\d{3}-\d{3}-\d{4}/.test(value) ? 0.9 : 0.8;
      case 'address':
        // Lower confidence due to pattern complexity
        return 0.75;
      case 'bank_account':
        // Lower confidence due to high false positive rate
        return 0.6;
      case 'date_of_birth':
        return 0.85;
      default:
        return 0.8;
    }
  }

  /**
   * Luhn algorithm for credit card validation.
   */
  private luhnCheck(num: string): boolean {
    if (!/^\d+$/.test(num)) return false;

    let sum = 0;
    let isEven = false;

    for (let i = num.length - 1; i >= 0; i--) {
      let digit = parseInt(num[i]!, 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }

  /**
   * Remove overlapping matches, keeping the one with higher confidence.
   */
  private removeOverlaps(sorted: DetectedPII[]): DetectedPII[] {
    if (sorted.length === 0) return [];

    const result: DetectedPII[] = [sorted[0]!];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]!;
      const last = result[result.length - 1]!;

      if (current.startIndex >= last.endIndex) {
        // No overlap
        result.push(current);
      } else if (current.confidence > last.confidence) {
        // Overlap, keep higher confidence
        result[result.length - 1] = current;
      }
      // Otherwise, keep the existing one (ignore current)
    }

    return result;
  }
}

// Default detector instance
export const defaultDetector = new PIIDetector();
