/**
 * Listing Cache Service
 *
 * Provides caching for listing data with automatic invalidation.
 */

import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';
import type { FastifyInstance } from 'fastify';

import { CacheKeys, CacheTags, CacheTTL } from '../../plugins/cache';

// =============================================================================
// Types
// =============================================================================

interface ListingWithDetails {
  id: string;
  title: string;
  description: string | null;
  rent: number;
  status: string;
  viewCount: number;
  unit?: {
    id: string;
    bedrooms: number;
    bathrooms: number;
    property?: {
      id: string;
      name: string;
      address: unknown;
      amenities: string[];
      type?: string;
    };
  };
  media?: Array<{
    id: string;
    url: string;
    type: string;
    isPrimary: boolean;
    order: number;
  }>;
  agent?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
  [key: string]: unknown;
}

// =============================================================================
// Listing Cache Functions
// =============================================================================

/**
 * Get a listing by ID with caching
 */
export async function getCachedListing(
  app: FastifyInstance,
  id: string
): Promise<ListingWithDetails | null> {
  const cacheKey = CacheKeys.listing(id);

  return app.cache.getOrSet(
    cacheKey,
    async () => {
      const listing = await prisma.listing.findUnique({
        where: { id },
        include: {
          unit: {
            include: {
              property: {
                select: { id: true, name: true, address: true, amenities: true, type: true },
              },
            },
          },
          media: { orderBy: { order: 'asc' } },
          agent: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        },
      });

      if (!listing) {
        return null;
      }

      return listing as unknown as ListingWithDetails;
    },
    {
      ttl: CacheTTL.MEDIUM,
      tags: [CacheTags.listing(id), CacheTags.allListings()],
    }
  );
}

/**
 * Get featured listings with caching
 */
export async function getCachedFeaturedListings(
  app: FastifyInstance,
  limit = 10
): Promise<ListingWithDetails[]> {
  const cacheKey = `${CacheKeys.listingsFeatured()}:${limit}`;

  return app.cache.getOrSet(
    cacheKey,
    async () => {
      const listings = await prisma.listing.findMany({
        where: { status: 'active', isFeatured: true },
        take: limit,
        include: {
          unit: {
            include: {
              property: {
                select: { id: true, name: true, address: true, amenities: true },
              },
            },
          },
          media: { where: { isPrimary: true }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
      });

      return listings as unknown as ListingWithDetails[];
    },
    {
      ttl: CacheTTL.LONG, // Featured listings change less frequently
      tags: [CacheTags.allListings()],
    }
  );
}

/**
 * Get listings by property with caching
 */
export async function getCachedListingsByProperty(
  app: FastifyInstance,
  propertyId: string
): Promise<ListingWithDetails[]> {
  const cacheKey = CacheKeys.listingsByProperty(propertyId);

  return app.cache.getOrSet(
    cacheKey,
    async () => {
      const listings = await prisma.listing.findMany({
        where: {
          unit: { propertyId },
          status: 'active',
        },
        include: {
          unit: true,
          media: { where: { isPrimary: true }, take: 1 },
        },
        orderBy: { rent: 'asc' },
      });

      return listings as unknown as ListingWithDetails[];
    },
    {
      ttl: CacheTTL.MEDIUM,
      tags: [CacheTags.property(propertyId), CacheTags.allListings()],
    }
  );
}

// =============================================================================
// Cache Invalidation
// =============================================================================

/**
 * Invalidate cache for a specific listing
 */
export async function invalidateListingCache(
  app: FastifyInstance,
  listingId: string
): Promise<void> {
  try {
    // Delete the specific listing cache
    await app.cache.delete(CacheKeys.listing(listingId));

    // Invalidate by tag to clear related caches
    await app.cache.deleteByTag(CacheTags.listing(listingId));

    logger.info({ listingId }, 'Listing cache invalidated');
  } catch (error) {
    logger.error({ error, listingId }, 'Failed to invalidate listing cache');
  }
}

/**
 * Invalidate all listing caches for a property
 */
export async function invalidatePropertyListingsCache(
  app: FastifyInstance,
  propertyId: string
): Promise<void> {
  try {
    await app.cache.delete(CacheKeys.listingsByProperty(propertyId));
    await app.cache.deleteByTag(CacheTags.property(propertyId));

    logger.info({ propertyId }, 'Property listings cache invalidated');
  } catch (error) {
    logger.error({ error, propertyId }, 'Failed to invalidate property listings cache');
  }
}

/**
 * Invalidate all listing caches (use sparingly)
 */
export async function invalidateAllListingsCache(app: FastifyInstance): Promise<void> {
  try {
    await app.cache.deleteByTag(CacheTags.allListings());
    await app.cache.deleteByPattern('listing:*');

    logger.info('All listings cache invalidated');
  } catch (error) {
    logger.error({ error }, 'Failed to invalidate all listings cache');
  }
}

// =============================================================================
// Cache Warming (optional, for high-traffic pages)
// =============================================================================

/**
 * Pre-warm cache for high-traffic listings
 */
export async function warmListingCache(
  app: FastifyInstance,
  listingIds: string[]
): Promise<void> {
  const promises = listingIds.map((id) => getCachedListing(app, id));
  await Promise.allSettled(promises);
  logger.info({ count: listingIds.length }, 'Listing cache warmed');
}

/**
 * Pre-warm featured listings cache
 */
export async function warmFeaturedListingsCache(app: FastifyInstance): Promise<void> {
  await getCachedFeaturedListings(app, 20);
  logger.info('Featured listings cache warmed');
}
