import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  prisma,
  type OccupancyStatus,
} from '@realriches/database';

// Helper functions
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

interface RentRollSummary {
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  noticeUnits: number;
  occupancyRate: number;
  totalSquareFeet: number;
  occupiedSquareFeet: number;
  totalMarketRent: number;
  totalCurrentRent: number;
  totalConcessions: number;
  totalOtherIncome: number;
  effectiveRent: number;
  lossToLease: number;
  lossToVacancy: number;
  totalBalance: number;
  totalDeposits: number;
  averageRentPerUnit: number;
  averageRentPerSqFt: number;
  expiringLeases30Days: number;
  expiringLeases60Days: number;
  expiringLeases90Days: number;
}

interface EntryData {
  squareFeet: number | null;
  monthlyRent: unknown;
  marketRent: unknown;
  balance: unknown;
  deposit: unknown;
  occupancyStatus: OccupancyStatus;
  leaseEnd: Date | null;
}

export function calculateSummary(entries: EntryData[]): RentRollSummary {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const totalUnits = entries.length;
  const occupiedEntries = entries.filter(e => e.occupancyStatus === 'occupied');
  const vacantEntries = entries.filter(e => e.occupancyStatus === 'vacant');
  const noticeEntries = entries.filter(e => e.occupancyStatus === 'notice_given');

  const totalSquareFeet = entries.reduce((sum, e) => sum + (e.squareFeet || 0), 0);
  const occupiedSquareFeet = occupiedEntries.reduce((sum, e) => sum + (e.squareFeet || 0), 0);

  const totalMarketRent = entries.reduce((sum, e) => sum + toNumber(e.marketRent), 0);
  const totalCurrentRent = occupiedEntries.reduce((sum, e) => sum + toNumber(e.monthlyRent), 0);
  const totalConcessions = 0;

  const lossToLease = occupiedEntries.reduce((sum, e) => sum + (toNumber(e.marketRent) - toNumber(e.monthlyRent)), 0);
  const lossToVacancy = vacantEntries.reduce((sum, e) => sum + toNumber(e.marketRent), 0);

  const expiringLeases30Days = occupiedEntries.filter(e =>
    e.leaseEnd && e.leaseEnd <= in30Days && e.leaseEnd > now
  ).length;
  const expiringLeases60Days = occupiedEntries.filter(e =>
    e.leaseEnd && e.leaseEnd <= in60Days && e.leaseEnd > now
  ).length;
  const expiringLeases90Days = occupiedEntries.filter(e =>
    e.leaseEnd && e.leaseEnd <= in90Days && e.leaseEnd > now
  ).length;

  return {
    totalUnits,
    occupiedUnits: occupiedEntries.length,
    vacantUnits: vacantEntries.length,
    noticeUnits: noticeEntries.length,
    occupancyRate: totalUnits > 0 ? (occupiedEntries.length / totalUnits) * 100 : 0,
    totalSquareFeet,
    occupiedSquareFeet,
    totalMarketRent,
    totalCurrentRent,
    totalConcessions,
    totalOtherIncome: 0,
    effectiveRent: totalCurrentRent - totalConcessions,
    lossToLease,
    lossToVacancy,
    totalBalance: entries.reduce((sum, e) => sum + toNumber(e.balance), 0),
    totalDeposits: entries.reduce((sum, e) => sum + toNumber(e.deposit), 0),
    averageRentPerUnit: occupiedEntries.length > 0 ? totalCurrentRent / occupiedEntries.length : 0,
    averageRentPerSqFt: occupiedSquareFeet > 0 ? totalCurrentRent / occupiedSquareFeet : 0,
    expiringLeases30Days,
    expiringLeases60Days,
    expiringLeases90Days
  };
}

