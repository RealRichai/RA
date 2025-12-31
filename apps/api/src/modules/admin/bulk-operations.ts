/**
 * Bulk Operations Admin API
 *
 * Provides bulk import/export functionality for:
 * - Properties
 * - Units
 * - Tenants
 * - Leases
 *
 * Supports CSV and JSON formats with background processing.
 */

import { prisma } from '@realriches/database';
import { logger, generatePrefixedId } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';

// =============================================================================
// Constants
// =============================================================================

const BULK_JOB_PREFIX = 'bulk_job:';
const BULK_JOB_TTL = 86400; // 24 hours
const MAX_BATCH_SIZE = 1000;
const CHUNK_SIZE = 100;

// =============================================================================
// Types
// =============================================================================

type BulkOperationType = 'import' | 'export';
type BulkEntityType = 'properties' | 'units' | 'tenants' | 'leases';
type BulkJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
type BulkFormat = 'csv' | 'json';

interface BulkJob {
  id: string;
  type: BulkOperationType;
  entityType: BulkEntityType;
  format: BulkFormat;
  status: BulkJobStatus;
  userId: string;
  totalRecords: number;
  processedRecords: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ row: number; field?: string; message: string }>;
  warnings: Array<{ row: number; field?: string; message: string }>;
  resultUrl?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface ImportRow {
  [key: string]: string | number | boolean | null | undefined;
}

// =============================================================================
// Schemas
// =============================================================================

const CreateImportJobSchema = z.object({
  entityType: z.enum(['properties', 'units', 'tenants', 'leases']),
  format: z.enum(['csv', 'json']),
  data: z.string(), // CSV string or JSON string
  options: z
    .object({
      skipDuplicates: z.boolean().default(false),
      updateExisting: z.boolean().default(false),
      validateOnly: z.boolean().default(false),
    })
    .optional(),
});

const CreateExportJobSchema = z.object({
  entityType: z.enum(['properties', 'units', 'tenants', 'leases']),
  format: z.enum(['csv', 'json']),
  filters: z
    .object({
      ids: z.array(z.string()).optional(),
      status: z.string().optional(),
      createdAfter: z.string().optional(),
      createdBefore: z.string().optional(),
    })
    .optional(),
});

// =============================================================================
// In-Memory Storage (Redis fallback)
// =============================================================================

const inMemoryJobs = new Map<string, BulkJob>();

// =============================================================================
// Helper Functions
// =============================================================================

function getRedis(app: FastifyInstance): Redis | null {
  return (app as unknown as { redis?: Redis }).redis || null;
}

async function getJob(redis: Redis | null, jobId: string): Promise<BulkJob | null> {
  if (redis) {
    const data = await redis.get(`${BULK_JOB_PREFIX}${jobId}`);
    if (data) return JSON.parse(data);
  }
  return inMemoryJobs.get(jobId) || null;
}

async function saveJob(redis: Redis | null, job: BulkJob): Promise<void> {
  if (redis) {
    await redis.setex(`${BULK_JOB_PREFIX}${job.id}`, BULK_JOB_TTL, JSON.stringify(job));
  }
  inMemoryJobs.set(job.id, job);
}

async function listUserJobs(redis: Redis | null, userId: string): Promise<BulkJob[]> {
  const jobs: BulkJob[] = [];

  if (redis) {
    const keys = await redis.keys(`${BULK_JOB_PREFIX}*`);
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const job = JSON.parse(data) as BulkJob;
        if (job.userId === userId) {
          jobs.push(job);
        }
      }
    }
  } else {
    inMemoryJobs.forEach((job) => {
      if (job.userId === userId) {
        jobs.push(job);
      }
    });
  }

  return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// =============================================================================
// CSV Parsing
// =============================================================================

