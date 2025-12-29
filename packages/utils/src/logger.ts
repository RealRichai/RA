import pino, { Logger, LoggerOptions } from 'pino';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  requestId?: string;
  userId?: string;
  organizationId?: string;
  correlationId?: string;
  [key: string]: unknown;
}

const defaultOptions: LoggerOptions = {
  level: process.env['LOG_LEVEL'] || 'info',
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      host: bindings.hostname,
    }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'password',
      'token',
      'accessToken',
      'refreshToken',
      'apiKey',
      'secret',
      'authorization',
      'cookie',
      'ssn',
      'creditCard',
      'bankAccount',
      'encryptionKey',
    ],
    remove: true,
  },
};

// Pretty print in development
const devOptions: LoggerOptions = {
  ...defaultOptions,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
};

/**
 * Create a logger instance
 */
export function createLogger(name: string, options?: LoggerOptions): Logger {
  const isDev = process.env['NODE_ENV'] === 'development';
  const baseOptions = isDev ? devOptions : defaultOptions;

  return pino({
    ...baseOptions,
    ...options,
    name,
  });
}

/**
 * Create a child logger with context
 */
export function createChildLogger(logger: Logger, context: LogContext): Logger {
  return logger.child(context);
}

/**
 * Root logger instance
 */
export const logger = createLogger('realriches');

/**
 * Audit logger for compliance/security events
 */
export const auditLogger = createLogger('realriches:audit', {
  level: 'info',
  // Audit logs should never be redacted
  redact: undefined,
});

/**
 * Log an audit event
 */
export function logAuditEvent(
  action: string,
  actor: {
    id?: string;
    email?: string;
    ip?: string;
    userAgent?: string;
  },
  target: {
    type: string;
    id: string;
  },
  details?: Record<string, unknown>,
  status: 'success' | 'failure' = 'success'
): void {
  auditLogger.info({
    type: 'audit',
    action,
    actor,
    target,
    details,
    status,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log a security event
 */
export function logSecurityEvent(
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  details: Record<string, unknown>
): void {
  auditLogger.warn({
    type: 'security',
    event,
    severity,
    ...details,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log a compliance event
 */
export function logComplianceEvent(
  event: string,
  ruleType: string,
  entityType: string,
  entityId: string,
  details?: Record<string, unknown>
): void {
  auditLogger.info({
    type: 'compliance',
    event,
    ruleType,
    entityType,
    entityId,
    details,
    timestamp: new Date().toISOString(),
  });
}

// Export pino for custom usage
export { pino };
export type { Logger, LoggerOptions };
