import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export type BudgetPeriod = 'monthly' | 'quarterly' | 'annual';
export type BudgetStatus = 'draft' | 'pending_approval' | 'approved' | 'active' | 'closed';
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

export interface Budget {
  id: string;
  propertyId: string;
  name: string;
  fiscalYear: number;
  period: BudgetPeriod;
  status: BudgetStatus;
  startDate: Date;
  endDate: Date;
  lineItems: BudgetLineItem[];
  totalIncome: number;
  totalExpenses: number;
  netOperatingIncome: number;
  notes: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetLineItem {
  id: string;
  category: BudgetCategory;
  name: string;
  description: string | null;
  type: 'income' | 'expense';
  annualAmount: number;
  monthlyAmounts: number[]; // 12 months
  isRecurring: boolean;
  frequency: 'monthly' | 'quarterly' | 'annual' | 'one_time';
  notes: string | null;
}

export interface BudgetActual {
  id: string;
  budgetId: string;
  lineItemId: string;
  month: number; // 1-12
  year: number;
  budgetedAmount: number;
  actualAmount: number;
  variance: number;
  variancePercentage: number;
  notes: string | null;
  transactions: ActualTransaction[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ActualTransaction {
  id: string;
  date: Date;
  description: string;
  amount: number;
  referenceType: string | null;
  referenceId: string | null;
}

export interface BudgetForecast {
  id: string;
  propertyId: string;
  name: string;
  forecastType: 'rolling' | 'scenario' | 'projection';
  baseBudgetId: string | null;
  startDate: Date;
  endDate: Date;
  assumptions: ForecastAssumption[];
  projections: ForecastProjection[];
  summary: ForecastSummary;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ForecastAssumption {
  category: BudgetCategory;
  growthRate: number; // percentage
  inflationAdjustment: boolean;
  customFormula: string | null;
  notes: string | null;
}

export interface ForecastProjection {
  period: string; // e.g., "2024-01", "2024-Q1"
  income: number;
  expenses: number;
  noi: number;
  cashFlow: number;
  occupancy: number;
}

export interface ForecastSummary {
  totalIncome: number;
  totalExpenses: number;
  totalNOI: number;
  averageOccupancy: number;
  irr: number | null;
  npv: number | null;
}

export interface CapExItem {
  id: string;
  propertyId: string;
  name: string;
  description: string | null;
  category: string;
  estimatedCost: number;
  actualCost: number | null;
  status: 'planned' | 'budgeted' | 'in_progress' | 'completed' | 'deferred';
  priority: 'low' | 'medium' | 'high' | 'critical';
  plannedDate: Date;
  completedDate: Date | null;
  usefulLife: number; // years
  fundingSource: 'reserves' | 'operating' | 'loan' | 'owner_contribution';
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

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
  category: BudgetCategory;
  name: string;
  type: 'income' | 'expense';
  budgeted: number;
  actual: number;
  variance: number;
  variancePercent: number;
  status: 'on_track' | 'over' | 'under' | 'significantly_over' | 'significantly_under';
}

// ============================================================================
// In-memory stores (placeholder for Prisma)
// ============================================================================

export const budgets = new Map<string, Budget>();
export const budgetActuals = new Map<string, BudgetActual>();
export const forecasts = new Map<string, BudgetForecast>();
export const capExItems = new Map<string, CapExItem>();

// ============================================================================
// Helper Functions
// ============================================================================

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
  const threshold = 10; // 10% threshold for significant variance
  const absVariance = Math.abs(variancePercent);

  if (absVariance <= 5) return 'on_track';

  if (type === 'income') {
    // For income: over is good, under is bad
    if (variancePercent > threshold) return 'significantly_over';
    if (variancePercent > 0) return 'over';
    if (variancePercent < -threshold) return 'significantly_under';
    return 'under';
  } else {
    // For expenses: over is bad, under is good
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
      months[11] = annualAmount; // December by default
      return months;

    case 'one_time':
      const month = (oneTimeMonth ?? 1) - 1; // Convert to 0-indexed
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
  // Newton-Raphson method for IRR approximation
  let rate = 0.1; // Initial guess: 10%

  for (let iteration = 0; iteration < 100; iteration++) {
    let npv = -initialInvestment;
    let derivative = 0;

    for (let i = 0; i < cashFlows.length; i++) {
      const denominator = Math.pow(1 + rate, i + 1);
      npv += cashFlows[i] / denominator;
      derivative -= (i + 1) * cashFlows[i] / Math.pow(1 + rate, i + 2);
    }

    if (Math.abs(npv) < 0.0001) {
      return Math.round(rate * 10000) / 100; // Return as percentage
    }

    if (derivative === 0) return null;

    rate = rate - npv / derivative;

    if (rate < -1 || rate > 10) return null; // Out of reasonable bounds
  }

  return null;
}

export function generateVarianceInsights(categories: VarianceCategory[]): string[] {
  const insights: string[] = [];

  // Find significant variances
  const significantOver = categories.filter((c) => c.status === 'significantly_over');
  const significantUnder = categories.filter((c) => c.status === 'significantly_under');

  // Income insights
  const incomeOver = significantOver.filter((c) => c.type === 'income');
  const incomeUnder = significantUnder.filter((c) => c.type === 'income');

  if (incomeOver.length > 0) {
    insights.push(`Strong performance: ${incomeOver.map((c) => c.name).join(', ')} exceeded budget.`);
  }
  if (incomeUnder.length > 0) {
    insights.push(`Attention needed: ${incomeUnder.map((c) => c.name).join(', ')} below budget expectations.`);
  }

  // Expense insights
  const expenseOver = significantOver.filter((c) => c.type === 'expense');
  const expenseUnder = significantUnder.filter((c) => c.type === 'expense');

  if (expenseOver.length > 0) {
    insights.push(`Cost overrun: ${expenseOver.map((c) => c.name).join(', ')} exceeded budget.`);
  }
  if (expenseUnder.length > 0) {
    insights.push(`Cost savings: ${expenseUnder.map((c) => c.name).join(', ')} under budget.`);
  }

  // Overall assessment
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
  lineItemId: z.string(),
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

    let budgetList = Array.from(budgets.values());

    if (query.propertyId) {
      budgetList = budgetList.filter((b) => b.propertyId === query.propertyId);
    }
    if (query.year) {
      const year = parseInt(query.year, 10);
      budgetList = budgetList.filter((b) => b.fiscalYear === year);
    }
    if (query.status) {
      budgetList = budgetList.filter((b) => b.status === query.status);
    }

    // Sort by fiscal year descending
    budgetList.sort((a, b) => b.fiscalYear - a.fiscalYear);

    return reply.send({
      success: true,
      data: budgetList,
      total: budgetList.length,
    });
  });

  // Get budget
  app.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const budget = budgets.get(id);

    if (!budget) {
      return reply.status(404).send({ success: false, error: 'Budget not found' });
    }

    return reply.send({ success: true, data: budget });
  });

