import { RegisterRequestSchema, LoginRequestSchema } from '@realriches/types';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import { AuthService } from './service';

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

const RequestResetSchema = z.object({
  email: z.string().email(),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const authService = new AuthService(app);

  // Register
  app.post(
    '/register',
    {
      schema: {
        description: 'Register a new user account',
        tags: ['Auth'],
        body: {
          type: 'object',
          required: ['email', 'password', 'firstName', 'lastName', 'role'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            role: { type: 'string', enum: ['LANDLORD', 'AGENT', 'TENANT', 'INVESTOR'] },
            phone: { type: 'string' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  user: { type: 'object' },
                  tokens: {
                    type: 'object',
                    properties: {
                      accessToken: { type: 'string' },
                      refreshToken: { type: 'string' },
                      expiresIn: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = RegisterRequestSchema.parse(request.body);
      const result = await authService.register(input);

      return reply.status(201).send({
        success: true,
        data: result,
      });
    }
  );

  // Login
  app.post(
    '/login',
    {
      schema: {
        description: 'Login with email and password',
        tags: ['Auth'],
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  user: { type: 'object' },
                  tokens: {
                    type: 'object',
                    properties: {
                      accessToken: { type: 'string' },
                      refreshToken: { type: 'string' },
                      expiresIn: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = LoginRequestSchema.parse(request.body);
      const result = await authService.login({
        ...input,
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        data: result,
      });
    }
  );

  // Refresh tokens
  app.post(
    '/refresh',
    {
      schema: {
        description: 'Refresh access token using refresh token',
        tags: ['Auth'],
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  accessToken: { type: 'string' },
                  refreshToken: { type: 'string' },
                  expiresIn: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { refreshToken } = RefreshSchema.parse(request.body);
      const tokens = await authService.refreshTokens(refreshToken);

      return reply.send({
        success: true,
        data: tokens,
      });
    }
  );

  // Logout
  app.post(
    '/logout',
    {
      schema: {
        description: 'Logout current session',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      await authService.logout(request.user.sessionId);

      return reply.send({
        success: true,
        message: 'Logged out successfully',
      });
    }
  );

  // Logout all sessions
  app.post(
    '/logout-all',
    {
      schema: {
        description: 'Logout all sessions for current user',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      await authService.logoutAllSessions(request.user.id);

      return reply.send({
        success: true,
        message: 'All sessions logged out successfully',
      });
    }
  );

  // Change password
  app.post(
    '/change-password',
    {
      schema: {
        description: 'Change password for current user',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string' },
            newPassword: { type: 'string', minLength: 8 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { currentPassword, newPassword } = ChangePasswordSchema.parse(request.body);
      await authService.changePassword(request.user.id, currentPassword, newPassword);

      return reply.send({
        success: true,
        message: 'Password changed successfully',
      });
    }
  );

  // Request password reset
  app.post(
    '/forgot-password',
    {
      schema: {
        description: 'Request password reset email',
        tags: ['Auth'],
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { email } = RequestResetSchema.parse(request.body);
      await authService.requestPasswordReset(email);

      // Always return success to prevent email enumeration
      return reply.send({
        success: true,
        message: 'If an account exists with this email, a reset link has been sent',
      });
    }
  );

  // Reset password
  app.post(
    '/reset-password',
    {
      schema: {
        description: 'Reset password using token',
        tags: ['Auth'],
        body: {
          type: 'object',
          required: ['token', 'newPassword'],
          properties: {
            token: { type: 'string' },
            newPassword: { type: 'string', minLength: 8 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { token, newPassword } = ResetPasswordSchema.parse(request.body);
      await authService.resetPassword(token, newPassword);

      return reply.send({
        success: true,
        message: 'Password reset successfully',
      });
    }
  );

  // Get current user
  app.get(
    '/me',
    {
      schema: {
        description: 'Get current authenticated user',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object' },
            },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      return reply.send({
        success: true,
        data: {
          id: request.user.id,
          email: request.user.email,
          role: request.user.role,
          permissions: request.user.permissions,
        },
      });
    }
  );
}
