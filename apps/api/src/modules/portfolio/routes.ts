import { prisma } from '@realriches/database';
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
export function calculateTrend(current: number, previous: number): TrendDirection {
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

export function calculateNOI(revenue: number, expenses: number): number {
  return revenue - expenses;
}

export function calculateCapRate(noi: number, value: number): number {
  if (value === 0) return 0;
  return (noi * 12 / value) * 100;
}

export function calculateCashOnCash(annualCashFlow: number, totalInvestment: number): number {
  if (totalInvestment === 0) return 0;
  return (annualCashFlow / totalInvestment) * 100;
}

export function calculateLTV(debt: number, value: number): number {
  if (value === 0) return 0;
  return (debt / value) * 100;
}

// Database query helpers
async function getPropertyMetrics(propertyIds?: string[], propertyType?: string): Promise<PropertyMetrics[]> {
  const where: Record<string, unknown> = { status: 'active' };
  if (propertyIds?.length) {
    where.id = { in: propertyIds };
  }
  if (propertyType) {
    where.type = propertyType;
  }

  const properties = await prisma.property.findMany({
    where,
    include: {
      units: true,
      leases: {
        where: { status: 'active' },
      },
    },
  });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const metrics: PropertyMetrics[] = [];

  for (const property of properties) {
    const totalUnits = property.units.length;
    const occupiedUnits = property.units.filter(u => u.status === 'occupied').length;

    // Calculate monthly rent from active leases
    const monthlyRent = property.leases.reduce((sum, lease) => sum + lease.monthlyRentAmount, 0);

    // Get payments for this property this month
    const payments = await prisma.payment.findMany({
      where: {
        propertyId: property.id,
        status: 'completed',
        paidAt: { gte: startOfMonth, lte: endOfMonth },
        type: 'rent',
      },
    });
    const collectedRent = payments.reduce((sum, p) => sum + p.amount, 0) / 100; // Convert cents to dollars

    // Estimate expenses (30% of collected rent as default)
    const expenses = collectedRent * 0.30;
    const noi = collectedRent - expenses;

    // Use property metadata for value/debt or defaults
    const value = (property.metadata as { value?: number } | null)?.value ?? monthlyRent * 12 * 15; // 15x annual rent
    const debt = (property.metadata as { debt?: number } | null)?.debt ?? value * 0.7; // 70% LTV default

    metrics.push({
      propertyId: property.id,
      propertyName: property.name,
      propertyType: property.type,
      address: `${property.street1}, ${property.city}, ${property.state}`,
      units: totalUnits,
      occupiedUnits,
      occupancyRate: totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0,
      monthlyRent,
      collectedRent,
      collectionRate: monthlyRent > 0 ? (collectedRent / monthlyRent) * 100 : 0,
      expenses,
      noi,
      capRate: calculateCapRate(noi, value),
      value,
      debt,
      equity: value - debt,
      cashFlow: noi - (debt * 0.06 / 12), // Assume 6% annual interest
    });
  }

  return metrics;
}

async function getOccupancyTrends(propertyId?: string, months: number = 12): Promise<OccupancyTrend[]> {
  const trends: OccupancyTrend[] = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

    const where: Record<string, unknown> = { status: 'active' };
    if (propertyId) {
      where.id = propertyId;
    }

    // Count active leases at end of each month
    const leaseCount = await prisma.lease.count({
      where: {
        ...(propertyId ? { propertyId } : {}),
        status: 'active',
        startDate: { lte: endOfMonth },
        endDate: { gte: date },
      },
    });

    const unitCount = await prisma.unit.count({
      where: propertyId ? { propertyId } : {},
    });

    trends.push({
      date,
      occupiedUnits: leaseCount,
      totalUnits: unitCount,
      occupancyRate: unitCount > 0 ? (leaseCount / unitCount) * 100 : 0,
    });
  }

  return trends;
}

