import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import {
  prisma,
  type BudgetStatus,
  type BudgetPeriodType,
  type BudgetItemType,
  type BudgetFrequency,
  type ForecastType,
  type CapExStatus,
  type CapExPriority,
  type FundingSource,
} from '@realriches/database';

// ============================================================================
// Types
// ============================================================================

export type BudgetPeriod = 'monthly' | 'quarterly' | 'annual';
export type BudgetCategory =
  | 'rental_income'
  | 'other_income'
  | 'management_fee'
  | 'maintenance'
  | 'utilities'
  | 'insurance'
  | 'property_tax'
  | 'hoa'
  | 'marketing'
  | 'legal'
  | 'capital_expenditure'
  | 'reserves'
  | 'other_expense';

export interface VarianceReport {
  budgetId: string;
  propertyId: string;
  period: string;
  categories: VarianceCategory[];
  totalBudgeted: { income: number; expenses: number; noi: number };
  totalActual: { income: number; expenses: number; noi: number };
  totalVariance: { income: number; expenses: number; noi: number };
  totalVariancePercent: { income: number; expenses: number; noi: number };
  insights: string[];
}

export interface VarianceCategory {
  category: string;
  name: string;
  type: 'income' | 'expense';
  budgeted: number;
  actual: number;
  variance: number;
  variancePercent: number;
  status: 'on_track' | 'over' | 'under' | 'significantly_over' | 'significantly_under';
}

// ============================================================================
// Helper Functions
// ============================================================================

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

export function calculateVariance(budgeted: number, actual: number): { variance: number; percentage: number } {
  const variance = actual - budgeted;
  const percentage = budgeted !== 0 ? (variance / budgeted) * 100 : actual !== 0 ? 100 : 0;
  return {
    variance: Math.round(variance * 100) / 100,
    percentage: Math.round(percentage * 100) / 100,
  };
}

export function getVarianceStatus(
  type: 'income' | 'expense',
  variancePercent: number
): 'on_track' | 'over' | 'under' | 'significantly_over' | 'significantly_under' {
  const threshold = 10;
  const absVariance = Math.abs(variancePercent);

  if (absVariance <= 5) return 'on_track';

  if (type === 'income') {
    if (variancePercent > threshold) return 'significantly_over';
    if (variancePercent > 0) return 'over';
    if (variancePercent < -threshold) return 'significantly_under';
    return 'under';
  } else {
    if (variancePercent > threshold) return 'significantly_over';
    if (variancePercent > 0) return 'over';
    if (variancePercent < -threshold) return 'significantly_under';
    return 'under';
  }
}

export function distributeAnnualToMonths(
  annualAmount: number,
  frequency: 'monthly' | 'quarterly' | 'annual' | 'one_time',
  oneTimeMonth?: number
): number[] {
  const months = new Array(12).fill(0);

  switch (frequency) {
    case 'monthly':
      const monthlyAmount = annualAmount / 12;
      return months.map(() => Math.round(monthlyAmount * 100) / 100);

    case 'quarterly':
      const quarterlyAmount = annualAmount / 4;
      return months.map((_, i) => (i % 3 === 2 ? Math.round(quarterlyAmount * 100) / 100 : 0));

    case 'annual':
      months[11] = annualAmount;
      return months;

    case 'one_time':
      const month = (oneTimeMonth ?? 1) - 1;
      months[month] = annualAmount;
      return months;

    default:
      return months;
  }
}

export function aggregateMonthlyToQuarterly(monthlyAmounts: number[]): number[] {
  return [
    monthlyAmounts.slice(0, 3).reduce((a, b) => a + b, 0),
    monthlyAmounts.slice(3, 6).reduce((a, b) => a + b, 0),
    monthlyAmounts.slice(6, 9).reduce((a, b) => a + b, 0),
    monthlyAmounts.slice(9, 12).reduce((a, b) => a + b, 0),
  ];
}

export function applyGrowthRate(baseAmount: number, growthRate: number, periods: number): number[] {
  const projections: number[] = [];
  let current = baseAmount;

  for (let i = 0; i < periods; i++) {
    projections.push(Math.round(current * 100) / 100);
    current *= 1 + growthRate / 100;
  }

  return projections;
}

