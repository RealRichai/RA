/**
 * Multi-Factor Authentication (MFA) Module
 *
 * Implements TOTP-based 2FA with:
 * - QR code generation for authenticator apps
 * - Backup codes for recovery
 * - MFA enforcement policies
 */

import { prisma } from '@realriches/database';
import { logger, generateToken, sha256, AppError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import * as crypto from 'crypto';
import { z } from 'zod';

// =============================================================================
// Constants
// =============================================================================

const MFA_ISSUER = 'RealRiches';
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_PREFIX = 'mfa_backup:';
const MFA_PENDING_PREFIX = 'mfa_pending:';
const MFA_PENDING_TTL = 300; // 5 minutes
const TOTP_WINDOW = 1; // Allow 1 step before/after current

// =============================================================================
// Schemas
// =============================================================================

const SetupMFASchema = z.object({
  password: z.string().min(1),
});

const VerifyMFASchema = z.object({
  code: z.string().length(6),
});

const VerifyBackupCodeSchema = z.object({
  code: z.string().min(8).max(12),
});

const DisableMFASchema = z.object({
  password: z.string().min(1),
  code: z.string().length(6),
});

// =============================================================================
// TOTP Implementation
// =============================================================================

/**
 * Generate a random base32 secret for TOTP
 */
function generateTOTPSecret(): string {
  const buffer = crypto.randomBytes(20);
  return base32Encode(buffer);
}

/**
 * Base32 encode a buffer
 */
function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  let bits = 0;
  let value = 0;

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 31];
  }

  return result;
}

/**
 * Base32 decode a string to buffer
 */
function base32Decode(encoded: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleanedInput = encoded.toUpperCase().replace(/=+$/, '');

  let bits = 0;
  let value = 0;
  const result: number[] = [];

  for (const char of cleanedInput) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      result.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(result);
}

/**
 * Generate TOTP code for a given secret and time
 */
function generateTOTP(secret: string, timeStep: number = 30, digits: number = 6): string {
  const time = Math.floor(Date.now() / 1000 / timeStep);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(time));

  const key = base32Decode(secret);
  const hmac = crypto.createHmac('sha1', key);
  hmac.update(timeBuffer);
  const hash = hmac.digest();

  const offset = hash[hash.length - 1] & 0x0f;
  const code =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = code % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

/**
 * Verify a TOTP code with window tolerance
 */
function verifyTOTP(secret: string, code: string, window: number = TOTP_WINDOW): boolean {
  const timeStep = 30;
  const currentTime = Math.floor(Date.now() / 1000 / timeStep);

  for (let i = -window; i <= window; i++) {
    const time = currentTime + i;
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigInt64BE(BigInt(time));

    const key = base32Decode(secret);
    const hmac = crypto.createHmac('sha1', key);
    hmac.update(timeBuffer);
    const hash = hmac.digest();

    const offset = hash[hash.length - 1] & 0x0f;
    const codeNum =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff);

    const otp = (codeNum % 1000000).toString().padStart(6, '0');
    if (otp === code) {
      return true;
    }
  }

  return false;
}

/**
 * Generate TOTP URI for QR code
 */
function generateTOTPUri(secret: string, email: string): string {
  const encodedIssuer = encodeURIComponent(MFA_ISSUER);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generate backup codes
 */
function generateBackupCodes(count: number = BACKUP_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric codes (format: XXXX-XXXX)
    const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    codes.push(`${part1}-${part2}`);
  }
  return codes;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getRedis(app: FastifyInstance): Redis | null {
  return (app as unknown as { redis?: Redis }).redis || null;
}

async function verifyPassword(userId: string, password: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!user) return false;

  // Use argon2 verify
  try {
    const { verify } = await import('argon2');
    return await verify(user.passwordHash, password);
  } catch {
    return false;
  }
}

// =============================================================================
// MFA Routes
// =============================================================================

