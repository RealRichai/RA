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
} from '@realriches/utils';
import { hash, verify } from 'argon2';
import type { FastifyInstance } from 'fastify';
import type Redis from 'ioredis';

// Redis key prefixes for tokens
const PASSWORD_RESET_PREFIX = 'password_reset:';
const EMAIL_VERIFICATION_PREFIX = 'email_verification:';

// Token expiration times (in seconds)
const PASSWORD_RESET_EXPIRY = 60 * 60; // 1 hour
const EMAIL_VERIFICATION_EXPIRY = 24 * 60 * 60; // 24 hours

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

const ARGON2_OPTIONS = {
  type: 2 as const, // argon2id
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

export class AuthService {
  private redis: Redis;
  private emailService: EmailService;

  constructor(private app: FastifyInstance) {
    this.redis = app.redis;
    this.emailService = app.emailService;
  }

  async register(input: RegisterInput): Promise<{ user: any; tokens: TokenPair }> {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    // Hash password with Argon2id
    const passwordHash = await hash(input.password, ARGON2_OPTIONS);

    // Create user
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

    // Create session and tokens
    const tokens = await this.createSession(user.id, user.email, user.role as Role);

    // Send email verification (non-blocking)
    this.sendEmailVerification(user.id).catch((err) => {
      // Log error but don't fail registration
      console.error('Failed to send verification email:', err);
    });

    return { user, tokens };
  }

  async login(input: LoginInput): Promise<{ user: any; tokens: TokenPair }> {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (!user) {
      throw new ValidationError('Invalid email or password');
    }

    if (user.status !== 'active') {
      throw new AppError('Account is not active', 'ACCOUNT_INACTIVE', 403);
    }

    // Verify password with Argon2id
    const validPassword = await verify(user.passwordHash, input.password);

    if (!validPassword) {
      throw new ValidationError('Invalid email or password');
    }

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

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    // Find refresh token
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true, session: true },
    });

    if (!storedToken) {
      throw new ValidationError('Invalid refresh token');
    }

    if (storedToken.revoked) {
      // Token reuse detected - revoke all tokens for this session
      await prisma.refreshToken.updateMany({
        where: { sessionId: storedToken.sessionId },
        data: { revoked: true },
      });
      throw new AppError('Token reuse detected', 'TOKEN_REUSE', 401);
    }

    if (storedToken.expiresAt < new Date()) {
      throw new AppError('Refresh token expired', 'TOKEN_EXPIRED', 401);
    }

    // Revoke current refresh token
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    // Create new tokens
    const config = getConfig();
    const permissions = RolePermissionsMap[storedToken.user.role as Role] || [];

    const accessToken = this.app.jwt.sign(
      {
        sub: storedToken.user.id,
        email: storedToken.user.email,
        role: storedToken.user.role,
        permissions,
        sessionId: storedToken.sessionId,
        type: 'access',
      },
      { expiresIn: config.jwt.accessExpiresIn }
    );

    const newRefreshToken = generateToken(64);
    const refreshExpiresIn = this.parseExpiry(config.jwt.refreshExpiresIn);

    await prisma.refreshToken.create({
      data: {
        id: generatePrefixedId('rtk'),
        token: newRefreshToken,
        userId: storedToken.userId,
        sessionId: storedToken.sessionId,
        expiresAt: new Date(Date.now() + refreshExpiresIn),
      },
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.parseExpiry(config.jwt.accessExpiresIn) / 1000,
    };
  }

  async logout(sessionId: string): Promise<void> {
    // Revoke all refresh tokens for this session
    await prisma.refreshToken.updateMany({
      where: { sessionId },
      data: { revoked: true },
    });

    // Deactivate session
    await prisma.session.update({
      where: { id: sessionId },
      data: { isActive: false },
    });
  }

  async logoutAllSessions(userId: string): Promise<void> {
    // Revoke all refresh tokens
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { revoked: true },
    });

    // Deactivate all sessions
    await prisma.session.updateMany({
      where: { userId },
      data: { isActive: false },
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify current password
    const validPassword = await verify(user.passwordHash, currentPassword);

    if (!validPassword) {
      throw new ValidationError('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await hash(newPassword, ARGON2_OPTIONS);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    // Logout all other sessions
    await this.logoutAllSessions(userId);
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return;
    }

    // Generate a secure token
    const token = generateToken(32);
    const tokenHash = sha256(token);

    // Store token in Redis with user ID
    await this.redis.setex(
      `${PASSWORD_RESET_PREFIX}${tokenHash}`,
      PASSWORD_RESET_EXPIRY,
      user.id
    );

    // Build the reset URL
    const config = getConfig();
    const resetUrl = `${config.web.appUrl}/reset-password?token=${token}`;

    // Send the password reset email
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

  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Hash the token to look it up
    const tokenHash = sha256(token);
    const redisKey = `${PASSWORD_RESET_PREFIX}${tokenHash}`;

    // Get the user ID from Redis
    const userId = await this.redis.get(redisKey);

    if (!userId) {
      throw new ValidationError('Invalid or expired reset token');
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Hash the new password
    const passwordHash = await hash(newPassword, ARGON2_OPTIONS);

    // Update the password
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Delete the used token
    await this.redis.del(redisKey);

    // Logout all existing sessions for security
    await this.logoutAllSessions(userId);
  }

  async sendEmailVerification(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.emailVerified) {
      return; // Already verified
    }

    // Generate a secure token
    const token = generateToken(32);
    const tokenHash = sha256(token);

    // Store token in Redis with user ID
    await this.redis.setex(
      `${EMAIL_VERIFICATION_PREFIX}${tokenHash}`,
      EMAIL_VERIFICATION_EXPIRY,
      user.id
    );

    // Build the verification URL
    const config = getConfig();
    const verificationUrl = `${config.web.appUrl}/verify-email?token=${token}`;

    // Send the verification email
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
  }

  async verifyEmail(token: string): Promise<void> {
    // Hash the token to look it up
    const tokenHash = sha256(token);
    const redisKey = `${EMAIL_VERIFICATION_PREFIX}${tokenHash}`;

    // Get the user ID from Redis
    const userId = await this.redis.get(redisKey);

    if (!userId) {
      throw new ValidationError('Invalid or expired verification token');
    }

    // Update user's email verified status
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });

    // Delete the used token
    await this.redis.del(redisKey);
  }

  private async createSession(
    userId: string,
    email: string,
    role: Role,
    userAgent?: string,
    ipAddress?: string
  ): Promise<TokenPair> {
    const config = getConfig();

    // Create session
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

    // Create access token
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

    // Create refresh token
    const refreshToken = generateToken(64);
    const refreshExpiresIn = this.parseExpiry(config.jwt.refreshExpiresIn);

    await prisma.refreshToken.create({
      data: {
        tokenHash: sha256(refreshToken),
        userId,
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
