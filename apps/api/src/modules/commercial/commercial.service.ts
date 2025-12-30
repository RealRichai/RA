/**
 * Commercial Service
 *
 * Provides commercial real estate functionality:
 * - Underwriting analysis
 * - Fractional ownership offerings
 * - Investment portfolio management
 */

import { prisma } from '@realriches/database';
import { generatePrefixedId } from '@realriches/utils';
import type { FastifyRequest } from 'fastify';

// =============================================================================
// Types
// =============================================================================

export interface UnderwritingInput {
  propertyId: string;
  purchasePrice: number;
  loanAmount?: number;
  interestRate?: number;
  holdPeriod: number;
  exitCapRate?: number;
}

export interface UnderwritingAnalysis {
  propertyId: string;
  propertyName: string;
  inputs: {
    purchasePrice: number;
    loanAmount: number;
    equity: number;
    interestRate: number;
    holdPeriod: number;
    exitCapRate: number;
  };
  metrics: {
    goingInCapRate: number;
    cashOnCash: number;
    estimatedIRR: number;
    dscr: number;
    ltv: number;
  };
  projections: {
    year1NOI: number;
    year1CashFlow: number;
    exitValue: number;
    totalProfit: number;
  };
  sensitivity: {
    capRateMinus50bps: number;
    capRatePlus50bps: number;
  };
  createdAt: string;
  createdBy: string;
}

export interface FractionalOffering {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyType: string;
  location: string;
  totalValue: number;
  pricePerShare: number;
  totalShares: number;
  sharesAvailable: number;
  sharesSubscribed: number;
  minimumInvestment: number;
  projectedReturns: {
    annualCashYield: number;
    targetIRR: number;
    holdPeriod: number;
  };
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'OPEN' | 'FUNDED' | 'CLOSED';
  deadline: string;
  createdAt: string;
  createdBy: string;
}

export interface Investment {
  id: string;
  offeringId: string;
  investorId: string;
  shares: number;
  amount: number;
  status: 'PENDING_VERIFICATION' | 'PENDING_PAYMENT' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
}

export interface Portfolio {
  totalInvested: number;
  currentValue: number;
  totalReturns: number;
  returnPercentage: number;
  investments: Array<{
    id: string;
    propertyName: string;
    shares: number;
    investedAmount: number;
    currentValue: number;
    distributions: number;
  }>;
  distributions: Array<{
    id: string;
    propertyName: string;
    amount: number;
    date: string;
    type: 'DIVIDEND' | 'RETURN_OF_CAPITAL';
  }>;
}

// =============================================================================
// In-Memory Store (would be database tables in production)
// =============================================================================

const fractionalOfferings = new Map<string, FractionalOffering>();
const investments = new Map<string, Investment>();
const investorPortfolios = new Map<string, Investment[]>();

// =============================================================================
// Underwriting Service
// =============================================================================

/**
 * Run underwriting analysis on a commercial property
 */
export async function runUnderwritingAnalysis(
  input: UnderwritingInput,
  property: { id: string; name: string; squareFeet?: number | null },
  userId: string
): Promise<UnderwritingAnalysis> {
  const purchasePrice = input.purchasePrice;
  const loanAmount = input.loanAmount || purchasePrice * 0.7; // 70% LTV default
  const equity = purchasePrice - loanAmount;
  const interestRate = input.interestRate || 0.065; // 6.5% default
  const holdPeriod = input.holdPeriod;
  const exitCapRate = input.exitCapRate || 0.055; // 5.5% default

  // Estimate NOI based on property size and market rates
  const sqft = property.squareFeet || 10000;
  const estimatedNOI = sqft * 28; // ~$28/sqft NOI for commercial
  const goingInCapRate = estimatedNOI / purchasePrice;

  // Annual debt service (interest-only for simplicity)
  const annualDebtService = loanAmount * interestRate;

  // Cash on cash return
  const yearOneCashFlow = estimatedNOI - annualDebtService;
  const cashOnCash = (yearOneCashFlow / equity) * 100;

  // Project NOI growth (2.5% annually for commercial)
  const noiGrowthRate = 0.025;
  const exitNOI = estimatedNOI * Math.pow(1 + noiGrowthRate, holdPeriod);
  const exitValue = exitNOI / exitCapRate;

  // Calculate total profit and IRR
  const totalProfit = exitValue - loanAmount - equity;
  const irr = Math.pow((equity + totalProfit) / equity, 1 / holdPeriod) - 1;

  // Debt service coverage ratio
  const dscr = estimatedNOI / annualDebtService;

  return {
    propertyId: property.id,
    propertyName: property.name,
    inputs: {
      purchasePrice,
      loanAmount,
      equity,
      interestRate,
      holdPeriod,
      exitCapRate,
    },
    metrics: {
      goingInCapRate: Math.round(goingInCapRate * 10000) / 100,
      cashOnCash: Math.round(cashOnCash * 100) / 100,
      estimatedIRR: Math.round(irr * 10000) / 100,
      dscr: Math.round(dscr * 100) / 100,
      ltv: Math.round((loanAmount / purchasePrice) * 10000) / 100,
    },
    projections: {
      year1NOI: Math.round(estimatedNOI),
      year1CashFlow: Math.round(yearOneCashFlow),
      exitValue: Math.round(exitValue),
      totalProfit: Math.round(totalProfit),
    },
    sensitivity: {
      capRateMinus50bps: Math.round(exitNOI / (exitCapRate - 0.005)),
      capRatePlus50bps: Math.round(exitNOI / (exitCapRate + 0.005)),
    },
    createdAt: new Date().toISOString(),
    createdBy: userId,
  };
}

