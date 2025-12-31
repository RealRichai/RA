import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Types
export type MetricPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'ytd' | 'all_time';
export type TrendDirection = 'up' | 'down' | 'flat';
export type PropertyClass = 'A' | 'B' | 'C' | 'D';

export interface PortfolioSummary {
  totalProperties: number;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  occupancyRate: number;
  totalValue: number;
  totalDebt: number;
  equity: number;
  ltv: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  noi: number;
  capRate: number;
  cashOnCash: number;
  updatedAt: Date;
}

export interface PropertyMetrics {
  propertyId: string;
  propertyName: string;
  propertyType: string;
  address: string;
  units: number;
  occupiedUnits: number;
  occupancyRate: number;
  monthlyRent: number;
  collectedRent: number;
  collectionRate: number;
  expenses: number;
  noi: number;
  capRate: number;
  value: number;
  debt: number;
  equity: number;
  cashFlow: number;
}

export interface OccupancyTrend {
  date: Date;
  occupancyRate: number;
  occupiedUnits: number;
  totalUnits: number;
}

export interface RevenueTrend {
  date: Date;
  scheduledRent: number;
  collectedRent: number;
  collectionRate: number;
  otherIncome: number;
  totalRevenue: number;
}

export interface ExpenseTrend {
  date: Date;
  operating: number;
  maintenance: number;
  utilities: number;
  insurance: number;
  taxes: number;
  management: number;
  other: number;
  total: number;
}

export interface NOITrend {
  date: Date;
  revenue: number;
  expenses: number;
  noi: number;
  noiMargin: number;
}

export interface CashFlowProjection {
  month: string;
  scheduledIncome: number;
  projectedVacancy: number;
  effectiveIncome: number;
  operatingExpenses: number;
  noi: number;
  debtService: number;
  cashFlow: number;
  cumulativeCashFlow: number;
}

export interface KPICard {
  id: string;
  name: string;
  value: number;
  formattedValue: string;
  previousValue: number;
  change: number;
  changePercent: number;
  trend: TrendDirection;
  period: MetricPeriod;
  category: 'revenue' | 'expense' | 'occupancy' | 'performance';
}

export interface LeaseExpirationSummary {
  month: string;
  expiringLeases: number;
  expiringRent: number;
  renewalProbability: number;
  projectedRenewalRent: number;
  atRiskRent: number;
}

export interface DelinquencyReport {
  current: { count: number; amount: number };
  days1to30: { count: number; amount: number };
  days31to60: { count: number; amount: number };
  days61to90: { count: number; amount: number };
  days90plus: { count: number; amount: number };
  total: { count: number; amount: number };
}

// In-memory mock data stores
const properties = new Map<string, PropertyMetrics>();
const occupancyHistory = new Map<string, OccupancyTrend[]>();
const revenueHistory = new Map<string, RevenueTrend[]>();

// Schemas
const periodSchema = z.enum(['day', 'week', 'month', 'quarter', 'year', 'ytd', 'all_time']);

const dashboardQuerySchema = z.object({
  period: periodSchema.optional().default('month'),
  propertyIds: z.string().optional(),
  propertyType: z.string().optional(),
});

const forecastQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(60).default(12),
  vacancyRate: z.coerce.number().min(0).max(100).optional(),
  rentGrowth: z.coerce.number().min(-50).max(50).optional(),
  expenseGrowth: z.coerce.number().min(-50).max(50).optional(),
});

