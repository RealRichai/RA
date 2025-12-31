import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Types
interface RentRollEntry {
  id: string;
  propertyId: string;
  unitId: string;
  unitNumber: string;
  unitType: string;
  squareFeet: number;
  bedrooms: number;
  bathrooms: number;
  leaseId?: string;
  tenantId?: string;
  tenantName?: string;
  status: 'occupied' | 'vacant' | 'notice' | 'model' | 'down' | 'employee';
  leaseStartDate?: Date;
  leaseEndDate?: Date;
  moveInDate?: Date;
  moveOutDate?: Date;
  marketRent: number;
  currentRent: number;
  concessions?: number;
  otherIncome?: number;
  balance: number;
  depositHeld: number;
  lastPaymentDate?: Date;
  lastPaymentAmount?: number;
  renewalStatus?: 'pending' | 'offered' | 'accepted' | 'declined' | 'month_to_month';
  notes?: string;
}

interface RentRollSnapshot {
  id: string;
  propertyId: string;
  snapshotDate: Date;
  name: string;
  description?: string;
  entries: RentRollEntry[];
  summary: RentRollSummary;
  createdBy: string;
  createdAt: Date;
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

interface ScheduledReport {
  id: string;
  propertyId: string;
  name: string;
  reportType: 'rent_roll' | 'vacancy' | 'collections' | 'renewals' | 'loss_analysis';
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  dayOfWeek?: number; // 0-6 for weekly
  dayOfMonth?: number; // 1-31 for monthly
  recipients: string[];
  format: 'pdf' | 'excel' | 'csv';
  includeComparison: boolean;
  comparisonPeriod?: 'previous_month' | 'previous_quarter' | 'previous_year' | 'custom';
  lastRunAt?: Date;
  nextRunAt: Date;
  isActive: boolean;
  createdAt: Date;
}

interface ReportExecution {
  id: string;
  scheduledReportId?: string;
  propertyId: string;
  reportType: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  fileUrl?: string;
  error?: string;
  recipientsSent?: string[];
}

interface RentRollChange {
  id: string;
  propertyId: string;
  unitId: string;
  changeType: 'move_in' | 'move_out' | 'rent_change' | 'renewal' | 'transfer' | 'concession';
  previousValue?: string;
  newValue?: string;
  effectiveDate: Date;
  recordedAt: Date;
  recordedBy: string;
  notes?: string;
}

// In-memory stores
export const rentRollEntries = new Map<string, RentRollEntry>();
export const rentRollSnapshots = new Map<string, RentRollSnapshot>();
export const scheduledReports = new Map<string, ScheduledReport>();
export const reportExecutions = new Map<string, ReportExecution>();
export const rentRollChanges = new Map<string, RentRollChange>();

// Helper functions
export function calculateSummary(entries: RentRollEntry[]): RentRollSummary {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const totalUnits = entries.length;
  const occupiedEntries = entries.filter(e => e.status === 'occupied');
  const vacantEntries = entries.filter(e => e.status === 'vacant');
  const noticeEntries = entries.filter(e => e.status === 'notice');

  const totalSquareFeet = entries.reduce((sum, e) => sum + e.squareFeet, 0);
  const occupiedSquareFeet = occupiedEntries.reduce((sum, e) => sum + e.squareFeet, 0);

  const totalMarketRent = entries.reduce((sum, e) => sum + e.marketRent, 0);
  const totalCurrentRent = occupiedEntries.reduce((sum, e) => sum + e.currentRent, 0);
  const totalConcessions = occupiedEntries.reduce((sum, e) => sum + (e.concessions || 0), 0);
  const totalOtherIncome = entries.reduce((sum, e) => sum + (e.otherIncome || 0), 0);

  const lossToLease = occupiedEntries.reduce((sum, e) => sum + (e.marketRent - e.currentRent), 0);
  const lossToVacancy = vacantEntries.reduce((sum, e) => sum + e.marketRent, 0);

  const expiringLeases30Days = occupiedEntries.filter(e =>
    e.leaseEndDate && e.leaseEndDate <= in30Days && e.leaseEndDate > now
  ).length;
  const expiringLeases60Days = occupiedEntries.filter(e =>
    e.leaseEndDate && e.leaseEndDate <= in60Days && e.leaseEndDate > now
  ).length;
  const expiringLeases90Days = occupiedEntries.filter(e =>
    e.leaseEndDate && e.leaseEndDate <= in90Days && e.leaseEndDate > now
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
    totalOtherIncome,
    effectiveRent: totalCurrentRent - totalConcessions + totalOtherIncome,
    lossToLease,
    lossToVacancy,
    totalBalance: entries.reduce((sum, e) => sum + e.balance, 0),
    totalDeposits: entries.reduce((sum, e) => sum + e.depositHeld, 0),
    averageRentPerUnit: occupiedEntries.length > 0 ? totalCurrentRent / occupiedEntries.length : 0,
    averageRentPerSqFt: occupiedSquareFeet > 0 ? totalCurrentRent / occupiedSquareFeet : 0,
    expiringLeases30Days,
    expiringLeases60Days,
    expiringLeases90Days
  };
}

export function getRentRollForProperty(propertyId: string): RentRollEntry[] {
  return Array.from(rentRollEntries.values())
    .filter(e => e.propertyId === propertyId)
    .sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }));
}