// =============================================================================
// Fractional Offerings Service
// =============================================================================

/**
 * List fractional ownership offerings
 */
export function listFractionalOfferings(filters: {
  status?: string;
  minInvestment?: number;
}): FractionalOffering[] {
  let offerings = Array.from(fractionalOfferings.values());

  if (filters.status) {
    offerings = offerings.filter((o) => o.status === filters.status);
  }

  if (filters.minInvestment) {
    offerings = offerings.filter((o) => o.minimumInvestment >= filters.minInvestment!);
  }

  // Add sample data if empty
  if (offerings.length === 0) {
    return [
      {
        id: 'frac_sample_1',
        propertyId: 'prop_sample',
        propertyName: 'Manhattan Office Tower',
        propertyType: 'OFFICE',
        location: 'New York, NY',
        totalValue: 50000000,
        pricePerShare: 1000,
        totalShares: 50000,
        sharesAvailable: 25000,
        sharesSubscribed: 25000,
        minimumInvestment: 10000,
        projectedReturns: {
          annualCashYield: 6.5,
          targetIRR: 15,
          holdPeriod: 5,
        },
        status: 'OPEN',
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        createdBy: 'system',
      },
      {
        id: 'frac_sample_2',
        propertyId: 'prop_sample_2',
        propertyName: 'Brooklyn Retail Center',
        propertyType: 'RETAIL',
        location: 'Brooklyn, NY',
        totalValue: 25000000,
        pricePerShare: 500,
        totalShares: 50000,
        sharesAvailable: 35000,
        sharesSubscribed: 15000,
        minimumInvestment: 5000,
        projectedReturns: {
          annualCashYield: 7.2,
          targetIRR: 12,
          holdPeriod: 7,
        },
        status: 'OPEN',
        deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        createdBy: 'system',
      },
    ];
  }

  return offerings;
}

/**
 * Create a new fractional offering
 */
export async function createFractionalOffering(
  data: {
    propertyId: string;
    totalValue: number;
    pricePerShare: number;
    minimumInvestment: number;
    projectedReturns: {
      annualCashYield: number;
      targetIRR: number;
      holdPeriod: number;
    };
    deadline: string;
  },
  property: { id: string; name: string; address: string; type: string },
  userId: string
): Promise<FractionalOffering> {
  const id = generatePrefixedId('frac');
  const totalShares = Math.floor(data.totalValue / data.pricePerShare);

  const offering: FractionalOffering = {
    id,
    propertyId: data.propertyId,
    propertyName: property.name,
    propertyType: property.type,
    location: property.address,
    totalValue: data.totalValue,
    pricePerShare: data.pricePerShare,
    totalShares,
    sharesAvailable: totalShares,
    sharesSubscribed: 0,
    minimumInvestment: data.minimumInvestment,
    projectedReturns: data.projectedReturns,
    status: 'PENDING_APPROVAL',
    deadline: data.deadline,
    createdAt: new Date().toISOString(),
    createdBy: userId,
  };

  fractionalOfferings.set(id, offering);

  return offering;
}

/**
 * Process an investment in a fractional offering
 */
export async function processInvestment(
  offeringId: string,
  investorId: string,
  shares: number,
  _paymentMethodId: string
): Promise<Investment> {
  const offering = fractionalOfferings.get(offeringId);

  // Create investment record
  const investment: Investment = {
    id: generatePrefixedId('inv'),
    offeringId,
    investorId,
    shares,
    amount: offering ? shares * offering.pricePerShare : shares * 1000,
    status: 'PENDING_VERIFICATION',
    createdAt: new Date().toISOString(),
  };

  investments.set(investment.id, investment);

  // Track in investor's portfolio
  const existing = investorPortfolios.get(investorId) || [];
  existing.push(investment);
  investorPortfolios.set(investorId, existing);

  // Update offering shares (if found)
  if (offering) {
    offering.sharesSubscribed += shares;
    offering.sharesAvailable -= shares;
    fractionalOfferings.set(offeringId, offering);
  }

  return investment;
}

// =============================================================================
// Portfolio Service
// =============================================================================

/**
 * Get investor's commercial portfolio
 */
export async function getInvestorPortfolio(investorId: string): Promise<Portfolio> {
  const investorInvestments = investorPortfolios.get(investorId) || [];

  let totalInvested = 0;
  let currentValue = 0;
  let totalReturns = 0;

  const portfolioInvestments = investorInvestments.map((inv) => {
    const offering = fractionalOfferings.get(inv.offeringId);
    const amount = inv.amount;
    // Simulate modest appreciation (5%)
    const value = Math.round(amount * 1.05);
    const distributions = Math.round(amount * 0.065); // ~6.5% yield

    totalInvested += amount;
    currentValue += value;
    totalReturns += distributions;

    return {
      id: inv.id,
      propertyName: offering?.propertyName || 'Investment Property',
      shares: inv.shares,
      investedAmount: amount,
      currentValue: value,
      distributions,
    };
  });

  const distributions = investorInvestments.map((inv) => ({
    id: generatePrefixedId('dist'),
    propertyName: fractionalOfferings.get(inv.offeringId)?.propertyName || 'Investment Property',
    amount: Math.round(inv.amount * 0.065 / 4), // Quarterly distribution
    date: new Date().toISOString(),
    type: 'DIVIDEND' as const,
  }));

  return {
    totalInvested,
    currentValue,
    totalReturns,
    returnPercentage: totalInvested > 0 ? Math.round(((currentValue + totalReturns - totalInvested) / totalInvested) * 10000) / 100 : 0,
    investments: portfolioInvestments,
    distributions,
  };
}
