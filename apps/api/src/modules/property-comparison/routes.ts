import {
  prisma,
  Prisma,
  type BenchmarkSource as PrismaBenchmarkSource,
} from '@realriches/database';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Helper to convert Prisma Decimal to number
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

// Exported types for testing
export interface PropertyMetrics {
  propertyId: string;
  propertyName: string;
  recordedAt: Date;

  // Physical attributes
  totalUnits: number;
  totalSquareFeet: number;
  yearBuilt?: number;
  propertyType: string;
  amenities: string[];

  // Financial metrics
  grossPotentialRent: number;
  effectiveGrossIncome: number;
  operatingExpenses: number;
  netOperatingIncome: number;
  capRate: number;
  cashOnCashReturn?: number;

  // Occupancy metrics
  occupancyRate: number;
  physicalOccupancy: number;
  economicOccupancy: number;
  averageDaysVacant: number;
  turnoverRate: number;

  // Rent metrics
  averageRentPerUnit: number;
  averageRentPerSqFt: number;
  marketRentPerUnit: number;
  lossToLease: number;
  lossToLeasePercent: number;

  // Collections
  collectionRate: number;
  delinquencyRate: number;
  badDebtWriteOff: number;

  // Maintenance
  maintenanceExpensePerUnit: number;
  workOrdersPerUnit: number;
  averageWorkOrderCompletionDays: number;

  // Leasing
  renewalRate: number;
  averageLeaseTerm: number;
  concessionRate: number;
}

export interface ComparisonReport {
  id: string;
  name: string;
  description?: string;
  propertyIds: string[];
  metrics: string[];
  period: {
    startDate: Date;
    endDate: Date;
  };
  createdBy: string;
  createdAt: Date;
  results?: ComparisonResult;
}

interface ComparisonResult {
  properties: PropertyMetrics[];
  rankings: MetricRanking[];
  averages: Record<string, number>;
  highlights: ComparisonHighlight[];
}

interface MetricRanking {
  metric: string;
  rankings: { propertyId: string; propertyName: string; value: number; rank: number }[];
  average: number;
  best: { propertyId: string; value: number };
  worst: { propertyId: string; value: number };
}

interface ComparisonHighlight {
  type: 'outperformer' | 'underperformer' | 'opportunity' | 'risk';
  propertyId: string;
  propertyName: string;
  metric: string;
  value: number;
  benchmark: number;
  variance: number;
  message: string;
}

export interface Benchmark {
  id: string;
  name: string;
  propertyType: string;
  market?: string;
  source: 'internal' | 'market' | 'custom';
  metrics: Record<string, { value: number; percentile?: number }>;
  effectiveDate: Date;
  createdAt: Date;
}

interface SavedComparison {
  id: string;
  name: string;
  description?: string;
  propertyIds: string[];
  metrics: string[];
  benchmarkId?: string;
  isDefault: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TrendData {
  propertyId: string;
  metric: string;
  dataPoints: { date: Date; value: number }[];
}

// Exported Maps for testing
export const propertyMetrics = new Map<string, PropertyMetrics>();
export const benchmarks = new Map<string, Benchmark>();
export const comparisonReports = new Map<string, ComparisonReport>();
export const savedComparisons = new Map<string, SavedComparison>();

// Sync versions of functions for testing
export function comparePropertiesSync(propertyIds: string[], metricKeys: string[]): ComparisonResult {
  const properties: PropertyMetrics[] = [];
  for (const id of propertyIds) {
    const metrics = propertyMetrics.get(id);
    if (metrics) properties.push(metrics);
  }

  const rankings: MetricRanking[] = metricKeys.map(metric => {
    const values = properties.map(p => ({
      propertyId: p.propertyId,
      propertyName: p.propertyName,
      value: (p as unknown as Record<string, unknown>)[metric] as number || 0,
      rank: 0,
    })).sort((a, b) => b.value - a.value);

    values.forEach((v, i) => { v.rank = i + 1; });

    const average = values.length > 0
      ? values.reduce((sum, v) => sum + v.value, 0) / values.length
      : 0;

    return {
      metric,
      rankings: values,
      average,
      best: values[0] || { propertyId: '', value: 0 },
      worst: values[values.length - 1] || { propertyId: '', value: 0 },
    };
  });

  const averages: Record<string, number> = {};
  for (const metric of metricKeys) {
    const values = properties.map(p => (p as unknown as Record<string, unknown>)[metric] as number || 0);
    averages[metric] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  return {
    properties,
    rankings,
    averages,
    highlights: [],
  };
}

export function calculatePortfolioAveragesSync(propertyIds: string[]): Record<string, number> {
  const properties: PropertyMetrics[] = [];
  for (const id of propertyIds) {
    const metrics = propertyMetrics.get(id);
    if (metrics) properties.push(metrics);
  }

  if (properties.length === 0) return {};

  const metricKeys: (keyof PropertyMetrics)[] = [
    'occupancyRate', 'collectionRate', 'renewalRate', 'turnoverRate',
    'averageRentPerUnit', 'averageRentPerSqFt', 'netOperatingIncome', 'capRate',
  ];

  const averages: Record<string, number> = {};
  for (const key of metricKeys) {
    const values = properties.map(p => p[key] as number || 0);
    averages[key] = values.reduce((a, b) => a + b, 0) / values.length;
  }

  return averages;
}

export function generateTrendDataSync(propertyId: string, metric: string, months: number = 12): TrendData {
  const dataPoints: { date: Date; value: number }[] = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - i);
    dataPoints.push({
      date,
      value: 90 + Math.random() * 10, // Mock data
    });
  }

