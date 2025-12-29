import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  timingSafeEqual,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * Encrypt data using AES-256-GCM
 */
export function encrypt(plaintext: string, key: string): string {
  const iv = randomBytes(IV_LENGTH);
  const keyBuffer = Buffer.from(key, 'hex');

  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted (all base64)
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(
    ':'
  );
}

/**
 * Decrypt data using AES-256-GCM
 */
export function decrypt(ciphertext: string, key: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }

  const [ivBase64, authTagBase64, encryptedBase64] = parts;
  if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error('Invalid ciphertext parts');
  }

  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const encrypted = Buffer.from(encryptedBase64, 'base64');
  const keyBuffer = Buffer.from(key, 'hex');

  const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(encrypted) + decipher.final('utf8');
}

/**
 * Generate a random encryption key (32 bytes for AES-256)
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hash a value using SHA-256
 */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Hash a value using SHA-512
 */
export function sha512(value: string): string {
  return createHash('sha512').update(value).digest('hex');
}

/**
 * Generate a secure random token
 */
export function generateToken(length = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Generate a secure random bytes as base64
 */
export function generateSecureBytes(length = 32): string {
  return randomBytes(length).toString('base64url');
}

/**
 * Constant-time string comparison (prevents timing attacks)
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Hash an API key for storage
 */
export function hashApiKey(apiKey: string): string {
  return sha256(apiKey);
}

/**
 * Generate an API key with prefix
 */
export function generateApiKey(prefix = 'rr'): { key: string; hashedKey: string } {
  const key = `${prefix}_${generateSecureBytes(24)}`;
  const hashedKey = hashApiKey(key);
  return { key, hashedKey };
}

/**
 * Mask a token for logging (show only first 8 chars)
 */
export function maskToken(token: string): string {
  if (token.length <= 8) return '***';
  return token.slice(0, 8) + '...';
}

/**
 * Create a webhook signature
 */
export function createWebhookSignature(payload: string, secret: string): string {
  const hmac = createHash('sha256');
  hmac.update(`${secret}${payload}`);
  return hmac.digest('hex');
}

/**
 * Verify a webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = createWebhookSignature(payload, secret);
  return secureCompare(expected, signature);
}
