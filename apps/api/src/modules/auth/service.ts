/**
 * Authentication Service
 *
 * Implements secure authentication with:
 * - Argon2id password hashing
 * - JWT access/refresh token pair
 * - Refresh token rotation with Redis revocation store
 * - Security event logging to AuditLog
 * - Rate limiting with account lockout policy
 */

import { getConfig } from '@realriches/config';
import { prisma } from '@realriches/database';
import type { EmailService } from '@realriches/email-service';
import type { Role } from '@realriches/types';
import { RolePermissionsMap } from '@realriches/types';
import {
  generatePrefixedId,
  generateToken,
  sha256,
  AppError,
  NotFoundError,
  ValidationError,
  ConflictError,
  logger,
} from '@realriches/utils';
import { hash, verify } from 'argon2';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type Redis from 'ioredis';

// =============================================================================
// Redis Key Prefixes
// =============================================================================

const PASSWORD_RESET_PREFIX = 'password_reset:';
const EMAIL_VERIFICATION_PREFIX = 'email_verification:';
const REVOKED_TOKEN_PREFIX = 'revoked_token:';
const FAILED_LOGIN_PREFIX = 'failed_login:';
const LOCKOUT_PREFIX = 'lockout:';

// =============================================================================
// Token & Security Configuration
// =============================================================================

const PASSWORD_RESET_EXPIRY = 60 * 60; // 1 hour
const EMAIL_VERIFICATION_EXPIRY = 24 * 60 * 60; // 24 hours
const REVOKED_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days (matches refresh token expiry)
const FAILED_LOGIN_WINDOW = 15 * 60; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION = 30 * 60; // 30 minutes