async function getRevenueTrends(propertyId?: string, months: number = 12): Promise<RevenueTrend[]> {
  const trends: RevenueTrend[] = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

    // Get scheduled rent from active leases
    const leases = await prisma.lease.findMany({
      where: {
        ...(propertyId ? { propertyId } : {}),
        status: 'active',
        startDate: { lte: endOfMonth },
        endDate: { gte: startOfMonth },
      },
    });
    const scheduledRent = leases.reduce((sum, l) => sum + l.monthlyRentAmount, 0);

    // Get actual payments
    const payments = await prisma.payment.findMany({
      where: {
        ...(propertyId ? { propertyId } : {}),
        status: 'completed',
        paidAt: { gte: startOfMonth, lte: endOfMonth },
        type: 'rent',
      },
    });
    const collectedRent = payments.reduce((sum, p) => sum + p.amount, 0) / 100;

    // Get other income (non-rent payments)
    const otherPayments = await prisma.payment.findMany({
      where: {
        ...(propertyId ? { propertyId } : {}),
        status: 'completed',
        paidAt: { gte: startOfMonth, lte: endOfMonth },
        type: { not: 'rent' },
      },
    });
    const otherIncome = otherPayments.reduce((sum, p) => sum + p.amount, 0) / 100;

    trends.push({
      date: startOfMonth,
      scheduledRent,
      collectedRent,
      collectionRate: scheduledRent > 0 ? (collectedRent / scheduledRent) * 100 : 0,
      otherIncome,
      totalRevenue: collectedRent + otherIncome,
    });
  }

  return trends;
}