function parseCSV(csvString: string): ImportRow[] {
  const lines = csvString.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows: ImportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row: ImportRow = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx];
      });
      rows.push(row);
    }
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function toCSV(data: Record<string, unknown>[], headers?: string[]): string {
  if (data.length === 0) return '';

  const allHeaders = headers || Object.keys(data[0]);
  const lines: string[] = [allHeaders.join(',')];

  for (const row of data) {
    const values = allHeaders.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

// =============================================================================
// Validation Functions
// =============================================================================

function validatePropertyRow(row: ImportRow, rowIndex: number): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!row.name || typeof row.name !== 'string') {
    errors.push(`Row ${rowIndex}: name is required`);
  }

  if (!row.address || typeof row.address !== 'string') {
    errors.push(`Row ${rowIndex}: address is required`);
  }

  if (!row.city || typeof row.city !== 'string') {
    errors.push(`Row ${rowIndex}: city is required`);
  }

  if (!row.state || typeof row.state !== 'string') {
    errors.push(`Row ${rowIndex}: state is required`);
  }

  if (!row.zipCode || typeof row.zipCode !== 'string') {
    errors.push(`Row ${rowIndex}: zipCode is required`);
  }

  const validTypes = ['single_family', 'multi_family', 'condo', 'townhouse', 'apartment', 'commercial'];
  if (row.type && !validTypes.includes(String(row.type))) {
    errors.push(`Row ${rowIndex}: invalid type "${row.type}"`);
  }

  return { valid: errors.length === 0, errors };
}

function validateUnitRow(row: ImportRow, rowIndex: number): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!row.propertyId && !row.propertyName) {
    errors.push(`Row ${rowIndex}: propertyId or propertyName is required`);
  }

  if (!row.unitNumber || typeof row.unitNumber !== 'string') {
    errors.push(`Row ${rowIndex}: unitNumber is required`);
  }

  if (row.bedrooms !== undefined && (isNaN(Number(row.bedrooms)) || Number(row.bedrooms) < 0)) {
    errors.push(`Row ${rowIndex}: bedrooms must be a non-negative number`);
  }

  if (row.bathrooms !== undefined && (isNaN(Number(row.bathrooms)) || Number(row.bathrooms) < 0)) {
    errors.push(`Row ${rowIndex}: bathrooms must be a non-negative number`);
  }

  if (row.sqft !== undefined && (isNaN(Number(row.sqft)) || Number(row.sqft) < 0)) {
    errors.push(`Row ${rowIndex}: sqft must be a non-negative number`);
  }

  return { valid: errors.length === 0, errors };
}

function validateTenantRow(row: ImportRow, rowIndex: number): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!row.email || typeof row.email !== 'string') {
    errors.push(`Row ${rowIndex}: email is required`);
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    errors.push(`Row ${rowIndex}: invalid email format`);
  }

  if (!row.firstName || typeof row.firstName !== 'string') {
    errors.push(`Row ${rowIndex}: firstName is required`);
  }

  if (!row.lastName || typeof row.lastName !== 'string') {
    errors.push(`Row ${rowIndex}: lastName is required`);
  }

  return { valid: errors.length === 0, errors };
}