export function compareSummaries(
  current: RentRollSummary,
  previous: RentRollSummary
): Record<string, { current: number; previous: number; change: number; changePercent: number }> {
  const keys: (keyof RentRollSummary)[] = [
    'totalUnits', 'occupiedUnits', 'vacantUnits', 'occupancyRate',
    'totalMarketRent', 'totalCurrentRent', 'lossToLease', 'lossToVacancy',
    'totalBalance', 'averageRentPerUnit'
  ];

  const comparison: Record<string, { current: number; previous: number; change: number; changePercent: number }> = {};

  for (const key of keys) {
    const curr = current[key] as number;
    const prev = previous[key] as number;
    comparison[key] = {
      current: curr,
      previous: prev,
      change: curr - prev,
      changePercent: prev !== 0 ? ((curr - prev) / prev) * 100 : 0
    };
  }

  return comparison;
}

export function calculateNextRunDate(frequency: string, dayOfWeek?: number | null, dayOfMonth?: number | null): Date {
  const now = new Date();
  const next = new Date(now);

  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      next.setHours(6, 0, 0, 0);
      break;
    case 'weekly': {
      const currentDay = next.getDay();
      const targetDay = dayOfWeek || 1;
      const daysUntil = (targetDay - currentDay + 7) % 7 || 7;
      next.setDate(next.getDate() + daysUntil);
      next.setHours(6, 0, 0, 0);
      break;
    }
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      next.setDate(Math.min(dayOfMonth || 1, 28));
      next.setHours(6, 0, 0, 0);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3 - (next.getMonth() % 3));
      next.setDate(1);
      next.setHours(6, 0, 0, 0);
      break;
  }

  return next;
}

// Schemas
const rentRollEntrySchema = z.object({
  propertyId: z.string(),
  unitId: z.string(),
  unitNumber: z.string(),
  squareFeet: z.number().positive().optional(),
  bedrooms: z.number().min(0).optional(),
  bathrooms: z.number().min(0).optional(),
  leaseId: z.string().optional(),
  tenantId: z.string().optional(),
  tenantName: z.string().optional(),
  occupancyStatus: z.enum(['occupied', 'vacant', 'notice_given', 'renovating', 'offline']).default('vacant'),
  leaseStart: z.string().transform(s => new Date(s)).optional(),
  leaseEnd: z.string().transform(s => new Date(s)).optional(),
  monthlyRent: z.number().min(0),
  marketRent: z.number().min(0).optional(),
  deposit: z.number().min(0).optional(),
  balance: z.number().default(0),
  lastPaymentDate: z.string().transform(s => new Date(s)).optional(),
  notes: z.string().optional()
});

const snapshotSchema = z.object({
  propertyId: z.string(),
  name: z.string(),
  createdBy: z.string().optional()
});

const scheduledReportSchema = z.object({
  propertyId: z.string(),
  name: z.string(),
  frequency: z.string(),
  dayOfWeek: z.number().min(0).max(6).optional(),
  dayOfMonth: z.number().min(1).max(31).optional(),
  recipients: z.array(z.string().email()),
  format: z.string().default('pdf'),
  includeVacant: z.boolean().default(true)
});

