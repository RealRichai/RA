/**
 * Shadow Write Service
 *
 * Implements dual-write pattern for Listings with fault injection support.
 * Primary: Prisma PostgreSQL
 * Shadow: In-memory store (for demonstration/testing)
 *
 * In production, shadow would be a separate database or cache.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';

import { emitShadowWriteEvidence } from './evidence.js';
import {
  recordShadowWriteDuration,
  recordShadowWriteFailure,
  recordShadowWriteSuccess,
} from './metrics.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Listing entity type (simplified for shadow store)
 */
interface ListingEntity {
  id: string;
  title: string;
  description: string | null;
  price: number;
  status: string;
  propertyId: string;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}

export interface ShadowWriteContext {
  requestId?: string;
  userId?: string;
  organizationId?: string;
}

export interface ShadowWriteResult<T> {
  canonical: T;
  shadowSuccess: boolean;
  shadowError?: Error;
  faultId?: string;
  durationMs: number;
}

// =============================================================================
// Shadow Store (In-Memory for Demo)
// =============================================================================

/**
 * In-memory shadow store for Listings
 * In a real implementation, this would be a separate database, cache, or queue
 */
class ListingShadowStore {
  private store = new Map<string, ListingEntity>();

  async create(listing: ListingEntity): Promise<ListingEntity> {
    this.store.set(listing.id, { ...listing });
    return listing;
  }

  async update(id: string, data: Partial<ListingEntity>): Promise<ListingEntity | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data };
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async findById(id: string): Promise<ListingEntity | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(options?: { limit?: number; offset?: number }): Promise<ListingEntity[]> {
    const all = Array.from(this.store.values());
    const offset = options?.offset || 0;
    const limit = options?.limit || all.length;
    return all.slice(offset, offset + limit);
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  async getAllIds(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  clear(): void {
    this.store.clear();
  }
}

// Singleton shadow store
const shadowStore = new ListingShadowStore();

// =============================================================================
// Fault Injector Integration
// =============================================================================

let faultInjectorModule: typeof import('@realriches/testing') | null = null;

async function getFaultInjector() {
  if (!faultInjectorModule) {
    try {
      faultInjectorModule = await import('@realriches/testing');
    } catch {
      // Package not available, return no-op
      return null;
    }
  }
  return faultInjectorModule.getFaultInjector();
}

function isInjectedFaultError(error: unknown): error is { faultId: string } {
  return (
    error !== null &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name: string }).name === 'InjectedFaultError' &&
    'faultId' in error
  );
}

// =============================================================================
// Shadow Write Service
// =============================================================================

export class ShadowWriteService {
  private readonly entityType = 'Listing';

  /**
   * Create a listing with shadow write
   */
  async createListing(
    data: Prisma.ListingCreateInput,
    context: ShadowWriteContext
  ): Promise<ShadowWriteResult<ListingEntity>> {
    // Step 1: Canonical write to primary (PostgreSQL)
    const canonical = await prisma.listing.create({ data });

    // Step 2: Shadow write with fault injection
    const shadowStart = Date.now();
    let shadowSuccess = false;
    let shadowError: Error | undefined;
    let faultId: string | undefined;

    try {
      // Check for fault injection
      const injector = await getFaultInjector();
      if (injector) {
        injector.maybeInjectFault('shadow_write_only', `${this.entityType}:create`);
      }

      // Shadow write
      await shadowStore.create(canonical);
      shadowSuccess = true;

      recordShadowWriteSuccess({
        entityType: this.entityType,
        operation: 'create',
      });
    } catch (error) {
      shadowSuccess = false;
      shadowError = error instanceof Error ? error : new Error(String(error));

      if (isInjectedFaultError(error)) {
        faultId = error.faultId;
      }

      recordShadowWriteFailure(
        { entityType: this.entityType, operation: 'create' },
        !!faultId
      );

      // Record failure evidence
      await this.recordFailure({
        operation: 'create',
        entityId: canonical.id,
        error: shadowError,
        faultId,
        context,
      });
    }

    const durationMs = Date.now() - shadowStart;
    recordShadowWriteDuration(
      { entityType: this.entityType, operation: 'create' },
      durationMs,
      shadowSuccess
    );

    return {
      canonical,
      shadowSuccess,
      shadowError,
      faultId,
      durationMs,
    };
  }

