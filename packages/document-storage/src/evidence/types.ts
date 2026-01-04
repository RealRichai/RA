/**
 * Vault Evidence Types
 *
 * Types for SOC2-compliant evidence logging.
 */

import { z } from 'zod';

// =============================================================================
// Event Types
// =============================================================================

export type VaultEvidenceEventType =
  | 'UPLOAD'
  | 'DOWNLOAD'
  | 'VIEW'
  | 'DELETE'
  | 'ACL_CHECK'
  | 'SHARE'
  | 'UPSELL_VIEW'
  | 'UPSELL_CONVERT'
  | 'UPSELL_DISMISS';

export type VaultEvidenceOutcome = 'SUCCESS' | 'DENIED' | 'FAILED';

// =============================================================================
// SOC2 Control IDs
// =============================================================================

export const SOC2_CONTROL_IDS = {
  // Logical Access Controls
  'CC6.1': 'Logical Access Security', // User authentication and authorization
  'CC6.2': 'User Registration and Authorization', // New user provisioning
  'CC6.3': 'User Access Removal', // Deprovisioning
  'CC6.6': 'Logical Access to Data', // Data access controls
  'CC6.7': 'Logical Access to System Configuration', // System config access

  // System Operations
  'CC7.1': 'Vulnerability Detection', // Security monitoring
  'CC7.2': 'Security Event Monitoring', // Logging and alerting
  'CC7.4': 'Incident Response', // Security incident handling

  // Change Management
  'CC8.1': 'Change Control Processes', // Infrastructure changes

  // Risk Mitigation
  'CC9.2': 'Vendor Management', // Third-party risk
} as const;

export type SOC2ControlId = keyof typeof SOC2_CONTROL_IDS;

// =============================================================================
// Evidence Record
// =============================================================================

export interface VaultEvidenceRecord {
  // Event identification
  eventType: VaultEvidenceEventType;
  eventOutcome: VaultEvidenceOutcome;
  controlId: SOC2ControlId;

  // Entity context
  propertyId: string;
  vaultId?: string;
  documentId?: string;

  // Actor context
  actorUserId: string;
  actorRole: string;
  actorEmail: string;

  // Request context
  resourcePath: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;

  // Additional metadata (sanitized - no PII)
  metadata?: Record<string, unknown>;
}

export interface StoredVaultEvidence extends VaultEvidenceRecord {
  id: string;
  timestamp: Date;
}

// =============================================================================
// Query Options
// =============================================================================

export interface EvidenceQueryOptions {
  propertyId?: string;
  vaultId?: string;
  actorUserId?: string;
  eventType?: VaultEvidenceEventType;
  controlId?: SOC2ControlId;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// =============================================================================
// Zod Schemas
// =============================================================================

export const VaultEvidenceEventTypeSchema = z.enum([
  'UPLOAD',
  'DOWNLOAD',
  'VIEW',
  'DELETE',
  'ACL_CHECK',
  'SHARE',
  'UPSELL_VIEW',
  'UPSELL_CONVERT',
  'UPSELL_DISMISS',
]);

export const VaultEvidenceOutcomeSchema = z.enum(['SUCCESS', 'DENIED', 'FAILED']);

export const SOC2ControlIdSchema = z.enum([
  'CC6.1',
  'CC6.2',
  'CC6.3',
  'CC6.6',
  'CC6.7',
  'CC7.1',
  'CC7.2',
  'CC7.4',
  'CC8.1',
  'CC9.2',
]);

export const VaultEvidenceRecordSchema = z.object({
  eventType: VaultEvidenceEventTypeSchema,
  eventOutcome: VaultEvidenceOutcomeSchema,
  controlId: SOC2ControlIdSchema,
  propertyId: z.string().uuid(),
  vaultId: z.string().uuid().optional(),
  documentId: z.string().uuid().optional(),
  actorUserId: z.string().uuid(),
  actorRole: z.string(),
  actorEmail: z.string().email(),
  resourcePath: z.string(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  requestId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// =============================================================================
// PII Sanitization
// =============================================================================

const PII_PATTERNS = [
  /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g, // SSN
  /\b\d{16}\b/g, // Credit card
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, // Email
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // Phone
];

/**
 * Sanitize metadata to remove potential PII
 */
export function sanitizeMetadata(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    // Skip known PII fields
    if (['ssn', 'socialSecurity', 'creditCard', 'phone', 'email'].includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    if (typeof value === 'string') {
      let sanitizedValue = value;
      for (const pattern of PII_PATTERNS) {
        sanitizedValue = sanitizedValue.replace(pattern, '[REDACTED]');
      }
      sanitized[key] = sanitizedValue;
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