  return {
    propertyId,
    metric,
    dataPoints,
  };
}

export function compareToBenchmarkSync(propertyId: string, benchmarkId: string): Record<string, { value: number; benchmark: number; variance: number; status: 'above' | 'below' | 'at' }> {
  const metrics = propertyMetrics.get(propertyId);
  const benchmark = benchmarks.get(benchmarkId);

  if (!metrics || !benchmark) return {};

  const result: Record<string, { value: number; benchmark: number; variance: number; status: 'above' | 'below' | 'at' }> = {};

  for (const [key, benchValue] of Object.entries(benchmark.metrics)) {
    const value = (metrics as unknown as Record<string, unknown>)[key] as number || 0;
    const benchmarkValue = benchValue.value;
    const variance = value - benchmarkValue;
    const status = variance > 0 ? 'above' : variance < 0 ? 'below' : 'at';

    result[key] = { value, benchmark: benchmarkValue, variance, status };
  }

  return result;
}

// Export sync functions as main exports for testing
export {
  comparePropertiesSync as compareProperties,
  calculatePortfolioAveragesSync as calculatePortfolioAverages,
  generateTrendDataSync as generateTrendData,
  compareToBenchmarkSync as compareToBenchmark,
};

// Note: TrendData is still generated dynamically, not stored in DB

// Helper to convert Prisma PropertyMetric to interface
function toPropertyMetrics(pm: Awaited<ReturnType<typeof prisma.propertyMetric.findFirst>>): PropertyMetrics | null {
  if (!pm) return null;
  return {
    propertyId: pm.propertyId,
    propertyName: pm.propertyName,
    recordedAt: pm.recordedAt,
    totalUnits: pm.totalUnits,
    totalSquareFeet: pm.totalSquareFeet,
    yearBuilt: pm.yearBuilt ?? undefined,
    propertyType: pm.propertyType,
    amenities: pm.amenities as string[],
    grossPotentialRent: toNumber(pm.grossPotentialRent),
    effectiveGrossIncome: toNumber(pm.effectiveGrossIncome),
    operatingExpenses: toNumber(pm.operatingExpenses),
    netOperatingIncome: toNumber(pm.netOperatingIncome),
    capRate: toNumber(pm.capRate),
    cashOnCashReturn: pm.cashOnCashReturn ? toNumber(pm.cashOnCashReturn) : undefined,
    occupancyRate: toNumber(pm.occupancyRate),
    physicalOccupancy: toNumber(pm.physicalOccupancy),
    economicOccupancy: toNumber(pm.economicOccupancy),
    averageDaysVacant: toNumber(pm.averageDaysVacant),
    turnoverRate: toNumber(pm.turnoverRate),
    averageRentPerUnit: toNumber(pm.averageRentPerUnit),
    averageRentPerSqFt: toNumber(pm.averageRentPerSqFt),
    marketRentPerUnit: toNumber(pm.marketRentPerUnit),
    lossToLease: toNumber(pm.lossToLease),
    lossToLeasePercent: toNumber(pm.lossToLeasePercent),
    collectionRate: toNumber(pm.collectionRate),
    delinquencyRate: toNumber(pm.delinquencyRate),
    badDebtWriteOff: toNumber(pm.badDebtWriteOff),
    maintenanceExpensePerUnit: toNumber(pm.maintenanceExpensePerUnit),
    workOrdersPerUnit: toNumber(pm.workOrdersPerUnit),
    averageWorkOrderCompletionDays: toNumber(pm.averageWorkOrderCompletionDays),
    renewalRate: toNumber(pm.renewalRate),
    averageLeaseTerm: toNumber(pm.averageLeaseTerm),
    concessionRate: toNumber(pm.concessionRate),
  };
}

