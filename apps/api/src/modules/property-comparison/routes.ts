import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Types
interface PropertyMetrics {
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

interface ComparisonReport {
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

interface Benchmark {
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

interface TrendData {
  propertyId: string;
  metric: string;
  dataPoints: { date: Date; value: number }[];
}

// In-memory stores
export const propertyMetrics = new Map<string, PropertyMetrics>();
export const comparisonReports = new Map<string, ComparisonReport>();
export const benchmarks = new Map<string, Benchmark>();
export const savedComparisons = new Map<string, SavedComparison>();
export const trendDataStore = new Map<string, TrendData>();

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

export function compareProperties(propertyIds: string[], metricKeys: string[]): ComparisonResult {
  const properties = propertyIds
    .map(id => propertyMetrics.get(id))
    .filter((p): p is PropertyMetrics => p !== undefined);

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
    const avg = values.reduce((sum, v) => sum + v.value, 0) / values.length;

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

export function calculatePortfolioAverages(propertyIds: string[]): Record<string, number> {
  const properties = propertyIds
    .map(id => propertyMetrics.get(id))
    .filter((p): p is PropertyMetrics => p !== undefined);

  if (properties.length === 0) return {};

  const averages: Record<string, number> = {};

  for (const metric of availableMetrics) {
    const values = properties.map(p => (p as unknown as Record<string, number>)[metric.key] || 0);
    averages[metric.key] = values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  return averages;
}

export function rankPropertyInPortfolio(propertyId: string, portfolioIds: string[]): Record<string, { rank: number; total: number; percentile: number }> {
  const rankings: Record<string, { rank: number; total: number; percentile: number }> = {};

  for (const metric of availableMetrics) {
    const values = portfolioIds
      .map(id => ({ id, value: (propertyMetrics.get(id) as unknown as Record<string, number>)?.[metric.key] || 0 }))
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

export function findSimilarProperties(propertyId: string, allPropertyIds: string[], limit: number = 5): string[] {
  const target = propertyMetrics.get(propertyId);
  if (!target) return [];

  const scores = allPropertyIds
    .filter(id => id !== propertyId)
    .map(id => {
      const prop = propertyMetrics.get(id);
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

export function generateTrendData(propertyId: string, metric: string, months: number = 12): TrendData {
  const dataPoints: { date: Date; value: number }[] = [];
  const baseMetrics = propertyMetrics.get(propertyId);
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

export function compareToBenchmark(propertyId: string, benchmarkId: string): Record<string, { value: number; benchmark: number; variance: number; status: 'above' | 'below' | 'at' }> {
  const property = propertyMetrics.get(propertyId);
  const benchmark = benchmarks.get(benchmarkId);

  if (!property || !benchmark) return {};

  const comparison: Record<string, { value: number; benchmark: number; variance: number; status: 'above' | 'below' | 'at' }> = {};

  for (const [key, benchmarkData] of Object.entries(benchmark.metrics)) {
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

    const metrics: PropertyMetrics = {
      ...data,
      recordedAt: new Date()
    };

    propertyMetrics.set(data.propertyId, metrics);
    return reply.status(201).send(metrics);
  });

  app.get('/metrics/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const metrics = propertyMetrics.get(propertyId);
    if (!metrics) return reply.status(404).send({ error: 'Metrics not found' });
    return reply.send(metrics);
  });

  app.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyIds } = request.query as { propertyIds?: string };
    let metrics = Array.from(propertyMetrics.values());

    if (propertyIds) {
      const ids = propertyIds.split(',');
      metrics = metrics.filter(m => ids.includes(m.propertyId));
    }

    return reply.send(metrics);
  });

  // Available metrics
  app.get('/available-metrics', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(availableMetrics);
  });

  // Compare properties
  app.post('/compare', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = comparisonSchema.parse(request.body);

    const results = compareProperties(data.propertyIds, data.metrics);

    const id = `comparison_${Date.now()}`;
    const report: ComparisonReport = {
      id,
      ...data,
      createdAt: new Date(),
      results
    };

    comparisonReports.set(id, report);
    return reply.status(201).send(report);
  });

  app.get('/compare/quick', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyIds, metrics } = request.query as { propertyIds: string; metrics?: string };

    const ids = propertyIds.split(',');
    const metricKeys = metrics ? metrics.split(',') : availableMetrics.map(m => m.key);

    const results = compareProperties(ids, metricKeys);
    return reply.send(results);
  });

  // Comparison reports
  app.get('/reports', async (request: FastifyRequest, reply: FastifyReply) => {
    const reports = Array.from(comparisonReports.values());
    return reply.send(reports.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
  });

  app.get('/reports/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const report = comparisonReports.get(id);
    if (!report) return reply.status(404).send({ error: 'Report not found' });
    return reply.send(report);
  });

