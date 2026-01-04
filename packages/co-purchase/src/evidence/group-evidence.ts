/**
 * Co-Purchase Group Evidence Emitter
 *
 * Records evidence for group activities for SOC2 compliance.
 * Sanitizes PII before logging.
 */

// ============================================================================
// Evidence Types
// ============================================================================

export type GroupEventType =
  | 'group.created'
  | 'group.updated'
  | 'group.status_changed'
  | 'group.archived'
  | 'member.joined'
  | 'member.left'
  | 'member.role_changed'
  | 'member.disclaimer_accepted'
  | 'invitation.sent'
  | 'invitation.accepted'
  | 'invitation.declined'
  | 'invitation.expired'
  | 'invitation.revoked'
  | 'verification.initiated'
  | 'verification.completed'
  | 'verification.failed'
  | 'verification.expired'
  | 'document.uploaded'
  | 'document.deleted'
  | 'document.accessed'
  | 'checklist.item_added'
  | 'checklist.item_updated'
  | 'checklist.item_completed'
  | 'checklist.item_deleted'
  | 'blocked_action.attempted';

export type SOC2Category = 'Security' | 'Availability' | 'ProcessingIntegrity' | 'Confidentiality' | 'Privacy';

export type EvidenceOutcome = 'success' | 'failure' | 'blocked' | 'pending';

export interface GroupEvidenceInput {
  eventType: GroupEventType;
  groupId: string;
  actorId: string;
  outcome: EvidenceOutcome;
  details: Record<string, unknown>;
  organizationId?: string;
  tenantId?: string;
}

export interface GroupEvidenceRecord {
  controlId: string;
  category: SOC2Category;
  eventType: GroupEventType;
  eventOutcome: EvidenceOutcome;
  summary: string;
  scope: 'org' | 'tenant' | 'user';
  actorType: 'user' | 'system';
  actorId: string;
  organizationId?: string;
  tenantId?: string;
  details: {
    groupId: string;
    eventData: Record<string, unknown>;
  };
  occurredAt: Date;
  recordedAt: Date;
}

// ============================================================================
// Control ID Mapping
// ============================================================================

const CONTROL_ID_MAP: Record<GroupEventType, { controlId: string; category: SOC2Category }> = {
  'group.created': { controlId: 'CC6.1', category: 'Security' },
  'group.updated': { controlId: 'CC6.1', category: 'Security' },
  'group.status_changed': { controlId: 'CC6.1', category: 'Security' },
  'group.archived': { controlId: 'CC6.1', category: 'Security' },
  'member.joined': { controlId: 'CC6.1', category: 'Security' },
  'member.left': { controlId: 'CC6.1', category: 'Security' },
  'member.role_changed': { controlId: 'CC6.2', category: 'Security' },
  'member.disclaimer_accepted': { controlId: 'CC6.1', category: 'Security' },
  'invitation.sent': { controlId: 'CC6.3', category: 'Security' },
  'invitation.accepted': { controlId: 'CC6.3', category: 'Security' },
  'invitation.declined': { controlId: 'CC6.3', category: 'Security' },
  'invitation.expired': { controlId: 'CC6.3', category: 'Security' },
  'invitation.revoked': { controlId: 'CC6.3', category: 'Security' },
  'verification.initiated': { controlId: 'CC6.6', category: 'Privacy' },
  'verification.completed': { controlId: 'CC6.6', category: 'Privacy' },
  'verification.failed': { controlId: 'CC6.6', category: 'Privacy' },
  'verification.expired': { controlId: 'CC6.6', category: 'Privacy' },
  'document.uploaded': { controlId: 'CC6.7', category: 'Confidentiality' },
  'document.deleted': { controlId: 'CC6.7', category: 'Confidentiality' },
  'document.accessed': { controlId: 'CC6.7', category: 'Confidentiality' },
  'checklist.item_added': { controlId: 'CC7.2', category: 'ProcessingIntegrity' },
  'checklist.item_updated': { controlId: 'CC7.2', category: 'ProcessingIntegrity' },
  'checklist.item_completed': { controlId: 'CC7.2', category: 'ProcessingIntegrity' },
  'checklist.item_deleted': { controlId: 'CC7.2', category: 'ProcessingIntegrity' },
  'blocked_action.attempted': { controlId: 'CC7.4', category: 'Security' },
};

// ============================================================================
// PII Sanitization
// ============================================================================

const PII_KEYS = new Set([
  'email',
  'phone',
  'ssn',
  'socialSecurityNumber',
  'dateOfBirth',
  'dob',
  'birthDate',
  'address',
  'streetAddress',
  'firstName',
  'lastName',
  'fullName',
  'name',
  'password',
  'token',
  'apiKey',
  'secret',
  'creditCard',
  'cardNumber',
  'cvv',
  'bankAccount',
  'routingNumber',
  'taxId',
  'ein',
  'driversLicense',
  'passport',
  'ipAddress',
]);

function sanitizeValue(key: string, value: unknown): unknown {
  const lowerKey = key.toLowerCase();

  // Check if key matches PII patterns
  for (const piiKey of PII_KEYS) {
    if (lowerKey.includes(piiKey.toLowerCase())) {
      return '[REDACTED]';
    }
  }

  return value;
}

