/**
 * Password Service
 * Argon2id hashing with secure configuration
 */

import argon2 from 'argon2';
import { type AsyncAppResult, okAsync, errAsync, tryCatchAsync } from '../../lib/result.js';
import { ErrorCode } from '../../lib/errors.js';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
};

export async function hashPassword(password: string): AsyncAppResult<string> {
  return tryCatchAsync(async () => {
    return argon2.hash(password, ARGON2_OPTIONS);
  }, ErrorCode.SYSTEM_ERROR);
}

export async function verifyPassword(password: string, hash: string): AsyncAppResult<boolean> {
  return tryCatchAsync(async () => {
    return argon2.verify(hash, password);
  }, ErrorCode.SYSTEM_ERROR);
}

export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < 8) errors.push('Password must be at least 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain an uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('Password must contain a lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('Password must contain a number');
  return { valid: errors.length === 0, errors };
}