  // Create budget
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createBudgetSchema.parse(request.body);
    const now = new Date();

    // Process line items
    const lineItems: BudgetLineItem[] = body.lineItems.map((item, index) => ({
      id: `li-${index}`,
      category: item.category,
      name: item.name,
      description: item.description ?? null,
      type: item.type,
      annualAmount: item.annualAmount,
      monthlyAmounts: distributeAnnualToMonths(item.annualAmount, item.frequency),
      isRecurring: item.isRecurring,
      frequency: item.frequency,
      notes: item.notes ?? null,
    }));

    // Calculate totals
    const totalIncome = lineItems
      .filter((i) => i.type === 'income')
      .reduce((sum, i) => sum + i.annualAmount, 0);
    const totalExpenses = lineItems
      .filter((i) => i.type === 'expense')
      .reduce((sum, i) => sum + i.annualAmount, 0);
    const netOperatingIncome = totalIncome - totalExpenses;

    const budget: Budget = {
      id: crypto.randomUUID(),
      propertyId: body.propertyId,
      name: body.name,
      fiscalYear: body.fiscalYear,
      period: body.period,
      status: 'draft',
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      lineItems,
      totalIncome,
      totalExpenses,
      netOperatingIncome,
      notes: body.notes ?? null,
      approvedById: null,
      approvedAt: null,
      createdById: 'system',
      createdAt: now,
      updatedAt: now,
    };

    budgets.set(budget.id, budget);

