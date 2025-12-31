/**
 * User Cache Service
 *
 * Provides caching for user data with automatic invalidation.
 */

import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';
import type { FastifyInstance } from 'fastify';

import { CacheKeys, CacheTags, CacheTTL } from '../../plugins/cache';

// =============================================================================
// Types
// =============================================================================

export interface CachedUserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  phone: string | null;
  avatarUrl: string | null;
  preferences: unknown;
  createdAt: Date;
}

export interface CachedUserWithStats extends CachedUserProfile {
  stats?: {
    propertiesCount: number;
    activeListingsCount: number;
    leasesCount: number;
  };
}

// =============================================================================
// User Cache Functions
// =============================================================================

/**
 * Get a user by ID with caching
 */
export async function getCachedUser(
  app: FastifyInstance,
  id: string
): Promise<CachedUserProfile | null> {
  const cacheKey = CacheKeys.user(id);

  return app.cache.getOrSet(
    cacheKey,
    async () => {
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          phone: true,
          avatarUrl: true,
          preferences: true,
          createdAt: true,
        },
      });

      if (!user) {
        return null;
      }

      return user as CachedUserProfile;
    },
    {
      ttl: CacheTTL.MEDIUM,
      tags: [CacheTags.user(id), CacheTags.allUsers()],
    }
  );
}

/**
 * Get a user by email with caching
 */
export async function getCachedUserByEmail(
  app: FastifyInstance,
  email: string
): Promise<CachedUserProfile | null> {
  const cacheKey = CacheKeys.userByEmail(email);

  return app.cache.getOrSet(
    cacheKey,
    async () => {
      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          phone: true,
          avatarUrl: true,
          preferences: true,
          createdAt: true,
        },
      });

      if (!user) {
        return null;
      }

      return user as CachedUserProfile;
    },
    {
      ttl: CacheTTL.MEDIUM,
      tags: [CacheTags.allUsers()],
    }
  );
}

/**
 * Get user profile with stats (for dashboard)
 */
export async function getCachedUserProfile(
  app: FastifyInstance,
  id: string
): Promise<CachedUserWithStats | null> {
  const cacheKey = CacheKeys.userProfile(id);

  return app.cache.getOrSet(
    cacheKey,
    async () => {
      const [user, propertiesCount, activeListingsCount, leasesCount] = await Promise.all([
        prisma.user.findUnique({
          where: { id },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
            phone: true,
            avatarUrl: true,
            preferences: true,
            createdAt: true,
          },
        }),
        prisma.property.count({ where: { ownerId: id } }),
        prisma.listing.count({
          where: {
            OR: [{ agentId: id }, { unit: { property: { ownerId: id } } }],
            status: 'active',
          },
        }),
        prisma.lease.count({
          where: {
            OR: [
              { tenantId: id },
              { property: { ownerId: id } },
            ],
            status: { in: ['active', 'pending'] },
          },
        }),
      ]);

      if (!user) {
        return null;
      }

      return {
        ...user,
        stats: {
          propertiesCount,
          activeListingsCount,
          leasesCount,
        },
      } as CachedUserWithStats;
    },
    {
      ttl: CacheTTL.SHORT, // Stats change more frequently
      tags: [CacheTags.user(id)],
    }
  );
}

// =============================================================================
// Cache Invalidation
// =============================================================================

/**
 * Invalidate cache for a specific user
 */
export async function invalidateUserCache(
  app: FastifyInstance,
  userId: string,
  email?: string
): Promise<void> {
  try {
    const promises: Promise<unknown>[] = [
      app.cache.delete(CacheKeys.user(userId)),
      app.cache.delete(CacheKeys.userProfile(userId)),
      app.cache.deleteByTag(CacheTags.user(userId)),
    ];

    if (email) {
      promises.push(app.cache.delete(CacheKeys.userByEmail(email)));
    }

    await Promise.all(promises);

    logger.info({ userId }, 'User cache invalidated');
  } catch (error) {
    logger.error({ error, userId }, 'Failed to invalidate user cache');
  }
}

/**
 * Invalidate all user caches (use sparingly)
 */
export async function invalidateAllUsersCache(app: FastifyInstance): Promise<void> {
  try {
    await app.cache.deleteByTag(CacheTags.allUsers());
    await app.cache.deleteByPattern('user:*');

    logger.info('All users cache invalidated');
  } catch (error) {
    logger.error({ error }, 'Failed to invalidate all users cache');
  }
}
