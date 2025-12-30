/**
 * Redaction Types
 *
 * Types for PII detection and redaction.
 */

import { z } from 'zod';

// =============================================================================
// Redaction Types
// =============================================================================

export const RedactionTypeSchema = z.enum([
  'email',
  'phone',
  'ssn',
  'address',
  'credit_card',
  'bank_account',
  'date_of_birth',
  'passport',
  'drivers_license',
  'name',
  'custom',
]);
export type RedactionType = z.infer<typeof RedactionTypeSchema>;

// =============================================================================
// Redaction Entry
// =============================================================================

export const RedactionEntrySchema = z.object({
  /** Type of PII detected */
  type: RedactionTypeSchema,
  /** Original text that was redacted */
  original: z.string(),
  /** Placeholder that replaced the original */
  redacted: z.string(),
  /** Start index in original text */
  startIndex: z.number().int().min(0),
  /** End index in original text */
  endIndex: z.number().int().min(0),
  /** Confidence score (0-1) */
  confidence: z.number().min(0).max(1),
});
export type RedactionEntry = z.infer<typeof RedactionEntrySchema>;

// =============================================================================
// Redaction Report
// =============================================================================

export const RedactionReportSchema = z.object({
  /** Unique identifier for this report */
  id: z.string().uuid(),
  /** SHA-256 hash of original content (for audit without storing PII) */
  originalHash: z.string(),
  /** Redacted content */
  redactedContent: z.string(),
  /** All redaction entries */
  entries: z.array(RedactionEntrySchema),
  /** Total number of redactions made */
  totalRedactions: z.number().int().min(0),
  /** When the redaction was performed */
  createdAt: z.coerce.date(),
});
export type RedactionReport = z.infer<typeof RedactionReportSchema>;

// =============================================================================
// Redacted Content
// =============================================================================

export const RedactedContentSchema = z.object({
  /** The redacted content */
  content: z.string(),
  /** Full redaction report */
  report: RedactionReportSchema,
});
export type RedactedContent = z.infer<typeof RedactedContentSchema>;

// =============================================================================
// Configuration
// =============================================================================

export interface RedactionConfig {
  /** Enable email address redaction */
  enableEmailRedaction: boolean;
  /** Enable phone number redaction */
  enablePhoneRedaction: boolean;
  /** Enable SSN redaction */
  enableSSNRedaction: boolean;
  /** Enable address redaction */
  enableAddressRedaction: boolean;
  /** Enable credit card number redaction */
  enableCreditCardRedaction: boolean;
  /** Enable bank account number redaction */
  enableBankAccountRedaction: boolean;
  /** Custom patterns for additional redaction */
  customPatterns?: Array<{
    name: string;
    pattern: RegExp;
    replacement: string;
  }>;
}

export const DEFAULT_REDACTION_CONFIG: RedactionConfig = {
  enableEmailRedaction: true,
  enablePhoneRedaction: true,
  enableSSNRedaction: true,
  enableAddressRedaction: true,
  enableCreditCardRedaction: true,
  enableBankAccountRedaction: true,
};

// =============================================================================
// Detected PII
// =============================================================================

export interface DetectedPII {
  type: RedactionType;
  value: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}
