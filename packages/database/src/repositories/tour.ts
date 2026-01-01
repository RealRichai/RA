import { Prisma, TourAssetStatus, TourConversionJobStatus } from '@prisma/client';

import { prisma, getPrismaPageParams, getPrismaOrderBy } from '../index';

// Helper to handle nullable JSON values for Prisma
function toJsonInput(value: Prisma.JsonValue | undefined): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

// ============================================================================
// TourAsset Repository
// ============================================================================

export interface CreateTourAssetInput {
  listingId: string;
  market: string;
  plyS3Key: string;
  plyChecksum: string;
  plyVersionId?: string;
  plySizeBytes?: bigint;
  metadata?: Prisma.JsonValue;
}

export interface UpdateTourAssetInput {
  sogS3Key?: string;
  sogChecksum?: string;
  sogSizeBytes?: bigint;
  converterVersion?: string;
  iterations?: number;
  conversionParams?: Prisma.JsonValue;
  qaScore?: number;
  qaReport?: Prisma.JsonValue;
  qaPassedAt?: Date;
  status?: TourAssetStatus;
  metadata?: Prisma.JsonValue;
}

export interface TourAssetFilters {
  listingId?: string;
  market?: string;
  status?: TourAssetStatus;
}

export const tourAssetRepository = {
  /**
   * Create a new tour asset
   */
  async create(data: CreateTourAssetInput) {
    return prisma.tourAsset.create({
      data: {
        listingId: data.listingId,
        market: data.market,
        plyS3Key: data.plyS3Key,
        plyChecksum: data.plyChecksum,
        plyVersionId: data.plyVersionId,
        plySizeBytes: data.plySizeBytes,
        metadata: toJsonInput(data.metadata),
      },
    });
  },

  /**
   * Find a tour asset by ID
   */
  async findById(id: string) {
    return prisma.tourAsset.findUnique({
      where: { id },
      include: { conversionJobs: true },
    });
  },

  /**
   * Find tour assets by listing ID
   */
  async findByListingId(listingId: string) {
    return prisma.tourAsset.findMany({
      where: { listingId },
      include: { conversionJobs: true },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Find tour assets with filters and pagination
   */
  async findMany(
    filters: TourAssetFilters,
    options?: {
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }
  ) {
    const where: Prisma.TourAssetWhereInput = {};

    if (filters.listingId) where.listingId = filters.listingId;
    if (filters.market) where.market = filters.market;
    if (filters.status) where.status = filters.status;

    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;

    const [items, total] = await Promise.all([
      prisma.tourAsset.findMany({
        where,
        ...getPrismaPageParams(page, limit),
        orderBy: getPrismaOrderBy(
          options?.sortBy,
          options?.sortOrder,
          'createdAt',
          'desc'
        ),
        include: { conversionJobs: true },
      }),
      prisma.tourAsset.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Update a tour asset
   */
  async update(id: string, data: UpdateTourAssetInput) {
    return prisma.tourAsset.update({
      where: { id },
      data: {
        ...data,
        conversionParams: toJsonInput(data.conversionParams),
        qaReport: toJsonInput(data.qaReport),
        metadata: toJsonInput(data.metadata),
      },
    });
  },

  /**
   * Update tour asset status
   */
  async updateStatus(id: string, status: TourAssetStatus) {
    return prisma.tourAsset.update({
      where: { id },
      data: { status },
    });
  },

  /**
   * Mark tour asset as ready with SOG data
   */
  async markAsReady(
    id: string,
    sogData: {
      sogS3Key: string;
      sogChecksum: string;
      sogSizeBytes?: bigint;
      converterVersion: string;
      iterations: number;
    }
  ) {
    return prisma.tourAsset.update({
      where: { id },
      data: {
        ...sogData,
        status: 'ready',
      },
    });
  },

  /**
   * Set QA results
   */
  async setQAResults(
    id: string,
    qaData: {
      qaScore: number;
      qaReport: Prisma.InputJsonValue;
      passed: boolean;
    }
  ) {
    return prisma.tourAsset.update({
      where: { id },
      data: {
        qaScore: qaData.qaScore,
        qaReport: qaData.qaReport,
        qaPassedAt: qaData.passed ? new Date() : null,
      },
    });
  },

  /**
   * Delete a tour asset
   */
  async delete(id: string) {
    return prisma.tourAsset.delete({
      where: { id },
    });
  },

  /**
   * Count tour assets by market
   */
  async countByMarket(market: string) {
    return prisma.tourAsset.count({
      where: { market },
    });
  },

  /**
   * Get ready assets for a market
   */
  async getReadyByMarket(market: string) {
    return prisma.tourAsset.findMany({
      where: {
        market,
        status: 'ready',
      },
      orderBy: { createdAt: 'desc' },
    });
  },
};

// ============================================================================
// TourConversionJob Repository
// ============================================================================

export interface CreateConversionJobInput {
  tourAssetId: string;
  maxAttempts?: number;
}

export interface ConversionJobFilters {
  tourAssetId?: string;
  status?: TourConversionJobStatus;
}

export const tourConversionJobRepository = {
  /**
   * Create a new conversion job
   */
  async create(data: CreateConversionJobInput) {
    return prisma.tourConversionJob.create({
      data: {
        tourAssetId: data.tourAssetId,
        maxAttempts: data.maxAttempts ?? 3,
      },
    });
  },

  /**
   * Find a conversion job by ID
   */
  async findById(id: string) {
    return prisma.tourConversionJob.findUnique({
      where: { id },
      include: { tourAsset: true },
    });
  },

  /**
   * Find conversion jobs for a tour asset
   */
  async findByTourAssetId(tourAssetId: string) {
    return prisma.tourConversionJob.findMany({
      where: { tourAssetId },
      orderBy: { queuedAt: 'desc' },
    });
  },

  /**
   * Find jobs with filters
   */
  async findMany(
    filters: ConversionJobFilters,
    options?: {
      page?: number;
      limit?: number;
    }
  ) {
    const where: Prisma.TourConversionJobWhereInput = {};

    if (filters.tourAssetId) where.tourAssetId = filters.tourAssetId;
    if (filters.status) where.status = filters.status;

    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;

    const [items, total] = await Promise.all([
      prisma.tourConversionJob.findMany({
        where,
        ...getPrismaPageParams(page, limit),
        orderBy: { queuedAt: 'desc' },
        include: { tourAsset: true },
      }),
      prisma.tourConversionJob.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Get next queued job (FIFO)
   */
  async getNextQueued() {
    return prisma.tourConversionJob.findFirst({
      where: { status: 'queued' },
      orderBy: { queuedAt: 'asc' },
      include: { tourAsset: true },
    });
  },

  /**
   * Start processing a job
   */
  async startProcessing(id: string, workerId: string, workerVersion?: string) {
    return prisma.tourConversionJob.update({
      where: { id },
      data: {
        status: 'processing',
        startedAt: new Date(),
        workerId,
        workerVersion,
        attempts: { increment: 1 },
      },
    });
  },

  /**
   * Mark job as completed
   */
  async complete(id: string) {
    return prisma.tourConversionJob.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });
  },

  /**
   * Mark job as failed
   */
  async fail(
    id: string,
    error: {
      code?: string;
      message: string;
      details?: Prisma.InputJsonValue;
    }
  ) {
    const job = await prisma.tourConversionJob.findUnique({
      where: { id },
      select: { attempts: true, maxAttempts: true },
    });

    if (!job) throw new Error(`Job not found: ${id}`);

    const shouldRequeue = job.attempts < job.maxAttempts;

    return prisma.tourConversionJob.update({
      where: { id },
      data: {
        status: shouldRequeue ? 'queued' : 'failed',
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details,
        completedAt: shouldRequeue ? null : new Date(),
      },
    });
  },

  /**
   * Cancel a job
   */
  async cancel(id: string) {
    return prisma.tourConversionJob.update({
      where: { id },
      data: {
        status: 'cancelled',
        completedAt: new Date(),
      },
    });
  },

  /**
   * Get job statistics
   */
  async getStats() {
    const [queued, processing, completed, failed] = await Promise.all([
      prisma.tourConversionJob.count({ where: { status: 'queued' } }),
      prisma.tourConversionJob.count({ where: { status: 'processing' } }),
      prisma.tourConversionJob.count({ where: { status: 'completed' } }),
      prisma.tourConversionJob.count({ where: { status: 'failed' } }),
    ]);

    return { queued, processing, completed, failed, total: queued + processing + completed + failed };
  },

  /**
   * Cleanup stale processing jobs (stuck workers)
   */
  async cleanupStale(staleThresholdMinutes = 30) {
    const staleThreshold = new Date(Date.now() - staleThresholdMinutes * 60 * 1000);

    return prisma.tourConversionJob.updateMany({
      where: {
        status: 'processing',
        startedAt: { lt: staleThreshold },
      },
      data: {
        status: 'queued',
        startedAt: null,
        workerId: null,
      },
    });
  },
};