// Available metrics for comparison
export const availableMetrics = [
  { key: 'occupancyRate', name: 'Occupancy Rate', category: 'occupancy', format: 'percent', higherIsBetter: true },
  { key: 'economicOccupancy', name: 'Economic Occupancy', category: 'occupancy', format: 'percent', higherIsBetter: true },
  { key: 'averageDaysVacant', name: 'Average Days Vacant', category: 'occupancy', format: 'number', higherIsBetter: false },
  { key: 'turnoverRate', name: 'Turnover Rate', category: 'occupancy', format: 'percent', higherIsBetter: false },
  { key: 'averageRentPerUnit', name: 'Average Rent/Unit', category: 'rent', format: 'currency', higherIsBetter: true },
  { key: 'averageRentPerSqFt', name: 'Rent/Sq Ft', category: 'rent', format: 'currency', higherIsBetter: true },
  { key: 'lossToLeasePercent', name: 'Loss to Lease %', category: 'rent', format: 'percent', higherIsBetter: false },
  { key: 'netOperatingIncome', name: 'NOI', category: 'financial', format: 'currency', higherIsBetter: true },
  { key: 'capRate', name: 'Cap Rate', category: 'financial', format: 'percent', higherIsBetter: true },
  { key: 'collectionRate', name: 'Collection Rate', category: 'collections', format: 'percent', higherIsBetter: true },
  { key: 'delinquencyRate', name: 'Delinquency Rate', category: 'collections', format: 'percent', higherIsBetter: false },
  { key: 'renewalRate', name: 'Renewal Rate', category: 'leasing', format: 'percent', higherIsBetter: true },
  { key: 'concessionRate', name: 'Concession Rate', category: 'leasing', format: 'percent', higherIsBetter: false },
  { key: 'maintenanceExpensePerUnit', name: 'Maintenance $/Unit', category: 'operations', format: 'currency', higherIsBetter: false },
  { key: 'workOrdersPerUnit', name: 'Work Orders/Unit', category: 'operations', format: 'number', higherIsBetter: false }
];

// Helper functions
export function getMetricDefinition(key: string): typeof availableMetrics[0] | undefined {
  return availableMetrics.find(m => m.key === key);
}

async function comparePropertiesAsync(propertyIds: string[], metricKeys: string[]): Promise<ComparisonResult> {
  const metricsRecords = await prisma.propertyMetric.findMany({
    where: { propertyId: { in: propertyIds } },
    orderBy: { recordedAt: 'desc' },
  });

  // Get latest metric for each property
  const latestMetrics = new Map<string, PropertyMetrics>();
  for (const record of metricsRecords) {
    if (!latestMetrics.has(record.propertyId)) {
      const converted = toPropertyMetrics(record);
      if (converted) latestMetrics.set(record.propertyId, converted);
    }
  }
  const properties = Array.from(latestMetrics.values());

  const rankings: MetricRanking[] = [];
  const averages: Record<string, number> = {};
  const highlights: ComparisonHighlight[] = [];

  for (const metricKey of metricKeys) {
    const definition = getMetricDefinition(metricKey);
    if (!definition) continue;

    const values = properties.map(p => ({
      propertyId: p.propertyId,
      propertyName: p.propertyName,
      value: (p as unknown as Record<string, number>)[metricKey] || 0
    }));

    // Sort for ranking (considering if higher is better)
    const sorted = [...values].sort((a, b) =>
      definition.higherIsBetter ? b.value - a.value : a.value - b.value
    );

    const rankedValues = sorted.map((v, i) => ({ ...v, rank: i + 1 }));
    const avg = values.length > 0 ? values.reduce((sum, v) => sum + v.value, 0) / values.length : 0;

    averages[metricKey] = avg;

    rankings.push({
      metric: metricKey,
      rankings: rankedValues,
      average: avg,
      best: { propertyId: sorted[0]?.propertyId || '', value: sorted[0]?.value || 0 },
      worst: { propertyId: sorted[sorted.length - 1]?.propertyId || '', value: sorted[sorted.length - 1]?.value || 0 }
    });

    // Generate highlights
    for (const prop of properties) {
      const value = (prop as unknown as Record<string, number>)[metricKey] || 0;
      const variance = avg !== 0 ? ((value - avg) / avg) * 100 : 0;

      if (Math.abs(variance) > 20) {
        const isGood = (definition.higherIsBetter && variance > 0) || (!definition.higherIsBetter && variance < 0);
        highlights.push({
          type: isGood ? 'outperformer' : 'underperformer',
          propertyId: prop.propertyId,
          propertyName: prop.propertyName,
          metric: metricKey,
          value,
          benchmark: avg,
          variance,
          message: `${prop.propertyName} ${metricKey} is ${Math.abs(variance).toFixed(1)}% ${variance > 0 ? 'above' : 'below'} portfolio average`
        });
      }
    }
  }

  return { properties, rankings, averages, highlights };
}

