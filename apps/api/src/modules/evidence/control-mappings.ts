/**
 * SOC2 Control Mappings
 *
 * Maps event types to SOC2 Trust Services Criteria controls.
 */

import type { SOC2Category, SOC2ControlMapping } from './types';

// =============================================================================
// SOC2 Control Definitions
// =============================================================================

export const SOC2_CONTROLS: Record<string, SOC2ControlMapping> = {
  // CC6 - Logical and Physical Access Controls
  'CC6.1': {
    controlId: 'CC6.1',
    category: 'Security',
    title: 'Logical Access Security',
    description:
      'The entity implements logical access security software, infrastructure, and architectures over protected information assets.',
  },
  'CC6.2': {
    controlId: 'CC6.2',
    category: 'Security',
    title: 'Access Provisioning',
    description:
      'Prior to issuing system credentials and granting system access, the entity registers and authorizes new internal and external users.',
  },
  'CC6.3': {
    controlId: 'CC6.3',
    category: 'Security',
    title: 'Credential Management',
    description:
      'The entity authorizes, modifies, or removes access to data, software, functions, and other protected information assets.',
  },
  'CC6.6': {
    controlId: 'CC6.6',
    category: 'Security',
    title: 'Third-Party Access',
    description:
      'The entity implements logical access security measures to protect against threats from sources outside its system boundaries.',
  },
  'CC6.7': {
    controlId: 'CC6.7',
    category: 'Security',
    title: 'Privileged Access',
    description:
      'The entity restricts the transmission, movement, and removal of information to authorized internal and external users.',
  },
  'CC6.8': {
    controlId: 'CC6.8',
    category: 'Security',
    title: 'Security Event Detection',
    description:
      'The entity implements controls to prevent or detect and act upon the introduction of unauthorized or malicious software.',
  },

  // CC7 - System Operations
  'CC7.2': {
    controlId: 'CC7.2',
    category: 'ProcessingIntegrity',
    title: 'System Monitoring',
    description:
      'The entity monitors system components and the operation of those components for anomalies and security incidents.',
  },

  // P6 - Privacy Disclosure
  'P6.1': {
    controlId: 'P6.1',
    category: 'Privacy',
    title: 'Data Subject Access',
    description:
      'The entity provides data subjects with access to their personal information for review and correction.',
  },

  // C1 - Confidentiality
  'C1.1': {
    controlId: 'C1.1',
    category: 'Confidentiality',
    title: 'Confidential Information Protection',
    description: 'The entity identifies and maintains confidential information to meet objectives.',
  },
};

// =============================================================================
// Event Type to Control Mappings
// =============================================================================

interface EventControlMapping {
  controlId: string;
  category: SOC2Category;
  outcomeDefault: 'success' | 'failure' | 'allowed' | 'blocked';
}