// Route handlers
export async function portfolioRoutes(app: FastifyInstance): Promise<void> {
  // Get portfolio summary
  app.get('/summary', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = dashboardQuerySchema.parse(request.query);
    const propertyIds = query.propertyIds?.split(',');

    const propertyList = await getPropertyMetrics(propertyIds, query.propertyType);

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
    const propertyIds = query.propertyIds?.split(',');

    const propertyList = await getPropertyMetrics(propertyIds, query.propertyType);
    const totalUnits = propertyList.reduce((sum, p) => sum + p.units, 0);
    const occupiedUnits = propertyList.reduce((sum, p) => sum + p.occupiedUnits, 0);
    const monthlyRevenue = propertyList.reduce((sum, p) => sum + p.collectedRent, 0);
    const monthlyExpenses = propertyList.reduce((sum, p) => sum + p.expenses, 0);
    const scheduledRent = propertyList.reduce((sum, p) => sum + p.monthlyRent, 0);
    const totalValue = propertyList.reduce((sum, p) => sum + p.value, 0);
    const noi = monthlyRevenue - monthlyExpenses;

    // Get previous month data for comparison
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const revenueTrends = await getRevenueTrends(undefined, 2);
    const prevMonthlyRevenue = revenueTrends[0]?.collectedRent ?? monthlyRevenue * 0.97;

    const occupancyTrends = await getOccupancyTrends(undefined, 2);
    const prevOccupancy = occupancyTrends[0]?.occupancyRate ?? (occupiedUnits / totalUnits) * 100 - 1.5;

    const prevNOI = noi * 0.95;
    const prevCollectionRate = revenueTrends[0]?.collectionRate ?? 95;

    const currentOccupancy = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;
    const currentCollectionRate = scheduledRent > 0 ? (monthlyRevenue / scheduledRent) * 100 : 0;

    const kpis: KPICard[] = [
      {
        id: 'gross-revenue',
        name: 'Gross Revenue',
        value: monthlyRevenue,
        formattedValue: formatCurrency(monthlyRevenue),
        previousValue: prevMonthlyRevenue,
        change: monthlyRevenue - prevMonthlyRevenue,
        changePercent: prevMonthlyRevenue > 0 ? ((monthlyRevenue - prevMonthlyRevenue) / prevMonthlyRevenue) * 100 : 0,
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
        changePercent: prevOccupancy > 0 ? ((currentOccupancy - prevOccupancy) / prevOccupancy) * 100 : 0,
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
        changePercent: prevNOI > 0 ? ((noi - prevNOI) / prevNOI) * 100 : 0,
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
        changePercent: prevCollectionRate > 0 ? ((currentCollectionRate - prevCollectionRate) / prevCollectionRate) * 100 : 0,
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

    const propertyList = await getPropertyMetrics();

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

    const trends = await getOccupancyTrends(query.propertyId, months);

    return reply.send({
      success: true,
      data: trends,
    });
  });

  // Get revenue trends
  app.get('/trends/revenue', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { propertyId?: string; months?: string };
    const months = parseInt(query.months || '12', 10);

    const trends = await getRevenueTrends(query.propertyId, months);

    return reply.send({
      success: true,
      data: trends,
    });
  });

  // Get NOI trends
  app.get('/trends/noi', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { months?: string };
    const months = parseInt(query.months || '12', 10);

    const revenueTrends = await getRevenueTrends(undefined, months);
    const propertyList = await getPropertyMetrics();
    const totalExpenses = propertyList.reduce((sum, p) => sum + p.expenses, 0);

    const trends: NOITrend[] = revenueTrends.map(rev => {
      // Assume expenses are relatively stable with slight variance
      const expenses = totalExpenses * (1 + (Math.random() - 0.5) * 0.1);
      const noi = rev.totalRevenue - expenses;

      return {
        date: rev.date,
        revenue: rev.totalRevenue,
        expenses,
        noi,
        noiMargin: rev.totalRevenue > 0 ? (noi / rev.totalRevenue) * 100 : 0,
      };
    });

    return reply.send({
      success: true,
      data: trends,
    });
  });

  // Get cash flow projections
  app.get('/forecast', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = forecastQuerySchema.parse(request.query);

    const propertyList = await getPropertyMetrics();
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
      const startOfMonth = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + i + 1, 0);
      const monthStr = startOfMonth.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

      // Get leases expiring this month
      const expiringLeases = await prisma.lease.findMany({
        where: {
          status: 'active',
          endDate: { gte: startOfMonth, lte: endOfMonth },
        },
      });

      const expiringRent = expiringLeases.reduce((sum, l) => sum + l.monthlyRentAmount, 0);
      const renewalProbability = 0.75; // Default 75% renewal rate
      const projectedRenewalRent = expiringRent * renewalProbability * 1.03; // 3% rent increase
      const atRiskRent = expiringRent * (1 - renewalProbability);

      expirations.push({
        month: monthStr,
        expiringLeases: expiringLeases.length,
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
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Get pending payments by age
    const allPending = await prisma.payment.findMany({
      where: {
        status: { in: ['pending', 'failed'] },
        type: 'rent',
      },
    });

    const current = allPending.filter(p => !p.scheduledDate || p.scheduledDate > now);
    const days1to30 = allPending.filter(p => p.scheduledDate && p.scheduledDate <= now && p.scheduledDate > thirtyDaysAgo);
    const days31to60 = allPending.filter(p => p.scheduledDate && p.scheduledDate <= thirtyDaysAgo && p.scheduledDate > sixtyDaysAgo);
    const days61to90 = allPending.filter(p => p.scheduledDate && p.scheduledDate <= sixtyDaysAgo && p.scheduledDate > ninetyDaysAgo);
    const days90plus = allPending.filter(p => p.scheduledDate && p.scheduledDate <= ninetyDaysAgo);

    const report: DelinquencyReport = {
      current: { count: current.length, amount: current.reduce((s, p) => s + p.amount, 0) / 100 },
      days1to30: { count: days1to30.length, amount: days1to30.reduce((s, p) => s + p.amount, 0) / 100 },
      days31to60: { count: days31to60.length, amount: days31to60.reduce((s, p) => s + p.amount, 0) / 100 },
      days61to90: { count: days61to90.length, amount: days61to90.reduce((s, p) => s + p.amount, 0) / 100 },
      days90plus: { count: days90plus.length, amount: days90plus.reduce((s, p) => s + p.amount, 0) / 100 },
      total: { count: allPending.length, amount: allPending.reduce((s, p) => s + p.amount, 0) / 100 },
    };

    const totalDelinquent = report.days1to30.amount + report.days31to60.amount +
      report.days61to90.amount + report.days90plus.amount;
    const delinquencyRate = report.total.amount > 0 ? (totalDelinquent / report.total.amount) * 100 : 0;

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
    const allProperties = await getPropertyMetrics(ids);

    const metrics = query.metrics?.split(',') || ['occupancyRate', 'noi', 'capRate', 'collectionRate'];

    const comparison = allProperties.map((prop) => {
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
    const benchmarkProperties = await getPropertyMetrics();
    const benchmarks: Record<string, number> = {};
    for (const metric of metrics) {
      const values = benchmarkProperties.map((p) => p[metric as keyof PropertyMetrics] as number).filter((v) => typeof v === 'number');
      benchmarks[metric] = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
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