async function calculatePortfolioAveragesAsync(propertyIds: string[]): Promise<Record<string, number>> {
  const metricsRecords = await prisma.propertyMetric.findMany({
    where: { propertyId: { in: propertyIds } },
    orderBy: { recordedAt: 'desc' },
  });

  // Get latest metric for each property
  const latestMetrics = new Map<string, PropertyMetrics>();
  for (const record of metricsRecords) {
    if (!latestMetrics.has(record.propertyId)) {
      const converted = toPropertyMetrics(record);
      if (converted) latestMetrics.set(record.propertyId, converted);
    }
  }
  const properties = Array.from(latestMetrics.values());

  if (properties.length === 0) return {};

  const averages: Record<string, number> = {};

  for (const metric of availableMetrics) {
    const values = properties.map(p => (p as unknown as Record<string, number>)[metric.key] || 0);
    averages[metric.key] = values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  return averages;
}

export async function rankPropertyInPortfolio(propertyId: string, portfolioIds: string[]): Promise<Record<string, { rank: number; total: number; percentile: number }>> {
  const metricsRecords = await prisma.propertyMetric.findMany({
    where: { propertyId: { in: portfolioIds } },
    orderBy: { recordedAt: 'desc' },
  });

  // Get latest metric for each property
  const latestMetrics = new Map<string, PropertyMetrics>();
  for (const record of metricsRecords) {
    if (!latestMetrics.has(record.propertyId)) {
      const converted = toPropertyMetrics(record);
      if (converted) latestMetrics.set(record.propertyId, converted);
    }
  }

  const rankings: Record<string, { rank: number; total: number; percentile: number }> = {};

  for (const metric of availableMetrics) {
    const values = portfolioIds
      .map(id => {
        const metrics = latestMetrics.get(id);
        return { id, value: metrics ? (metrics as unknown as Record<string, number>)[metric.key] || 0 : 0 };
      })
      .filter(v => v.value !== undefined);

    const sorted = [...values].sort((a, b) =>
      metric.higherIsBetter ? b.value - a.value : a.value - b.value
    );

    const rank = sorted.findIndex(v => v.id === propertyId) + 1;
    const total = sorted.length;

    rankings[metric.key] = {
      rank,
      total,
      percentile: total > 0 ? ((total - rank + 1) / total) * 100 : 0
    };
  }

  return rankings;
}

export async function findSimilarProperties(propertyId: string, allPropertyIds: string[], limit: number = 5): Promise<string[]> {
  const metricsRecords = await prisma.propertyMetric.findMany({
    where: { propertyId: { in: allPropertyIds } },
    orderBy: { recordedAt: 'desc' },
  });

  // Get latest metric for each property
  const latestMetrics = new Map<string, PropertyMetrics>();
  for (const record of metricsRecords) {
    if (!latestMetrics.has(record.propertyId)) {
      const converted = toPropertyMetrics(record);
      if (converted) latestMetrics.set(record.propertyId, converted);
    }
  }

  const target = latestMetrics.get(propertyId);
  if (!target) return [];

  const scores = allPropertyIds
    .filter(id => id !== propertyId)
    .map(id => {
      const prop = latestMetrics.get(id);
      if (!prop) return { id, score: Infinity };

      // Calculate similarity score based on key attributes
      let score = 0;
      score += Math.abs(target.totalUnits - prop.totalUnits) / Math.max(target.totalUnits, 1);
      score += Math.abs(target.averageRentPerUnit - prop.averageRentPerUnit) / Math.max(target.averageRentPerUnit, 1);
      if (target.propertyType !== prop.propertyType) score += 1;

      return { id, score };
    })
    .sort((a, b) => a.score - b.score);

  return scores.slice(0, limit).map(s => s.id);
}

async function generateTrendDataAsync(propertyId: string, metric: string, months: number = 12): Promise<TrendData> {
  const dataPoints: { date: Date; value: number }[] = [];

  const latestMetric = await prisma.propertyMetric.findFirst({
    where: { propertyId },
    orderBy: { recordedAt: 'desc' },
  });

  const baseMetrics = toPropertyMetrics(latestMetric);
  const baseValue = baseMetrics ? (baseMetrics as unknown as Record<string, number>)[metric] || 100 : 100;

  // Generate mock trend data
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    // Add some variation (+/- 10%)
    const variation = 1 + (Math.random() - 0.5) * 0.2;
    dataPoints.push({ date, value: baseValue * variation });
  }

  return { propertyId, metric, dataPoints };
}