export const EVENT_CONTROL_MAPPINGS: Record<string, EventControlMapping> = {
  // Auth Events - CC6.1 (Logical Access Security)
  'auth.login_success': { controlId: 'CC6.1', category: 'Security', outcomeDefault: 'success' },
  'auth.login_failed': { controlId: 'CC6.1', category: 'Security', outcomeDefault: 'failure' },
  'auth.logout': { controlId: 'CC6.1', category: 'Security', outcomeDefault: 'success' },
  'auth.logout_all': { controlId: 'CC6.2', category: 'Security', outcomeDefault: 'success' },
  'auth.token_refresh': { controlId: 'CC6.1', category: 'Security', outcomeDefault: 'success' },
  'auth.token_revoked': { controlId: 'CC6.2', category: 'Security', outcomeDefault: 'success' },
  'auth.token_reuse_detected': {
    controlId: 'CC6.8',
    category: 'Security',
    outcomeDefault: 'blocked',
  },
  'auth.password_changed': { controlId: 'CC6.3', category: 'Security', outcomeDefault: 'success' },
  'auth.password_reset_requested': {
    controlId: 'CC6.3',
    category: 'Security',
    outcomeDefault: 'success',
  },
  'auth.password_reset_completed': {
    controlId: 'CC6.3',
    category: 'Security',
    outcomeDefault: 'success',
  },
  'auth.email_verified': { controlId: 'CC6.1', category: 'Security', outcomeDefault: 'success' },
  'auth.account_locked': { controlId: 'CC6.1', category: 'Security', outcomeDefault: 'blocked' },
  'auth.account_unlocked': { controlId: 'CC6.1', category: 'Security', outcomeDefault: 'success' },
  'auth.suspicious_activity': {
    controlId: 'CC6.8',
    category: 'Security',
    outcomeDefault: 'blocked',
  },

  // API Key Events - CC6.6 (Third-Party Access)
  'admin.api_key_created': { controlId: 'CC6.6', category: 'Security', outcomeDefault: 'success' },
  'admin.api_key_updated': { controlId: 'CC6.6', category: 'Security', outcomeDefault: 'success' },
  'admin.api_key_disabled': { controlId: 'CC6.6', category: 'Security', outcomeDefault: 'success' },
  'admin.api_key_enabled': { controlId: 'CC6.6', category: 'Security', outcomeDefault: 'success' },
  'admin.api_key_revoked': { controlId: 'CC6.6', category: 'Security', outcomeDefault: 'success' },
  'admin.api_key_rotated': { controlId: 'CC6.6', category: 'Security', outcomeDefault: 'success' },

  // Admin Access Events - CC6.7 (Privileged Access)
  'admin.impersonation_started': {
    controlId: 'CC6.7',
    category: 'Security',
    outcomeDefault: 'success',
  },
  'admin.impersonation_ended': {
    controlId: 'CC6.7',
    category: 'Security',
    outcomeDefault: 'success',
  },
  'admin.impersonation_force_ended': {
    controlId: 'CC6.7',
    category: 'Security',
    outcomeDefault: 'success',
  },
  'admin.bulk_operation_initiated': {
    controlId: 'CC6.7',
    category: 'Security',
    outcomeDefault: 'success',
  },
  'admin.system_setting_changed': {
    controlId: 'CC6.7',
    category: 'Security',
    outcomeDefault: 'success',
  },
  'admin.role_assigned': { controlId: 'CC6.7', category: 'Security', outcomeDefault: 'success' },
  'admin.role_revoked': { controlId: 'CC6.7', category: 'Security', outcomeDefault: 'success' },

  // Compliance Events - CC7.2 (System Monitoring)
  'compliance.gate_passed': {
    controlId: 'CC7.2',
    category: 'ProcessingIntegrity',
    outcomeDefault: 'allowed',
  },
  'compliance.gate_blocked': {
    controlId: 'CC7.2',
    category: 'ProcessingIntegrity',
    outcomeDefault: 'blocked',
  },

  // Data Export Events - P6.1 (Data Subject Access)
  'data.export_requested': { controlId: 'P6.1', category: 'Privacy', outcomeDefault: 'success' },
  'data.export_completed': { controlId: 'P6.1', category: 'Privacy', outcomeDefault: 'success' },
  'data.export_downloaded': { controlId: 'P6.1', category: 'Privacy', outcomeDefault: 'success' },
  'data.export_failed': { controlId: 'P6.1', category: 'Privacy', outcomeDefault: 'failure' },

  // Confidential Data Access - C1.1
  'data.access_granted': {
    controlId: 'C1.1',
    category: 'Confidentiality',
    outcomeDefault: 'allowed',
  },
  'data.access_denied': {
    controlId: 'C1.1',
    category: 'Confidentiality',
    outcomeDefault: 'blocked',
  },
};

/**
 * Get control mapping for an event type
 */
export function getControlMapping(eventType: string): EventControlMapping | null {
  return EVENT_CONTROL_MAPPINGS[eventType] || null;
}

/**
 * Get SOC2 control details by control ID
 */
export function getControlDetails(controlId: string): SOC2ControlMapping | null {
  return SOC2_CONTROLS[controlId] || null;
}

/**
 * Get all controls for a category
 */
export function getControlsByCategory(category: SOC2Category): SOC2ControlMapping[] {
  return Object.values(SOC2_CONTROLS).filter((c) => c.category === category);
}

/**
 * Get all event types for a control
 */
export function getEventTypesForControl(controlId: string): string[] {
  return Object.entries(EVENT_CONTROL_MAPPINGS)
    .filter(([, mapping]) => mapping.controlId === controlId)
    .map(([eventType]) => eventType);
}
