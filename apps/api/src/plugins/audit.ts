/**
 * Audit Logging Middleware
 * 
 * Records all write operations (POST, PUT, PATCH, DELETE) to the AuditLog table.
 * - Append-only records for compliance
 * - Non-blocking (audit failures don't block requests)
 * - Captures: actor, action, entity, changes, metadata, request context
 */

import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';

export interface AuditContext {
  entityType: string;
  entityId: string;
  action: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// Metrics counter for audit failures (in production, send to APM)
let auditFailureCount = 0;

/**
 * Write an audit log entry (non-blocking)
 */
export async function writeAuditLog(
  request: FastifyRequest,
  context: AuditContext
): Promise<void> {
  // Fire and forget - don't await in the request path
  setImmediate(async () => {
    try {
      const user = (request as any).user;
      
      await prisma.auditLog.create({
        data: {
          actorId: user?.id || null,
          actorEmail: user?.email || 'anonymous',
          action: context.action,
          entityType: context.entityType,
          entityId: context.entityId,
          changes: context.changes ? JSON.parse(JSON.stringify(context.changes)) : undefined,
          metadata: context.metadata ? JSON.parse(JSON.stringify(context.metadata)) : undefined,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] || null,
          requestId: request.id,
        },
      });
    } catch (err) {
      // Never throw - just log and increment metric
      auditFailureCount++;
      logger.error({
        msg: 'audit_failed',
        error: err instanceof Error ? err.message : 'Unknown error',
        context,
        requestId: request.id,
        failureCount: auditFailureCount,
      });
    }
  });
}

/**
 * Extract entity info from request URL and body
 */
function extractEntityInfo(request: FastifyRequest): { entityType: string; entityId: string } | null {
  const url = request.url;
  const pathParts = url.split('/').filter(Boolean);
  
  // Common API patterns: /api/v1/resource/:id or /api/v1/resource
  // Find the resource type (usually after 'v1')
  const v1Index = pathParts.indexOf('v1');
  if (v1Index === -1 || v1Index >= pathParts.length - 1) {
    return null;
  }

  const entityType = pathParts[v1Index + 1] || 'unknown';
  
  // Try to get entity ID from URL params or body
  const params = request.params as Record<string, string> || {};
  const body = request.body as Record<string, unknown> || {};
  
  const entityId = params.id || params.entityId || 
    (body.id as string) || 
    'new';

  return { entityType, entityId };
}

/**
 * Determine action from HTTP method and URL
 */
function determineAction(method: string, url: string): string {
  const methodActions: Record<string, string> = {
    POST: 'create',
    PUT: 'update',
    PATCH: 'update',
    DELETE: 'delete',
  };

  const baseAction = methodActions[method] || method.toLowerCase();
  
  // Check for specific action endpoints
  if (url.includes('/login')) return 'login';
  if (url.includes('/logout')) return 'logout';
  if (url.includes('/register')) return 'register';
  if (url.includes('/refresh')) return 'token_refresh';
  if (url.includes('/password')) return 'password_change';
  if (url.includes('/approve')) return 'approve';
  if (url.includes('/reject')) return 'reject';
  if (url.includes('/publish')) return 'publish';
  if (url.includes('/archive')) return 'archive';
  
  return baseAction;
}

/**
 * Audit logging plugin
 */
const auditPluginCallback: FastifyPluginCallback = (fastify, _opts, done) => {
  // Decorate request with audit helper
  fastify.decorateRequest('audit', null);
  
  // Add hook for write operations
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const method = request.method;
    
    // Only audit write operations
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return;
    }

    // Skip health checks and docs
    if (request.url.includes('/health') || request.url.includes('/docs')) {
      return;
    }

    // Only audit successful mutations (2xx status codes)
    if (reply.statusCode < 200 || reply.statusCode >= 300) {
      return;
    }

    const entityInfo = extractEntityInfo(request);
    if (!entityInfo) {
      return;
    }

    const action = determineAction(method, request.url);
    
    // Sanitize body for logging (remove sensitive fields)
    const sanitizedBody = sanitizeForAudit(request.body as Record<string, unknown>);

    await writeAuditLog(request, {
      entityType: entityInfo.entityType,
      entityId: entityInfo.entityId,
      action,
      changes: sanitizedBody,
      metadata: {
        method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
    });
  });

  // Expose audit function on fastify instance for manual auditing
  fastify.decorate('audit', writeAuditLog);

  done();
};

/**
 * Remove sensitive fields from audit logs
 */
function sanitizeForAudit(data: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
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
    if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeForAudit(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Get audit failure count (for monitoring)
 */
export function getAuditFailureCount(): number {
  return auditFailureCount;
}

/**
 * Reset audit failure count (for testing)
 */
export function resetAuditFailureCount(): void {
  auditFailureCount = 0;
}

export const auditPlugin = fp(auditPluginCallback, {
  name: 'audit',
});

// Type augmentation
declare module 'fastify' {
  interface FastifyInstance {
    audit: typeof writeAuditLog;
  }
}
