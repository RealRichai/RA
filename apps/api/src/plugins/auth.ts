import type { Permission, Role } from '@realriches/types';
import { RolePermissionsMap } from '@realriches/types';
import type { FastifyRequest, FastifyReply, FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';

// Define user type for the application
export interface AppUser {
  id: string;
  email: string;
  role: Role;
  permissions: Permission[];
  sessionId: string;
}

// Use @fastify/jwt's type augmentation pattern
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      email: string;
      role: Role;
      permissions: Permission[];
      sessionId: string;
      type: 'access' | 'refresh';
    };
    user: AppUser;
  }
}

export interface AuthenticateOptions {
  optional?: boolean;
}

export interface AuthorizeOptions {
  roles?: Role[];
  permissions?: Permission[];
  any?: boolean; // If true, user needs any of the permissions, not all
}

const authPluginCallback: FastifyPluginCallback = (fastify, _opts, done) => {
  // Set user to null by default (check if not already decorated by jwt plugin)
  if (!fastify.hasRequestDecorator('user')) {
    fastify.decorateRequest('user', null);
  }

  // Authentication decorator
  fastify.decorate(
    'authenticate',
    async function (request: FastifyRequest, reply: FastifyReply, options?: AuthenticateOptions): Promise<void> {
      try {
        const token = request.headers.authorization?.replace('Bearer ', '');

        if (!token) {
          if (options?.optional) {
            request.user = null;
            return;
          }
          reply.status(401).send({
            success: false,
            error: {
              code: 'AUTH_REQUIRED',
              message: 'Authentication required',
            },
          });
          return;
        }

        const decoded = await request.jwtVerify<{
          sub: string;
          email: string;
          role: Role;
          permissions: Permission[];
          sessionId: string;
          type: 'access' | 'refresh';
        }>();

        if (decoded.type !== 'access') {
          reply.status(401).send({
            success: false,
            error: {
              code: 'AUTH_TOKEN_INVALID',
              message: 'Invalid token type',
            },
          });
          return;
        }

        request.user = {
          id: decoded.sub,
          email: decoded.email,
          role: decoded.role,
          permissions: decoded.permissions,
          sessionId: decoded.sessionId,
        };
      } catch (error) {
        if (options?.optional) {
          request.user = null;
          return;
        }

        const err = error as Error & { code?: string };
        if (err.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
          reply.status(401).send({
            success: false,
            error: {
              code: 'AUTH_TOKEN_EXPIRED',
              message: 'Token has expired',
            },
          });
          return;
        }

        reply.status(401).send({
          success: false,
          error: {
            code: 'AUTH_TOKEN_INVALID',
            message: 'Invalid authentication token',
          },
        });
      }
    }
  );

  // Authorization decorator
  fastify.decorate(
    'authorize',
    function (request: FastifyRequest, reply: FastifyReply, options: AuthorizeOptions) {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'AUTH_REQUIRED',
            message: 'Authentication required',
          },
        });
      }

      // Check roles
      if (options.roles && options.roles.length > 0) {
        if (!options.roles.includes(request.user.role)) {
          return reply.status(403).send({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You do not have permission to access this resource',
            },
          });
        }
      }

      // Check permissions
      if (options.permissions && options.permissions.length > 0) {
        const userPermissions = request.user.permissions;

        if (options.any) {
          // User needs at least one of the permissions
          const hasAny = options.permissions.some((p) => userPermissions.includes(p));
          if (!hasAny) {
            return reply.status(403).send({
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'You do not have the required permissions',
              },
            });
          }
        } else {
          // User needs all permissions
          const hasAll = options.permissions.every((p) => userPermissions.includes(p));
          if (!hasAll) {
            return reply.status(403).send({
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'You do not have the required permissions',
              },
            });
          }
        }
      }

      return true;
    }
  );

  done();
};

export const authPlugin = fp(authPluginCallback, {
  name: 'auth',
  dependencies: ['@fastify/jwt'],
});

// Type augmentation for decorators
declare module 'fastify' {
  // Note: 'user' property is already augmented by @fastify/jwt via FastifyJWT interface

  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
      options?: AuthenticateOptions
    ) => Promise<void>;
    authorize: (
      request: FastifyRequest,
      reply: FastifyReply,
      options: AuthorizeOptions
    ) => boolean | FastifyReply;
  }
}

// Helper to get permissions for a role
export function getPermissionsForRole(role: Role): Permission[] {
  return RolePermissionsMap[role] || [];
}