  /**
   * Update a listing with shadow write
   */
  async updateListing(
    id: string,
    data: Prisma.ListingUpdateInput,
    context: ShadowWriteContext
  ): Promise<ShadowWriteResult<ListingEntity>> {
    // Step 1: Canonical update to primary
    const canonical = await prisma.listing.update({
      where: { id },
      data,
    });

    // Step 2: Shadow update with fault injection
    const shadowStart = Date.now();
    let shadowSuccess = false;
    let shadowError: Error | undefined;
    let faultId: string | undefined;

    try {
      const injector = await getFaultInjector();
      if (injector) {
        injector.maybeInjectFault('shadow_write_only', `${this.entityType}:update`);
      }

      await shadowStore.update(id, canonical);
      shadowSuccess = true;

      recordShadowWriteSuccess({
        entityType: this.entityType,
        operation: 'update',
      });
    } catch (error) {
      shadowSuccess = false;
      shadowError = error instanceof Error ? error : new Error(String(error));

      if (isInjectedFaultError(error)) {
        faultId = error.faultId;
      }

      recordShadowWriteFailure(
        { entityType: this.entityType, operation: 'update' },
        !!faultId
      );

      await this.recordFailure({
        operation: 'update',
        entityId: id,
        error: shadowError,
        faultId,
        context,
      });
    }

    const durationMs = Date.now() - shadowStart;
    recordShadowWriteDuration(
      { entityType: this.entityType, operation: 'update' },
      durationMs,
      shadowSuccess
    );

    return {
      canonical,
      shadowSuccess,
      shadowError,
      faultId,
      durationMs,
    };
  }

  /**
   * Delete a listing with shadow write
   */
  async deleteListing(
    id: string,
    context: ShadowWriteContext
  ): Promise<ShadowWriteResult<ListingEntity>> {
    // Step 1: Canonical delete from primary
    const canonical = await prisma.listing.delete({
      where: { id },
    });

    // Step 2: Shadow delete with fault injection
    const shadowStart = Date.now();
    let shadowSuccess = false;
    let shadowError: Error | undefined;
    let faultId: string | undefined;

    try {
      const injector = await getFaultInjector();
      if (injector) {
        injector.maybeInjectFault('shadow_write_only', `${this.entityType}:delete`);
      }

      await shadowStore.delete(id);
      shadowSuccess = true;

      recordShadowWriteSuccess({
        entityType: this.entityType,
        operation: 'delete',
      });
    } catch (error) {
      shadowSuccess = false;
      shadowError = error instanceof Error ? error : new Error(String(error));

      if (isInjectedFaultError(error)) {
        faultId = error.faultId;
      }

      recordShadowWriteFailure(
        { entityType: this.entityType, operation: 'delete' },
        !!faultId
      );

      await this.recordFailure({
        operation: 'delete',
        entityId: id,
        error: shadowError,
        faultId,
        context,
      });
    }

    const durationMs = Date.now() - shadowStart;
    recordShadowWriteDuration(
      { entityType: this.entityType, operation: 'delete' },
      durationMs,
      shadowSuccess
    );

    return {
      canonical,
      shadowSuccess,
      shadowError,
      faultId,
      durationMs,
    };
  }

  /**
   * Read from primary (shadow is write-only)
   */
  async readListing(id: string): Promise<ListingEntity | null> {
    return prisma.listing.findUnique({ where: { id } });
  }

  /**
   * Get shadow store for discrepancy checking
   */
  getShadowStore(): ListingShadowStore {
    return shadowStore;
  }

  /**
   * Record shadow write failure as evidence
   */
  private async recordFailure(params: {
    operation: 'create' | 'update' | 'delete';
    entityId: string;
    error: Error;
    faultId?: string;
    context: ShadowWriteContext;
  }): Promise<void> {
    try {
      await emitShadowWriteEvidence({
        eventType: 'SHADOW_WRITE_FAILURE',
        entityType: this.entityType,
        entityId: params.entityId,
        operation: params.operation,
        errorMessage: params.error.message,
        errorName: params.error.name,
        faultId: params.faultId,
        requestId: params.context.requestId,
        userId: params.context.userId,
        organizationId: params.context.organizationId,
      });
    } catch (evidenceError) {
      logger.error({ err: evidenceError }, 'Failed to emit shadow write evidence');
    }
  }
}

// Singleton service instance
let serviceInstance: ShadowWriteService | null = null;

export function getShadowWriteService(): ShadowWriteService {
  if (!serviceInstance) {
    serviceInstance = new ShadowWriteService();
  }
  return serviceInstance;
}

/**
 * Reset the service (for testing)
 */
export function resetShadowWriteService(): void {
  shadowStore.clear();
  serviceInstance = null;
}
