/**
 * Scheduled Reports Module
 *
 * Automated daily/weekly/monthly reports delivered via email.
 * Supports vacancy reports, rent roll, P&L statements, and custom reports.
 */

import {
  prisma,
  Prisma,
  type ReportType as PrismaReportType,
  type ReportFrequency as PrismaReportFrequency,
  type ReportFormat as PrismaReportFormat,
} from '@realriches/database';
import { generatePrefixedId, logger, AppError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// =============================================================================
// Types
// =============================================================================

export type ReportType = 'vacancy' | 'rent_roll' | 'profit_loss' | 'maintenance' | 'lease_expiry' | 'payment_aging' | 'custom';
export type ReportFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly';
export type ReportFormat = 'pdf' | 'csv' | 'excel';

interface ReportSchedule {
  id: string;
  userId: string;
  name: string;
  reportType: ReportType;
  frequency: ReportFrequency;
  dayOfWeek?: number; // 0-6 for weekly
  dayOfMonth?: number; // 1-31 for monthly
  timeOfDay: string; // HH:MM format
  format: ReportFormat;
  recipients: string[];
  filters: Record<string, unknown>;
  isActive: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface ReportRun {
  id: string;
  scheduleId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  fileUrl?: string;
  error?: string;
  recipientsSent: number;
}

// =============================================================================
// In-Memory Storage (would be Prisma in production)
// =============================================================================

const reportSchedules = new Map<string, ReportSchedule>();
const reportRuns = new Map<string, ReportRun>();

// =============================================================================
// Schemas
// =============================================================================

const CreateScheduleSchema = z.object({
  name: z.string().min(1).max(100),
  reportType: z.enum(['vacancy', 'rent_roll', 'profit_loss', 'maintenance', 'lease_expiry', 'payment_aging', 'custom']),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly']),
  dayOfWeek: z.number().min(0).max(6).optional(),
  dayOfMonth: z.number().min(1).max(31).optional(),
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  format: z.enum(['pdf', 'csv', 'excel']).default('pdf'),
  recipients: z.array(z.string().email()).min(1),
  filters: z.record(z.unknown()).optional(),
});

const UpdateScheduleSchema = CreateScheduleSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// =============================================================================
// Report Generation Functions
// =============================================================================

async function generateVacancyReport(userId: string, filters: Record<string, unknown>): Promise<{
  totalUnits: number;
  vacantUnits: number;
  vacancyRate: number;
  avgDaysVacant: number;
  potentialLostRevenue: number;
  byProperty: Array<{
    propertyId: string;
    propertyName: string;
    totalUnits: number;
    vacantUnits: number;
    vacancyRate: number;
  }>;
}> {
  const properties = await prisma.property.findMany({
    where: { ownerId: userId },
    include: {
      units: {
        include: {
          leases: {
            where: {
              status: 'active',
            },
          },
        },
      },
    },
  });

  let totalUnits = 0;
  let vacantUnits = 0;
  let totalDaysVacant = 0;
  let potentialLostRevenue = 0;
  const byProperty: Array<{
    propertyId: string;
    propertyName: string;
    totalUnits: number;
    vacantUnits: number;
    vacancyRate: number;
  }> = [];

  for (const property of properties) {
    const propTotal = property.units.length;
    const propVacant = property.units.filter(u => u.leases.length === 0).length;

    totalUnits += propTotal;
    vacantUnits += propVacant;

    for (const unit of property.units) {
      if (unit.leases.length === 0 && unit.availableDate) {
        const daysVacant = Math.floor((Date.now() - new Date(unit.availableDate).getTime()) / (1000 * 60 * 60 * 24));
        totalDaysVacant += daysVacant;
        potentialLostRevenue += (unit.marketRentAmount || 0) * (daysVacant / 30) / 100; // Convert from cents
      }
    }

    byProperty.push({
      propertyId: property.id,
      propertyName: property.name,
      totalUnits: propTotal,
      vacantUnits: propVacant,
      vacancyRate: propTotal > 0 ? (propVacant / propTotal) * 100 : 0,
    });
  }

  return {
    totalUnits,
    vacantUnits,
    vacancyRate: totalUnits > 0 ? (vacantUnits / totalUnits) * 100 : 0,
    avgDaysVacant: vacantUnits > 0 ? totalDaysVacant / vacantUnits : 0,
    potentialLostRevenue,
    byProperty,
  };
}

async function generateRentRollReport(userId: string, filters: Record<string, unknown>): Promise<{
  totalMonthlyRent: number;
  totalCollected: number;
  collectionRate: number;
  leases: Array<{
    leaseId: string;
    propertyName: string;
    unitNumber: string;
    tenantName: string;
    monthlyRent: number;
    status: string;
    startDate: string;
    endDate: string;
  }>;
}> {
  const leases = await prisma.lease.findMany({
    where: {
      unit: {
        property: {
          ownerId: userId,
        },
      },
      status: 'active',
    },
    include: {
      unit: {
        include: {
          property: true,
        },
      },
      primaryTenant: true,
    },
  });

  const payments = await prisma.payment.findMany({
    where: {
      leaseId: { in: leases.map(l => l.id) },
      type: 'rent',
      status: 'completed',
      scheduledDate: {
        gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        lt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
      },
    },
  });

  const totalMonthlyRent = leases.reduce((sum, l) => sum + (Number(l.monthlyRent) || 0), 0);
  const totalCollected = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  return {
    totalMonthlyRent,
    totalCollected,
    collectionRate: totalMonthlyRent > 0 ? (totalCollected / totalMonthlyRent) * 100 : 0,
    leases: leases.map(l => ({
      leaseId: l.id,
      propertyName: l.unit?.property?.name || 'Unknown',
      unitNumber: l.unit?.unitNumber || 'Unknown',
      tenantName: l.primaryTenant ? `${l.primaryTenant.firstName} ${l.primaryTenant.lastName}` : 'Unknown',
      monthlyRent: Number(l.monthlyRent) || 0,
      status: l.status,
      startDate: l.startDate.toISOString(),
      endDate: l.endDate.toISOString(),
    })),
  };
}

async function generateProfitLossReport(userId: string, filters: Record<string, unknown>): Promise<{
  period: { start: string; end: string };
  income: {
    rent: number;
    lateFees: number;
    otherIncome: number;
    total: number;
  };
  expenses: {
    maintenance: number;
    utilities: number;
    insurance: number;
    taxes: number;
    management: number;
    other: number;
    total: number;
  };
  netOperatingIncome: number;
  profitMargin: number;
}> {
  const startDate = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  const endDate = new Date(new Date().getFullYear(), new Date().getMonth(), 0);

  const properties = await prisma.property.findMany({
    where: { ownerId: userId },
    select: { id: true },
  });
  const propertyIds = properties.map(p => p.id);

  const payments = await prisma.payment.findMany({
    where: {
      lease: {
        unit: {
          propertyId: { in: propertyIds },
        },
      },
      status: 'completed',
      paidAt: { gte: startDate, lte: endDate },
    },
  });

  const rent = payments.filter(p => p.type === 'rent').reduce((sum, p) => sum + (p.amount || 0), 0);
  const lateFees = payments.filter(p => p.type === 'late_fee').reduce((sum, p) => sum + (p.amount || 0), 0);
  const otherIncome = payments.filter(p => p.type === 'other').reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalIncome = rent + lateFees + otherIncome;

  // Placeholder expenses (would come from expense tracking module)
  const expenses = {
    maintenance: totalIncome * 0.05,
    utilities: totalIncome * 0.03,
    insurance: totalIncome * 0.02,
    taxes: totalIncome * 0.08,
    management: totalIncome * 0.08,
    other: totalIncome * 0.02,
    total: 0,
  };
  expenses.total = Object.values(expenses).reduce((a, b) => a + b, 0) - expenses.total;

  const netOperatingIncome = totalIncome - expenses.total;

  return {
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    income: { rent, lateFees, otherIncome, total: totalIncome },
    expenses,
    netOperatingIncome,
    profitMargin: totalIncome > 0 ? (netOperatingIncome / totalIncome) * 100 : 0,
  };
}

async function generateLeaseExpiryReport(userId: string, filters: Record<string, unknown>): Promise<{
  expiringIn30Days: number;
  expiringIn60Days: number;
  expiringIn90Days: number;
  leases: Array<{
    leaseId: string;
    propertyName: string;
    unitNumber: string;
    tenantName: string;
    tenantEmail: string;
    expiryDate: string;
    daysUntilExpiry: number;
    monthlyRent: number;
    renewalStatus: string;
  }>;
}> {
  const now = new Date();
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const leases = await prisma.lease.findMany({
    where: {
      unit: {
        property: {
          ownerId: userId,
        },
      },
      status: 'active',
      endDate: { lte: in90Days },
    },
    include: {
      unit: {
        include: {
          property: true,
        },
      },
      primaryTenant: true,
    },
    orderBy: { endDate: 'asc' },
  });

  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  return {
    expiringIn30Days: leases.filter(l => l.endDate <= in30Days).length,
    expiringIn60Days: leases.filter(l => l.endDate <= in60Days).length,
    expiringIn90Days: leases.length,
    leases: leases.map(l => ({
      leaseId: l.id,
      propertyName: l.unit?.property?.name || 'Unknown',
      unitNumber: l.unit?.unitNumber || 'Unknown',
      tenantName: l.primaryTenant ? `${l.primaryTenant.firstName} ${l.primaryTenant.lastName}` : 'Unknown',
      tenantEmail: l.primaryTenant?.email || '',
      expiryDate: l.endDate.toISOString(),
      daysUntilExpiry: Math.ceil((l.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      monthlyRent: l.monthlyRent || 0,
      renewalStatus: 'pending',
    })),
  };
}

async function generatePaymentAgingReport(userId: string, filters: Record<string, unknown>): Promise<{
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  over90Days: number;
  totalOutstanding: number;
  accounts: Array<{
    leaseId: string;
    tenantName: string;
    propertyName: string;
    unitNumber: string;
    amountDue: number;
    daysOverdue: number;
    bucket: string;
  }>;
}> {
  const now = new Date();

  const payments = await prisma.payment.findMany({
    where: {
      lease: {
        unit: {
          property: {
            ownerId: userId,
          },
        },
      },
      status: 'pending',
      scheduledDate: { lt: now }, // Only get payments that are due
    },
    include: {
      lease: {
        include: {
          unit: {
            include: {
              property: true,
            },
          },
          primaryTenant: true,
        },
      },
    },
  }) as Array<{
    id: string;
    leaseId: string | null;
    amount: number;
    scheduledDate: Date | null;
    lease: {
      primaryTenant: { firstName: string; lastName: string } | null;
      unit: { unitNumber: string; property: { name: string } | null } | null;
    } | null;
  }>;

  let current = 0;
  let days1to30 = 0;
  let days31to60 = 0;
  let days61to90 = 0;
  let over90Days = 0;

  const accounts = payments.map(p => {
    const daysOverdue = Math.max(0, Math.floor((now.getTime() - new Date(p.scheduledDate || now).getTime()) / (1000 * 60 * 60 * 24)));
    let bucket = 'current';

    if (daysOverdue === 0) {
      current += p.amount || 0;
      bucket = 'current';
    } else if (daysOverdue <= 30) {
      days1to30 += p.amount || 0;
      bucket = '1-30 days';
    } else if (daysOverdue <= 60) {
      days31to60 += p.amount || 0;
      bucket = '31-60 days';
    } else if (daysOverdue <= 90) {
      days61to90 += p.amount || 0;
      bucket = '61-90 days';
    } else {
      over90Days += p.amount || 0;
      bucket = '90+ days';
    }

    return {
      leaseId: p.leaseId || '',
      tenantName: p.lease?.primaryTenant ? `${p.lease.primaryTenant.firstName} ${p.lease.primaryTenant.lastName}` : 'Unknown',
      propertyName: p.lease?.unit?.property?.name || 'Unknown',
      unitNumber: p.lease?.unit?.unitNumber || 'Unknown',
      amountDue: p.amount || 0,
      daysOverdue,
      bucket,
    };
  });

  return {
    current,
    days1to30,
    days31to60,
    days61to90,
    over90Days,
    totalOutstanding: current + days1to30 + days31to60 + days61to90 + over90Days,
    accounts,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function calculateNextRunDate(schedule: ReportSchedule): Date {
  const now = new Date();
  const [hours, minutes] = schedule.timeOfDay.split(':').map(Number);
  const nextRun = new Date(now);
  nextRun.setHours(hours, minutes, 0, 0);

  switch (schedule.frequency) {
    case 'daily':
      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
      break;
    case 'weekly':
      const targetDay = schedule.dayOfWeek ?? 1; // Monday default
      const currentDay = nextRun.getDay();
      let daysUntil = (targetDay - currentDay + 7) % 7;
      if (daysUntil === 0 && nextRun <= now) {
        daysUntil = 7;
      }
      nextRun.setDate(nextRun.getDate() + daysUntil);
      break;
    case 'monthly':
      const targetDate = schedule.dayOfMonth ?? 1;
      nextRun.setDate(targetDate);
      if (nextRun <= now) {
        nextRun.setMonth(nextRun.getMonth() + 1);
      }
      break;
    case 'quarterly':
      const currentMonth = nextRun.getMonth();
      const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
      nextRun.setMonth(quarterStartMonth + 3);
      nextRun.setDate(schedule.dayOfMonth ?? 1);
      break;
  }

  return nextRun;
}

// =============================================================================
// Routes
// =============================================================================

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  // List report schedules
  app.get(
    '/schedules',
    {
      schema: {
        description: 'List scheduled reports',
        tags: ['Reports'],
        security: [{ bearerAuth: [] }],
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

      const schedules = await prisma.reportSchedule.findMany({
        where: { userId: request.user!.id },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({
        success: true,
        data: { schedules },
      });
    }
  );

  // Create report schedule
  app.post(
    '/schedules',
    {
      schema: {
        description: 'Create a scheduled report',
        tags: ['Reports'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof CreateScheduleSchema> }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = CreateScheduleSchema.parse(request.body);

      // Calculate next run date using temporary schedule object
      const tempSchedule = {
        frequency: data.frequency,
        dayOfWeek: data.dayOfWeek,
        dayOfMonth: data.dayOfMonth,
        timeOfDay: data.timeOfDay,
      };
      const nextRunAt = calculateNextRunDate(tempSchedule as ReportSchedule);

      const schedule = await prisma.reportSchedule.create({
        data: {
          userId: request.user.id,
          name: data.name,
          reportType: data.reportType as PrismaReportType,
          frequency: data.frequency as PrismaReportFrequency,
          dayOfWeek: data.dayOfWeek,
          dayOfMonth: data.dayOfMonth,
          timeOfDay: data.timeOfDay,
          format: data.format as PrismaReportFormat,
          recipients: data.recipients,
          filters: data.filters || {},
          isActive: true,
          nextRunAt,
        },
      });

      logger.info({ scheduleId: schedule.id, reportType: schedule.reportType }, 'Report schedule created');

      return reply.status(201).send({
        success: true,
        data: { schedule },
      });
    }
  );

  // Update report schedule
  app.patch(
    '/schedules/:scheduleId',
    {
      schema: {
        description: 'Update a scheduled report',
        tags: ['Reports'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Params: { scheduleId: string };
        Body: z.infer<typeof UpdateScheduleSchema>;
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { scheduleId } = request.params;
      const existing = await prisma.reportSchedule.findUnique({
        where: { id: scheduleId },
      });

      if (!existing || existing.userId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Schedule not found', 404);
      }

      const data = UpdateScheduleSchema.parse(request.body);

      // Build update data
      const updateData: Prisma.ReportScheduleUpdateInput = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.reportType !== undefined) updateData.reportType = data.reportType as PrismaReportType;
      if (data.frequency !== undefined) updateData.frequency = data.frequency as PrismaReportFrequency;
      if (data.dayOfWeek !== undefined) updateData.dayOfWeek = data.dayOfWeek;
      if (data.dayOfMonth !== undefined) updateData.dayOfMonth = data.dayOfMonth;
      if (data.timeOfDay !== undefined) updateData.timeOfDay = data.timeOfDay;
      if (data.format !== undefined) updateData.format = data.format as PrismaReportFormat;
      if (data.recipients !== undefined) updateData.recipients = data.recipients;
      if (data.filters !== undefined) updateData.filters = data.filters;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;

      // Recalculate next run date
      const mergedSchedule = { ...existing, ...data };
      updateData.nextRunAt = calculateNextRunDate(mergedSchedule as ReportSchedule);

      const schedule = await prisma.reportSchedule.update({
        where: { id: scheduleId },
        data: updateData,
      });

      return reply.send({
        success: true,
        data: { schedule },
      });
    }
  );

  // Delete report schedule
  app.delete(
    '/schedules/:scheduleId',
    {
      schema: {
        description: 'Delete a scheduled report',
        tags: ['Reports'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { scheduleId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { scheduleId } = request.params;
      const existing = await prisma.reportSchedule.findUnique({
        where: { id: scheduleId },
      });

      if (!existing || existing.userId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Schedule not found', 404);
      }

      await prisma.reportSchedule.delete({ where: { id: scheduleId } });

      return reply.send({
        success: true,
        message: 'Schedule deleted',
      });
    }
  );

  // Generate report on-demand
  app.post(
    '/generate',
    {
      schema: {
        description: 'Generate a report on-demand',
        tags: ['Reports'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['reportType'],
          properties: {
            reportType: { type: 'string', enum: ['vacancy', 'rent_roll', 'profit_loss', 'maintenance', 'lease_expiry', 'payment_aging'] },
            filters: { type: 'object' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Body: { reportType: ReportType; filters?: Record<string, unknown> };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { reportType, filters = {} } = request.body;
      let report: unknown;

      switch (reportType) {
        case 'vacancy':
          report = await generateVacancyReport(request.user.id, filters);
          break;
        case 'rent_roll':
          report = await generateRentRollReport(request.user.id, filters);
          break;
        case 'profit_loss':
          report = await generateProfitLossReport(request.user.id, filters);
          break;
        case 'lease_expiry':
          report = await generateLeaseExpiryReport(request.user.id, filters);
          break;
        case 'payment_aging':
          report = await generatePaymentAgingReport(request.user.id, filters);
          break;
        default:
          throw new AppError('VALIDATION_ERROR', `Unknown report type: ${reportType}`, 400);
      }

      logger.info({ userId: request.user.id, reportType }, 'Report generated on-demand');

      return reply.send({
        success: true,
        data: {
          reportType,
          generatedAt: new Date().toISOString(),
          report,
        },
      });
    }
  );

  // Get report run history
  app.get(
    '/history',
    {
      schema: {
        description: 'Get report run history',
        tags: ['Reports'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            scheduleId: { type: 'string' },
            limit: { type: 'integer', default: 20 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { scheduleId?: string; limit?: number } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { scheduleId, limit = 20 } = request.query;

      // Build where clause to get runs for user's schedules
      const whereClause: Prisma.ReportRunWhereInput = {
        schedule: {
          userId: request.user!.id,
        },
      };

      if (scheduleId) {
        whereClause.scheduleId = scheduleId;
      }

      const runs = await prisma.reportRun.findMany({
        where: whereClause,
        orderBy: { startedAt: 'desc' },
        take: limit,
        include: {
          schedule: {
            select: { name: true, reportType: true },
          },
        },
      });

      return reply.send({
        success: true,
        data: { runs },
      });
    }
  );
}

// =============================================================================
// Export Report Generators for Job Scheduler
// =============================================================================

export {
  generateVacancyReport,
  generateRentRollReport,
  generateProfitLossReport,
  generateLeaseExpiryReport,
  generatePaymentAgingReport,
  reportSchedules,
  reportRuns,
  calculateNextRunDate,
};
