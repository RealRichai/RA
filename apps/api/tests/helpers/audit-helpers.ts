/**
 * Test helpers for audit functionality
 *
 * These are thin wrappers around the audit module's internal functions
 * to make them testable without modifying the original module.
 */

/**
 * Sanitize data for audit logging (removes sensitive fields)
 */
export function sanitizeForAuditTest(
  data: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const sensitiveFields = [
    'password',
    'passwordHash',
    'currentPassword',
    'newPassword',
    'confirmPassword',
    'token',
    'accessToken',
    'refreshToken',
    'secret',
    'apiKey',
    'ssn',
    'creditCard',
    'bankAccount',
    'encryptionKey',
    'mfaSecret',
    'mfaCode',
  ];

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (sensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeForAuditTest(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Extract entity info from URL for audit logging
 */
export function extractEntityInfoTest(
  url: string,
  params: Record<string, string>,
  body: Record<string, unknown>
): { entityType: string; entityId: string } | null {
  const pathParts = url.split('/').filter(Boolean);

  // Common API patterns: /api/v1/resource/:id
  const v1Index = pathParts.indexOf('v1');
  if (v1Index === -1 || v1Index >= pathParts.length - 1) {
    return null;
  }

  const entityType = pathParts[v1Index + 1] || 'unknown';
  const entityId = params.id || params.entityId || (body.id as string) || 'new';

  return { entityType, entityId };
}