function validateLeaseRow(row: ImportRow, rowIndex: number): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!row.unitId && !row.unitNumber) {
    errors.push(`Row ${rowIndex}: unitId or unitNumber is required`);
  }

  if (!row.tenantEmail && !row.tenantId) {
    errors.push(`Row ${rowIndex}: tenantEmail or tenantId is required`);
  }

  if (!row.startDate || typeof row.startDate !== 'string') {
    errors.push(`Row ${rowIndex}: startDate is required`);
  }

  if (!row.endDate || typeof row.endDate !== 'string') {
    errors.push(`Row ${rowIndex}: endDate is required`);
  }

  if (!row.rentAmount || isNaN(Number(row.rentAmount)) || Number(row.rentAmount) <= 0) {
    errors.push(`Row ${rowIndex}: rentAmount must be a positive number`);
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// Import Processing
// =============================================================================

async function processImport(
  job: BulkJob,
  rows: ImportRow[],
  userId: string,
  options: { skipDuplicates?: boolean; updateExisting?: boolean; validateOnly?: boolean },
  redis: Redis | null
): Promise<void> {
  job.status = 'processing';
  job.startedAt = new Date().toISOString();
  job.totalRecords = rows.length;
  await saveJob(redis, job);

  const errors: Array<{ row: number; field?: string; message: string }> = [];
  const warnings: Array<{ row: number; field?: string; message: string }> = [];
  let successCount = 0;

  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowIndex = i + 2; // Account for header row and 0-indexing

      try {
        // Validate
        let validation: { valid: boolean; errors: string[] };
        switch (job.entityType) {
          case 'properties':
            validation = validatePropertyRow(row, rowIndex);
            break;
          case 'units':
            validation = validateUnitRow(row, rowIndex);
            break;
          case 'tenants':
            validation = validateTenantRow(row, rowIndex);
            break;
          case 'leases':
            validation = validateLeaseRow(row, rowIndex);
            break;
          default:
            validation = { valid: false, errors: [`Unknown entity type: ${job.entityType}`] };
        }

        if (!validation.valid) {
          validation.errors.forEach((err) => {
            errors.push({ row: rowIndex, message: err });
          });
          continue;
        }

        if (options.validateOnly) {
          successCount++;
          continue;
        }

        // Import based on entity type
        switch (job.entityType) {
          case 'properties':
            await importProperty(row, userId, options);
            successCount++;
            break;
          case 'units':
            await importUnit(row, userId, options);
            successCount++;
            break;
          case 'tenants':
            await importTenant(row, options);
            successCount++;
            break;
          case 'leases':
            await importLease(row, userId, options);
            successCount++;
            break;
        }
      } catch (error) {
        errors.push({
          row: rowIndex,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Update progress every chunk
      if ((i + 1) % CHUNK_SIZE === 0 || i === rows.length - 1) {
        job.processedRecords = i + 1;
        job.successCount = successCount;
        job.errorCount = errors.length;
        job.errors = errors.slice(0, 100); // Keep first 100 errors
        job.warnings = warnings.slice(0, 100);
        await saveJob(redis, job);
      }
    }

    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.processedRecords = rows.length;
    job.successCount = successCount;
    job.errorCount = errors.length;
    job.errors = errors.slice(0, 100);
    job.warnings = warnings.slice(0, 100);
    await saveJob(redis, job);

    logger.info({
      msg: 'bulk_import_completed',
      jobId: job.id,
      entityType: job.entityType,
      total: rows.length,
      success: successCount,
      errors: errors.length,
    });
  } catch (error) {
    job.status = 'failed';
    job.completedAt = new Date().toISOString();
    job.errors = [{ row: 0, message: error instanceof Error ? error.message : 'Import failed' }];
    await saveJob(redis, job);

    logger.error({ error, jobId: job.id }, 'Bulk import failed');
  }
}

async function importProperty(
  row: ImportRow,
  userId: string,
  _options: { skipDuplicates?: boolean; updateExisting?: boolean }
): Promise<void> {
  await prisma.property.create({
    data: {
      id: generatePrefixedId('prop'),
      name: String(row.name),
      address: String(row.address),
      city: String(row.city),
      state: String(row.state),
      zipCode: String(row.zipCode),
      country: String(row.country || 'US'),
      type: (row.type as 'single_family') || 'single_family',
      status: 'active',
      ownerId: userId,
      description: row.description ? String(row.description) : '',
      yearBuilt: row.yearBuilt ? Number(row.yearBuilt) : null,
      totalUnits: row.totalUnits ? Number(row.totalUnits) : 1,
    },
  });
}

async function importUnit(
  row: ImportRow,
  userId: string,
  _options: { skipDuplicates?: boolean; updateExisting?: boolean }
): Promise<void> {
  let propertyId = row.propertyId ? String(row.propertyId) : null;

  if (!propertyId && row.propertyName) {
    const property = await prisma.property.findFirst({
      where: { name: String(row.propertyName), ownerId: userId },
      select: { id: true },
    });
    if (property) propertyId = property.id;
  }

  if (!propertyId) {
    throw new Error('Property not found');
  }

  await prisma.unit.create({
    data: {
      id: generatePrefixedId('unit'),
      propertyId,
      unitNumber: String(row.unitNumber),
      bedrooms: row.bedrooms ? Number(row.bedrooms) : 0,
      bathrooms: row.bathrooms ? Number(row.bathrooms) : 1,
      sqft: row.sqft ? Number(row.sqft) : null,
      status: 'available',
      floor: row.floor ? Number(row.floor) : null,
    },
  });
}

async function importTenant(
  row: ImportRow,
  _options: { skipDuplicates?: boolean; updateExisting?: boolean }
): Promise<void> {
  // Check if user already exists
  const existing = await prisma.user.findUnique({
    where: { email: String(row.email).toLowerCase() },
  });

  if (existing) {
    throw new Error('User with this email already exists');
  }

  await prisma.user.create({
    data: {
      id: generatePrefixedId('usr'),
      email: String(row.email).toLowerCase(),
      firstName: String(row.firstName),
      lastName: String(row.lastName),
      phone: row.phone ? String(row.phone) : null,
      role: 'tenant',
      status: 'pending_verification',
      passwordHash: '', // Would need to generate or require password
    },
  });
}

async function importLease(
  row: ImportRow,
  userId: string,
  _options: { skipDuplicates?: boolean; updateExisting?: boolean }
): Promise<void> {
  let unitId = row.unitId ? String(row.unitId) : null;

  if (!unitId && row.unitNumber && row.propertyId) {
    const unit = await prisma.unit.findFirst({
      where: {
        unitNumber: String(row.unitNumber),
        propertyId: String(row.propertyId),
      },
      select: { id: true },
    });
    if (unit) unitId = unit.id;
  }

  if (!unitId) {
    throw new Error('Unit not found');
  }

  // Get property for the unit
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { propertyId: true },
  });

  if (!unit) {
    throw new Error('Unit not found');
  }

  await prisma.lease.create({
    data: {
      id: generatePrefixedId('lease'),
      propertyId: unit.propertyId,
      unitId,
      ownerId: userId,
      startDate: new Date(String(row.startDate)),
      endDate: new Date(String(row.endDate)),
      rentAmount: Number(row.rentAmount),
      securityDeposit: row.securityDeposit ? Number(row.securityDeposit) : Number(row.rentAmount),
      status: 'draft',
      type: 'standard',
    },
  });
}