// Helper functions
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function calculateTrend(current: number, previous: number): TrendDirection {
  const change = current - previous;
  if (Math.abs(change) < 0.01) return 'flat';
  return change > 0 ? 'up' : 'down';
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function calculateNOI(revenue: number, expenses: number): number {
  return revenue - expenses;
}

function calculateCapRate(noi: number, value: number): number {
  if (value === 0) return 0;
  return (noi * 12 / value) * 100;
}

function calculateCashOnCash(annualCashFlow: number, totalInvestment: number): number {
  if (totalInvestment === 0) return 0;
  return (annualCashFlow / totalInvestment) * 100;
}

function calculateLTV(debt: number, value: number): number {
  if (value === 0) return 0;
  return (debt / value) * 100;
}

// Initialize mock data
function initializeMockData(): void {
  const propertyData: PropertyMetrics[] = [
    {
      propertyId: 'prop-1',
      propertyName: 'Sunset Apartments',
      propertyType: 'multifamily',
      address: '123 Sunset Blvd, Los Angeles, CA',
      units: 24,
      occupiedUnits: 22,
      occupancyRate: 91.67,
      monthlyRent: 48000,
      collectedRent: 46500,
      collectionRate: 96.88,
      expenses: 18000,
      noi: 28500,
      capRate: 5.7,
      value: 6000000,
      debt: 4200000,
      equity: 1800000,
      cashFlow: 12000,
    },
    {
      propertyId: 'prop-2',
      propertyName: 'Downtown Lofts',
      propertyType: 'multifamily',
      address: '456 Main St, New York, NY',
      units: 48,
      occupiedUnits: 45,
      occupancyRate: 93.75,
      monthlyRent: 120000,
      collectedRent: 117000,
      collectionRate: 97.5,
      expenses: 42000,
      noi: 75000,
      capRate: 6.0,
      value: 15000000,
      debt: 10500000,
      equity: 4500000,
      cashFlow: 35000,
    },
    {
      propertyId: 'prop-3',
      propertyName: 'Parkview Residences',
      propertyType: 'multifamily',
      address: '789 Park Ave, Chicago, IL',
      units: 36,
      occupiedUnits: 32,
      occupancyRate: 88.89,
      monthlyRent: 72000,
      collectedRent: 68000,
      collectionRate: 94.44,
      expenses: 28000,
      noi: 40000,
      capRate: 5.3,
      value: 9000000,
      debt: 6300000,
      equity: 2700000,
      cashFlow: 18000,
    },
  ];

  for (const prop of propertyData) {
    properties.set(prop.propertyId, prop);
  }

  // Generate historical data for trends
  const now = new Date();
  for (const prop of propertyData) {
    const occHistory: OccupancyTrend[] = [];
    const revHistory: RevenueTrend[] = [];

    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const variance = (Math.random() - 0.5) * 10;

      occHistory.push({
        date,
        occupancyRate: Math.min(100, Math.max(80, prop.occupancyRate + variance)),
        occupiedUnits: Math.round(prop.units * (prop.occupancyRate + variance) / 100),
        totalUnits: prop.units,
      });

      const rentVariance = (Math.random() - 0.5) * 0.1;
      revHistory.push({
        date,
        scheduledRent: prop.monthlyRent * (1 + rentVariance),
        collectedRent: prop.collectedRent * (1 + rentVariance),
        collectionRate: prop.collectionRate + (Math.random() - 0.5) * 5,
        otherIncome: prop.monthlyRent * 0.05 * (1 + rentVariance),
        totalRevenue: prop.collectedRent * 1.05 * (1 + rentVariance),
      });
    }

    occupancyHistory.set(prop.propertyId, occHistory);
    revenueHistory.set(prop.propertyId, revHistory);
  }
}

initializeMockData();