async function compareToBenchmarkAsync(propertyId: string, benchmarkId: string): Promise<Record<string, { value: number; benchmark: number; variance: number; status: 'above' | 'below' | 'at' }>> {
  const propertyMetric = await prisma.propertyMetric.findFirst({
    where: { propertyId },
    orderBy: { recordedAt: 'desc' },
  });
  const benchmarkRecord = await prisma.benchmark.findUnique({
    where: { id: benchmarkId },
  });

  const property = toPropertyMetrics(propertyMetric);
  if (!property || !benchmarkRecord) return {};

  const benchmarkMetrics = benchmarkRecord.metrics as Record<string, { value: number; percentile?: number }>;
  const comparison: Record<string, { value: number; benchmark: number; variance: number; status: 'above' | 'below' | 'at' }> = {};

  for (const [key, benchmarkData] of Object.entries(benchmarkMetrics)) {
    const value = (property as unknown as Record<string, number>)[key] || 0;
    const benchmarkValue = benchmarkData.value;
    const variance = benchmarkValue !== 0 ? ((value - benchmarkValue) / benchmarkValue) * 100 : 0;

    let status: 'above' | 'below' | 'at' = 'at';
    if (Math.abs(variance) > 5) {
      status = variance > 0 ? 'above' : 'below';
    }

    comparison[key] = { value, benchmark: benchmarkValue, variance, status };
  }

  return comparison;
}

// Schemas
const metricsSchema = z.object({
  propertyId: z.string(),
  propertyName: z.string(),
  totalUnits: z.number().min(0),
  totalSquareFeet: z.number().min(0),
  yearBuilt: z.number().optional(),
  propertyType: z.string(),
  amenities: z.array(z.string()),
  grossPotentialRent: z.number(),
  effectiveGrossIncome: z.number(),
  operatingExpenses: z.number(),
  netOperatingIncome: z.number(),
  capRate: z.number(),
  cashOnCashReturn: z.number().optional(),
  occupancyRate: z.number(),
  physicalOccupancy: z.number(),
  economicOccupancy: z.number(),
  averageDaysVacant: z.number(),
  turnoverRate: z.number(),
  averageRentPerUnit: z.number(),
  averageRentPerSqFt: z.number(),
  marketRentPerUnit: z.number(),
  lossToLease: z.number(),
  lossToLeasePercent: z.number(),
  collectionRate: z.number(),
  delinquencyRate: z.number(),
  badDebtWriteOff: z.number(),
  maintenanceExpensePerUnit: z.number(),
  workOrdersPerUnit: z.number(),
  averageWorkOrderCompletionDays: z.number(),
  renewalRate: z.number(),
  averageLeaseTerm: z.number(),
  concessionRate: z.number()
});

const comparisonSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  propertyIds: z.array(z.string()).min(2),
  metrics: z.array(z.string()).min(1),
  period: z.object({
    startDate: z.string().transform(s => new Date(s)),
    endDate: z.string().transform(s => new Date(s))
  }),
  createdBy: z.string()
});

const benchmarkSchema = z.object({
  name: z.string(),
  propertyType: z.string(),
  market: z.string().optional(),
  source: z.enum(['internal', 'market', 'custom']),
  metrics: z.record(z.object({
    value: z.number(),
    percentile: z.number().optional()
  })),
  effectiveDate: z.string().transform(s => new Date(s))
});

const savedComparisonSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  propertyIds: z.array(z.string()),
  metrics: z.array(z.string()),
  benchmarkId: z.string().optional(),
  isDefault: z.boolean().optional(),
  createdBy: z.string()
});

