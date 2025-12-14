/**
 * Logger Configuration
 * Pino-based structured logging with PII redaction
 */

import pino from 'pino';
import { env, isDev } from '../config/env.js';

const redactPaths = [
  'password', 'passwordHash', 'token', 'refreshToken', 'accessToken',
  'apiKey', 'secret', 'authorization', 'ssn', 'creditCard',
  '*.password', '*.passwordHash', '*.token', '*.apiKey',
  'req.headers.authorization', 'req.headers.cookie',
];

export const logger = pino({
  level: isDev ? 'debug' : 'info',
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    env: env.NODE_ENV,
    service: 'realriches-api',
  },
});

export function createModuleLogger(module: string) {
  return logger.child({ module });
}

export function createRequestLogger(requestId: string, userId?: string) {
  return logger.child({ requestId, userId });
}