export function getVacancyAnalysis(propertyId: string): {
  currentVacancy: number;
  averageDaysVacant: number;
  vacancyTrend: number[];
  projectedVacancy: number;
} {
  const entries = getRentRollForProperty(propertyId);
  const vacantUnits = entries.filter(e => e.status === 'vacant');
  const noticeUnits = entries.filter(e => e.status === 'notice');

  // Calculate days vacant for each vacant unit
  const now = new Date();
  const daysVacant = vacantUnits.map(u => {
    if (u.moveOutDate) {
      return Math.floor((now.getTime() - u.moveOutDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    return 0;
  });

  const averageDaysVacant = daysVacant.length > 0
    ? daysVacant.reduce((sum, d) => sum + d, 0) / daysVacant.length
    : 0;

  return {
    currentVacancy: vacantUnits.length,
    averageDaysVacant,
    vacancyTrend: [5, 4, 6, 5, 4, vacantUnits.length], // Placeholder trend data
    projectedVacancy: vacantUnits.length + noticeUnits.length
  };
}

export function getCollectionsAnalysis(propertyId: string): {
  totalOwed: number;
  current: number;
  past30: number;
  past60: number;
  past90Plus: number;
  collectionRate: number;
} {
  const entries = getRentRollForProperty(propertyId).filter(e => e.status === 'occupied');

  // For demo purposes, distribute balances across aging buckets
  const totalOwed = entries.reduce((sum, e) => sum + Math.max(0, e.balance), 0);

  // Simple distribution - in reality would track actual aging
  const current = totalOwed * 0.4;
  const past30 = totalOwed * 0.3;
  const past60 = totalOwed * 0.2;
  const past90Plus = totalOwed * 0.1;

  const totalRent = entries.reduce((sum, e) => sum + e.currentRent, 0);
  const totalCollected = entries.reduce((sum, e) => sum + (e.lastPaymentAmount || 0), 0);

  return {
    totalOwed,
    current,
    past30,
    past60,
    past90Plus,
    collectionRate: totalRent > 0 ? (totalCollected / totalRent) * 100 : 0
  };
}

export function getRenewalAnalysis(propertyId: string): {
  expiringThisMonth: RentRollEntry[];
  renewalRate: number;
  averageRentIncrease: number;
  pendingRenewals: number;
} {
  const entries = getRentRollForProperty(propertyId).filter(e => e.status === 'occupied');
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const expiringThisMonth = entries.filter(e =>
    e.leaseEndDate && e.leaseEndDate <= endOfMonth && e.leaseEndDate >= now
  );

  const renewedLeases = entries.filter(e => e.renewalStatus === 'accepted');
  const totalExpiredOrRenewed = entries.filter(e =>
    e.renewalStatus && ['accepted', 'declined'].includes(e.renewalStatus)
  ).length;

  return {
    expiringThisMonth,
    renewalRate: totalExpiredOrRenewed > 0 ? (renewedLeases.length / totalExpiredOrRenewed) * 100 : 0,
    averageRentIncrease: 3.5, // Placeholder - would calculate from actual renewal data
    pendingRenewals: entries.filter(e => e.renewalStatus === 'pending' || e.renewalStatus === 'offered').length
  };
}

export function compareSummaries(current: RentRollSummary, previous: RentRollSummary): Record<string, { current: number; previous: number; change: number; changePercent: number }> {
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

export function calculateNextRunDate(schedule: ScheduledReport): Date {
  const now = new Date();
  const next = new Date(now);

  switch (schedule.frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      next.setHours(6, 0, 0, 0);
      break;
    case 'weekly':
      const currentDay = next.getDay();
      const targetDay = schedule.dayOfWeek || 1; // Default Monday
      const daysUntil = (targetDay - currentDay + 7) % 7 || 7;
      next.setDate(next.getDate() + daysUntil);
      next.setHours(6, 0, 0, 0);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      next.setDate(Math.min(schedule.dayOfMonth || 1, 28));
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

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

// Schemas
const rentRollEntrySchema = z.object({
  propertyId: z.string(),
  unitId: z.string(),
  unitNumber: z.string(),
  unitType: z.string(),
  squareFeet: z.number().positive(),
  bedrooms: z.number().min(0),
  bathrooms: z.number().min(0),
  leaseId: z.string().optional(),
  tenantId: z.string().optional(),
  tenantName: z.string().optional(),
  status: z.enum(['occupied', 'vacant', 'notice', 'model', 'down', 'employee']),
  leaseStartDate: z.string().transform(s => new Date(s)).optional(),
  leaseEndDate: z.string().transform(s => new Date(s)).optional(),
  moveInDate: z.string().transform(s => new Date(s)).optional(),
  moveOutDate: z.string().transform(s => new Date(s)).optional(),
  marketRent: z.number().min(0),
  currentRent: z.number().min(0),
  concessions: z.number().optional(),
  otherIncome: z.number().optional(),
  balance: z.number(),
  depositHeld: z.number().min(0),
  lastPaymentDate: z.string().transform(s => new Date(s)).optional(),
  lastPaymentAmount: z.number().optional(),
  renewalStatus: z.enum(['pending', 'offered', 'accepted', 'declined', 'month_to_month']).optional(),
  notes: z.string().optional()
});

const snapshotSchema = z.object({
  propertyId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  createdBy: z.string()
});

const scheduledReportSchema = z.object({
  propertyId: z.string(),
  name: z.string(),
  reportType: z.enum(['rent_roll', 'vacancy', 'collections', 'renewals', 'loss_analysis']),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly']),
  dayOfWeek: z.number().min(0).max(6).optional(),
  dayOfMonth: z.number().min(1).max(31).optional(),
  recipients: z.array(z.string().email()),
  format: z.enum(['pdf', 'excel', 'csv']),
  includeComparison: z.boolean(),
  comparisonPeriod: z.enum(['previous_month', 'previous_quarter', 'previous_year', 'custom']).optional()
});

const changeSchema = z.object({
  propertyId: z.string(),
  unitId: z.string(),
  changeType: z.enum(['move_in', 'move_out', 'rent_change', 'renewal', 'transfer', 'concession']),
  previousValue: z.string().optional(),
  newValue: z.string().optional(),
  effectiveDate: z.string().transform(s => new Date(s)),
  recordedBy: z.string(),
  notes: z.string().optional()
});

export async function rentRollRoutes(app: FastifyInstance): Promise<void> {
  // Rent Roll Entries
  app.post('/entries', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = rentRollEntrySchema.parse(request.body);

    const id = `rr_${Date.now()}`;
    const entry: RentRollEntry = {
      id,
      ...data
    };

    rentRollEntries.set(id, entry);
    return reply.status(201).send(entry);
  });

  app.get('/entries', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, status } = request.query as { propertyId?: string; status?: string };
    let entries = Array.from(rentRollEntries.values());

    if (propertyId) entries = entries.filter(e => e.propertyId === propertyId);
    if (status) entries = entries.filter(e => e.status === status);

    return reply.send(entries.sort((a, b) =>
      a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })
    ));
  });

  app.get('/entries/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const entry = rentRollEntries.get(id);
    if (!entry) return reply.status(404).send({ error: 'Entry not found' });
    return reply.send(entry);
  });

  app.put('/entries/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = rentRollEntrySchema.parse(request.body);

    const entry = rentRollEntries.get(id);
    if (!entry) return reply.status(404).send({ error: 'Entry not found' });

    Object.assign(entry, data);
    rentRollEntries.set(id, entry);
    return reply.send(entry);
  });

  // Full Rent Roll Report
  app.get('/report/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const entries = getRentRollForProperty(propertyId);
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
    const entries = getRentRollForProperty(propertyId);
    const summary = calculateSummary(entries);
    return reply.send(summary);
  });

  // Snapshots
  app.post('/snapshots', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = snapshotSchema.parse(request.body);

    const entries = getRentRollForProperty(data.propertyId);
    const summary = calculateSummary(entries);

    const id = `snapshot_${Date.now()}`;
    const snapshot: RentRollSnapshot = {
      id,
      propertyId: data.propertyId,
      snapshotDate: new Date(),
      name: data.name,
      description: data.description,
      entries: JSON.parse(JSON.stringify(entries)), // Deep copy
      summary,
      createdBy: data.createdBy,
      createdAt: new Date()
    };

    rentRollSnapshots.set(id, snapshot);
    return reply.status(201).send(snapshot);
  });

  app.get('/snapshots', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.query as { propertyId?: string };
    let snapshots = Array.from(rentRollSnapshots.values());

    if (propertyId) snapshots = snapshots.filter(s => s.propertyId === propertyId);

    return reply.send(snapshots.sort((a, b) => b.snapshotDate.getTime() - a.snapshotDate.getTime()));
  });

  app.get('/snapshots/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const snapshot = rentRollSnapshots.get(id);
    if (!snapshot) return reply.status(404).send({ error: 'Snapshot not found' });
    return reply.send(snapshot);
  });

  // Compare snapshots
  app.get('/snapshots/compare', async (request: FastifyRequest, reply: FastifyReply) => {
    const { currentId, previousId } = request.query as { currentId: string; previousId: string };

    const current = rentRollSnapshots.get(currentId);
    const previous = rentRollSnapshots.get(previousId);

    if (!current) return reply.status(404).send({ error: 'Current snapshot not found' });
    if (!previous) return reply.status(404).send({ error: 'Previous snapshot not found' });

    const comparison = compareSummaries(current.summary, previous.summary);

    return reply.send({
      current: {
        id: current.id,
        date: current.snapshotDate,
        summary: current.summary
      },
      previous: {
        id: previous.id,
        date: previous.snapshotDate,
        summary: previous.summary
      },
      comparison
    });
  });

  // Analysis endpoints
  app.get('/analysis/vacancy/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const analysis = getVacancyAnalysis(propertyId);
    return reply.send(analysis);
  });

  app.get('/analysis/collections/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const analysis = getCollectionsAnalysis(propertyId);
    return reply.send(analysis);
  });

  app.get('/analysis/renewals/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const analysis = getRenewalAnalysis(propertyId);
    return reply.send(analysis);
  });

  app.get('/analysis/loss/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const entries = getRentRollForProperty(propertyId);
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

    const id = `schedrpt_${Date.now()}`;
    const report: ScheduledReport = {
      id,
      ...data,
      nextRunAt: calculateNextRunDate({ ...data, id, nextRunAt: new Date(), isActive: true, createdAt: new Date() } as ScheduledReport),
      isActive: true,
      createdAt: new Date()
    };

    scheduledReports.set(id, report);
    return reply.status(201).send(report);
  });

  app.get('/scheduled-reports', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.query as { propertyId?: string };
    let reports = Array.from(scheduledReports.values());

    if (propertyId) reports = reports.filter(r => r.propertyId === propertyId);

    return reply.send(reports);
  });

  app.patch('/scheduled-reports/:id/toggle', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const report = scheduledReports.get(id);
    if (!report) return reply.status(404).send({ error: 'Scheduled report not found' });

    report.isActive = !report.isActive;
    if (report.isActive) {
      report.nextRunAt = calculateNextRunDate(report);
    }
    scheduledReports.set(id, report);

    return reply.send(report);
  });

  app.delete('/scheduled-reports/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    if (!scheduledReports.has(id)) {
      return reply.status(404).send({ error: 'Scheduled report not found' });
    }

    scheduledReports.delete(id);
    return reply.status(204).send();
  });

  // Run report manually
  app.post('/scheduled-reports/:id/run', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const report = scheduledReports.get(id);
    if (!report) return reply.status(404).send({ error: 'Scheduled report not found' });

    const executionId = `exec_${Date.now()}`;
    const execution: ReportExecution = {
      id: executionId,
      scheduledReportId: id,
      propertyId: report.propertyId,
      reportType: report.reportType,
      status: 'completed',
      startedAt: new Date(),
      completedAt: new Date(),
      fileUrl: `/reports/${executionId}.${report.format}`,
      recipientsSent: report.recipients
    };

    reportExecutions.set(executionId, execution);

    report.lastRunAt = new Date();
    report.nextRunAt = calculateNextRunDate(report);
    scheduledReports.set(id, report);

    return reply.send(execution);
  });

  // Report executions
  app.get('/executions', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, reportId } = request.query as { propertyId?: string; reportId?: string };
    let executions = Array.from(reportExecutions.values());

    if (propertyId) executions = executions.filter(e => e.propertyId === propertyId);
    if (reportId) executions = executions.filter(e => e.scheduledReportId === reportId);

    return reply.send(executions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()));
  });

  // Changes/Audit log
  app.post('/changes', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = changeSchema.parse(request.body);

    const id = `rrchange_${Date.now()}`;
    const change: RentRollChange = {
      id,
      ...data,
      recordedAt: new Date()
    };

    rentRollChanges.set(id, change);
    return reply.status(201).send(change);
  });

  app.get('/changes', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, unitId, changeType } = request.query as {
      propertyId?: string;
      unitId?: string;
      changeType?: string;
    };

    let changes = Array.from(rentRollChanges.values());

    if (propertyId) changes = changes.filter(c => c.propertyId === propertyId);
    if (unitId) changes = changes.filter(c => c.unitId === unitId);
    if (changeType) changes = changes.filter(c => c.changeType === changeType);

    return reply.send(changes.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime()));
  });

  // Export endpoints
  app.get('/export/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const { format } = request.query as { format?: string };

    const entries = getRentRollForProperty(propertyId);
    const summary = calculateSummary(entries);

    // In production, this would generate actual files
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