  // Rankings
  app.get('/rankings/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const { portfolioIds } = request.query as { portfolioIds?: string };

    const ids = portfolioIds
      ? portfolioIds.split(',')
      : Array.from(propertyMetrics.keys());

    const rankings = rankPropertyInPortfolio(propertyId, ids);
    return reply.send(rankings);
  });

  // Portfolio averages
  app.get('/portfolio/averages', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyIds } = request.query as { propertyIds?: string };

    const ids = propertyIds
      ? propertyIds.split(',')
      : Array.from(propertyMetrics.keys());

    const averages = calculatePortfolioAverages(ids);
    return reply.send(averages);
  });

  // Similar properties
  app.get('/similar/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const { limit } = request.query as { limit?: string };

    const allIds = Array.from(propertyMetrics.keys());
    const similarIds = findSimilarProperties(propertyId, allIds, limit ? parseInt(limit) : 5);

    const similarProperties = similarIds.map(id => propertyMetrics.get(id)).filter(Boolean);
    return reply.send(similarProperties);
  });

  // Trends
  app.get('/trends/:propertyId/:metric', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, metric } = request.params as { propertyId: string; metric: string };
    const { months } = request.query as { months?: string };

    const trendData = generateTrendData(propertyId, metric, months ? parseInt(months) : 12);
    return reply.send(trendData);
  });

  app.get('/trends/compare', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyIds, metric, months } = request.query as {
      propertyIds: string;
      metric: string;
      months?: string;
    };

    const ids = propertyIds.split(',');
    const trends = ids.map(id => generateTrendData(id, metric, months ? parseInt(months) : 12));

    return reply.send(trends);
  });

  // Benchmarks
  app.post('/benchmarks', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = benchmarkSchema.parse(request.body);

    const id = `benchmark_${Date.now()}`;
    const benchmark: Benchmark = {
      id,
      ...data,
      createdAt: new Date()
    };

    benchmarks.set(id, benchmark);
    return reply.status(201).send(benchmark);
  });

  app.get('/benchmarks', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyType, source } = request.query as { propertyType?: string; source?: string };
    let allBenchmarks = Array.from(benchmarks.values());

    if (propertyType) allBenchmarks = allBenchmarks.filter(b => b.propertyType === propertyType);
    if (source) allBenchmarks = allBenchmarks.filter(b => b.source === source);

    return reply.send(allBenchmarks);
  });

  app.get('/benchmarks/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const benchmark = benchmarks.get(id);
    if (!benchmark) return reply.status(404).send({ error: 'Benchmark not found' });
    return reply.send(benchmark);
  });

  // Compare to benchmark
  app.get('/compare-to-benchmark/:propertyId/:benchmarkId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, benchmarkId } = request.params as { propertyId: string; benchmarkId: string };

    const comparison = compareToBenchmark(propertyId, benchmarkId);
    if (Object.keys(comparison).length === 0) {
      return reply.status(404).send({ error: 'Property or benchmark not found' });
    }

    return reply.send(comparison);
  });

  // Saved comparisons
  app.post('/saved', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = savedComparisonSchema.parse(request.body);

    const id = `saved_${Date.now()}`;
    const saved: SavedComparison = {
      id,
      ...data,
      isDefault: data.isDefault || false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    savedComparisons.set(id, saved);
    return reply.status(201).send(saved);
  });

  app.get('/saved', async (request: FastifyRequest, reply: FastifyReply) => {
    const { createdBy } = request.query as { createdBy?: string };
    let saved = Array.from(savedComparisons.values());

    if (createdBy) saved = saved.filter(s => s.createdBy === createdBy);

    return reply.send(saved);
  });

  app.get('/saved/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const saved = savedComparisons.get(id);
    if (!saved) return reply.status(404).send({ error: 'Saved comparison not found' });
    return reply.send(saved);
  });

  app.delete('/saved/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    if (!savedComparisons.has(id)) {
      return reply.status(404).send({ error: 'Saved comparison not found' });
    }

    savedComparisons.delete(id);
    return reply.status(204).send();
  });

  // Run saved comparison
  app.post('/saved/:id/run', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const saved = savedComparisons.get(id);
    if (!saved) return reply.status(404).send({ error: 'Saved comparison not found' });

    const results = compareProperties(saved.propertyIds, saved.metrics);

    // If benchmark specified, add benchmark comparison
    let benchmarkComparison;
    if (saved.benchmarkId) {
      benchmarkComparison = {};
      for (const propId of saved.propertyIds) {
        benchmarkComparison[propId] = compareToBenchmark(propId, saved.benchmarkId);
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

    const report = comparisonReports.get(reportId);
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

    const metrics = propertyMetrics.get(propertyId);
    if (!metrics) return reply.status(404).send({ error: 'Property metrics not found' });

    const ids = portfolioIds
      ? portfolioIds.split(',')
      : Array.from(propertyMetrics.keys());

    const rankings = rankPropertyInPortfolio(propertyId, ids);
    const portfolioAvgs = calculatePortfolioAverages(ids);

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
