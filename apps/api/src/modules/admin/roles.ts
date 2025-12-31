/**
 * Role & Permission Management Admin API
 *
 * Provides CRUD operations for roles and permission assignments.
 * Supports custom roles with granular permissions.
 */

import { prisma } from '@realriches/database';
import type { Permission, Role } from '@realriches/types';
import { PermissionSchema, RolePermissionsMap, RoleSchema } from '@realriches/types';
import { logger, AppError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';

// =============================================================================
// Constants
// =============================================================================

const CUSTOM_ROLES_KEY = 'custom_roles';
const USER_PERMISSIONS_PREFIX = 'user_permissions:';
const ROLE_CACHE_TTL = 3600; // 1 hour

// =============================================================================
// Types
// =============================================================================

interface CustomRole {
  id: string;
  name: string;
  displayName: string;
  description: string;
  permissions: Permission[];
  isSystem: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface UserPermissionOverride {
  userId: string;
  additionalPermissions: Permission[];
  revokedPermissions: Permission[];
  customRoleId?: string;
  updatedBy: string;
  updatedAt: string;
}

// =============================================================================
// Schemas
// =============================================================================

const CreateRoleSchema = z.object({
  name: z.string().min(2).max(50).regex(/^[a-z_]+$/, 'Name must be lowercase with underscores'),
  displayName: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  permissions: z.array(PermissionSchema).min(1),
  baseRole: RoleSchema.optional(),
});

const UpdateRoleSchema = z.object({
  displayName: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  permissions: z.array(PermissionSchema).optional(),
});

const AssignRoleSchema = z.object({
  role: z.string(),
});

const UpdateUserPermissionsSchema = z.object({
  additionalPermissions: z.array(PermissionSchema).optional(),
  revokedPermissions: z.array(PermissionSchema).optional(),
});

// =============================================================================
// In-Memory Storage (Redis fallback)
// =============================================================================

const inMemoryCustomRoles = new Map<string, CustomRole>();
const inMemoryUserOverrides = new Map<string, UserPermissionOverride>();

// =============================================================================
// Helper Functions
// =============================================================================

function getRedis(app: FastifyInstance): Redis | null {
  return (app as unknown as { redis?: Redis }).redis || null;
}

async function getCustomRoles(redis: Redis | null): Promise<Map<string, CustomRole>> {
  if (redis) {
    const data = await redis.get(CUSTOM_ROLES_KEY);
    if (data) {
      const roles = JSON.parse(data) as CustomRole[];
      return new Map(roles.map((r) => [r.id, r]));
    }
  }
  return new Map(inMemoryCustomRoles);
}

async function saveCustomRoles(redis: Redis | null, roles: Map<string, CustomRole>): Promise<void> {
  const rolesArray = Array.from(roles.values());
  if (redis) {
    await redis.set(CUSTOM_ROLES_KEY, JSON.stringify(rolesArray));
  }
  inMemoryCustomRoles.clear();
  roles.forEach((v, k) => inMemoryCustomRoles.set(k, v));
}

async function getUserPermissionOverride(
  redis: Redis | null,
  userId: string
): Promise<UserPermissionOverride | null> {
  if (redis) {
    const data = await redis.get(`${USER_PERMISSIONS_PREFIX}${userId}`);
    if (data) return JSON.parse(data);
  }
  return inMemoryUserOverrides.get(userId) || null;
}

async function saveUserPermissionOverride(
  redis: Redis | null,
  userId: string,
  override: UserPermissionOverride
): Promise<void> {
  if (redis) {
    await redis.setex(`${USER_PERMISSIONS_PREFIX}${userId}`, ROLE_CACHE_TTL, JSON.stringify(override));
  }
  inMemoryUserOverrides.set(userId, override);
}

async function deleteUserPermissionOverride(redis: Redis | null, userId: string): Promise<void> {
  if (redis) {
    await redis.del(`${USER_PERMISSIONS_PREFIX}${userId}`);
  }
  inMemoryUserOverrides.delete(userId);
}

function getAllPermissions(): Permission[] {
  return Object.values(PermissionSchema.enum) as Permission[];
}

function getSystemRoles(): Array<{ name: Role; displayName: string; permissions: Permission[]; isSystem: true }> {
  return (Object.keys(RolePermissionsMap) as Role[]).map((role) => ({
    name: role,
    displayName: role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    permissions: RolePermissionsMap[role],
    isSystem: true as const,
  }));
}

// =============================================================================
// Routes
// =============================================================================

export async function roleManagementRoutes(app: FastifyInstance): Promise<void> {
  const redis = getRedis(app);

  // ===========================================================================
  // GET /admin/roles - List all roles (system + custom)
  // ===========================================================================
  app.get(
    '/',
    {
      schema: {
        description: 'List all roles (system and custom)',
        tags: ['Admin', 'Roles'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const systemRoles = getSystemRoles();
        const customRoles = await getCustomRoles(redis);

        const allRoles = [
          ...systemRoles.map((r) => ({
            id: r.name,
            name: r.name,
            displayName: r.displayName,
            permissions: r.permissions,
            permissionCount: r.permissions.length,
            isSystem: true,
          })),
          ...Array.from(customRoles.values()).map((r) => ({
            id: r.id,
            name: r.name,
            displayName: r.displayName,
            description: r.description,
            permissions: r.permissions,
            permissionCount: r.permissions.length,
            isSystem: false,
            createdAt: r.createdAt,
          })),
        ];

        return reply.send({
          success: true,
          data: {
            roles: allRoles,
            total: allRoles.length,
            systemCount: systemRoles.length,
            customCount: customRoles.size,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to list roles');
        return reply.status(500).send({
          success: false,
          error: { code: 'LIST_FAILED', message: 'Failed to list roles' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/roles/permissions - List all available permissions
  // ===========================================================================
  app.get(
    '/permissions',
    {
      schema: {
        description: 'List all available permissions',
        tags: ['Admin', 'Roles'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const permissions = getAllPermissions();

      // Group permissions by category
      const grouped = permissions.reduce(
        (acc, permission) => {
          const [category] = permission.split(':');
          if (!acc[category]) {
            acc[category] = [];
          }
          acc[category].push(permission);
          return acc;
        },
        {} as Record<string, Permission[]>
      );

      return reply.send({
        success: true,
        data: {
          permissions,
          grouped,
          total: permissions.length,
          categories: Object.keys(grouped),
        },
      });
    }
  );

  // ===========================================================================
  // GET /admin/roles/:roleId - Get role details
  // ===========================================================================
  app.get(
    '/:roleId',
    {
      schema: {
        description: 'Get role details',
        tags: ['Admin', 'Roles'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['roleId'],
          properties: { roleId: { type: 'string' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { roleId: string } }>, reply: FastifyReply) => {
      try {
        const { roleId } = request.params;

        // Check system roles first
        const systemRoles = getSystemRoles();
        const systemRole = systemRoles.find((r) => r.name === roleId);

        if (systemRole) {
          // Count users with this role
          const userCount = await prisma.user.count({
            where: { role: roleId as Role },
          });

          return reply.send({
            success: true,
            data: {
              id: systemRole.name,
              name: systemRole.name,
              displayName: systemRole.displayName,
              permissions: systemRole.permissions,
              permissionCount: systemRole.permissions.length,
              isSystem: true,
              userCount,
            },
          });
        }

        // Check custom roles
        const customRoles = await getCustomRoles(redis);
        const customRole = customRoles.get(roleId);

        if (!customRole) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Role not found' },
          });
        }

        return reply.send({
          success: true,
          data: {
            ...customRole,
            permissionCount: customRole.permissions.length,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get role');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_FAILED', message: 'Failed to get role' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/roles - Create custom role
  // ===========================================================================
  app.post(
    '/',
    {
      schema: {
        description: 'Create a custom role',
        tags: ['Admin', 'Roles'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'displayName', 'permissions'],
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 50 },
            displayName: { type: 'string', minLength: 2, maxLength: 100 },
            description: { type: 'string', maxLength: 500 },
            permissions: { type: 'array', items: { type: 'string' }, minItems: 1 },
            baseRole: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const input = CreateRoleSchema.parse(request.body);
        const adminId = request.user?.id;

        if (!adminId) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          });
        }

        // Check for name conflicts
        const systemRoles = getSystemRoles();
        if (systemRoles.some((r) => r.name === input.name)) {
          return reply.status(409).send({
            success: false,
            error: { code: 'NAME_CONFLICT', message: 'Role name conflicts with system role' },
          });
        }

        const customRoles = await getCustomRoles(redis);
        if (Array.from(customRoles.values()).some((r) => r.name === input.name)) {
          return reply.status(409).send({
            success: false,
            error: { code: 'NAME_CONFLICT', message: 'Role with this name already exists' },
          });
        }

        // Start with base role permissions if specified
        let permissions = input.permissions;
        if (input.baseRole && RolePermissionsMap[input.baseRole]) {
          permissions = [...new Set([...RolePermissionsMap[input.baseRole], ...input.permissions])];
        }

        const now = new Date().toISOString();
        const newRole: CustomRole = {
          id: `custom_${input.name}`,
          name: input.name,
          displayName: input.displayName,
          description: input.description || '',
          permissions,
          isSystem: false,
          createdBy: adminId,
          createdAt: now,
          updatedAt: now,
        };

        customRoles.set(newRole.id, newRole);
        await saveCustomRoles(redis, customRoles);

        // Audit log
        await prisma.auditLog.create({
          data: {
            action: 'role_created',
            actorId: adminId,
            targetType: 'role',
            targetId: newRole.id,
            metadata: { roleName: newRole.name, permissionCount: permissions.length },
          },
        });

        logger.info({
          msg: 'custom_role_created',
          roleId: newRole.id,
          adminId,
        });

        return reply.status(201).send({
          success: true,
          data: newRole,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        logger.error({ error }, 'Failed to create role');
        return reply.status(500).send({
          success: false,
          error: { code: 'CREATE_FAILED', message: 'Failed to create role' },
        });
      }
    }
  );

  // ===========================================================================
  // PUT /admin/roles/:roleId - Update custom role
  // ===========================================================================
  app.put(
    '/:roleId',
    {
      schema: {
        description: 'Update a custom role',
        tags: ['Admin', 'Roles'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['roleId'],
          properties: { roleId: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            displayName: { type: 'string', minLength: 2, maxLength: 100 },
            description: { type: 'string', maxLength: 500 },
            permissions: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { roleId: string } }>, reply: FastifyReply) => {
      try {
        const { roleId } = request.params;
        const input = UpdateRoleSchema.parse(request.body);
        const adminId = request.user?.id;

        // Cannot update system roles
        const systemRoles = getSystemRoles();
        if (systemRoles.some((r) => r.name === roleId)) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Cannot modify system roles' },
          });
        }

        const customRoles = await getCustomRoles(redis);
        const role = customRoles.get(roleId);

        if (!role) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Role not found' },
          });
        }

        // Update role
        const updatedRole: CustomRole = {
          ...role,
          displayName: input.displayName ?? role.displayName,
          description: input.description ?? role.description,
          permissions: input.permissions ?? role.permissions,
          updatedAt: new Date().toISOString(),
        };

        customRoles.set(roleId, updatedRole);
        await saveCustomRoles(redis, customRoles);

        // Audit log
        await prisma.auditLog.create({
          data: {
            action: 'role_updated',
            actorId: adminId,
            targetType: 'role',
            targetId: roleId,
            metadata: { changes: Object.keys(input) },
          },
        });

        logger.info({
          msg: 'custom_role_updated',
          roleId,
          adminId,
        });

        return reply.send({
          success: true,
          data: updatedRole,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to update role');
        return reply.status(500).send({
          success: false,
          error: { code: 'UPDATE_FAILED', message: 'Failed to update role' },
        });
      }
    }
  );

  // ===========================================================================
  // DELETE /admin/roles/:roleId - Delete custom role
  // ===========================================================================
  app.delete(
    '/:roleId',
    {
      schema: {
        description: 'Delete a custom role',
        tags: ['Admin', 'Roles'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['roleId'],
          properties: { roleId: { type: 'string' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { roleId: string } }>, reply: FastifyReply) => {
      try {
        const { roleId } = request.params;
        const adminId = request.user?.id;

        // Cannot delete system roles
        const systemRoles = getSystemRoles();
        if (systemRoles.some((r) => r.name === roleId)) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Cannot delete system roles' },
          });
        }

        const customRoles = await getCustomRoles(redis);
        const role = customRoles.get(roleId);

        if (!role) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Role not found' },
          });
        }

        customRoles.delete(roleId);
        await saveCustomRoles(redis, customRoles);

        // Audit log
        await prisma.auditLog.create({
          data: {
            action: 'role_deleted',
            actorId: adminId,
            targetType: 'role',
            targetId: roleId,
            metadata: { roleName: role.name },
          },
        });

        logger.info({
          msg: 'custom_role_deleted',
          roleId,
          adminId,
        });

        return reply.send({
          success: true,
          message: 'Role deleted successfully',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to delete role');
        return reply.status(500).send({
          success: false,
          error: { code: 'DELETE_FAILED', message: 'Failed to delete role' },
        });
      }
    }
  );

  // ===========================================================================
  // PUT /admin/roles/users/:userId/role - Assign role to user
  // ===========================================================================
  app.put(
    '/users/:userId/role',
    {
      schema: {
        description: 'Assign a role to a user',
        tags: ['Admin', 'Roles'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['role'],
          properties: {
            role: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (
      request: FastifyRequest<{ Params: { userId: string }; Body: { role: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { userId } = request.params;
        const { role } = AssignRoleSchema.parse(request.body);
        const adminId = request.user?.id;

        // Check if user exists
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true, email: true },
        });

        if (!user) {
          return reply.status(404).send({
            success: false,
            error: { code: 'USER_NOT_FOUND', message: 'User not found' },
          });
        }

        // Validate role exists (system or custom)
        const systemRoles = getSystemRoles();
        const isSystemRole = systemRoles.some((r) => r.name === role);

        if (!isSystemRole) {
          const customRoles = await getCustomRoles(redis);
          if (!customRoles.has(`custom_${role}`) && !customRoles.has(role)) {
            return reply.status(400).send({
              success: false,
              error: { code: 'INVALID_ROLE', message: 'Role does not exist' },
            });
          }
        }

        const oldRole = user.role;

        // Update user role (only for system roles - custom roles use overrides)
        if (isSystemRole) {
          await prisma.user.update({
            where: { id: userId },
            data: { role: role as Role },
          });
        } else {
          // For custom roles, store as override
          const override: UserPermissionOverride = {
            userId,
            additionalPermissions: [],
            revokedPermissions: [],
            customRoleId: role.startsWith('custom_') ? role : `custom_${role}`,
            updatedBy: adminId!,
            updatedAt: new Date().toISOString(),
          };
          await saveUserPermissionOverride(redis, userId, override);
        }

        // Audit log
        await prisma.auditLog.create({
          data: {
            action: 'user_role_changed',
            actorId: adminId,
            targetType: 'user',
            targetId: userId,
            metadata: { oldRole, newRole: role },
          },
        });

        logger.info({
          msg: 'user_role_assigned',
          userId,
          oldRole,
          newRole: role,
          adminId,
        });

        return reply.send({
          success: true,
          message: 'Role assigned successfully',
          data: { userId, role },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to assign role');
        return reply.status(500).send({
          success: false,
          error: { code: 'ASSIGN_FAILED', message: 'Failed to assign role' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/roles/users/:userId/permissions - Get user's effective permissions
  // ===========================================================================
  app.get(
    '/users/:userId/permissions',
    {
      schema: {
        description: "Get a user's effective permissions",
        tags: ['Admin', 'Roles'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string', format: 'uuid' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      try {
        const { userId } = request.params;

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, role: true },
        });

        if (!user) {
          return reply.status(404).send({
            success: false,
            error: { code: 'USER_NOT_FOUND', message: 'User not found' },
          });
        }

        // Get base permissions from role
        const basePermissions = RolePermissionsMap[user.role as Role] || [];

        // Get overrides
        const override = await getUserPermissionOverride(redis, userId);

        let effectivePermissions = [...basePermissions];

        if (override) {
          // Add additional permissions
          if (override.additionalPermissions) {
            effectivePermissions = [...new Set([...effectivePermissions, ...override.additionalPermissions])];
          }

          // Remove revoked permissions
          if (override.revokedPermissions) {
            effectivePermissions = effectivePermissions.filter(
              (p) => !override.revokedPermissions.includes(p)
            );
          }

          // If custom role, use its permissions instead
          if (override.customRoleId) {
            const customRoles = await getCustomRoles(redis);
            const customRole = customRoles.get(override.customRoleId);
            if (customRole) {
              effectivePermissions = [...customRole.permissions];
            }
          }
        }

        return reply.send({
          success: true,
          data: {
            userId,
            email: user.email,
            role: user.role,
            basePermissions,
            effectivePermissions,
            override: override
              ? {
                  additionalPermissions: override.additionalPermissions,
                  revokedPermissions: override.revokedPermissions,
                  customRoleId: override.customRoleId,
                }
              : null,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get user permissions');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_FAILED', message: 'Failed to get user permissions' },
        });
      }
    }
  );

  // ===========================================================================
  // PUT /admin/roles/users/:userId/permissions - Update user's permission overrides
  // ===========================================================================
  app.put(
    '/users/:userId/permissions',
    {
      schema: {
        description: "Update a user's permission overrides",
        tags: ['Admin', 'Roles'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          properties: {
            additionalPermissions: { type: 'array', items: { type: 'string' } },
            revokedPermissions: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      try {
        const { userId } = request.params;
        const input = UpdateUserPermissionsSchema.parse(request.body);
        const adminId = request.user?.id;

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true },
        });

        if (!user) {
          return reply.status(404).send({
            success: false,
            error: { code: 'USER_NOT_FOUND', message: 'User not found' },
          });
        }

        const existingOverride = await getUserPermissionOverride(redis, userId);

        const override: UserPermissionOverride = {
          userId,
          additionalPermissions: input.additionalPermissions ?? existingOverride?.additionalPermissions ?? [],
          revokedPermissions: input.revokedPermissions ?? existingOverride?.revokedPermissions ?? [],
          customRoleId: existingOverride?.customRoleId,
          updatedBy: adminId!,
          updatedAt: new Date().toISOString(),
        };

        await saveUserPermissionOverride(redis, userId, override);

        // Audit log
        await prisma.auditLog.create({
          data: {
            action: 'user_permissions_updated',
            actorId: adminId,
            targetType: 'user',
            targetId: userId,
            metadata: {
              additionalPermissions: override.additionalPermissions,
              revokedPermissions: override.revokedPermissions,
            },
          },
        });

        logger.info({
          msg: 'user_permissions_updated',
          userId,
          adminId,
        });

        return reply.send({
          success: true,
          message: 'User permissions updated',
          data: override,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to update user permissions');
        return reply.status(500).send({
          success: false,
          error: { code: 'UPDATE_FAILED', message: 'Failed to update user permissions' },
        });
      }
    }
  );

  // ===========================================================================
  // DELETE /admin/roles/users/:userId/permissions - Reset user permissions to role default
  // ===========================================================================
  app.delete(
    '/users/:userId/permissions',
    {
      schema: {
        description: "Reset a user's permissions to their role's default",
        tags: ['Admin', 'Roles'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string', format: 'uuid' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      try {
        const { userId } = request.params;
        const adminId = request.user?.id;

        await deleteUserPermissionOverride(redis, userId);

        // Audit log
        await prisma.auditLog.create({
          data: {
            action: 'user_permissions_reset',
            actorId: adminId,
            targetType: 'user',
            targetId: userId,
            metadata: {},
          },
        });

        logger.info({
          msg: 'user_permissions_reset',
          userId,
          adminId,
        });

        return reply.send({
          success: true,
          message: 'User permissions reset to role defaults',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to reset user permissions');
        return reply.status(500).send({
          success: false,
          error: { code: 'RESET_FAILED', message: 'Failed to reset user permissions' },
        });
      }
    }
  );
}
