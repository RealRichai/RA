/**
 * Auth Service
 * Complete authentication flows: register, login, refresh, password reset
 */

import { db } from '../../lib/database.js';
import { logger, createModuleLogger } from '../../lib/logger.js';
import { AppError, ErrorCode } from '../../lib/errors.js';
import { type AsyncAppResult, okAsync, errAsync, tryCatchAsync } from '../../lib/result.js';
import { hashPassword, verifyPassword, validatePasswordStrength } from './password.service.js';
import { generateTokenPair, verifyRefreshToken, type TokenPair, type TokenPayload } from './jwt.service.js';
import type { User, UserRole } from '@prisma/client';

const log = createModuleLogger('auth-service');

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
  phone?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthResult {
  user: Omit<User, 'passwordHash'>;
  tokens: TokenPair;
}

export async function register(input: RegisterInput): AsyncAppResult<AuthResult> {
  const passwordValidation = validatePasswordStrength(input.password);
  if (!passwordValidation.valid) {
    return errAsync(new AppError({
      code: ErrorCode.AUTH_PASSWORD_WEAK,
      message: 'Password does not meet requirements',
      details: { errors: passwordValidation.errors },
    }));
  }

  const existingUser = await db.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existingUser) {
    return errAsync(new AppError({
      code: ErrorCode.USER_EMAIL_TAKEN,
      message: 'Email is already registered',
    }));
  }

  if (input.phone) {
    const existingPhone = await db.user.findUnique({ where: { phone: input.phone } });
    if (existingPhone) {
      return errAsync(new AppError({
        code: ErrorCode.USER_PHONE_TAKEN,
        message: 'Phone number is already registered',
      }));
    }
  }

  const hashResult = await hashPassword(input.password);
  if (hashResult.isErr()) return errAsync(hashResult.error);

  return tryCatchAsync(async () => {
    const user = await db.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash: hashResult.value,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role ?? 'TENANT',
        phone: input.phone,
      },
    });

    const session = await db.session.create({
      data: {
        userId: user.id,
        refreshToken: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const tokenResult = await generateTokenPair({
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id,
    });

    if (tokenResult.isErr()) throw tokenResult.error;

    await db.session.update({
      where: { id: session.id },
      data: { refreshToken: tokenResult.value.refreshToken },
    });

    const { passwordHash, ...userWithoutPassword } = user;
    log.info({ userId: user.id, email: user.email }, 'User registered');

    return { user: userWithoutPassword, tokens: tokenResult.value };
  }, ErrorCode.DB_QUERY_FAILED);
}

export async function login(input: LoginInput): AsyncAppResult<AuthResult> {
  const user = await db.user.findUnique({ where: { email: input.email.toLowerCase() } });

  if (!user) {
    return errAsync(new AppError({
      code: ErrorCode.AUTH_INVALID_CREDENTIALS,
      message: 'Invalid email or password',
    }));
  }

  if (user.status === 'SUSPENDED') {
    return errAsync(new AppError({
      code: ErrorCode.AUTH_ACCOUNT_SUSPENDED,
      message: 'Account is suspended',
    }));
  }

  const passwordResult = await verifyPassword(input.password, user.passwordHash);
  if (passwordResult.isErr()) return errAsync(passwordResult.error);

  if (!passwordResult.value) {
    return errAsync(new AppError({
      code: ErrorCode.AUTH_INVALID_CREDENTIALS,
      message: 'Invalid email or password',
    }));
  }

  return tryCatchAsync(async () => {
    const session = await db.session.create({
      data: {
        userId: user.id,
        refreshToken: crypto.randomUUID(),
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const tokenResult = await generateTokenPair({
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id,
    });

    if (tokenResult.isErr()) throw tokenResult.error;

    await db.session.update({
      where: { id: session.id },
      data: { refreshToken: tokenResult.value.refreshToken },
    });

    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), loginCount: { increment: 1 } },
    });

    const { passwordHash, ...userWithoutPassword } = user;
    log.info({ userId: user.id }, 'User logged in');

    return { user: userWithoutPassword, tokens: tokenResult.value };
  }, ErrorCode.DB_QUERY_FAILED);
}

export async function refreshTokens(refreshToken: string): AsyncAppResult<TokenPair> {
  const payloadResult = await verifyRefreshToken(refreshToken);
  if (payloadResult.isErr()) return errAsync(payloadResult.error);

  const session = await db.session.findFirst({
    where: {
      refreshToken,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });

  if (!session) {
    return errAsync(new AppError({
      code: ErrorCode.AUTH_REFRESH_TOKEN_INVALID,
      message: 'Invalid or expired refresh token',
    }));
  }

  const tokenResult = await generateTokenPair({
    userId: session.user.id,
    email: session.user.email,
    role: session.user.role,
    sessionId: session.id,
  });

  if (tokenResult.isErr()) return errAsync(tokenResult.error);

  await db.session.update({
    where: { id: session.id },
    data: { refreshToken: tokenResult.value.refreshToken },
  });

  log.info({ userId: session.userId, sessionId: session.id }, 'Tokens refreshed');
  return okAsync(tokenResult.value);
}

export async function logout(sessionId: string): AsyncAppResult<void> {
  return tryCatchAsync(async () => {
    await db.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    log.info({ sessionId }, 'Session revoked');
  }, ErrorCode.DB_QUERY_FAILED);
}

export async function logoutAllSessions(userId: string): AsyncAppResult<void> {
  return tryCatchAsync(async () => {
    await db.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    log.info({ userId }, 'All sessions revoked');
  }, ErrorCode.DB_QUERY_FAILED);
}