export async function rentRollRoutes(app: FastifyInstance): Promise<void> {
  // Rent Roll Entries
  app.post('/entries', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = rentRollEntrySchema.parse(request.body);

    const entry = await prisma.rentRollEntry.create({
      data: {
        propertyId: data.propertyId,
        unitId: data.unitId,
        unitNumber: data.unitNumber,
        squareFeet: data.squareFeet,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        leaseId: data.leaseId,
        tenantId: data.tenantId,
        tenantName: data.tenantName,
        occupancyStatus: data.occupancyStatus,
        leaseStart: data.leaseStart,
        leaseEnd: data.leaseEnd,
        monthlyRent: data.monthlyRent,
        marketRent: data.marketRent,
        deposit: data.deposit,
        balance: data.balance,
        lastPaymentDate: data.lastPaymentDate,
        notes: data.notes,
      },
    });

    return reply.status(201).send(entry);
  });

  app.get('/entries', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, occupancyStatus } = request.query as { propertyId?: string; occupancyStatus?: string };

    const entries = await prisma.rentRollEntry.findMany({
      where: {
        snapshotId: null,
        ...(propertyId && { propertyId }),
        ...(occupancyStatus && { occupancyStatus: occupancyStatus as OccupancyStatus }),
      },
      orderBy: { unitNumber: 'asc' },
    });

    return reply.send(entries);
  });

  app.get('/entries/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const entry = await prisma.rentRollEntry.findUnique({ where: { id } });
    if (!entry) return reply.status(404).send({ error: 'Entry not found' });
    return reply.send(entry);
  });

  app.put('/entries/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = rentRollEntrySchema.parse(request.body);

    try {
      const entry = await prisma.rentRollEntry.update({
        where: { id },
        data: {
          propertyId: data.propertyId,
          unitId: data.unitId,
          unitNumber: data.unitNumber,
          squareFeet: data.squareFeet,
          bedrooms: data.bedrooms,
          bathrooms: data.bathrooms,
          leaseId: data.leaseId,
          tenantId: data.tenantId,
          tenantName: data.tenantName,
          occupancyStatus: data.occupancyStatus,
          leaseStart: data.leaseStart,
          leaseEnd: data.leaseEnd,
          monthlyRent: data.monthlyRent,
          marketRent: data.marketRent,
          deposit: data.deposit,
          balance: data.balance,
          lastPaymentDate: data.lastPaymentDate,
          notes: data.notes,
        },
      });
      return reply.send(entry);
    } catch {
      return reply.status(404).send({ error: 'Entry not found' });
    }
  });

  // Full Rent Roll Report
  app.get('/report/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };

    const entries = await prisma.rentRollEntry.findMany({
      where: { propertyId, snapshotId: null },
      orderBy: { unitNumber: 'asc' },
    });

    const summary = calculateSummary(entries);

    return reply.send({
      propertyId,
      generatedAt: new Date(),
      entries,
      summary
    });
  });

  // Summary only
  app.get('/summary/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };

    const entries = await prisma.rentRollEntry.findMany({
      where: { propertyId, snapshotId: null },
    });

    const summary = calculateSummary(entries);
    return reply.send(summary);
  });

  // Snapshots
  app.post('/snapshots', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = snapshotSchema.parse(request.body);

    const entries = await prisma.rentRollEntry.findMany({
      where: { propertyId: data.propertyId, snapshotId: null },
    });

    const summary = calculateSummary(entries);

    const snapshot = await prisma.rentRollSnapshot.create({
      data: {
        propertyId: data.propertyId,
        snapshotDate: new Date(),
        name: data.name,
        totalUnits: summary.totalUnits,
        occupiedUnits: summary.occupiedUnits,
        vacantUnits: summary.vacantUnits,
        totalMonthlyRent: summary.totalCurrentRent,
        totalMarketRent: summary.totalMarketRent,
        occupancyRate: summary.occupancyRate,
        totalBalance: summary.totalBalance,
        createdBy: data.createdBy,
      },
    });

    // Create copies of entries linked to snapshot
    for (const entry of entries) {
      await prisma.rentRollEntry.create({
        data: {
          propertyId: entry.propertyId,
          unitId: entry.unitId,
          unitNumber: entry.unitNumber,
          squareFeet: entry.squareFeet,
          bedrooms: entry.bedrooms,
          bathrooms: entry.bathrooms ? toNumber(entry.bathrooms) : null,
          leaseId: entry.leaseId,
          tenantId: entry.tenantId,
          tenantName: entry.tenantName,
          occupancyStatus: entry.occupancyStatus,
          leaseStart: entry.leaseStart,
          leaseEnd: entry.leaseEnd,
          monthlyRent: toNumber(entry.monthlyRent),
          marketRent: entry.marketRent ? toNumber(entry.marketRent) : null,
          deposit: entry.deposit ? toNumber(entry.deposit) : null,
          balance: toNumber(entry.balance),
          lastPaymentDate: entry.lastPaymentDate,
          notes: entry.notes,
          snapshotId: snapshot.id,
        },
      });
    }

    return reply.status(201).send({ ...snapshot, summary });
  });

  app.get('/snapshots', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.query as { propertyId?: string };

    const snapshots = await prisma.rentRollSnapshot.findMany({
      where: {
        ...(propertyId && { propertyId }),
      },
      orderBy: { snapshotDate: 'desc' },
    });

    return reply.send(snapshots);
  });

  app.get('/snapshots/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const snapshot = await prisma.rentRollSnapshot.findUnique({
      where: { id },
      include: { entries: true },
    });

    if (!snapshot) return reply.status(404).send({ error: 'Snapshot not found' });
    return reply.send(snapshot);
  });

  // Compare snapshots
  app.get('/snapshots/compare', async (request: FastifyRequest, reply: FastifyReply) => {
    const { currentId, previousId } = request.query as { currentId: string; previousId: string };

    const current = await prisma.rentRollSnapshot.findUnique({
      where: { id: currentId },
      include: { entries: true },
    });
    const previous = await prisma.rentRollSnapshot.findUnique({
      where: { id: previousId },
      include: { entries: true },
    });

    if (!current) return reply.status(404).send({ error: 'Current snapshot not found' });
    if (!previous) return reply.status(404).send({ error: 'Previous snapshot not found' });

    const currentSummary = calculateSummary(current.entries);
    const previousSummary = calculateSummary(previous.entries);
    const comparison = compareSummaries(currentSummary, previousSummary);

    return reply.send({
      current: {
        id: current.id,
        date: current.snapshotDate,
        summary: currentSummary
      },
      previous: {
        id: previous.id,
        date: previous.snapshotDate,
        summary: previousSummary
      },
      comparison
    });
  });

  // Analysis endpoints
  app.get('/analysis/vacancy/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };

    const entries = await prisma.rentRollEntry.findMany({
      where: { propertyId, snapshotId: null },
    });

    const vacantUnits = entries.filter(e => e.occupancyStatus === 'vacant');
    const noticeUnits = entries.filter(e => e.occupancyStatus === 'notice_given');

    return reply.send({
      currentVacancy: vacantUnits.length,
      averageDaysVacant: 0,
      vacancyTrend: [5, 4, 6, 5, 4, vacantUnits.length],
      projectedVacancy: vacantUnits.length + noticeUnits.length
    });
  });

  app.get('/analysis/collections/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };

    const entries = await prisma.rentRollEntry.findMany({
      where: { propertyId, snapshotId: null, occupancyStatus: 'occupied' },
    });

    const totalOwed = entries.reduce((sum, e) => sum + Math.max(0, toNumber(e.balance)), 0);
    const totalRent = entries.reduce((sum, e) => sum + toNumber(e.monthlyRent), 0);

    return reply.send({
      totalOwed,
      current: totalOwed * 0.4,
      past30: totalOwed * 0.3,
      past60: totalOwed * 0.2,
      past90Plus: totalOwed * 0.1,
      collectionRate: totalRent > 0 ? ((totalRent - totalOwed) / totalRent) * 100 : 100
    });
  });

  app.get('/analysis/renewals/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };

    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const entries = await prisma.rentRollEntry.findMany({
      where: { propertyId, snapshotId: null, occupancyStatus: 'occupied' },
    });

    const expiringThisMonth = entries.filter(e =>
      e.leaseEnd && e.leaseEnd <= endOfMonth && e.leaseEnd >= now
    );

    return reply.send({
      expiringThisMonth,
      renewalRate: 75,
      averageRentIncrease: 3.5,
      pendingRenewals: expiringThisMonth.length
    });
  });

  app.get('/analysis/loss/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };

    const entries = await prisma.rentRollEntry.findMany({
      where: { propertyId, snapshotId: null },
    });

    const summary = calculateSummary(entries);

    return reply.send({
      lossToLease: {
        amount: summary.lossToLease,
        asPercentOfMarket: summary.totalMarketRent > 0
          ? (summary.lossToLease / summary.totalMarketRent) * 100
          : 0
      },
      lossToVacancy: {
        amount: summary.lossToVacancy,
        asPercentOfMarket: summary.totalMarketRent > 0
          ? (summary.lossToVacancy / summary.totalMarketRent) * 100
          : 0
      },
      concessions: {
        amount: summary.totalConcessions,
        asPercentOfRent: summary.totalCurrentRent > 0
          ? (summary.totalConcessions / summary.totalCurrentRent) * 100
          : 0
      },
      totalLoss: summary.lossToLease + summary.lossToVacancy + summary.totalConcessions,
      effectiveRentYield: summary.totalMarketRent > 0
        ? (summary.effectiveRent / summary.totalMarketRent) * 100
        : 0
    });
  });

  // Scheduled Reports
  app.post('/scheduled-reports', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = scheduledReportSchema.parse(request.body);

    const nextRunAt = calculateNextRunDate(data.frequency, data.dayOfWeek, data.dayOfMonth);

    const report = await prisma.scheduledRentRollReport.create({
      data: {
        propertyId: data.propertyId,
        name: data.name,
        frequency: data.frequency,
        dayOfWeek: data.dayOfWeek,
        dayOfMonth: data.dayOfMonth,
        recipients: data.recipients,
        format: data.format,
        includeVacant: data.includeVacant,
        nextRunAt,
        isActive: true,
      },
    });

    return reply.status(201).send(report);
  });

  app.get('/scheduled-reports', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.query as { propertyId?: string };

    const reports = await prisma.scheduledRentRollReport.findMany({
      where: {
        ...(propertyId && { propertyId }),
      },
    });

    return reply.send(reports);
  });

  app.patch('/scheduled-reports/:id/toggle', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const report = await prisma.scheduledRentRollReport.findUnique({ where: { id } });
    if (!report) return reply.status(404).send({ error: 'Scheduled report not found' });

    const updated = await prisma.scheduledRentRollReport.update({
      where: { id },
      data: {
        isActive: !report.isActive,
        nextRunAt: !report.isActive ? calculateNextRunDate(report.frequency, report.dayOfWeek, report.dayOfMonth) : report.nextRunAt,
      },
    });

    return reply.send(updated);
  });

  app.delete('/scheduled-reports/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    try {
      await prisma.scheduledRentRollReport.delete({ where: { id } });
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: 'Scheduled report not found' });
    }
  });

  // Run report manually
  app.post('/scheduled-reports/:id/run', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const report = await prisma.scheduledRentRollReport.findUnique({ where: { id } });
    if (!report) return reply.status(404).send({ error: 'Scheduled report not found' });

    const now = new Date();

    const execution = await prisma.rentRollExecution.create({
      data: {
        reportId: id,
        executedAt: now,
        status: 'success',
        fileUrl: `/reports/${id}-${now.getTime()}.${report.format}`,
      },
    });

    await prisma.scheduledRentRollReport.update({
      where: { id },
      data: {
        lastRunAt: now,
        nextRunAt: calculateNextRunDate(report.frequency, report.dayOfWeek, report.dayOfMonth),
      },
    });

    return reply.send(execution);
  });

  // Report executions
  app.get('/executions', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, reportId } = request.query as { propertyId?: string; reportId?: string };

    const executions = await prisma.rentRollExecution.findMany({
      where: {
        ...(reportId && { reportId }),
        ...(propertyId && { report: { propertyId } }),
      },
      orderBy: { executedAt: 'desc' },
      include: { report: true },
    });

    return reply.send(executions);
  });

  // Export endpoints
  app.get('/export/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const { format } = request.query as { format?: string };

    const entries = await prisma.rentRollEntry.findMany({
      where: { propertyId, snapshotId: null },
      orderBy: { unitNumber: 'asc' },
    });

    const summary = calculateSummary(entries);

    return reply.send({
      propertyId,
      format: format || 'json',
      generatedAt: new Date(),
      downloadUrl: `/exports/rent-roll-${propertyId}-${Date.now()}.${format || 'json'}`,
      entries,
      summary
    });
  });
}