// =============================================================================
// Export Processing
// =============================================================================

async function processExport(
  job: BulkJob,
  filters: { ids?: string[]; status?: string; createdAfter?: string; createdBefore?: string },
  userId: string,
  redis: Redis | null
): Promise<void> {
  job.status = 'processing';
  job.startedAt = new Date().toISOString();
  await saveJob(redis, job);

  try {
    let data: Record<string, unknown>[] = [];

    switch (job.entityType) {
      case 'properties':
        data = await exportProperties(userId, filters);
        break;
      case 'units':
        data = await exportUnits(userId, filters);
        break;
      case 'tenants':
        data = await exportTenants(userId);
        break;
      case 'leases':
        data = await exportLeases(userId, filters);
        break;
    }

    job.totalRecords = data.length;
    job.processedRecords = data.length;
    job.successCount = data.length;

    // Generate result
    let result: string;
    if (job.format === 'csv') {
      result = toCSV(data);
    } else {
      result = JSON.stringify(data, null, 2);
    }

    // Store result (in production, would upload to S3)
    if (redis) {
      await redis.setex(`bulk_result:${job.id}`, BULK_JOB_TTL, result);
    }

    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.resultUrl = `/api/v1/admin/bulk/jobs/${job.id}/download`;
    await saveJob(redis, job);

    logger.info({
      msg: 'bulk_export_completed',
      jobId: job.id,
      entityType: job.entityType,
      recordCount: data.length,
    });
  } catch (error) {
    job.status = 'failed';
    job.completedAt = new Date().toISOString();
    job.errors = [{ row: 0, message: error instanceof Error ? error.message : 'Export failed' }];
    await saveJob(redis, job);

    logger.error({ error, jobId: job.id }, 'Bulk export failed');
  }
}

async function exportProperties(
  userId: string,
  filters: { ids?: string[]; status?: string; createdAfter?: string; createdBefore?: string }
): Promise<Record<string, unknown>[]> {
  const where: Record<string, unknown> = { ownerId: userId };

  if (filters.ids?.length) {
    where.id = { in: filters.ids };
  }
  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.createdAfter) {
    where.createdAt = { ...((where.createdAt as object) || {}), gte: new Date(filters.createdAfter) };
  }
  if (filters.createdBefore) {
    where.createdAt = { ...((where.createdAt as object) || {}), lte: new Date(filters.createdBefore) };
  }

  const properties = await prisma.property.findMany({
    where,
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      country: true,
      type: true,
      status: true,
      yearBuilt: true,
      totalUnits: true,
      createdAt: true,
    },
  });

  return properties.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
  }));
}

async function exportUnits(
  userId: string,
  filters: { ids?: string[]; status?: string }
): Promise<Record<string, unknown>[]> {
  const where: Record<string, unknown> = {
    property: { ownerId: userId },
  };

  if (filters.ids?.length) {
    where.id = { in: filters.ids };
  }
  if (filters.status) {
    where.status = filters.status;
  }

  const units = await prisma.unit.findMany({
    where,
    select: {
      id: true,
      propertyId: true,
      unitNumber: true,
      bedrooms: true,
      bathrooms: true,
      sqft: true,
      floor: true,
      status: true,
      createdAt: true,
      property: {
        select: { name: true },
      },
    },
  });

  return units.map((u) => ({
    id: u.id,
    propertyId: u.propertyId,
    propertyName: u.property.name,
    unitNumber: u.unitNumber,
    bedrooms: u.bedrooms,
    bathrooms: u.bathrooms,
    sqft: u.sqft,
    floor: u.floor,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
  }));
}