export function calculateNPV(cashFlows: number[], discountRate: number): number {
  let npv = 0;
  for (let i = 0; i < cashFlows.length; i++) {
    npv += cashFlows[i] / Math.pow(1 + discountRate / 100, i + 1);
  }
  return Math.round(npv * 100) / 100;
}

export function calculateIRR(cashFlows: number[], initialInvestment: number): number | null {
  let rate = 0.1;

  for (let iteration = 0; iteration < 100; iteration++) {
    let npv = -initialInvestment;
    let derivative = 0;

    for (let i = 0; i < cashFlows.length; i++) {
      const denominator = Math.pow(1 + rate, i + 1);
      npv += cashFlows[i] / denominator;
      derivative -= (i + 1) * cashFlows[i] / Math.pow(1 + rate, i + 2);
    }

    if (Math.abs(npv) < 0.0001) {
      return Math.round(rate * 10000) / 100;
    }

    if (derivative === 0) return null;

    rate = rate - npv / derivative;

    if (rate < -1 || rate > 10) return null;
  }

  return null;
}

export function generateVarianceInsights(categories: VarianceCategory[]): string[] {
  const insights: string[] = [];

  const significantOver = categories.filter((c) => c.status === 'significantly_over');
  const significantUnder = categories.filter((c) => c.status === 'significantly_under');

  const incomeOver = significantOver.filter((c) => c.type === 'income');
  const incomeUnder = significantUnder.filter((c) => c.type === 'income');

  if (incomeOver.length > 0) {
    insights.push(`Strong performance: ${incomeOver.map((c) => c.name).join(', ')} exceeded budget.`);
  }
  if (incomeUnder.length > 0) {
    insights.push(`Attention needed: ${incomeUnder.map((c) => c.name).join(', ')} below budget expectations.`);
  }

  const expenseOver = significantOver.filter((c) => c.type === 'expense');
  const expenseUnder = significantUnder.filter((c) => c.type === 'expense');

  if (expenseOver.length > 0) {
    insights.push(`Cost overrun: ${expenseOver.map((c) => c.name).join(', ')} exceeded budget.`);
  }
  if (expenseUnder.length > 0) {
    insights.push(`Cost savings: ${expenseUnder.map((c) => c.name).join(', ')} under budget.`);
  }

  const onTrack = categories.filter((c) => c.status === 'on_track').length;
  const total = categories.length;
  const onTrackPercent = Math.round((onTrack / total) * 100);

  if (onTrackPercent >= 80) {
    insights.push(`Overall budget performance is strong with ${onTrackPercent}% of categories on track.`);
  } else if (onTrackPercent >= 50) {
    insights.push(`Budget performance is moderate with ${onTrackPercent}% of categories on track.`);
  } else {
    insights.push(`Budget requires attention: only ${onTrackPercent}% of categories are on track.`);
  }

  return insights;
}

function getMonthlyAmounts(lineItem: {
  jan: unknown;
  feb: unknown;
  mar: unknown;
  apr: unknown;
  may: unknown;
  jun: unknown;
  jul: unknown;
  aug: unknown;
  sep: unknown;
  oct: unknown;
  nov: unknown;
  dec: unknown;
}): number[] {
  return [
    toNumber(lineItem.jan),
    toNumber(lineItem.feb),
    toNumber(lineItem.mar),
    toNumber(lineItem.apr),
    toNumber(lineItem.may),
    toNumber(lineItem.jun),
    toNumber(lineItem.jul),
    toNumber(lineItem.aug),
    toNumber(lineItem.sep),
    toNumber(lineItem.oct),
    toNumber(lineItem.nov),
    toNumber(lineItem.dec),
  ];
}

// ============================================================================
// Validation Schemas
// ============================================================================

const createBudgetSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string().min(1),
  fiscalYear: z.number().min(2020).max(2100),
  period: z.enum(['monthly', 'quarterly', 'annual']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  notes: z.string().optional(),
  lineItems: z.array(z.object({
    category: z.enum([
      'rental_income', 'other_income', 'management_fee', 'maintenance',
      'utilities', 'insurance', 'property_tax', 'hoa', 'marketing',
      'legal', 'capital_expenditure', 'reserves', 'other_expense',
    ]),
    name: z.string().min(1),
    description: z.string().optional(),
    type: z.enum(['income', 'expense']),
    annualAmount: z.number(),
    frequency: z.enum(['monthly', 'quarterly', 'annual', 'one_time']),
    isRecurring: z.boolean().default(true),
    notes: z.string().optional(),
  })),
});