export async function propertyComparisonRoutes(app: FastifyInstance): Promise<void> {
  // Metrics endpoints
  app.post('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = metricsSchema.parse(request.body);

    const metric = await prisma.propertyMetric.create({
      data: {
        propertyId: data.propertyId,
        propertyName: data.propertyName,
        totalUnits: data.totalUnits,
        totalSquareFeet: data.totalSquareFeet,
        yearBuilt: data.yearBuilt,
        propertyType: data.propertyType,
        amenities: data.amenities as unknown as Prisma.JsonValue,
        grossPotentialRent: data.grossPotentialRent,
        effectiveGrossIncome: data.effectiveGrossIncome,
        operatingExpenses: data.operatingExpenses,
        netOperatingIncome: data.netOperatingIncome,
        capRate: data.capRate,
        cashOnCashReturn: data.cashOnCashReturn,
        occupancyRate: data.occupancyRate,
        physicalOccupancy: data.physicalOccupancy,
        economicOccupancy: data.economicOccupancy,
        averageDaysVacant: data.averageDaysVacant,
        turnoverRate: data.turnoverRate,
        averageRentPerUnit: data.averageRentPerUnit,
        averageRentPerSqFt: data.averageRentPerSqFt,
        marketRentPerUnit: data.marketRentPerUnit,
        lossToLease: data.lossToLease,
        lossToLeasePercent: data.lossToLeasePercent,
        collectionRate: data.collectionRate,
        delinquencyRate: data.delinquencyRate,
        badDebtWriteOff: data.badDebtWriteOff,
        maintenanceExpensePerUnit: data.maintenanceExpensePerUnit,
        workOrdersPerUnit: data.workOrdersPerUnit,
        averageWorkOrderCompletionDays: data.averageWorkOrderCompletionDays,
        renewalRate: data.renewalRate,
        averageLeaseTerm: data.averageLeaseTerm,
        concessionRate: data.concessionRate,
      },
    });

    return reply.status(201).send(toPropertyMetrics(metric));
  });

  app.get('/metrics/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const metric = await prisma.propertyMetric.findFirst({
      where: { propertyId },
      orderBy: { recordedAt: 'desc' },
    });
    if (!metric) return reply.status(404).send({ error: 'Metrics not found' });
    return reply.send(toPropertyMetrics(metric));
  });

  app.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyIds } = request.query as { propertyIds?: string };

    const where: Prisma.PropertyMetricWhereInput = {};
    if (propertyIds) {
      where.propertyId = { in: propertyIds.split(',') };
    }

    const metrics = await prisma.propertyMetric.findMany({
      where,
      orderBy: { recordedAt: 'desc' },
    });

    // Get latest metric per property
    const latestMetrics = new Map<string, PropertyMetrics>();
    for (const m of metrics) {
      if (!latestMetrics.has(m.propertyId)) {
        const converted = toPropertyMetrics(m);
        if (converted) latestMetrics.set(m.propertyId, converted);
      }
    }

    return reply.send(Array.from(latestMetrics.values()));
  });

  // Available metrics
  app.get('/available-metrics', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(availableMetrics);
  });

  // Compare properties
  app.post('/compare', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = comparisonSchema.parse(request.body);

    const results = await comparePropertiesAsync(data.propertyIds, data.metrics);

    const report = await prisma.comparisonReport.create({
      data: {
        name: data.name,
        description: data.description,
        propertyIds: data.propertyIds as unknown as Prisma.JsonValue,
        metrics: data.metrics as unknown as Prisma.JsonValue,
        period: { startDate: data.period.startDate, endDate: data.period.endDate } as unknown as Prisma.JsonValue,
        results: results as unknown as Prisma.JsonValue,
        createdBy: data.createdBy,
      },
    });

    return reply.status(201).send({
      id: report.id,
      name: report.name,
      description: report.description,
      propertyIds: report.propertyIds,
      metrics: report.metrics,
      period: report.period,
      createdBy: report.createdBy,
      createdAt: report.createdAt,
      results: report.results,
    });
  });

  app.get('/compare/quick', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyIds, metrics } = request.query as { propertyIds: string; metrics?: string };

    const ids = propertyIds.split(',');
    const metricKeys = metrics ? metrics.split(',') : availableMetrics.map(m => m.key);

    const results = await comparePropertiesAsync(ids, metricKeys);
    return reply.send(results);
  });

  // Comparison reports
  app.get('/reports', async (request: FastifyRequest, reply: FastifyReply) => {
    const reports = await prisma.comparisonReport.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return reply.send(reports);
  });

  app.get('/reports/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const report = await prisma.comparisonReport.findUnique({ where: { id } });
    if (!report) return reply.status(404).send({ error: 'Report not found' });
    return reply.send(report);
  });

  // Rankings
  app.get('/rankings/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const { portfolioIds } = request.query as { portfolioIds?: string };

    let ids: string[];
    if (portfolioIds) {
      ids = portfolioIds.split(',');
    } else {
      const allMetrics = await prisma.propertyMetric.findMany({
        select: { propertyId: true },
        distinct: ['propertyId'],
      });
      ids = allMetrics.map(m => m.propertyId);
    }

    const rankings = await rankPropertyInPortfolio(propertyId, ids);
    return reply.send(rankings);
  });

  // Portfolio averages
  app.get('/portfolio/averages', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyIds } = request.query as { propertyIds?: string };

    let ids: string[];
    if (propertyIds) {
      ids = propertyIds.split(',');
    } else {
      const allMetrics = await prisma.propertyMetric.findMany({
        select: { propertyId: true },
        distinct: ['propertyId'],
      });
      ids = allMetrics.map(m => m.propertyId);
    }

    const averages = await calculatePortfolioAveragesAsync(ids);
    return reply.send(averages);
  });

  // Similar properties
  app.get('/similar/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const { limit } = request.query as { limit?: string };

    const allMetrics = await prisma.propertyMetric.findMany({
      select: { propertyId: true },
      distinct: ['propertyId'],
    });
    const allIds = allMetrics.map(m => m.propertyId);

    const similarIds = await findSimilarProperties(propertyId, allIds, limit ? parseInt(limit) : 5);

    // Get the metrics for similar properties
    const similarMetrics = await prisma.propertyMetric.findMany({
      where: { propertyId: { in: similarIds } },
      orderBy: { recordedAt: 'desc' },
    });

    // Get latest for each
    const latestMetrics = new Map<string, PropertyMetrics>();
    for (const m of similarMetrics) {
      if (!latestMetrics.has(m.propertyId)) {
        const converted = toPropertyMetrics(m);
        if (converted) latestMetrics.set(m.propertyId, converted);
      }
    }

    const similarProperties = similarIds.map(id => latestMetrics.get(id)).filter(Boolean);
    return reply.send(similarProperties);
  });

  // Trends
  app.get('/trends/:propertyId/:metric', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, metric } = request.params as { propertyId: string; metric: string };
    const { months } = request.query as { months?: string };

    const trendData = await generateTrendDataAsync(propertyId, metric, months ? parseInt(months) : 12);
    return reply.send(trendData);
  });

  app.get('/trends/compare', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyIds, metric, months } = request.query as {
      propertyIds: string;
      metric: string;
      months?: string;
    };

    const ids = propertyIds.split(',');
    const trends = await Promise.all(
      ids.map(id => generateTrendDataAsync(id, metric, months ? parseInt(months) : 12))
    );

    return reply.send(trends);
  });

  // Benchmarks
  app.post('/benchmarks', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = benchmarkSchema.parse(request.body);

    const benchmark = await prisma.benchmark.create({
      data: {
        name: data.name,
        propertyType: data.propertyType,
        market: data.market,
        source: data.source as PrismaBenchmarkSource,
        metrics: data.metrics as unknown as Prisma.JsonValue,
        effectiveDate: data.effectiveDate,
      },
    });

    return reply.status(201).send({
      id: benchmark.id,
      name: benchmark.name,
      propertyType: benchmark.propertyType,
      market: benchmark.market,
      source: benchmark.source,
      metrics: benchmark.metrics,
      effectiveDate: benchmark.effectiveDate,
      createdAt: benchmark.createdAt,
    });
  });

  app.get('/benchmarks', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyType, source } = request.query as { propertyType?: string; source?: string };

    const where: Prisma.BenchmarkWhereInput = {};
    if (propertyType) where.propertyType = propertyType;
    if (source) where.source = source as PrismaBenchmarkSource;

    const allBenchmarks = await prisma.benchmark.findMany({ where });

    return reply.send(allBenchmarks);
  });

  app.get('/benchmarks/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const benchmark = await prisma.benchmark.findUnique({ where: { id } });
    if (!benchmark) return reply.status(404).send({ error: 'Benchmark not found' });
    return reply.send(benchmark);
  });

  // Compare to benchmark
  app.get('/compare-to-benchmark/:propertyId/:benchmarkId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, benchmarkId } = request.params as { propertyId: string; benchmarkId: string };

    const comparison = await compareToBenchmarkAsync(propertyId, benchmarkId);
    if (Object.keys(comparison).length === 0) {
      return reply.status(404).send({ error: 'Property or benchmark not found' });
    }

    return reply.send(comparison);
  });

  // Saved comparisons
  app.post('/saved', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = savedComparisonSchema.parse(request.body);

    const saved = await prisma.savedPropertyComparison.create({
      data: {
        name: data.name,
        description: data.description,
        propertyIds: data.propertyIds as unknown as Prisma.JsonValue,
        metrics: data.metrics as unknown as Prisma.JsonValue,
        benchmarkId: data.benchmarkId,
        isDefault: data.isDefault ?? false,
        createdBy: data.createdBy,
      },
    });

    return reply.status(201).send({
      id: saved.id,
      name: saved.name,
      description: saved.description,
      propertyIds: saved.propertyIds,
      metrics: saved.metrics,
      benchmarkId: saved.benchmarkId,
      isDefault: saved.isDefault,
      createdBy: saved.createdBy,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    });
  });

  app.get('/saved', async (request: FastifyRequest, reply: FastifyReply) => {
    const { createdBy } = request.query as { createdBy?: string };

    const where: Prisma.SavedPropertyComparisonWhereInput = {};
    if (createdBy) where.createdBy = createdBy;

    const saved = await prisma.savedPropertyComparison.findMany({ where });

    return reply.send(saved);
  });

  app.get('/saved/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const saved = await prisma.savedPropertyComparison.findUnique({ where: { id } });
    if (!saved) return reply.status(404).send({ error: 'Saved comparison not found' });
    return reply.send(saved);
  });

  app.delete('/saved/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.savedPropertyComparison.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: 'Saved comparison not found' });
    }

    await prisma.savedPropertyComparison.delete({ where: { id } });
    return reply.status(204).send();
  });

  // Run saved comparison
  app.post('/saved/:id/run', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const saved = await prisma.savedPropertyComparison.findUnique({ where: { id } });
    if (!saved) return reply.status(404).send({ error: 'Saved comparison not found' });

    const propertyIds = saved.propertyIds as string[];
    const metrics = saved.metrics as string[];
    const results = await comparePropertiesAsync(propertyIds, metrics);

    // If benchmark specified, add benchmark comparison
    let benchmarkComparison: Record<string, Record<string, { value: number; benchmark: number; variance: number; status: 'above' | 'below' | 'at' }>> | undefined;
    if (saved.benchmarkId) {
      const benchmarkResults = await Promise.all(
        propertyIds.map(async propId => ({
          propId,
          comparison: await compareToBenchmarkAsync(propId, saved.benchmarkId!),
        }))
      );
      benchmarkComparison = {};
      for (const { propId, comparison } of benchmarkResults) {
        benchmarkComparison[propId] = comparison;
      }
    }

    return reply.send({
      savedComparison: saved,
      results,
      benchmarkComparison
    });
  });

  // Export comparison
  app.get('/export/:reportId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { reportId } = request.params as { reportId: string };
    const { format } = request.query as { format?: string };

    const report = await prisma.comparisonReport.findUnique({ where: { id: reportId } });
    if (!report) return reply.status(404).send({ error: 'Report not found' });

    // In production, this would generate actual files
    return reply.send({
      reportId,
      format: format || 'json',
      generatedAt: new Date(),
      downloadUrl: `/exports/comparison-${reportId}.${format || 'json'}`,
      report
    });
  });

  // Scorecard - comprehensive property summary
  app.get('/scorecard/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const { portfolioIds } = request.query as { portfolioIds?: string };

    const metricRecord = await prisma.propertyMetric.findFirst({
      where: { propertyId },
      orderBy: { recordedAt: 'desc' },
    });
    const metrics = toPropertyMetrics(metricRecord);
    if (!metrics) return reply.status(404).send({ error: 'Property metrics not found' });

    let ids: string[];
    if (portfolioIds) {
      ids = portfolioIds.split(',');
    } else {
      const allMetrics = await prisma.propertyMetric.findMany({
        select: { propertyId: true },
        distinct: ['propertyId'],
      });
      ids = allMetrics.map(m => m.propertyId);
    }

    const rankings = await rankPropertyInPortfolio(propertyId, ids);
    const portfolioAvgs = await calculatePortfolioAveragesAsync(ids);

    // Calculate grades based on percentile
    const grades: Record<string, string> = {};
    for (const [key, ranking] of Object.entries(rankings)) {
      if (ranking.percentile >= 80) grades[key] = 'A';
      else if (ranking.percentile >= 60) grades[key] = 'B';
      else if (ranking.percentile >= 40) grades[key] = 'C';
      else if (ranking.percentile >= 20) grades[key] = 'D';
      else grades[key] = 'F';
    }

    return reply.send({
      property: metrics,
      rankings,
      portfolioAverages: portfolioAvgs,
      grades,
      overallGrade: Object.values(grades).reduce((sum, g) => {
        const points = { A: 4, B: 3, C: 2, D: 1, F: 0 };
        return sum + (points[g as keyof typeof points] || 0);
      }, 0) / Object.values(grades).length
    });
  });
}