function sanitizeForEvidence(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      sanitized[key] = value;
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        typeof item === 'object' && item !== null
          ? sanitizeForEvidence(item as Record<string, unknown>)
          : sanitizeValue(key, item)
      );
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeForEvidence(value as Record<string, unknown>);
    } else {
      sanitized[key] = sanitizeValue(key, value);
    }
  }

  return sanitized;
}

// ============================================================================
// Summary Builder
// ============================================================================

function buildSummary(eventType: GroupEventType, outcome: EvidenceOutcome, groupId: string): string {
  const actionMap: Record<GroupEventType, string> = {
    'group.created': 'Co-purchase group created',
    'group.updated': 'Co-purchase group updated',
    'group.status_changed': 'Co-purchase group status changed',
    'group.archived': 'Co-purchase group archived',
    'member.joined': 'Member joined co-purchase group',
    'member.left': 'Member left co-purchase group',
    'member.role_changed': 'Member role changed in co-purchase group',
    'member.disclaimer_accepted': 'Member accepted non-custodial disclaimer',
    'invitation.sent': 'Invitation sent for co-purchase group',
    'invitation.accepted': 'Invitation accepted for co-purchase group',
    'invitation.declined': 'Invitation declined for co-purchase group',
    'invitation.expired': 'Invitation expired for co-purchase group',
    'invitation.revoked': 'Invitation revoked for co-purchase group',
    'verification.initiated': 'Member verification initiated',
    'verification.completed': 'Member verification completed',
    'verification.failed': 'Member verification failed',
    'verification.expired': 'Member verification expired',
    'document.uploaded': 'Document uploaded to co-purchase group',
    'document.deleted': 'Document deleted from co-purchase group',
    'document.accessed': 'Document accessed in co-purchase group',
    'checklist.item_added': 'Checklist item added to co-purchase group',
    'checklist.item_updated': 'Checklist item updated in co-purchase group',
    'checklist.item_completed': 'Checklist item completed in co-purchase group',
    'checklist.item_deleted': 'Checklist item deleted from co-purchase group',
    'blocked_action.attempted': 'Blocked custodial action attempted',
  };

  const action = actionMap[eventType] || `Co-purchase ${eventType.replace(/\./g, ' ')}`;
  return `${action} (${outcome}) - Group: ${groupId.substring(0, 8)}...`;
}

// ============================================================================
// Evidence Emitter
// ============================================================================

export interface EvidenceEmitterDeps {
  /**
   * Evidence service for SOC2 logging
   */
  evidenceService?: {
    emit: (record: GroupEvidenceRecord) => Promise<{ evidenceId: string }>;
  };
  /**
   * Logger instance
   */
  logger?: {
    info: (data: Record<string, unknown>) => void;
    error: (data: Record<string, unknown>) => void;
  };
}

let deps: EvidenceEmitterDeps = {};

/**
 * Configure evidence emitter dependencies
 */
export function configureEvidenceEmitter(newDeps: EvidenceEmitterDeps): void {
  deps = { ...deps, ...newDeps };
}

/**
 * Emit evidence for a co-purchase group event.
 * Fire-and-forget to avoid blocking business logic.
 */
export function emitGroupEvidence(input: GroupEvidenceInput): void {
  const { eventType, groupId, actorId, outcome, details, organizationId, tenantId } = input;

  const mapping = CONTROL_ID_MAP[eventType];
  const now = new Date();

  const record: GroupEvidenceRecord = {
    controlId: mapping.controlId,
    category: mapping.category,
    eventType,
    eventOutcome: outcome,
    summary: buildSummary(eventType, outcome, groupId),
    scope: organizationId ? 'org' : tenantId ? 'tenant' : 'user',
    actorType: 'user',
    actorId,
    organizationId,
    tenantId,
    details: {
      groupId,
      eventData: sanitizeForEvidence(details),
    },
    occurredAt: now,
    recordedAt: now,
  };

  // Fire-and-forget: emit to evidence service if available
  if (deps.evidenceService) {
    setImmediate(() => {
      void (async () => {
        try {
          await deps.evidenceService!.emit(record);
        } catch (error) {
          deps.logger?.error({
            msg: 'Failed to emit co-purchase evidence',
            error: error instanceof Error ? error.message : String(error),
            eventType,
            groupId,
          });
        }
      })();
    });
  }

  // Always log for evidence pipeline collection
  const logger = deps.logger ?? console;
  logger.info({
    msg: 'co_purchase_evidence',
    ...record,
  });
}

/**
 * Emit evidence for a blocked action attempt
 */
export function emitBlockedActionEvidence(
  groupId: string,
  actorId: string,
  actionType: string,
  additionalDetails?: Record<string, unknown>
): void {
  emitGroupEvidence({
    eventType: 'blocked_action.attempted',
    groupId,
    actorId,
    outcome: 'blocked',
    details: {
      actionType,
      reason: 'NON_CUSTODIAL_GUARDRAIL',
      // TODO: HUMAN_IMPLEMENTATION_REQUIRED
      implementationNote: 'This action requires custodial functionality which is intentionally blocked',
      ...additionalDetails,
    },
  });
}