const recordActualSchema = z.object({
  budgetId: z.string().uuid(),
  lineItemId: z.string().uuid(),
  month: z.number().min(1).max(12),
  year: z.number().min(2020).max(2100),
  actualAmount: z.number(),
  notes: z.string().optional(),
  transactions: z.array(z.object({
    date: z.string().datetime(),
    description: z.string(),
    amount: z.number(),
    referenceType: z.string().optional(),
    referenceId: z.string().optional(),
  })).optional(),
});

const createForecastSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string().min(1),
  forecastType: z.enum(['rolling', 'scenario', 'projection']),
  baseBudgetId: z.string().uuid().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  assumptions: z.array(z.object({
    category: z.enum([
      'rental_income', 'other_income', 'management_fee', 'maintenance',
      'utilities', 'insurance', 'property_tax', 'hoa', 'marketing',
      'legal', 'capital_expenditure', 'reserves', 'other_expense',
    ]),
    growthRate: z.number(),
    inflationAdjustment: z.boolean().default(false),
    customFormula: z.string().optional(),
    notes: z.string().optional(),
  })),
  initialIncome: z.number(),
  initialExpenses: z.number(),
  initialOccupancy: z.number().min(0).max(100),
});

const createCapExSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string(),
  estimatedCost: z.number().min(0),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  plannedDate: z.string().datetime(),
  usefulLife: z.number().min(1),
  fundingSource: z.enum(['reserves', 'operating', 'loan', 'owner_contribution']),
  notes: z.string().optional(),
});

// ============================================================================
// Routes
// ============================================================================

