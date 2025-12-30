/**
 * Redactor
 *
 * Redacts PII from text and generates audit reports.
 */

import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

import { PIIDetector, defaultDetector } from './detector';
import type {
  RedactionConfig,
  RedactionReport,
  RedactedContent,
  RedactionEntry,
  RedactionType,
} from './types';
import { DEFAULT_REDACTION_CONFIG } from './types';

// =============================================================================
// Redaction Placeholders
// =============================================================================

const REDACTION_PLACEHOLDERS: Record<RedactionType, string> = {
  email: '[EMAIL_REDACTED]',
  phone: '[PHONE_REDACTED]',
  ssn: '[SSN_REDACTED]',
  address: '[ADDRESS_REDACTED]',
  credit_card: '[CREDIT_CARD_REDACTED]',
  bank_account: '[BANK_ACCOUNT_REDACTED]',
  date_of_birth: '[DOB_REDACTED]',
  passport: '[PASSPORT_REDACTED]',
  drivers_license: '[DL_REDACTED]',
  name: '[NAME_REDACTED]',
  custom: '[REDACTED]',
};

// =============================================================================
// Redactor Class
// =============================================================================

/**
 * Redacts PII from text and generates audit reports.
 */
export class Redactor {
  private detector: PIIDetector;
  private config: RedactionConfig;

  constructor(
    config: Partial<RedactionConfig> = {},
    detector?: PIIDetector
  ) {
    this.config = { ...DEFAULT_REDACTION_CONFIG, ...config };
    this.detector = detector || defaultDetector;

    // Register custom patterns
    if (config.customPatterns) {
      for (const custom of config.customPatterns) {
        this.detector.addCustomPattern(custom.name, custom.pattern);
      }
    }
  }

  /**
   * Redact PII from text and return redacted content with report.
   */
  redact(text: string): RedactedContent {
    const enabledTypes = this.getEnabledTypes();
    const detected = this.detector.detectTypes(text, enabledTypes);

    if (detected.length === 0) {
      return {
        content: text,
        report: this.createReport(text, text, []),
      };
    }

    // Build redacted text and entries
    const entries: RedactionEntry[] = [];
    let redactedText = '';
    let lastIndex = 0;
    let offset = 0;

    for (const pii of detected) {
      // Add text before this PII
      redactedText += text.slice(lastIndex, pii.startIndex);

      // Get placeholder for this type
      const placeholder = REDACTION_PLACEHOLDERS[pii.type] || '[REDACTED]';
      redactedText += placeholder;

      entries.push({
        type: pii.type,
        original: pii.value,
        redacted: placeholder,
        startIndex: pii.startIndex + offset,
        endIndex: pii.startIndex + offset + placeholder.length,
        confidence: pii.confidence,
      });

      offset += placeholder.length - pii.value.length;
      lastIndex = pii.endIndex;
    }

    // Add remaining text
    redactedText += text.slice(lastIndex);

    return {
      content: redactedText,
      report: this.createReport(text, redactedText, entries),
    };
  }

  /**
   * Redact multiple texts (e.g., messages in a conversation).
   */
  redactMessages<T extends { role: string; content: string }>(
    messages: T[]
  ): {
    messages: T[];
    reports: RedactionReport[];
  } {
    const reports: RedactionReport[] = [];
    const redactedMessages = messages.map((msg) => {
      const result = this.redact(msg.content);
      if (result.report.totalRedactions > 0) {
        reports.push(result.report);
      }
      return { ...msg, content: result.content };
    });

    return { messages: redactedMessages, reports };
  }

  /**
   * Check if text contains any PII.
   */
  containsPII(text: string): boolean {
    const enabledTypes = this.getEnabledTypes();
    const detected = this.detector.detectTypes(text, enabledTypes);
    return detected.length > 0;
  }

  /**
   * Get PII detection summary without redacting.
   */
  analyze(text: string): {
    hasPII: boolean;
    types: RedactionType[];
    count: number;
  } {
    const enabledTypes = this.getEnabledTypes();
    const detected = this.detector.detectTypes(text, enabledTypes);
    const types = [...new Set(detected.map((d) => d.type))];

    return {
      hasPII: detected.length > 0,
      types,
      count: detected.length,
    };
  }

  /**
   * Get the list of enabled redaction types based on config.
   */
  private getEnabledTypes(): RedactionType[] {
    const types: RedactionType[] = [];

    if (this.config.enableEmailRedaction) types.push('email');
    if (this.config.enablePhoneRedaction) types.push('phone');
    if (this.config.enableSSNRedaction) types.push('ssn');
    if (this.config.enableAddressRedaction) types.push('address');
    if (this.config.enableCreditCardRedaction) types.push('credit_card');
    if (this.config.enableBankAccountRedaction) types.push('bank_account');

    // Always include custom if there are custom patterns
    if (this.config.customPatterns && this.config.customPatterns.length > 0) {
      types.push('custom');
    }

    return types;
  }

  /**
   * Create a redaction report.
   */
  private createReport(
    original: string,
    redacted: string,
    entries: RedactionEntry[]
  ): RedactionReport {
    return {
      id: randomUUID(),
      originalHash: createHash('sha256').update(original).digest('hex'),
      redactedContent: redacted,
      entries,
      totalRedactions: entries.length,
      createdAt: new Date(),
    };
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

let defaultRedactor: Redactor | null = null;

/**
 * Get the default redactor instance.
 * Creates a new one with the provided config if config is provided.
 */
export function getRedactor(config?: Partial<RedactionConfig>): Redactor {
  if (!defaultRedactor || config) {
    defaultRedactor = new Redactor(config);
  }
  return defaultRedactor;
}

/**
 * Reset the default redactor instance.
 */
export function resetRedactor(): void {
  defaultRedactor = null;
}