export async function mfaRoutes(app: FastifyInstance): Promise<void> {
  const redis = getRedis(app);

  // ===========================================================================
  // GET /auth/mfa/status - Get MFA status for current user
  // ===========================================================================
  app.get(
    '/status',
    {
      schema: {
        description: 'Get MFA status for current user',
        tags: ['Auth', 'MFA'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user?.id;
      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { mfaEnabled: true },
      });

      // Check if backup codes exist
      let hasBackupCodes = false;
      if (redis) {
        const backupCodes = await redis.get(`${BACKUP_CODE_PREFIX}${userId}`);
        hasBackupCodes = !!backupCodes;
      }

      return reply.send({
        success: true,
        data: {
          enabled: user?.mfaEnabled ?? false,
          hasBackupCodes,
        },
      });
    }
  );

  // ===========================================================================
  // POST /auth/mfa/setup - Begin MFA setup
  // ===========================================================================
  app.post(
    '/setup',
    {
      schema: {
        description: 'Begin MFA setup - returns QR code and backup codes',
        tags: ['Auth', 'MFA'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['password'],
          properties: {
            password: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Body: { password: string } }>, reply: FastifyReply) => {
      try {
        const { password } = SetupMFASchema.parse(request.body);
        const userId = request.user?.id;
        const userEmail = request.user?.email;

        if (!userId || !userEmail) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          });
        }

        // Verify password
        const isValid = await verifyPassword(userId, password);
        if (!isValid) {
          return reply.status(401).send({
            success: false,
            error: { code: 'INVALID_PASSWORD', message: 'Invalid password' },
          });
        }

        // Check if already enabled
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { mfaEnabled: true },
        });

        if (user?.mfaEnabled) {
          return reply.status(400).send({
            success: false,
            error: { code: 'MFA_ALREADY_ENABLED', message: 'MFA is already enabled' },
          });
        }

        // Generate secret and backup codes
        const secret = generateTOTPSecret();
        const backupCodes = generateBackupCodes();
        const qrCodeUrl = generateTOTPUri(secret, userEmail);

        // Store pending setup in Redis (requires verification to complete)
        if (redis) {
          await redis.setex(
            `${MFA_PENDING_PREFIX}${userId}`,
            MFA_PENDING_TTL,
            JSON.stringify({ secret, backupCodes })
          );
        }

        logger.info({
          msg: 'mfa_setup_initiated',
          userId,
        });

        return reply.send({
          success: true,
          data: {
            secret,
            qrCodeUrl,
            backupCodes,
            expiresIn: MFA_PENDING_TTL,
            message: 'Scan QR code with authenticator app and verify with a code to complete setup',
          },
        });
      } catch (error) {
        logger.error({ error }, 'MFA setup failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'SETUP_FAILED', message: 'Failed to initiate MFA setup' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /auth/mfa/verify-setup - Complete MFA setup with verification code
  // ===========================================================================
  app.post(
    '/verify-setup',
    {
      schema: {
        description: 'Complete MFA setup by verifying a TOTP code',
        tags: ['Auth', 'MFA'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['code'],
          properties: {
            code: { type: 'string', minLength: 6, maxLength: 6 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Body: { code: string } }>, reply: FastifyReply) => {
      try {
        const { code } = VerifyMFASchema.parse(request.body);
        const userId = request.user?.id;

        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          });
        }

        if (!redis) {
          return reply.status(500).send({
            success: false,
            error: { code: 'REDIS_UNAVAILABLE', message: 'MFA service unavailable' },
          });
        }

        // Get pending setup
        const pendingData = await redis.get(`${MFA_PENDING_PREFIX}${userId}`);
        if (!pendingData) {
          return reply.status(400).send({
            success: false,
            error: { code: 'NO_PENDING_SETUP', message: 'No pending MFA setup. Start with /auth/mfa/setup' },
          });
        }

        const { secret, backupCodes } = JSON.parse(pendingData);

        // Verify the code
        const isValid = verifyTOTP(secret, code);
        if (!isValid) {
          return reply.status(400).send({
            success: false,
            error: { code: 'INVALID_CODE', message: 'Invalid verification code' },
          });
        }

        // Enable MFA and store secret
        await prisma.user.update({
          where: { id: userId },
          data: {
            mfaEnabled: true,
            mfaSecret: secret,
          },
        });

        // Store hashed backup codes
        const hashedCodes = backupCodes.map((c: string) => sha256(c.replace('-', '')));
        await redis.set(`${BACKUP_CODE_PREFIX}${userId}`, JSON.stringify(hashedCodes));

        // Delete pending setup
        await redis.del(`${MFA_PENDING_PREFIX}${userId}`);

        // Audit log
        await prisma.auditLog.create({
          data: {
            action: 'mfa_enabled',
            actorId: userId,
            targetType: 'user',
            targetId: userId,
            metadata: {},
          },
        });

        logger.info({
          msg: 'mfa_enabled',
          userId,
        });

        return reply.send({
          success: true,
          message: 'MFA has been enabled successfully',
          data: {
            enabled: true,
            backupCodesRemaining: backupCodes.length,
          },
        });
      } catch (error) {
        logger.error({ error }, 'MFA verification failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'VERIFY_FAILED', message: 'Failed to verify MFA setup' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /auth/mfa/verify - Verify MFA code during login
  // ===========================================================================
  app.post(
    '/verify',
    {
      schema: {
        description: 'Verify MFA code during login',
        tags: ['Auth', 'MFA'],
        body: {
          type: 'object',
          required: ['code'],
          properties: {
            code: { type: 'string', minLength: 6, maxLength: 6 },
            pendingToken: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { code: string; pendingToken?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { code, pendingToken } = request.body;

        if (!pendingToken) {
          return reply.status(400).send({
            success: false,
            error: { code: 'MISSING_TOKEN', message: 'Pending login token required' },
          });
        }

        if (!redis) {
          return reply.status(500).send({
            success: false,
            error: { code: 'REDIS_UNAVAILABLE', message: 'MFA service unavailable' },
          });
        }

        // Get pending login data
        const pendingData = await redis.get(`mfa_login:${pendingToken}`);
        if (!pendingData) {
          return reply.status(400).send({
            success: false,
            error: { code: 'EXPIRED_TOKEN', message: 'Login session expired. Please login again.' },
          });
        }

        const { userId } = JSON.parse(pendingData);

        // Get user's MFA secret
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { mfaSecret: true, mfaEnabled: true },
        });

        if (!user?.mfaEnabled || !user?.mfaSecret) {
          return reply.status(400).send({
            success: false,
            error: { code: 'MFA_NOT_ENABLED', message: 'MFA is not enabled for this account' },
          });
        }

        // Verify code
        const isValid = verifyTOTP(user.mfaSecret, code);
        if (!isValid) {
          return reply.status(401).send({
            success: false,
            error: { code: 'INVALID_CODE', message: 'Invalid verification code' },
          });
        }

        // Delete pending login
        await redis.del(`mfa_login:${pendingToken}`);

        // Generate tokens (would integrate with AuthService)
        logger.info({
          msg: 'mfa_verified',
          userId,
        });

        return reply.send({
          success: true,
          message: 'MFA verification successful',
          data: {
            verified: true,
            userId,
          },
        });
      } catch (error) {
        logger.error({ error }, 'MFA verification failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'VERIFY_FAILED', message: 'Failed to verify MFA code' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /auth/mfa/verify-backup - Verify using backup code
  // ===========================================================================
  app.post(
    '/verify-backup',
    {
      schema: {
        description: 'Verify using a backup code',
        tags: ['Auth', 'MFA'],
        body: {
          type: 'object',
          required: ['code', 'pendingToken'],
          properties: {
            code: { type: 'string' },
            pendingToken: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { code: string; pendingToken: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { code, pendingToken } = VerifyBackupCodeSchema.extend({
          pendingToken: z.string(),
        }).parse(request.body);

        if (!redis) {
          return reply.status(500).send({
            success: false,
            error: { code: 'REDIS_UNAVAILABLE', message: 'MFA service unavailable' },
          });
        }

        // Get pending login data
        const pendingData = await redis.get(`mfa_login:${pendingToken}`);
        if (!pendingData) {
          return reply.status(400).send({
            success: false,
            error: { code: 'EXPIRED_TOKEN', message: 'Login session expired' },
          });
        }

        const { userId } = JSON.parse(pendingData);

        // Get backup codes
        const backupCodesData = await redis.get(`${BACKUP_CODE_PREFIX}${userId}`);
        if (!backupCodesData) {
          return reply.status(400).send({
            success: false,
            error: { code: 'NO_BACKUP_CODES', message: 'No backup codes available' },
          });
        }

        const hashedCodes: string[] = JSON.parse(backupCodesData);
        const hashedInput = sha256(code.replace('-', ''));

        const codeIndex = hashedCodes.indexOf(hashedInput);
        if (codeIndex === -1) {
          return reply.status(401).send({
            success: false,
            error: { code: 'INVALID_CODE', message: 'Invalid backup code' },
          });
        }

        // Remove used backup code
        hashedCodes.splice(codeIndex, 1);
        await redis.set(`${BACKUP_CODE_PREFIX}${userId}`, JSON.stringify(hashedCodes));

        // Delete pending login
        await redis.del(`mfa_login:${pendingToken}`);

        // Audit log
        await prisma.auditLog.create({
          data: {
            action: 'mfa_backup_code_used',
            actorId: userId,
            targetType: 'user',
            targetId: userId,
            metadata: { codesRemaining: hashedCodes.length },
          },
        });

        logger.info({
          msg: 'mfa_backup_code_used',
          userId,
          codesRemaining: hashedCodes.length,
        });

        return reply.send({
          success: true,
          message: 'Backup code accepted',
          data: {
            verified: true,
            userId,
            backupCodesRemaining: hashedCodes.length,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Backup code verification failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'VERIFY_FAILED', message: 'Failed to verify backup code' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /auth/mfa/disable - Disable MFA
  // ===========================================================================
  app.post(
    '/disable',
    {
      schema: {
        description: 'Disable MFA for current user',
        tags: ['Auth', 'MFA'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['password', 'code'],
          properties: {
            password: { type: 'string' },
            code: { type: 'string', minLength: 6, maxLength: 6 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Body: { password: string; code: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { password, code } = DisableMFASchema.parse(request.body);
        const userId = request.user?.id;

        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          });
        }

        // Verify password
        const isPasswordValid = await verifyPassword(userId, password);
        if (!isPasswordValid) {
          return reply.status(401).send({
            success: false,
            error: { code: 'INVALID_PASSWORD', message: 'Invalid password' },
          });
        }

        // Get user's MFA secret and verify code
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { mfaSecret: true, mfaEnabled: true },
        });

        if (!user?.mfaEnabled) {
          return reply.status(400).send({
            success: false,
            error: { code: 'MFA_NOT_ENABLED', message: 'MFA is not enabled' },
          });
        }

        if (!user.mfaSecret || !verifyTOTP(user.mfaSecret, code)) {
          return reply.status(401).send({
            success: false,
            error: { code: 'INVALID_CODE', message: 'Invalid verification code' },
          });
        }

        // Disable MFA
        await prisma.user.update({
          where: { id: userId },
          data: {
            mfaEnabled: false,
            mfaSecret: null,
          },
        });

        // Remove backup codes
        if (redis) {
          await redis.del(`${BACKUP_CODE_PREFIX}${userId}`);
        }

        // Audit log
        await prisma.auditLog.create({
          data: {
            action: 'mfa_disabled',
            actorId: userId,
            targetType: 'user',
            targetId: userId,
            metadata: {},
          },
        });

        logger.info({
          msg: 'mfa_disabled',
          userId,
        });

        return reply.send({
          success: true,
          message: 'MFA has been disabled',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to disable MFA');
        return reply.status(500).send({
          success: false,
          error: { code: 'DISABLE_FAILED', message: 'Failed to disable MFA' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /auth/mfa/regenerate-backup - Regenerate backup codes
  // ===========================================================================
  app.post(
    '/regenerate-backup',
    {
      schema: {
        description: 'Regenerate backup codes (invalidates old codes)',
        tags: ['Auth', 'MFA'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['password', 'code'],
          properties: {
            password: { type: 'string' },
            code: { type: 'string', minLength: 6, maxLength: 6 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Body: { password: string; code: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { password, code } = request.body;
        const userId = request.user?.id;

        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          });
        }

        // Verify password
        const isPasswordValid = await verifyPassword(userId, password);
        if (!isPasswordValid) {
          return reply.status(401).send({
            success: false,
            error: { code: 'INVALID_PASSWORD', message: 'Invalid password' },
          });
        }

        // Get user's MFA secret and verify code
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { mfaSecret: true, mfaEnabled: true },
        });

        if (!user?.mfaEnabled || !user.mfaSecret) {
          return reply.status(400).send({
            success: false,
            error: { code: 'MFA_NOT_ENABLED', message: 'MFA is not enabled' },
          });
        }

        if (!verifyTOTP(user.mfaSecret, code)) {
          return reply.status(401).send({
            success: false,
            error: { code: 'INVALID_CODE', message: 'Invalid verification code' },
          });
        }

        // Generate new backup codes
        const backupCodes = generateBackupCodes();
        const hashedCodes = backupCodes.map((c) => sha256(c.replace('-', '')));

        if (redis) {
          await redis.set(`${BACKUP_CODE_PREFIX}${userId}`, JSON.stringify(hashedCodes));
        }

        // Audit log
        await prisma.auditLog.create({
          data: {
            action: 'mfa_backup_codes_regenerated',
            actorId: userId,
            targetType: 'user',
            targetId: userId,
            metadata: {},
          },
        });

        logger.info({
          msg: 'mfa_backup_codes_regenerated',
          userId,
        });

        return reply.send({
          success: true,
          message: 'Backup codes regenerated. Old codes are now invalid.',
          data: {
            backupCodes,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to regenerate backup codes');
        return reply.status(500).send({
          success: false,
          error: { code: 'REGENERATE_FAILED', message: 'Failed to regenerate backup codes' },
        });
      }
    }
  );
}