// Route handlers
export async function portfolioRoutes(app: FastifyInstance): Promise<void> {
  // Get portfolio summary
  app.get('/summary', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = dashboardQuerySchema.parse(request.query);

    let propertyList = Array.from(properties.values());

    if (query.propertyIds) {
      const ids = query.propertyIds.split(',');
      propertyList = propertyList.filter((p) => ids.includes(p.propertyId));
    }

    if (query.propertyType) {
      propertyList = propertyList.filter((p) => p.propertyType === query.propertyType);
    }

    const totalUnits = propertyList.reduce((sum, p) => sum + p.units, 0);
    const occupiedUnits = propertyList.reduce((sum, p) => sum + p.occupiedUnits, 0);
    const monthlyRevenue = propertyList.reduce((sum, p) => sum + p.collectedRent, 0);
    const monthlyExpenses = propertyList.reduce((sum, p) => sum + p.expenses, 0);
    const totalValue = propertyList.reduce((sum, p) => sum + p.value, 0);
    const totalDebt = propertyList.reduce((sum, p) => sum + p.debt, 0);
    const noi = monthlyRevenue - monthlyExpenses;

    const summary: PortfolioSummary = {
      totalProperties: propertyList.length,
      totalUnits,
      occupiedUnits,
      vacantUnits: totalUnits - occupiedUnits,
      occupancyRate: totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0,
      totalValue,
      totalDebt,
      equity: totalValue - totalDebt,
      ltv: calculateLTV(totalDebt, totalValue),
      monthlyRevenue,
      monthlyExpenses,
      noi,
      capRate: calculateCapRate(noi, totalValue),
      cashOnCash: calculateCashOnCash(noi * 12 - totalDebt * 0.06, totalValue - totalDebt),
      updatedAt: new Date(),
    };

    return reply.send({
      success: true,
      data: summary,
    });
  });

  // Get KPI cards
  app.get('/kpis', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = dashboardQuerySchema.parse(request.query);

    const propertyList = Array.from(properties.values());
    const totalUnits = propertyList.reduce((sum, p) => sum + p.units, 0);
    const occupiedUnits = propertyList.reduce((sum, p) => sum + p.occupiedUnits, 0);
    const monthlyRevenue = propertyList.reduce((sum, p) => sum + p.collectedRent, 0);
    const monthlyExpenses = propertyList.reduce((sum, p) => sum + p.expenses, 0);
    const scheduledRent = propertyList.reduce((sum, p) => sum + p.monthlyRent, 0);
    const totalValue = propertyList.reduce((sum, p) => sum + p.value, 0);
    const noi = monthlyRevenue - monthlyExpenses;

    // Mock previous period values (slightly lower)
    const prevMonthlyRevenue = monthlyRevenue * 0.97;
    const prevOccupancy = (occupiedUnits / totalUnits) * 100 - 1.5;
    const prevNOI = noi * 0.95;
    const prevCollectionRate = (monthlyRevenue / scheduledRent) * 100 - 0.8;

    const currentOccupancy = (occupiedUnits / totalUnits) * 100;
    const currentCollectionRate = (monthlyRevenue / scheduledRent) * 100;

    const kpis: KPICard[] = [
      {
        id: 'gross-revenue',
        name: 'Gross Revenue',
        value: monthlyRevenue,
        formattedValue: formatCurrency(monthlyRevenue),
        previousValue: prevMonthlyRevenue,
        change: monthlyRevenue - prevMonthlyRevenue,
        changePercent: ((monthlyRevenue - prevMonthlyRevenue) / prevMonthlyRevenue) * 100,
        trend: calculateTrend(monthlyRevenue, prevMonthlyRevenue),
        period: query.period,
        category: 'revenue',
      },
      {
        id: 'occupancy-rate',
        name: 'Occupancy Rate',
        value: currentOccupancy,
        formattedValue: formatPercent(currentOccupancy),
        previousValue: prevOccupancy,
        change: currentOccupancy - prevOccupancy,
        changePercent: ((currentOccupancy - prevOccupancy) / prevOccupancy) * 100,
        trend: calculateTrend(currentOccupancy, prevOccupancy),
        period: query.period,
        category: 'occupancy',
      },
      {
        id: 'noi',
        name: 'Net Operating Income',
        value: noi,
        formattedValue: formatCurrency(noi),
        previousValue: prevNOI,
        change: noi - prevNOI,
        changePercent: ((noi - prevNOI) / prevNOI) * 100,
        trend: calculateTrend(noi, prevNOI),
        period: query.period,
        category: 'performance',
      },
      {
        id: 'collection-rate',
        name: 'Collection Rate',
        value: currentCollectionRate,
        formattedValue: formatPercent(currentCollectionRate),
        previousValue: prevCollectionRate,
        change: currentCollectionRate - prevCollectionRate,
        changePercent: ((currentCollectionRate - prevCollectionRate) / prevCollectionRate) * 100,
        trend: calculateTrend(currentCollectionRate, prevCollectionRate),
        period: query.period,
        category: 'revenue',
      },
      {
        id: 'operating-expenses',
        name: 'Operating Expenses',
        value: monthlyExpenses,
        formattedValue: formatCurrency(monthlyExpenses),
        previousValue: monthlyExpenses * 1.02,
        change: monthlyExpenses - monthlyExpenses * 1.02,
        changePercent: -2,
        trend: 'down',
        period: query.period,
        category: 'expense',
      },
      {
        id: 'cap-rate',
        name: 'Cap Rate',
        value: calculateCapRate(noi, totalValue),
        formattedValue: formatPercent(calculateCapRate(noi, totalValue)),
        previousValue: calculateCapRate(prevNOI, totalValue),
        change: calculateCapRate(noi, totalValue) - calculateCapRate(prevNOI, totalValue),
        changePercent: 2.5,
        trend: 'up',
        period: query.period,
        category: 'performance',
      },
    ];

    return reply.send({
      success: true,
      data: kpis,
    });
  });

  // Get property-level metrics
  app.get('/properties', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { sortBy?: string; sortOrder?: 'asc' | 'desc' };

    const propertyList = Array.from(properties.values());

    if (query.sortBy) {
      const sortKey = query.sortBy as keyof PropertyMetrics;
      propertyList.sort((a, b) => {
        const aVal = a[sortKey] as number;
        const bVal = b[sortKey] as number;
        return query.sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }

    return reply.send({
      success: true,
      data: propertyList,
      total: propertyList.length,
    });
  });

  // Get occupancy trends
  app.get('/trends/occupancy', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { propertyId?: string; months?: string };
    const months = parseInt(query.months || '12', 10);

    let trends: OccupancyTrend[] = [];

    if (query.propertyId) {
      trends = occupancyHistory.get(query.propertyId)?.slice(-months) || [];
    } else {
      // Aggregate across all properties
      const allHistory = Array.from(occupancyHistory.values());
      if (allHistory.length > 0) {
        const monthCount = Math.min(months, allHistory[0].length);
        for (let i = 0; i < monthCount; i++) {
          let totalOccupied = 0;
          let totalUnits = 0;

          for (const history of allHistory) {
            if (history[i]) {
              totalOccupied += history[i].occupiedUnits;
              totalUnits += history[i].totalUnits;
            }
          }

          trends.push({
            date: allHistory[0][i]?.date || new Date(),
            occupancyRate: totalUnits > 0 ? (totalOccupied / totalUnits) * 100 : 0,
            occupiedUnits: totalOccupied,
            totalUnits,
          });
        }
      }
    }

    return reply.send({
      success: true,
      data: trends,
    });
  });

  // Get revenue trends
  app.get('/trends/revenue', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { propertyId?: string; months?: string };
    const months = parseInt(query.months || '12', 10);

    let trends: RevenueTrend[] = [];

    if (query.propertyId) {
      trends = revenueHistory.get(query.propertyId)?.slice(-months) || [];
    } else {
      // Aggregate across all properties
      const allHistory = Array.from(revenueHistory.values());
      if (allHistory.length > 0) {
        const monthCount = Math.min(months, allHistory[0].length);
        for (let i = 0; i < monthCount; i++) {
          let scheduledRent = 0;
          let collectedRent = 0;
          let otherIncome = 0;

          for (const history of allHistory) {
            if (history[i]) {
              scheduledRent += history[i].scheduledRent;
              collectedRent += history[i].collectedRent;
              otherIncome += history[i].otherIncome;
            }
          }

          trends.push({
            date: allHistory[0][i]?.date || new Date(),
            scheduledRent,
            collectedRent,
            collectionRate: scheduledRent > 0 ? (collectedRent / scheduledRent) * 100 : 0,
            otherIncome,
            totalRevenue: collectedRent + otherIncome,
          });
        }
      }
    }

    return reply.send({
      success: true,
      data: trends,
    });
  });

  // Get NOI trends
  app.get('/trends/noi', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { months?: string };
    const months = parseInt(query.months || '12', 10);

    const propertyList = Array.from(properties.values());
    const totalExpenses = propertyList.reduce((sum, p) => sum + p.expenses, 0);

    const allRevHistory = Array.from(revenueHistory.values());
    const trends: NOITrend[] = [];

    if (allRevHistory.length > 0) {
      const monthCount = Math.min(months, allRevHistory[0].length);
      for (let i = 0; i < monthCount; i++) {
        let totalRevenue = 0;

        for (const history of allRevHistory) {
          if (history[i]) {
            totalRevenue += history[i].totalRevenue;
          }
        }

        // Assume expenses are relatively stable
        const expenses = totalExpenses * (1 + (Math.random() - 0.5) * 0.1);
        const noi = totalRevenue - expenses;

        trends.push({
          date: allRevHistory[0][i]?.date || new Date(),
          revenue: totalRevenue,
          expenses,
          noi,
          noiMargin: totalRevenue > 0 ? (noi / totalRevenue) * 100 : 0,
        });
      }
    }

    return reply.send({
      success: true,
      data: trends,
    });
  });

  // Get cash flow projections
  app.get('/forecast', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = forecastQuerySchema.parse(request.query);

    const propertyList = Array.from(properties.values());
    const baseMonthlyRent = propertyList.reduce((sum, p) => sum + p.monthlyRent, 0);
    const baseExpenses = propertyList.reduce((sum, p) => sum + p.expenses, 0);
    const totalDebt = propertyList.reduce((sum, p) => sum + p.debt, 0);
    const monthlyDebtService = totalDebt * 0.06 / 12;

    const vacancyRate = query.vacancyRate ?? 5;
    const rentGrowth = query.rentGrowth ?? 3;
    const expenseGrowth = query.expenseGrowth ?? 2;

    const projections: CashFlowProjection[] = [];
    let cumulativeCashFlow = 0;

    const now = new Date();

    for (let i = 0; i < query.months; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

      const growthFactor = Math.pow(1 + rentGrowth / 100 / 12, i);
      const expenseGrowthFactor = Math.pow(1 + expenseGrowth / 100 / 12, i);

      const scheduledIncome = baseMonthlyRent * growthFactor;
      const projectedVacancy = scheduledIncome * (vacancyRate / 100);
      const effectiveIncome = scheduledIncome - projectedVacancy;
      const operatingExpenses = baseExpenses * expenseGrowthFactor;
      const noi = effectiveIncome - operatingExpenses;
      const cashFlow = noi - monthlyDebtService;
      cumulativeCashFlow += cashFlow;

      projections.push({
        month: monthStr,
        scheduledIncome: Math.round(scheduledIncome),
        projectedVacancy: Math.round(projectedVacancy),
        effectiveIncome: Math.round(effectiveIncome),
        operatingExpenses: Math.round(operatingExpenses),
        noi: Math.round(noi),
        debtService: Math.round(monthlyDebtService),
        cashFlow: Math.round(cashFlow),
        cumulativeCashFlow: Math.round(cumulativeCashFlow),
      });
    }

    return reply.send({
      success: true,
      data: {
        assumptions: {
          vacancyRate,
          rentGrowth,
          expenseGrowth,
          interestRate: 6,
        },
        projections,
        summary: {
          totalProjectedRevenue: projections.reduce((sum, p) => sum + p.effectiveIncome, 0),
          totalProjectedExpenses: projections.reduce((sum, p) => sum + p.operatingExpenses, 0),
          totalProjectedNOI: projections.reduce((sum, p) => sum + p.noi, 0),
          totalProjectedCashFlow: projections.reduce((sum, p) => sum + p.cashFlow, 0),
          averageMonthlyCashFlow: projections.reduce((sum, p) => sum + p.cashFlow, 0) / query.months,
        },
      },
    });
  });

  // Get lease expiration summary
  app.get('/lease-expirations', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { months?: string };
    const months = parseInt(query.months || '12', 10);

    const now = new Date();
    const expirations: LeaseExpirationSummary[] = [];

    for (let i = 0; i < months; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

      // Mock data - would come from lease database
      const expiringLeases = Math.floor(Math.random() * 8) + 1;
      const avgRent = 2000 + Math.random() * 1000;
      const expiringRent = expiringLeases * avgRent;
      const renewalProbability = 0.7 + Math.random() * 0.2;
      const projectedRenewalRent = expiringRent * renewalProbability * 1.03;
      const atRiskRent = expiringRent * (1 - renewalProbability);

      expirations.push({
        month: monthStr,
        expiringLeases,
        expiringRent: Math.round(expiringRent),
        renewalProbability: Math.round(renewalProbability * 100),
        projectedRenewalRent: Math.round(projectedRenewalRent),
        atRiskRent: Math.round(atRiskRent),
      });
    }

    return reply.send({
      success: true,
      data: expirations,
      summary: {
        totalExpiringLeases: expirations.reduce((sum, e) => sum + e.expiringLeases, 0),
        totalExpiringRent: expirations.reduce((sum, e) => sum + e.expiringRent, 0),
        totalAtRiskRent: expirations.reduce((sum, e) => sum + e.atRiskRent, 0),
        averageRenewalProbability: expirations.reduce((sum, e) => sum + e.renewalProbability, 0) / months,
      },
    });
  });

  // Get delinquency report
  app.get('/delinquency', async (request: FastifyRequest, reply: FastifyReply) => {
    // Mock delinquency data
    const report: DelinquencyReport = {
      current: { count: 95, amount: 190000 },
      days1to30: { count: 8, amount: 16000 },
      days31to60: { count: 4, amount: 8000 },
      days61to90: { count: 2, amount: 4000 },
      days90plus: { count: 1, amount: 2500 },
      total: { count: 110, amount: 220500 },
    };

    const delinquencyRate = ((report.days1to30.amount + report.days31to60.amount +
      report.days61to90.amount + report.days90plus.amount) / report.total.amount) * 100;

    return reply.send({
      success: true,
      data: {
        report,
        delinquencyRate: Math.round(delinquencyRate * 100) / 100,
        collectionRate: 100 - delinquencyRate,
      },
    });
  });

  // Get property comparison
  app.get('/compare', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { propertyIds: string; metrics?: string };

    if (!query.propertyIds) {
      return reply.status(400).send({
        success: false,
        error: 'propertyIds is required',
      });
    }

    const ids = query.propertyIds.split(',');
    const selectedProperties = ids.map((id) => properties.get(id)).filter(Boolean) as PropertyMetrics[];

    const metrics = query.metrics?.split(',') || ['occupancyRate', 'noi', 'capRate', 'collectionRate'];

    const comparison = selectedProperties.map((prop) => {
      const result: Record<string, string | number> = {
        propertyId: prop.propertyId,
        propertyName: prop.propertyName,
      };

      for (const metric of metrics) {
        if (metric in prop) {
          result[metric] = prop[metric as keyof PropertyMetrics] as number;
        }
      }

      return result;
    });

    // Calculate averages for benchmarking
    const allProps = Array.from(properties.values());
    const benchmarks: Record<string, number> = {};
    for (const metric of metrics) {
      const values = allProps.map((p) => p[metric as keyof PropertyMetrics] as number).filter((v) => typeof v === 'number');
      benchmarks[metric] = values.reduce((sum, v) => sum + v, 0) / values.length;
    }

    return reply.send({
      success: true,
      data: {
        comparison,
        benchmarks,
      },
    });
  });
}

// Export for testing
export {
  properties,
  occupancyHistory,
  revenueHistory,
  calculateNOI,
  calculateCapRate,
  calculateCashOnCash,
  calculateLTV,
  calculateTrend,
};
