/**
 * Auth Routes - Registration, Login, Token Management
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { hashPassword, verifyPassword } from '../../lib/crypto.js';
import { AppError, ErrorCode } from '../../lib/errors.js';
import { generateTokenPair, verifyRefreshToken } from '../plugins/auth.js';
import type { JWTPayload } from '@realriches/shared';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  phone: z.string().regex(/^\+1[0-9]{10}$/),
  role: z.enum(['TENANT', 'LANDLORD', 'AGENT']),
  marketId: z.string().uuid().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register
  fastify.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);
    
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      throw new AppError(ErrorCode.EMAIL_EXISTS, 'Email already registered', 409);
    }

    const passwordHash = await hashPassword(body.password);

    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        role: body.role,
        emailVerified: false,
        status: 'ACTIVE'
      }
    });

    // Create role-specific profile
    if (body.role === 'TENANT') {
      await prisma.tenantProfile.create({ data: { userId: user.id } });
    } else if (body.role === 'LANDLORD') {
      await prisma.landlordProfile.create({ data: { userId: user.id } });
    }
    // Note: AgentProfile creation requires license info, handled separately in agent onboarding

    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };
    const tokens = generateTokenPair(fastify, payload);
    
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        userAgent: request.headers['user-agent'] || 'unknown',
        ipAddress: request.ip
      }
    });

    return reply.status(201).send({
      success: true,
      data: {
        user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
        tokens
      }
    });
  });

  // Login
  fastify.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password', 401);
    }

    if (user.status !== 'ACTIVE') {
      throw new AppError(ErrorCode.ACCOUNT_SUSPENDED, 'Account is suspended', 403);
    }

    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };
    const tokens = generateTokenPair(fastify, payload);
    
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        userAgent: request.headers['user-agent'] || 'unknown',
        ipAddress: request.ip
      }
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    return reply.send({
      success: true,
      data: {
        user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
        tokens
      }
    });
  });

  // Refresh token
  fastify.post('/refresh', async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string };

    const decoded = verifyRefreshToken(fastify, refreshToken);
    if (!decoded) {
      throw new AppError(ErrorCode.INVALID_TOKEN, 'Invalid refresh token', 401);
    }

    const session = await prisma.session.findFirst({
      where: { refreshToken, userId: decoded.userId, expiresAt: { gt: new Date() } },
      include: { user: true }
    });

    if (!session) {
      throw new AppError(ErrorCode.INVALID_TOKEN, 'Session expired or invalid', 401);
    }

    const newPayload: JWTPayload = {
      userId: session.userId,
      email: session.user.email,
      role: session.user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };
    const tokens = generateTokenPair(fastify, newPayload);

    await prisma.session.update({
      where: { id: session.id },
      data: { refreshToken: tokens.refreshToken, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
    });

    return reply.send({ success: true, data: { tokens } });
  });

  // Logout
  fastify.post('/logout', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken?: string };
    
    if (refreshToken) {
      await prisma.session.deleteMany({ where: { refreshToken, userId: request.user.userId } });
    } else {
      await prisma.session.deleteMany({ where: { userId: request.user.userId } });
    }

    return reply.send({ success: true, message: 'Logged out successfully' });
  });

  // Get current user
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      include: {
        tenantProfile: true,
        landlordProfile: true,
        agentProfile: true
      }
    });

    if (!user) {
      throw new AppError(ErrorCode.NOT_FOUND, 'User not found', 404);
    }

    const { passwordHash, ...userData } = user;
    return reply.send({ success: true, data: userData });
  });
};