    return reply.status(201).send({
      success: true,
      data: budget,
    });
  });

  // Approve budget
  app.post('/:id/approve', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.body as { userId: string };

    const budget = budgets.get(id);
    if (!budget) {
      return reply.status(404).send({ success: false, error: 'Budget not found' });
    }

    budget.status = 'approved';
    budget.approvedById = userId;
    budget.approvedAt = new Date();
    budget.updatedAt = new Date();
    budgets.set(id, budget);

    return reply.send({ success: true, data: budget });
  });

  // Activate budget
  app.post('/:id/activate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const budget = budgets.get(id);
    if (!budget) {
      return reply.status(404).send({ success: false, error: 'Budget not found' });
    }

    if (budget.status !== 'approved') {
      return reply.status(400).send({ success: false, error: 'Budget must be approved first' });
    }

    // Deactivate other active budgets for same property/year
    for (const [budgetId, b] of budgets) {
      if (b.propertyId === budget.propertyId && b.fiscalYear === budget.fiscalYear && b.status === 'active') {
        b.status = 'closed';
        budgets.set(budgetId, b);
      }
    }

    budget.status = 'active';
    budget.updatedAt = new Date();
    budgets.set(id, budget);

    return reply.send({ success: true, data: budget });
  });

  // -------------------------------------------------------------------------
  // Budget Actuals
  // -------------------------------------------------------------------------

  // Record actual
  app.post('/actuals', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = recordActualSchema.parse(request.body);
    const now = new Date();

    const budget = budgets.get(body.budgetId);
    if (!budget) {
      return reply.status(404).send({ success: false, error: 'Budget not found' });
    }

    const lineItem = budget.lineItems.find((li) => li.id === body.lineItemId);
    if (!lineItem) {
      return reply.status(404).send({ success: false, error: 'Line item not found' });
    }

    const budgetedAmount = lineItem.monthlyAmounts[body.month - 1];
    const { variance, percentage } = calculateVariance(budgetedAmount, body.actualAmount);

    const transactions: ActualTransaction[] = (body.transactions ?? []).map((t, i) => ({
      id: `txn-${i}`,
      date: new Date(t.date),
      description: t.description,
      amount: t.amount,
      referenceType: t.referenceType ?? null,
      referenceId: t.referenceId ?? null,
    }));

    const actual: BudgetActual = {
      id: crypto.randomUUID(),
      budgetId: body.budgetId,
      lineItemId: body.lineItemId,
      month: body.month,
      year: body.year,
      budgetedAmount,
      actualAmount: body.actualAmount,
      variance,
      variancePercentage: percentage,
      notes: body.notes ?? null,
      transactions,
      createdAt: now,
      updatedAt: now,
    };

    budgetActuals.set(actual.id, actual);

    return reply.status(201).send({
      success: true,
      data: actual,
    });
  });

  // Get actuals for budget
  app.get('/:id/actuals', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { month?: string };

    const budget = budgets.get(id);
    if (!budget) {
      return reply.status(404).send({ success: false, error: 'Budget not found' });
    }

    let actualsList = Array.from(budgetActuals.values())
      .filter((a) => a.budgetId === id);

    if (query.month) {
      const month = parseInt(query.month, 10);
      actualsList = actualsList.filter((a) => a.month === month);
    }

    return reply.send({
      success: true,
      data: actualsList,
      total: actualsList.length,
    });
  });

  // -------------------------------------------------------------------------
  // Variance Reports
  // -------------------------------------------------------------------------

  // Get variance report
  app.get('/:id/variance', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { month?: string; quarter?: string };

    const budget = budgets.get(id);
    if (!budget) {
      return reply.status(404).send({ success: false, error: 'Budget not found' });
    }

    const actuals = Array.from(budgetActuals.values())
      .filter((a) => a.budgetId === id);

    // Determine period
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

    // Calculate variance by category
    const categories: VarianceCategory[] = [];

    for (const lineItem of budget.lineItems) {
      const itemActuals = actuals.filter(
        (a) => a.lineItemId === lineItem.id && months.includes(a.month)
      );

      const budgeted = months.reduce((sum, m) => sum + lineItem.monthlyAmounts[m - 1], 0);
      const actual = itemActuals.reduce((sum, a) => sum + a.actualAmount, 0);
      const { variance, percentage } = calculateVariance(budgeted, actual);

      categories.push({
        category: lineItem.category,
        name: lineItem.name,
        type: lineItem.type,
        budgeted: Math.round(budgeted * 100) / 100,
        actual: Math.round(actual * 100) / 100,
        variance,
        variancePercent: percentage,
        status: getVarianceStatus(lineItem.type, percentage),
      });
    }

    // Calculate totals
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

    let forecastList = Array.from(forecasts.values());

    if (query.propertyId) {
      forecastList = forecastList.filter((f) => f.propertyId === query.propertyId);
    }

    return reply.send({
      success: true,
      data: forecastList,
      total: forecastList.length,
    });
  });

  // Create forecast
  app.post('/forecasts', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createForecastSchema.parse(request.body);
    const now = new Date();

    // Calculate number of periods
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    const months = Math.ceil((endDate.getTime() - startDate.getTime()) / (30 * 24 * 60 * 60 * 1000));

    // Generate projections
    const projections: ForecastProjection[] = [];
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

      // Apply monthly growth
      if (i > 0) {
        currentIncome *= 1 + incomeGrowth / 1200; // Annual rate / 12
        currentExpenses *= 1 + expenseGrowth / 1200;
        // Occupancy with slight variation
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

    // Calculate summary
    const cashFlows = projections.map((p) => p.cashFlow);
    const npv = calculateNPV(cashFlows, 8); // 8% discount rate
    const irr = calculateIRR(cashFlows, body.initialIncome * 12); // Initial investment = 1 year income

    const summary: ForecastSummary = {
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      totalNOI: Math.round((totalIncome - totalExpenses) * 100) / 100,
      averageOccupancy: Math.round((totalOccupancy / months) * 100) / 100,
      irr,
      npv,
    };

    const forecast: BudgetForecast = {
      id: crypto.randomUUID(),
      propertyId: body.propertyId,
      name: body.name,
      forecastType: body.forecastType,
      baseBudgetId: body.baseBudgetId ?? null,
      startDate,
      endDate,
      assumptions: body.assumptions,
      projections,
      summary,
      createdById: 'system',
      createdAt: now,
      updatedAt: now,
    };

    forecasts.set(forecast.id, forecast);

    return reply.status(201).send({
      success: true,
      data: forecast,
    });
  });

  // -------------------------------------------------------------------------
  // CapEx Planning
  // -------------------------------------------------------------------------

  // List CapEx items
  app.get('/capex', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { propertyId?: string; status?: string; priority?: string };

    let capExList = Array.from(capExItems.values());

    if (query.propertyId) {
      capExList = capExList.filter((c) => c.propertyId === query.propertyId);
    }
    if (query.status) {
      capExList = capExList.filter((c) => c.status === query.status);
    }
    if (query.priority) {
      capExList = capExList.filter((c) => c.priority === query.priority);
    }

    // Sort by planned date
    capExList.sort((a, b) => a.plannedDate.getTime() - b.plannedDate.getTime());

    return reply.send({
      success: true,
      data: capExList,
      total: capExList.length,
    });
  });

  // Create CapEx item
  app.post('/capex', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createCapExSchema.parse(request.body);
    const now = new Date();

    const item: CapExItem = {
      id: crypto.randomUUID(),
      propertyId: body.propertyId,
      name: body.name,
      description: body.description ?? null,
      category: body.category,
      estimatedCost: body.estimatedCost,
      actualCost: null,
      status: 'planned',
      priority: body.priority,
      plannedDate: new Date(body.plannedDate),
      completedDate: null,
      usefulLife: body.usefulLife,
      fundingSource: body.fundingSource,
      notes: body.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };

    capExItems.set(item.id, item);

    return reply.status(201).send({
      success: true,
      data: item,
    });
  });

  // Update CapEx status
  app.patch('/capex/:id/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { status: CapExItem['status']; actualCost?: number };

    const item = capExItems.get(id);
    if (!item) {
      return reply.status(404).send({ success: false, error: 'CapEx item not found' });
    }

    item.status = body.status;
    if (body.status === 'completed') {
      item.completedDate = new Date();
      if (body.actualCost !== undefined) {
        item.actualCost = body.actualCost;
      }
    }
    item.updatedAt = new Date();
    capExItems.set(id, item);

    return reply.send({ success: true, data: item });
  });

  // Get CapEx summary for property
  app.get('/capex/summary/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };

    const propertyCapEx = Array.from(capExItems.values())
      .filter((c) => c.propertyId === propertyId);

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
          planned: planned.reduce((sum, c) => sum + c.estimatedCost, 0),
          budgeted: budgeted.reduce((sum, c) => sum + c.estimatedCost, 0),
          inProgress: inProgress.reduce((sum, c) => sum + c.estimatedCost, 0),
          completed: completed.reduce((sum, c) => sum + (c.actualCost ?? c.estimatedCost), 0),
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
            estimated: thisYearItems.reduce((sum, c) => sum + c.estimatedCost, 0),
          },
          nextYear: {
            count: nextYearItems.length,
            estimated: nextYearItems.reduce((sum, c) => sum + c.estimatedCost, 0),
          },
        },
        byPriority: {
          critical: { count: byPriority.critical.length, estimated: byPriority.critical.reduce((sum, c) => sum + c.estimatedCost, 0) },
          high: { count: byPriority.high.length, estimated: byPriority.high.reduce((sum, c) => sum + c.estimatedCost, 0) },
          medium: { count: byPriority.medium.length, estimated: byPriority.medium.reduce((sum, c) => sum + c.estimatedCost, 0) },
          low: { count: byPriority.low.length, estimated: byPriority.low.reduce((sum, c) => sum + c.estimatedCost, 0) },
        },
      },
    });
  });
}