async function exportTenants(userId: string): Promise<Record<string, unknown>[]> {
  // Get tenants who have leases on user's properties
  const leases = await prisma.lease.findMany({
    where: { ownerId: userId },
    select: {
      tenants: {
        select: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  const tenantMap = new Map<string, Record<string, unknown>>();

  leases.forEach((lease) => {
    lease.tenants.forEach((t) => {
      if (!tenantMap.has(t.user.id)) {
        tenantMap.set(t.user.id, {
          id: t.user.id,
          email: t.user.email,
          firstName: t.user.firstName,
          lastName: t.user.lastName,
          phone: t.user.phone,
          createdAt: t.user.createdAt.toISOString(),
        });
      }
    });
  });

  return Array.from(tenantMap.values());
}

async function exportLeases(
  userId: string,
  filters: { ids?: string[]; status?: string; createdAfter?: string; createdBefore?: string }
): Promise<Record<string, unknown>[]> {
  const where: Record<string, unknown> = { ownerId: userId };

  if (filters.ids?.length) {
    where.id = { in: filters.ids };
  }
  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.createdAfter) {
    where.createdAt = { ...((where.createdAt as object) || {}), gte: new Date(filters.createdAfter) };
  }
  if (filters.createdBefore) {
    where.createdAt = { ...((where.createdAt as object) || {}), lte: new Date(filters.createdBefore) };
  }

  const leases = await prisma.lease.findMany({
    where,
    select: {
      id: true,
      propertyId: true,
      unitId: true,
      startDate: true,
      endDate: true,
      rentAmount: true,
      securityDeposit: true,
      status: true,
      type: true,
      createdAt: true,
      property: { select: { name: true } },
      unit: { select: { unitNumber: true } },
    },
  });

  return leases.map((l) => ({
    id: l.id,
    propertyId: l.propertyId,
    propertyName: l.property.name,
    unitId: l.unitId,
    unitNumber: l.unit?.unitNumber,
    startDate: l.startDate.toISOString().split('T')[0],
    endDate: l.endDate.toISOString().split('T')[0],
    rentAmount: l.rentAmount,
    securityDeposit: l.securityDeposit,
    status: l.status,
    type: l.type,
    createdAt: l.createdAt.toISOString(),
  }));
}

// =============================================================================
// Routes
// =============================================================================

export async function bulkOperationsRoutes(app: FastifyInstance): Promise<void> {
  const redis = getRedis(app);

  // ===========================================================================
  // GET /admin/bulk/jobs - List bulk jobs for current user
  // ===========================================================================
  app.get(
    '/jobs',
    {
      schema: {
        description: 'List bulk operation jobs',
        tags: ['Admin', 'Bulk Operations'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['import', 'export'] },
            entityType: { type: 'string', enum: ['properties', 'units', 'tenants', 'leases'] },
            status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { type?: string; entityType?: string; status?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = request.user?.id;
        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          });
        }

        let jobs = await listUserJobs(redis, userId);

        // Apply filters
        if (request.query.type) {
          jobs = jobs.filter((j) => j.type === request.query.type);
        }
        if (request.query.entityType) {
          jobs = jobs.filter((j) => j.entityType === request.query.entityType);
        }
        if (request.query.status) {
          jobs = jobs.filter((j) => j.status === request.query.status);
        }

        return reply.send({
          success: true,
          data: {
            jobs,
            total: jobs.length,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to list bulk jobs');
        return reply.status(500).send({
          success: false,
          error: { code: 'LIST_FAILED', message: 'Failed to list bulk jobs' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/bulk/jobs/:jobId - Get job status
  // ===========================================================================
  app.get(
    '/jobs/:jobId',
    {
      schema: {
        description: 'Get bulk job status and details',
        tags: ['Admin', 'Bulk Operations'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['jobId'],
          properties: { jobId: { type: 'string' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
      try {
        const { jobId } = request.params;
        const userId = request.user?.id;

        const job = await getJob(redis, jobId);

        if (!job) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Job not found' },
          });
        }

        if (job.userId !== userId) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Access denied' },
          });
        }

        return reply.send({
          success: true,
          data: job,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get bulk job');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_FAILED', message: 'Failed to get job status' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/bulk/import - Create import job
  // ===========================================================================
  app.post(
    '/import',
    {
      schema: {
        description: 'Create a bulk import job',
        tags: ['Admin', 'Bulk Operations'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['entityType', 'format', 'data'],
          properties: {
            entityType: { type: 'string', enum: ['properties', 'units', 'tenants', 'leases'] },
            format: { type: 'string', enum: ['csv', 'json'] },
            data: { type: 'string' },
            options: {
              type: 'object',
              properties: {
                skipDuplicates: { type: 'boolean' },
                updateExisting: { type: 'boolean' },
                validateOnly: { type: 'boolean' },
              },
            },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const input = CreateImportJobSchema.parse(request.body);
        const userId = request.user?.id;

        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          });
        }

        // Parse data
        let rows: ImportRow[];
        try {
          if (input.format === 'csv') {
            rows = parseCSV(input.data);
          } else {
            rows = JSON.parse(input.data);
            if (!Array.isArray(rows)) {
              throw new Error('JSON data must be an array');
            }
          }
        } catch (parseError) {
          return reply.status(400).send({
            success: false,
            error: { code: 'PARSE_ERROR', message: 'Failed to parse input data' },
          });
        }

        if (rows.length === 0) {
          return reply.status(400).send({
            success: false,
            error: { code: 'EMPTY_DATA', message: 'No records to import' },
          });
        }

        if (rows.length > MAX_BATCH_SIZE) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'TOO_MANY_RECORDS',
              message: `Maximum ${MAX_BATCH_SIZE} records per import`,
            },
          });
        }

        // Create job
        const job: BulkJob = {
          id: generatePrefixedId('bulk'),
          type: 'import',
          entityType: input.entityType,
          format: input.format,
          status: 'pending',
          userId,
          totalRecords: rows.length,
          processedRecords: 0,
          successCount: 0,
          errorCount: 0,
          errors: [],
          warnings: [],
          createdAt: new Date().toISOString(),
        };

        await saveJob(redis, job);

        // Process in background (simplified - in production use job queue)
        setImmediate(() => {
          processImport(job, rows, userId, input.options || {}, redis);
        });

        logger.info({
          msg: 'bulk_import_started',
          jobId: job.id,
          entityType: input.entityType,
          recordCount: rows.length,
        });

        return reply.status(202).send({
          success: true,
          data: {
            jobId: job.id,
            status: job.status,
            totalRecords: rows.length,
            statusUrl: `/api/v1/admin/bulk/jobs/${job.id}`,
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        logger.error({ error }, 'Failed to create import job');
        return reply.status(500).send({
          success: false,
          error: { code: 'CREATE_FAILED', message: 'Failed to create import job' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/bulk/export - Create export job
  // ===========================================================================
  app.post(
    '/export',
    {
      schema: {
        description: 'Create a bulk export job',
        tags: ['Admin', 'Bulk Operations'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['entityType', 'format'],
          properties: {
            entityType: { type: 'string', enum: ['properties', 'units', 'tenants', 'leases'] },
            format: { type: 'string', enum: ['csv', 'json'] },
            filters: {
              type: 'object',
              properties: {
                ids: { type: 'array', items: { type: 'string' } },
                status: { type: 'string' },
                createdAfter: { type: 'string' },
                createdBefore: { type: 'string' },
              },
            },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const input = CreateExportJobSchema.parse(request.body);
        const userId = request.user?.id;

        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          });
        }

        // Create job
        const job: BulkJob = {
          id: generatePrefixedId('bulk'),
          type: 'export',
          entityType: input.entityType,
          format: input.format,
          status: 'pending',
          userId,
          totalRecords: 0,
          processedRecords: 0,
          successCount: 0,
          errorCount: 0,
          errors: [],
          warnings: [],
          createdAt: new Date().toISOString(),
        };

        await saveJob(redis, job);

        // Process in background
        setImmediate(() => {
          processExport(job, input.filters || {}, userId, redis);
        });

        logger.info({
          msg: 'bulk_export_started',
          jobId: job.id,
          entityType: input.entityType,
        });

        return reply.status(202).send({
          success: true,
          data: {
            jobId: job.id,
            status: job.status,
            statusUrl: `/api/v1/admin/bulk/jobs/${job.id}`,
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        logger.error({ error }, 'Failed to create export job');
        return reply.status(500).send({
          success: false,
          error: { code: 'CREATE_FAILED', message: 'Failed to create export job' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/bulk/jobs/:jobId/download - Download export result
  // ===========================================================================
  app.get(
    '/jobs/:jobId/download',
    {
      schema: {
        description: 'Download export result',
        tags: ['Admin', 'Bulk Operations'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['jobId'],
          properties: { jobId: { type: 'string' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
      try {
        const { jobId } = request.params;
        const userId = request.user?.id;

        const job = await getJob(redis, jobId);

        if (!job) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Job not found' },
          });
        }

        if (job.userId !== userId) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Access denied' },
          });
        }

        if (job.type !== 'export') {
          return reply.status(400).send({
            success: false,
            error: { code: 'INVALID_JOB', message: 'This is not an export job' },
          });
        }

        if (job.status !== 'completed') {
          return reply.status(400).send({
            success: false,
            error: { code: 'NOT_READY', message: 'Export is not yet complete' },
          });
        }

        // Get result
        let result: string | null = null;
        if (redis) {
          result = await redis.get(`bulk_result:${jobId}`);
        }

        if (!result) {
          return reply.status(404).send({
            success: false,
            error: { code: 'RESULT_EXPIRED', message: 'Export result has expired' },
          });
        }

        const contentType = job.format === 'csv' ? 'text/csv' : 'application/json';
        const extension = job.format === 'csv' ? 'csv' : 'json';
        const filename = `${job.entityType}_export_${job.id}.${extension}`;

        return reply
          .header('Content-Type', contentType)
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .send(result);
      } catch (error) {
        logger.error({ error }, 'Failed to download export');
        return reply.status(500).send({
          success: false,
          error: { code: 'DOWNLOAD_FAILED', message: 'Failed to download export' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/bulk/templates/:entityType - Get import template
  // ===========================================================================
  app.get(
    '/templates/:entityType',
    {
      schema: {
        description: 'Get CSV import template for entity type',
        tags: ['Admin', 'Bulk Operations'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['entityType'],
          properties: {
            entityType: { type: 'string', enum: ['properties', 'units', 'tenants', 'leases'] },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { entityType: string } }>, reply: FastifyReply) => {
      const { entityType } = request.params;

      const templates: Record<string, { headers: string[]; example: Record<string, string> }> = {
        properties: {
          headers: ['name', 'address', 'city', 'state', 'zipCode', 'country', 'type', 'yearBuilt', 'totalUnits', 'description'],
          example: {
            name: 'Sunset Apartments',
            address: '123 Main St',
            city: 'Los Angeles',
            state: 'CA',
            zipCode: '90001',
            country: 'US',
            type: 'multi_family',
            yearBuilt: '2010',
            totalUnits: '12',
            description: 'Modern apartment complex',
          },
        },
        units: {
          headers: ['propertyId', 'propertyName', 'unitNumber', 'bedrooms', 'bathrooms', 'sqft', 'floor'],
          example: {
            propertyId: '',
            propertyName: 'Sunset Apartments',
            unitNumber: '101',
            bedrooms: '2',
            bathrooms: '1',
            sqft: '850',
            floor: '1',
          },
        },
        tenants: {
          headers: ['email', 'firstName', 'lastName', 'phone'],
          example: {
            email: 'tenant@example.com',
            firstName: 'John',
            lastName: 'Doe',
            phone: '+1-555-123-4567',
          },
        },
        leases: {
          headers: ['propertyId', 'unitId', 'unitNumber', 'tenantEmail', 'startDate', 'endDate', 'rentAmount', 'securityDeposit'],
          example: {
            propertyId: 'prop_xxx',
            unitId: '',
            unitNumber: '101',
            tenantEmail: 'tenant@example.com',
            startDate: '2025-01-01',
            endDate: '2026-01-01',
            rentAmount: '1500',
            securityDeposit: '1500',
          },
        },
      };

      const template = templates[entityType];
      if (!template) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_TYPE', message: 'Invalid entity type' },
        });
      }

      const csv = [
        template.headers.join(','),
        template.headers.map((h) => template.example[h] || '').join(','),
      ].join('\n');

      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="${entityType}_template.csv"`)
        .send(csv);
    }
  );
}