const ARGON2_OPTIONS = {
  type: 2 as const, // argon2id
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

// =============================================================================
// Security Event Types
// =============================================================================

export type SecurityEventType =
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'logout_all'
  | 'token_refresh'
  | 'token_revoked'
  | 'token_reuse_detected'
  | 'password_changed'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'email_verification_sent'
  | 'email_verified'
  | 'account_locked'
  | 'account_unlocked'
  | 'suspicious_activity';

// =============================================================================
// Types
// =============================================================================

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
  phone?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface SecurityEventContext {
  userId?: string;
  email?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Auth Service
// =============================================================================

export class AuthService {
  private redis: Redis;
  private emailService: EmailService;

  constructor(private app: FastifyInstance) {
    this.redis = app.redis;
    this.emailService = app.emailService;
  }

  // ===========================================================================
  // Registration
  // ===========================================================================

  async register(input: RegisterInput): Promise<{ user: any; tokens: TokenPair }> {
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    const passwordHash = await hash(input.password, ARGON2_OPTIONS);

    const user = await prisma.user.create({
      data: {
        id: generatePrefixedId('usr'),
        email: input.email.toLowerCase(),
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        phone: input.phone,
        emailVerified: false,
        status: 'active',
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
        createdAt: true,
      },
    });

    const tokens = await this.createSession(user.id, user.email, user.role as Role);

    // Log security event
    await this.logSecurityEvent('login_success', {
      userId: user.id,
      email: user.email,
      metadata: { action: 'register' },
    });

    // Send email verification (non-blocking)
    this.sendEmailVerification(user.id).catch((err) => {
      logger.error({ err, userId: user.id }, 'Failed to send verification email');
    });

    return { user, tokens };
  }

  // ===========================================================================
  // Login
  // ===========================================================================

  async login(input: LoginInput): Promise<{ user: any; tokens: TokenPair }> {
    const email = input.email.toLowerCase();

    // Check if account is locked
    const isLocked = await this.isAccountLocked(email);
    if (isLocked) {
      await this.logSecurityEvent('login_failed', {
        email,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: { reason: 'account_locked' },
      });
      throw new AppError('Account is temporarily locked. Please try again later.', 'ACCOUNT_LOCKED', 423);
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      await this.recordFailedLogin(email, input.ipAddress, input.userAgent);
      throw new ValidationError('Invalid email or password');
    }

    if (user.status !== 'active') {
      await this.logSecurityEvent('login_failed', {
        userId: user.id,
        email,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: { reason: 'account_inactive', status: user.status },
      });
      throw new AppError('Account is not active', 'ACCOUNT_INACTIVE', 403);
    }

    const validPassword = await verify(user.passwordHash, input.password);

    if (!validPassword) {
      await this.recordFailedLogin(email, input.ipAddress, input.userAgent, user.id);
      throw new ValidationError('Invalid email or password');
    }

    // Clear failed login attempts on successful login
    await this.clearFailedLogins(email);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Create session and tokens
    const tokens = await this.createSession(
      user.id,
      user.email,
      user.role as Role,
      input.userAgent,
      input.ipAddress
    );

    // Log security event
    await this.logSecurityEvent('login_success', {
      userId: user.id,
      email: user.email,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        phone: user.phone,
      },
      tokens,
    };
  }

  // ===========================================================================
  // Token Refresh with Rotation
  // ===========================================================================

  async refreshTokens(refreshToken: string, request?: FastifyRequest): Promise<TokenPair> {
    const tokenHash = sha256(refreshToken);

    // Check Redis revocation store first (fast path)
    const isRevoked = await this.isTokenRevoked(tokenHash);
    if (isRevoked) {
      await this.logSecurityEvent('suspicious_activity', {
        ipAddress: request?.ip,
        userAgent: request?.headers['user-agent'],
        metadata: { reason: 'revoked_token_reuse', tokenHash: tokenHash.slice(0, 16) },
      });
      throw new AppError('Token has been revoked', 'TOKEN_REVOKED', 401);
    }

    // Find refresh token in database
    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken) {
      throw new ValidationError('Invalid refresh token');
    }

    if (storedToken.revoked) {
      // Token reuse detected - this is a security incident
      // Revoke ALL tokens for this user (potential session hijacking)
      await this.revokeAllUserTokens(storedToken.userId);

      await this.logSecurityEvent('token_reuse_detected', {
        userId: storedToken.userId,
        email: storedToken.user.email,
        ipAddress: request?.ip,
        userAgent: request?.headers['user-agent'],
        metadata: { tokenHash: tokenHash.slice(0, 16) },
      });

      throw new AppError('Token reuse detected - all sessions revoked for security', 'TOKEN_REUSE', 401);
    }

    if (storedToken.expiresAt < new Date()) {
      throw new AppError('Refresh token expired', 'TOKEN_EXPIRED', 401);
    }

    // Rotate: Revoke current token
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true, revokedAt: new Date() },
    });

    // Add to Redis revocation store for fast lookup
    await this.addToRevocationStore(tokenHash);

    // Create new tokens
    const config = getConfig();
    const permissions = RolePermissionsMap[storedToken.user.role as Role] || [];

    const accessToken = this.app.jwt.sign(
      {
        sub: storedToken.user.id,
        email: storedToken.user.email,
        role: storedToken.user.role,
        permissions,
        sessionId: storedToken.sessionId || storedToken.id,
        type: 'access',
      },
      { expiresIn: config.jwt.accessExpiresIn }
    );

    const newRefreshToken = generateToken(64);
    const newTokenHash = sha256(newRefreshToken);
    const refreshExpiresIn = this.parseExpiry(config.jwt.refreshExpiresIn);

    await prisma.refreshToken.create({
      data: {
        id: generatePrefixedId('rtk'),
        token: newRefreshToken,
        tokenHash: newTokenHash,
        userId: storedToken.userId,
        sessionId: storedToken.sessionId,
        expiresAt: new Date(Date.now() + refreshExpiresIn),
      },
    });

    // Log security event
    await this.logSecurityEvent('token_refresh', {
      userId: storedToken.userId,
      email: storedToken.user.email,
      sessionId: storedToken.sessionId || undefined,
      ipAddress: request?.ip,
      userAgent: request?.headers['user-agent'],
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.parseExpiry(config.jwt.accessExpiresIn) / 1000,
    };
  }

  // ===========================================================================
  // Logout
  // ===========================================================================

  async logout(sessionId: string, userId?: string, request?: FastifyRequest): Promise<void> {
    // Revoke all refresh tokens for this session
    const tokens = await prisma.refreshToken.findMany({
      where: { sessionId },
      select: { tokenHash: true },
    });

    await prisma.refreshToken.updateMany({
      where: { sessionId },
      data: { revoked: true, revokedAt: new Date() },
    });

    // Add all tokens to Redis revocation store
    for (const token of tokens) {
      await this.addToRevocationStore(token.tokenHash);
    }

    // Deactivate session
    await prisma.session.update({
      where: { id: sessionId },
      data: { isActive: false },
    });

    // Log security event
    await this.logSecurityEvent('logout', {
      userId,
      sessionId,
      ipAddress: request?.ip,
      userAgent: request?.headers['user-agent'],
    });
  }

  async logoutAllSessions(userId: string, request?: FastifyRequest): Promise<void> {
    await this.revokeAllUserTokens(userId);

    // Deactivate all sessions
    await prisma.session.updateMany({
      where: { userId },
      data: { isActive: false },
    });

    // Log security event
    await this.logSecurityEvent('logout_all', {
      userId,
      ipAddress: request?.ip,
      userAgent: request?.headers['user-agent'],
    });
  }

  // ===========================================================================
  // Password Management
  // ===========================================================================

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    request?: FastifyRequest
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const validPassword = await verify(user.passwordHash, currentPassword);

    if (!validPassword) {
      await this.logSecurityEvent('suspicious_activity', {
        userId,
        email: user.email,
        ipAddress: request?.ip,
        userAgent: request?.headers['user-agent'],
        metadata: { reason: 'invalid_password_on_change' },
      });
      throw new ValidationError('Current password is incorrect');
    }

    const newPasswordHash = await hash(newPassword, ARGON2_OPTIONS);

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        passwordChangedAt: new Date(),
      },
    });

    // Logout all other sessions for security
    await this.logoutAllSessions(userId, request);

    // Log security event
    await this.logSecurityEvent('password_changed', {
      userId,
      email: user.email,
      ipAddress: request?.ip,
      userAgent: request?.headers['user-agent'],
    });
  }

  async requestPasswordReset(email: string, request?: FastifyRequest): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Log security event (even if user not found - for monitoring)
    await this.logSecurityEvent('password_reset_requested', {
      email: email.toLowerCase(),
      userId: user?.id,
      ipAddress: request?.ip,
      userAgent: request?.headers['user-agent'],
      metadata: { userExists: !!user },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return;
    }

    const token = generateToken(32);
    const tokenHash = sha256(token);

    await this.redis.setex(
      `${PASSWORD_RESET_PREFIX}${tokenHash}`,
      PASSWORD_RESET_EXPIRY,
      user.id
    );

    const config = getConfig();
    const resetUrl = `${config.web.appUrl}/reset-password?token=${token}`;

    await this.emailService.send({
      templateId: 'auth.password-reset',
      to: user.email,
      data: {
        firstName: user.firstName,
        resetUrl,
        expiresIn: '1 hour',
      },
      priority: 'high',
      userId: user.id,
      entityType: 'user',
      entityId: user.id,
    });
  }

  async resetPassword(token: string, newPassword: string, request?: FastifyRequest): Promise<void> {
    const tokenHash = sha256(token);
    const redisKey = `${PASSWORD_RESET_PREFIX}${tokenHash}`;

    const userId = await this.redis.get(redisKey);

    if (!userId) {
      throw new ValidationError('Invalid or expired reset token');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const passwordHash = await hash(newPassword, ARGON2_OPTIONS);

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
      },
    });

    // Delete the used token
    await this.redis.del(redisKey);

    // Logout all existing sessions for security
    await this.logoutAllSessions(userId, request);

    // Clear any lockout on this account
    await this.clearLockout(user.email);

    // Log security event
    await this.logSecurityEvent('password_reset_completed', {
      userId,
      email: user.email,
      ipAddress: request?.ip,
      userAgent: request?.headers['user-agent'],
    });
  }

  // ===========================================================================
  // Email Verification
  // ===========================================================================

  async sendEmailVerification(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.emailVerified) {
      return;
    }

    const token = generateToken(32);
    const tokenHash = sha256(token);

    await this.redis.setex(
      `${EMAIL_VERIFICATION_PREFIX}${tokenHash}`,
      EMAIL_VERIFICATION_EXPIRY,
      user.id
    );

    const config = getConfig();
    const verificationUrl = `${config.web.appUrl}/verify-email?token=${token}`;

    await this.emailService.send({
      templateId: 'auth.email-verification',
      to: user.email,
      data: {
        firstName: user.firstName,
        verificationUrl,
        expiresIn: '24 hours',
      },
      priority: 'high',
      userId: user.id,
      entityType: 'user',
      entityId: user.id,
    });

    // Log security event
    await this.logSecurityEvent('email_verification_sent', {
      userId,
      email: user.email,
    });
  }

  async verifyEmail(token: string, request?: FastifyRequest): Promise<void> {
    const tokenHash = sha256(token);
    const redisKey = `${EMAIL_VERIFICATION_PREFIX}${tokenHash}`;

    const userId = await this.redis.get(redisKey);

    if (!userId) {
      throw new ValidationError('Invalid or expired verification token');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });

    await this.redis.del(redisKey);

    // Log security event
    await this.logSecurityEvent('email_verified', {
      userId,
      email: user?.email,
      ipAddress: request?.ip,
      userAgent: request?.headers['user-agent'],
    });
  }

  // ===========================================================================
  // Redis Revocation Store
  // ===========================================================================

  private async isTokenRevoked(tokenHash: string): Promise<boolean> {
    const exists = await this.redis.exists(`${REVOKED_TOKEN_PREFIX}${tokenHash}`);
    return exists === 1;
  }

  private async addToRevocationStore(tokenHash: string): Promise<void> {
    await this.redis.setex(
      `${REVOKED_TOKEN_PREFIX}${tokenHash}`,
      REVOKED_TOKEN_TTL,
      '1'
    );
  }

  private async revokeAllUserTokens(userId: string): Promise<void> {
    const tokens = await prisma.refreshToken.findMany({
      where: { userId, revoked: false },
      select: { id: true, tokenHash: true },
    });

    // Mark all as revoked in database
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { revoked: true, revokedAt: new Date() },
    });

    // Add all to Redis revocation store
    const pipeline = this.redis.pipeline();
    for (const token of tokens) {
      pipeline.setex(`${REVOKED_TOKEN_PREFIX}${token.tokenHash}`, REVOKED_TOKEN_TTL, '1');
    }
    await pipeline.exec();

    // Log security event
    await this.logSecurityEvent('token_revoked', {
      userId,
      metadata: { tokenCount: tokens.length, reason: 'all_tokens_revoked' },
    });
  }

  // ===========================================================================
  // Rate Limiting & Lockout Policy
  // ===========================================================================

  private async recordFailedLogin(
    email: string,
    ipAddress?: string,
    userAgent?: string,
    userId?: string
  ): Promise<void> {
    const key = `${FAILED_LOGIN_PREFIX}${email}`;

    // Increment failed attempts
    const attempts = await this.redis.incr(key);

    // Set expiry on first attempt
    if (attempts === 1) {
      await this.redis.expire(key, FAILED_LOGIN_WINDOW);
    }

    // Log security event
    await this.logSecurityEvent('login_failed', {
      userId,
      email,
      ipAddress,
      userAgent,
      metadata: { attempts, maxAttempts: MAX_FAILED_ATTEMPTS },
    });

    // Check if we should lock the account
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      await this.lockAccount(email);
    }
  }

  private async clearFailedLogins(email: string): Promise<void> {
    await this.redis.del(`${FAILED_LOGIN_PREFIX}${email}`);
  }

  private async lockAccount(email: string): Promise<void> {
    await this.redis.setex(`${LOCKOUT_PREFIX}${email}`, LOCKOUT_DURATION, '1');

    // Log security event
    await this.logSecurityEvent('account_locked', {
      email,
      metadata: { lockoutDuration: LOCKOUT_DURATION },
    });
  }

  private async clearLockout(email: string): Promise<void> {
    const wasLocked = await this.redis.del(`${LOCKOUT_PREFIX}${email}`);
    await this.redis.del(`${FAILED_LOGIN_PREFIX}${email}`);

    if (wasLocked) {
      await this.logSecurityEvent('account_unlocked', {
        email,
        metadata: { reason: 'password_reset' },
      });
    }
  }

  private async isAccountLocked(email: string): Promise<boolean> {
    const exists = await this.redis.exists(`${LOCKOUT_PREFIX}${email}`);
    return exists === 1;
  }

  /**
   * Get remaining lockout time in seconds (for client display)
   */
  async getLockoutRemaining(email: string): Promise<number | null> {
    const ttl = await this.redis.ttl(`${LOCKOUT_PREFIX}${email}`);
    return ttl > 0 ? ttl : null;
  }

  /**
   * Get failed login count (for monitoring/admin)
   */
  async getFailedLoginCount(email: string): Promise<number> {
    const count = await this.redis.get(`${FAILED_LOGIN_PREFIX}${email}`);
    return count ? parseInt(count, 10) : 0;
  }

  // ===========================================================================
  // Security Event Logging
  // ===========================================================================

  private async logSecurityEvent(
    eventType: SecurityEventType,
    context: SecurityEventContext
  ): Promise<void> {
    // Non-blocking - fire and forget
    setImmediate(async () => {
      try {
        // Use a dummy entity ID for auth events (user ID or email hash)
        const entityId = context.userId || sha256(context.email || 'anonymous').slice(0, 36);

        await prisma.auditLog.create({
          data: {
            actorId: context.userId || null,
            actorEmail: context.email || 'anonymous',
            action: `auth.${eventType}`,
            entityType: 'auth',
            entityId,
            metadata: {
              ...context.metadata,
              sessionId: context.sessionId,
            },
            ipAddress: context.ipAddress || null,
            userAgent: context.userAgent || null,
          },
        });
      } catch (err) {
        // Never throw - just log
        logger.error({
          msg: 'security_event_log_failed',
          eventType,
          context: { ...context, metadata: undefined },
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  }

  // ===========================================================================
  // Session Management
  // ===========================================================================

  private async createSession(
    userId: string,
    email: string,
    role: Role,
    userAgent?: string,
    ipAddress?: string
  ): Promise<TokenPair> {
    const config = getConfig();

    const session = await prisma.session.create({
      data: {
        userId,
        userAgent: userAgent || 'unknown',
        ipAddress: ipAddress || 'unknown',
        isValid: true,
        expiresAt: new Date(Date.now() + this.parseExpiry(config.jwt.refreshExpiresIn)),
      },
    });

    const permissions = RolePermissionsMap[role] || [];

    const accessToken = this.app.jwt.sign(
      {
        sub: userId,
        email,
        role,
        permissions,
        sessionId: session.id,
        type: 'access',
      },
      { expiresIn: config.jwt.accessExpiresIn }
    );

    const refreshToken = generateToken(64);
    const tokenHash = sha256(refreshToken);
    const refreshExpiresIn = this.parseExpiry(config.jwt.refreshExpiresIn);

    await prisma.refreshToken.create({
      data: {
        id: generatePrefixedId('rtk'),
        tokenHash,
        userId,
        sessionId: session.id,
        expiresAt: new Date(Date.now() + refreshExpiresIn),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpiry(config.jwt.accessExpiresIn) / 1000,
    };
  }

  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 3600000; // Default 1 hour
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 3600000;
    }
  }
}