export async function budgetRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // Budgets
  // -------------------------------------------------------------------------

  // List budgets
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { propertyId?: string; year?: string; status?: string };

    const budgets = await prisma.budget.findMany({
      where: {
        ...(query.propertyId && { propertyId: query.propertyId }),
        ...(query.year && { fiscalYear: parseInt(query.year, 10) }),
        ...(query.status && { status: query.status as BudgetStatus }),
      },
      include: {
        lineItems: true,
      },
      orderBy: { fiscalYear: 'desc' },
    });

    const result = budgets.map((b) => ({
      ...b,
      totalIncome: toNumber(b.totalIncome),
      totalExpenses: toNumber(b.totalExpense),
      netOperatingIncome: toNumber(b.netIncome),
      lineItems: b.lineItems.map((li) => ({
        id: li.id,
        category: li.category,
        name: li.name,
        description: li.description,
        type: li.type,
        annualAmount: toNumber(li.annualBudget),
        monthlyAmounts: getMonthlyAmounts(li),
        isRecurring: li.isRecurring,
        frequency: li.frequency,
        notes: li.notes,
      })),
    }));

    return reply.send({
      success: true,
      data: result,
      total: result.length,
    });
  });

  // Get budget
  app.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const budget = await prisma.budget.findUnique({
      where: { id },
      include: { lineItems: true },
    });

    if (!budget) {
      return reply.status(404).send({ success: false, error: 'Budget not found' });
    }

    const result = {
      ...budget,
      totalIncome: toNumber(budget.totalIncome),
      totalExpenses: toNumber(budget.totalExpense),
      netOperatingIncome: toNumber(budget.netIncome),
      lineItems: budget.lineItems.map((li) => ({
        id: li.id,
        category: li.category,
        name: li.name,
        description: li.description,
        type: li.type,
        annualAmount: toNumber(li.annualBudget),
        monthlyAmounts: getMonthlyAmounts(li),
        isRecurring: li.isRecurring,
        frequency: li.frequency,
        notes: li.notes,
      })),
    };

    return reply.send({ success: true, data: result });
  });

  // Create budget
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createBudgetSchema.parse(request.body);

    // Calculate totals
    const totalIncome = body.lineItems
      .filter((i) => i.type === 'income')
      .reduce((sum, i) => sum + i.annualAmount, 0);
    const totalExpenses = body.lineItems
      .filter((i) => i.type === 'expense')
      .reduce((sum, i) => sum + i.annualAmount, 0);
    const netOperatingIncome = totalIncome - totalExpenses;

    const budget = await prisma.budget.create({
      data: {
        propertyId: body.propertyId,
        name: body.name,
        fiscalYear: body.fiscalYear,
        periodType: body.period as BudgetPeriodType,
        status: 'draft',
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        totalIncome,
        totalExpense: totalExpenses,
        netIncome: netOperatingIncome,
        notes: body.notes,
        createdBy: 'system',
        lineItems: {
          create: body.lineItems.map((item) => {
            const monthlyAmounts = distributeAnnualToMonths(item.annualAmount, item.frequency);
            return {
              category: item.category,
              name: item.name,
              description: item.description,
              type: item.type as BudgetItemType,
              frequency: item.frequency as BudgetFrequency,
              isRecurring: item.isRecurring,
              jan: monthlyAmounts[0],
              feb: monthlyAmounts[1],
              mar: monthlyAmounts[2],
              apr: monthlyAmounts[3],
              may: monthlyAmounts[4],
              jun: monthlyAmounts[5],
              jul: monthlyAmounts[6],
              aug: monthlyAmounts[7],
              sep: monthlyAmounts[8],
              oct: monthlyAmounts[9],
              nov: monthlyAmounts[10],
              dec: monthlyAmounts[11],
              annualBudget: item.annualAmount,
              notes: item.notes,
            };
          }),
        },
      },
      include: { lineItems: true },
    });

    const result = {
      ...budget,
      totalIncome: toNumber(budget.totalIncome),
      totalExpenses: toNumber(budget.totalExpense),
      netOperatingIncome: toNumber(budget.netIncome),
      lineItems: budget.lineItems.map((li) => ({
        id: li.id,
        category: li.category,
        name: li.name,
        description: li.description,
        type: li.type,
        annualAmount: toNumber(li.annualBudget),
        monthlyAmounts: getMonthlyAmounts(li),
        isRecurring: li.isRecurring,
        frequency: li.frequency,
        notes: li.notes,
      })),
    };

    return reply.status(201).send({
      success: true,
      data: result,
    });
  });

  // Approve budget
  app.post('/:id/approve', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.body as { userId: string };

    const budget = await prisma.budget.findUnique({ where: { id } });
    if (!budget) {
      return reply.status(404).send({ success: false, error: 'Budget not found' });
    }

    const updated = await prisma.budget.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: userId,
        approvedAt: new Date(),
      },
      include: { lineItems: true },
    });

    return reply.send({ success: true, data: updated });
  });

  // Activate budget
  app.post('/:id/activate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const budget = await prisma.budget.findUnique({ where: { id } });
    if (!budget) {
      return reply.status(404).send({ success: false, error: 'Budget not found' });
    }

    if (budget.status !== 'approved') {
      return reply.status(400).send({ success: false, error: 'Budget must be approved first' });
    }

    // Deactivate other active budgets for same property/year
    await prisma.budget.updateMany({
      where: {
        propertyId: budget.propertyId,
        fiscalYear: budget.fiscalYear,
        status: 'active',
        id: { not: id },
      },
      data: { status: 'closed' },
    });

    const updated = await prisma.budget.update({
      where: { id },
      data: { status: 'active' },
      include: { lineItems: true },
    });

    return reply.send({ success: true, data: updated });
  });

  // -------------------------------------------------------------------------
  // Budget Actuals
  // -------------------------------------------------------------------------

  // Record actual
  app.post('/actuals', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = recordActualSchema.parse(request.body);

    const budget = await prisma.budget.findUnique({
      where: { id: body.budgetId },
      include: { lineItems: true },
    });
    if (!budget) {
      return reply.status(404).send({ success: false, error: 'Budget not found' });
    }

    const lineItem = budget.lineItems.find((li) => li.id === body.lineItemId);
    if (!lineItem) {
      return reply.status(404).send({ success: false, error: 'Line item not found' });
    }

    const monthlyAmounts = getMonthlyAmounts(lineItem);
    const budgetedAmount = monthlyAmounts[body.month - 1];
    const { variance, percentage } = calculateVariance(budgetedAmount, body.actualAmount);

    const actual = await prisma.budgetActual.upsert({
      where: {
        budgetId_lineItemId_month_year: {
          budgetId: body.budgetId,
          lineItemId: body.lineItemId,
          month: body.month,
          year: body.year,
        },
      },
      create: {
        budgetId: body.budgetId,
        lineItemId: body.lineItemId,
        month: body.month,
        year: body.year,
        budgetedAmount,
        actualAmount: body.actualAmount,
        variance,
        variancePercent: percentage,
        notes: body.notes,
        transactions: body.transactions ? {
          create: body.transactions.map((t) => ({
            date: new Date(t.date),
            description: t.description,
            amount: t.amount,
            referenceType: t.referenceType,
            referenceId: t.referenceId,
          })),
        } : undefined,
      },
      update: {
        budgetedAmount,
        actualAmount: body.actualAmount,
        variance,
        variancePercent: percentage,
        notes: body.notes,
      },
      include: { transactions: true },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...actual,
        budgetedAmount: toNumber(actual.budgetedAmount),
        actualAmount: toNumber(actual.actualAmount),
        variance: toNumber(actual.variance),
        variancePercentage: toNumber(actual.variancePercent),
        transactions: actual.transactions.map((t) => ({
          ...t,
          amount: toNumber(t.amount),
        })),
      },
    });
  });

  // Get actuals for budget
  app.get('/:id/actuals', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { month?: string };

    const budget = await prisma.budget.findUnique({ where: { id } });
    if (!budget) {
      return reply.status(404).send({ success: false, error: 'Budget not found' });
    }

    const actuals = await prisma.budgetActual.findMany({
      where: {
        budgetId: id,
        ...(query.month && { month: parseInt(query.month, 10) }),
      },
      include: { transactions: true },
    });

    const result = actuals.map((a) => ({
      ...a,
      budgetedAmount: toNumber(a.budgetedAmount),
      actualAmount: toNumber(a.actualAmount),
      variance: toNumber(a.variance),
      variancePercentage: toNumber(a.variancePercent),
      transactions: a.transactions.map((t) => ({
        ...t,
        amount: toNumber(t.amount),
      })),
    }));

    return reply.send({
      success: true,
      data: result,
      total: result.length,
    });
  });

  // -------------------------------------------------------------------------
  // Variance Reports
  // -------------------------------------------------------------------------

  // Get variance report
  app.get('/:id/variance', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { month?: string; quarter?: string };

    const budget = await prisma.budget.findUnique({
      where: { id },
      include: { lineItems: true },
    });
    if (!budget) {
      return reply.status(404).send({ success: false, error: 'Budget not found' });
    }

    const actuals = await prisma.budgetActual.findMany({
      where: { budgetId: id },
    });

    let period = 'YTD';
    let months: number[] = [];

    if (query.month) {
      const month = parseInt(query.month, 10);
      months = [month];
      period = `Month ${month}`;
    } else if (query.quarter) {
      const quarter = parseInt(query.quarter, 10);
      const startMonth = (quarter - 1) * 3 + 1;
      months = [startMonth, startMonth + 1, startMonth + 2];
      period = `Q${quarter}`;
    } else {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      months = Array.from({ length: currentMonth }, (_, i) => i + 1);
    }

    const categories: VarianceCategory[] = [];

    for (const lineItem of budget.lineItems) {
      const monthlyAmounts = getMonthlyAmounts(lineItem);
      const itemActuals = actuals.filter(
        (a) => a.lineItemId === lineItem.id && months.includes(a.month)
      );

      const budgeted = months.reduce((sum, m) => sum + monthlyAmounts[m - 1], 0);
      const actual = itemActuals.reduce((sum, a) => sum + toNumber(a.actualAmount), 0);
      const { variance, percentage } = calculateVariance(budgeted, actual);

      categories.push({
        category: lineItem.category,
        name: lineItem.name,
        type: lineItem.type as 'income' | 'expense',
        budgeted: Math.round(budgeted * 100) / 100,
        actual: Math.round(actual * 100) / 100,
        variance,
        variancePercent: percentage,
        status: getVarianceStatus(lineItem.type as 'income' | 'expense', percentage),
      });
    }

    const incomeCategories = categories.filter((c) => c.type === 'income');
    const expenseCategories = categories.filter((c) => c.type === 'expense');

    const totalBudgetedIncome = incomeCategories.reduce((sum, c) => sum + c.budgeted, 0);
    const totalActualIncome = incomeCategories.reduce((sum, c) => sum + c.actual, 0);
    const totalBudgetedExpenses = expenseCategories.reduce((sum, c) => sum + c.budgeted, 0);
    const totalActualExpenses = expenseCategories.reduce((sum, c) => sum + c.actual, 0);

    const report: VarianceReport = {
      budgetId: id,
      propertyId: budget.propertyId,
      period,
      categories,
      totalBudgeted: {
        income: Math.round(totalBudgetedIncome * 100) / 100,
        expenses: Math.round(totalBudgetedExpenses * 100) / 100,
        noi: Math.round((totalBudgetedIncome - totalBudgetedExpenses) * 100) / 100,
      },
      totalActual: {
        income: Math.round(totalActualIncome * 100) / 100,
        expenses: Math.round(totalActualExpenses * 100) / 100,
        noi: Math.round((totalActualIncome - totalActualExpenses) * 100) / 100,
      },
      totalVariance: {
        income: Math.round((totalActualIncome - totalBudgetedIncome) * 100) / 100,
        expenses: Math.round((totalActualExpenses - totalBudgetedExpenses) * 100) / 100,
        noi: Math.round(((totalActualIncome - totalActualExpenses) - (totalBudgetedIncome - totalBudgetedExpenses)) * 100) / 100,
      },
      totalVariancePercent: {
        income: totalBudgetedIncome !== 0 ? Math.round(((totalActualIncome - totalBudgetedIncome) / totalBudgetedIncome) * 10000) / 100 : 0,
        expenses: totalBudgetedExpenses !== 0 ? Math.round(((totalActualExpenses - totalBudgetedExpenses) / totalBudgetedExpenses) * 10000) / 100 : 0,
        noi: 0,
      },
      insights: generateVarianceInsights(categories),
    };

    return reply.send({ success: true, data: report });
  });

  // -------------------------------------------------------------------------
  // Forecasts
  // -------------------------------------------------------------------------

  // List forecasts
  app.get('/forecasts', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { propertyId?: string };

    const forecasts = await prisma.budgetForecast.findMany({
      where: query.propertyId ? { propertyId: query.propertyId } : undefined,
      include: {
        assumptions: true,
        projections: true,
      },
    });

    const result = forecasts.map((f) => ({
      ...f,
      summary: {
        totalIncome: toNumber(f.totalIncome),
        totalExpenses: toNumber(f.totalExpenses),
        totalNOI: toNumber(f.totalNOI),
        averageOccupancy: toNumber(f.averageOccupancy),
        irr: f.irr ? toNumber(f.irr) : null,
        npv: f.npv ? toNumber(f.npv) : null,
      },
      assumptions: f.assumptions.map((a) => ({
        category: a.category,
        growthRate: toNumber(a.growthRate),
        inflationAdjustment: a.inflationAdjustment,
        customFormula: a.customFormula,
        notes: a.notes,
      })),
      projections: f.projections.map((p) => ({
        period: p.period,
        income: toNumber(p.income),
        expenses: toNumber(p.expenses),
        noi: toNumber(p.noi),
        cashFlow: toNumber(p.cashFlow),
        occupancy: toNumber(p.occupancy),
      })),
    }));

    return reply.send({
      success: true,
      data: result,
      total: result.length,
    });
  });

  // Create forecast
  app.post('/forecasts', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createForecastSchema.parse(request.body);

    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    const months = Math.ceil((endDate.getTime() - startDate.getTime()) / (30 * 24 * 60 * 60 * 1000));

    const projections: Array<{
      period: string;
      income: number;
      expenses: number;
      noi: number;
      cashFlow: number;
      occupancy: number;
    }> = [];
    let currentIncome = body.initialIncome;
    let currentExpenses = body.initialExpenses;
    let currentOccupancy = body.initialOccupancy;

    const incomeAssumption = body.assumptions.find((a) => a.category === 'rental_income');
    const expenseAssumption = body.assumptions.find((a) => a.category === 'maintenance');

    const incomeGrowth = incomeAssumption?.growthRate ?? 3;
    const expenseGrowth = expenseAssumption?.growthRate ?? 2;

    let totalIncome = 0;
    let totalExpenses = 0;
    let totalOccupancy = 0;

    for (let i = 0; i < months; i++) {
      const periodDate = new Date(startDate);
      periodDate.setMonth(periodDate.getMonth() + i);
      const period = `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, '0')}`;

      if (i > 0) {
        currentIncome *= 1 + incomeGrowth / 1200;
        currentExpenses *= 1 + expenseGrowth / 1200;
        currentOccupancy = Math.min(100, Math.max(80, currentOccupancy + (Math.random() - 0.5) * 2));
      }

      const adjustedIncome = currentIncome * (currentOccupancy / 100);
      const noi = adjustedIncome - currentExpenses;

      projections.push({
        period,
        income: Math.round(adjustedIncome * 100) / 100,
        expenses: Math.round(currentExpenses * 100) / 100,
        noi: Math.round(noi * 100) / 100,
        cashFlow: Math.round(noi * 100) / 100,
        occupancy: Math.round(currentOccupancy * 100) / 100,
      });

      totalIncome += adjustedIncome;
      totalExpenses += currentExpenses;
      totalOccupancy += currentOccupancy;
    }

    const cashFlows = projections.map((p) => p.cashFlow);
    const npv = calculateNPV(cashFlows, 8);
    const irr = calculateIRR(cashFlows, body.initialIncome * 12);

    const forecast = await prisma.budgetForecast.create({
      data: {
        propertyId: body.propertyId,
        baseBudgetId: body.baseBudgetId,
        name: body.name,
        forecastType: body.forecastType as ForecastType,
        startDate,
        endDate,
        totalIncome: Math.round(totalIncome * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        totalNOI: Math.round((totalIncome - totalExpenses) * 100) / 100,
        averageOccupancy: Math.round((totalOccupancy / months) * 100) / 100,
        irr,
        npv,
        createdBy: 'system',
        assumptions: {
          create: body.assumptions.map((a) => ({
            category: a.category,
            growthRate: a.growthRate,
            inflationAdjustment: a.inflationAdjustment,
            customFormula: a.customFormula,
            notes: a.notes,
          })),
        },
        projections: {
          create: projections,
        },
      },
      include: {
        assumptions: true,
        projections: true,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...forecast,
        summary: {
          totalIncome: toNumber(forecast.totalIncome),
          totalExpenses: toNumber(forecast.totalExpenses),
          totalNOI: toNumber(forecast.totalNOI),
          averageOccupancy: toNumber(forecast.averageOccupancy),
          irr: forecast.irr ? toNumber(forecast.irr) : null,
          npv: forecast.npv ? toNumber(forecast.npv) : null,
        },
        assumptions: forecast.assumptions.map((a) => ({
          category: a.category,
          growthRate: toNumber(a.growthRate),
          inflationAdjustment: a.inflationAdjustment,
          customFormula: a.customFormula,
          notes: a.notes,
        })),
        projections: forecast.projections.map((p) => ({
          period: p.period,
          income: toNumber(p.income),
          expenses: toNumber(p.expenses),
          noi: toNumber(p.noi),
          cashFlow: toNumber(p.cashFlow),
          occupancy: toNumber(p.occupancy),
        })),
      },
    });
  });

  // -------------------------------------------------------------------------
  // CapEx Planning
  // -------------------------------------------------------------------------

  // List CapEx items
  app.get('/capex', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { propertyId?: string; status?: string; priority?: string };

    const capExItems = await prisma.capExItem.findMany({
      where: {
        ...(query.propertyId && { propertyId: query.propertyId }),
        ...(query.status && { status: query.status as CapExStatus }),
        ...(query.priority && { priority: query.priority as CapExPriority }),
      },
      orderBy: { plannedDate: 'asc' },
    });

    const result = capExItems.map((item) => ({
      ...item,
      estimatedCost: toNumber(item.estimatedCost),
      actualCost: item.actualCost ? toNumber(item.actualCost) : null,
    }));

    return reply.send({
      success: true,
      data: result,
      total: result.length,
    });
  });

  // Create CapEx item
  app.post('/capex', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createCapExSchema.parse(request.body);

    const item = await prisma.capExItem.create({
      data: {
        propertyId: body.propertyId,
        name: body.name,
        description: body.description,
        category: body.category,
        estimatedCost: body.estimatedCost,
        status: 'planned',
        priority: body.priority as CapExPriority,
        plannedDate: new Date(body.plannedDate),
        usefulLife: body.usefulLife,
        fundingSource: body.fundingSource as FundingSource,
        notes: body.notes,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...item,
        estimatedCost: toNumber(item.estimatedCost),
        actualCost: item.actualCost ? toNumber(item.actualCost) : null,
      },
    });
  });

  // Update CapEx status
  app.patch('/capex/:id/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { status: CapExStatus; actualCost?: number };

    const item = await prisma.capExItem.findUnique({ where: { id } });
    if (!item) {
      return reply.status(404).send({ success: false, error: 'CapEx item not found' });
    }

    const updated = await prisma.capExItem.update({
      where: { id },
      data: {
        status: body.status,
        ...(body.status === 'completed' && {
          completedDate: new Date(),
          ...(body.actualCost !== undefined && { actualCost: body.actualCost }),
        }),
      },
    });

    return reply.send({
      success: true,
      data: {
        ...updated,
        estimatedCost: toNumber(updated.estimatedCost),
        actualCost: updated.actualCost ? toNumber(updated.actualCost) : null,
      },
    });
  });

  // Get CapEx summary for property
  app.get('/capex/summary/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };

    const propertyCapEx = await prisma.capExItem.findMany({
      where: { propertyId },
    });

    const now = new Date();
    const thisYear = now.getFullYear();
    const nextYear = thisYear + 1;

    const planned = propertyCapEx.filter((c) => c.status === 'planned');
    const budgeted = propertyCapEx.filter((c) => c.status === 'budgeted');
    const inProgress = propertyCapEx.filter((c) => c.status === 'in_progress');
    const completed = propertyCapEx.filter((c) => c.status === 'completed');

    const thisYearItems = propertyCapEx.filter((c) => c.plannedDate.getFullYear() === thisYear);
    const nextYearItems = propertyCapEx.filter((c) => c.plannedDate.getFullYear() === nextYear);

    const byPriority = {
      critical: propertyCapEx.filter((c) => c.priority === 'critical' && c.status !== 'completed'),
      high: propertyCapEx.filter((c) => c.priority === 'high' && c.status !== 'completed'),
      medium: propertyCapEx.filter((c) => c.priority === 'medium' && c.status !== 'completed'),
      low: propertyCapEx.filter((c) => c.priority === 'low' && c.status !== 'completed'),
    };

    return reply.send({
      success: true,
      data: {
        propertyId,
        totals: {
          planned: planned.reduce((sum, c) => sum + toNumber(c.estimatedCost), 0),
          budgeted: budgeted.reduce((sum, c) => sum + toNumber(c.estimatedCost), 0),
          inProgress: inProgress.reduce((sum, c) => sum + toNumber(c.estimatedCost), 0),
          completed: completed.reduce((sum, c) => sum + (c.actualCost ? toNumber(c.actualCost) : toNumber(c.estimatedCost)), 0),
        },
        counts: {
          planned: planned.length,
          budgeted: budgeted.length,
          inProgress: inProgress.length,
          completed: completed.length,
        },
        timeline: {
          thisYear: {
            count: thisYearItems.length,
            estimated: thisYearItems.reduce((sum, c) => sum + toNumber(c.estimatedCost), 0),
          },
          nextYear: {
            count: nextYearItems.length,
            estimated: nextYearItems.reduce((sum, c) => sum + toNumber(c.estimatedCost), 0),
          },
        },
        byPriority: {
          critical: { count: byPriority.critical.length, estimated: byPriority.critical.reduce((sum, c) => sum + toNumber(c.estimatedCost), 0) },
          high: { count: byPriority.high.length, estimated: byPriority.high.reduce((sum, c) => sum + toNumber(c.estimatedCost), 0) },
          medium: { count: byPriority.medium.length, estimated: byPriority.medium.reduce((sum, c) => sum + toNumber(c.estimatedCost), 0) },
          low: { count: byPriority.low.length, estimated: byPriority.low.reduce((sum, c) => sum + toNumber(c.estimatedCost), 0) },
        },
      },
    });
  });
}
