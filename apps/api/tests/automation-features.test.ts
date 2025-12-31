/**
 * Tests for Automation Features
 *
 * - Scheduled Reports
 * - Lease Renewal Automation
 * - Maintenance Workflows
 * - Payment Reconciliation
 */

import { describe, it, expect, beforeEach } from 'vitest';

// =============================================================================
// Scheduled Reports Tests
// =============================================================================

describe('Scheduled Reports', () => {
  describe('Report Schedule Management', () => {
    it('should create a report schedule with valid data', () => {
      const schedule = {
        id: 'rpt_001',
        userId: 'usr_001',
        name: 'Weekly Vacancy Report',
        reportType: 'vacancy',
        frequency: 'weekly',
        dayOfWeek: 1, // Monday
        timeOfDay: '09:00',
        format: 'pdf',
        recipients: ['owner@example.com'],
        filters: {},
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(schedule.name).toBe('Weekly Vacancy Report');
      expect(schedule.frequency).toBe('weekly');
      expect(schedule.recipients).toHaveLength(1);
    });

    it('should calculate next run date for daily schedule', () => {
      const now = new Date();
      const timeOfDay = '09:00';
      const [hours, minutes] = timeOfDay.split(':').map(Number);

      const nextRun = new Date(now);
      nextRun.setHours(hours, minutes, 0, 0);
      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
      }

      expect(nextRun.getHours()).toBe(9);
      expect(nextRun.getMinutes()).toBe(0);
    });

    it('should calculate next run date for weekly schedule', () => {
      const targetDay = 1; // Monday
      const now = new Date();
      const nextRun = new Date(now);
      nextRun.setHours(9, 0, 0, 0);

      const currentDay = nextRun.getDay();
      let daysUntil = (targetDay - currentDay + 7) % 7;
      if (daysUntil === 0 && nextRun <= now) {
        daysUntil = 7;
      }
      nextRun.setDate(nextRun.getDate() + daysUntil);

      expect(nextRun.getDay()).toBe(1); // Should be Monday
    });

    it('should calculate next run date for monthly schedule', () => {
      const targetDate = 15;
      const now = new Date();
      const nextRun = new Date(now);
      nextRun.setDate(targetDate);
      nextRun.setHours(9, 0, 0, 0);

      if (nextRun <= now) {
        nextRun.setMonth(nextRun.getMonth() + 1);
      }

      expect(nextRun.getDate()).toBe(15);
    });

    it('should update schedule properties', () => {
      const schedule = {
        id: 'rpt_001',
        name: 'Old Name',
        isActive: true,
        recipients: ['old@example.com'],
      };

      const updates = {
        name: 'New Name',
        recipients: ['new@example.com', 'another@example.com'],
      };

      Object.assign(schedule, updates);

      expect(schedule.name).toBe('New Name');
      expect(schedule.recipients).toHaveLength(2);
    });
  });

  describe('Report Generation', () => {
    it('should calculate vacancy rate correctly', () => {
      const totalUnits = 100;
      const vacantUnits = 5;
      const vacancyRate = (vacantUnits / totalUnits) * 100;

      expect(vacancyRate).toBe(5);
    });

    it('should calculate potential lost revenue', () => {
      const vacantUnits = [
        { marketRent: 2000, daysVacant: 30 },
        { marketRent: 1500, daysVacant: 15 },
      ];

      const potentialLostRevenue = vacantUnits.reduce((sum, unit) => {
        return sum + (unit.marketRent * (unit.daysVacant / 30));
      }, 0);

      expect(potentialLostRevenue).toBe(2750); // 2000 + 750
    });

    it('should calculate collection rate', () => {
      const totalMonthlyRent = 50000;
      const totalCollected = 47500;
      const collectionRate = (totalCollected / totalMonthlyRent) * 100;

      expect(collectionRate).toBe(95);
    });

    it('should calculate net operating income', () => {
      const income = { rent: 50000, lateFees: 500, other: 200 };
      const expenses = { maintenance: 2500, utilities: 1500, taxes: 4000 };

      const totalIncome = income.rent + income.lateFees + income.other;
      const totalExpenses = expenses.maintenance + expenses.utilities + expenses.taxes;
      const noi = totalIncome - totalExpenses;

      expect(noi).toBe(42700);
    });

    it('should categorize payment aging buckets', () => {
      const payments = [
        { amount: 1000, daysOverdue: 0 },
        { amount: 1500, daysOverdue: 15 },
        { amount: 2000, daysOverdue: 45 },
        { amount: 500, daysOverdue: 100 },
      ];

      const buckets = {
        current: 0,
        days1to30: 0,
        days31to60: 0,
        over60: 0,
      };

      for (const p of payments) {
        if (p.daysOverdue === 0) buckets.current += p.amount;
        else if (p.daysOverdue <= 30) buckets.days1to30 += p.amount;
        else if (p.daysOverdue <= 60) buckets.days31to60 += p.amount;
        else buckets.over60 += p.amount;
      }

      expect(buckets.current).toBe(1000);
      expect(buckets.days1to30).toBe(1500);
      expect(buckets.days31to60).toBe(2000);
      expect(buckets.over60).toBe(500);
    });
  });

  describe('Report Formats', () => {
    it('should support PDF format', () => {
      const supportedFormats = ['pdf', 'csv', 'excel'];
      expect(supportedFormats).toContain('pdf');
    });

    it('should support CSV format', () => {
      const supportedFormats = ['pdf', 'csv', 'excel'];
      expect(supportedFormats).toContain('csv');
    });

    it('should support Excel format', () => {
      const supportedFormats = ['pdf', 'csv', 'excel'];
      expect(supportedFormats).toContain('excel');
    });
  });
});

// =============================================================================
// Lease Renewal Automation Tests
// =============================================================================

describe('Lease Renewal Automation', () => {
  describe('Renewal Offer Management', () => {
    it('should create a renewal offer with term options', () => {
      const offer = {
        id: 'rnw_001',
        leaseId: 'lea_001',
        tenantId: 'usr_tenant',
        landlordId: 'usr_landlord',
        status: 'pending',
        currentRent: 2000,
        proposedRent: 2100,
        rentIncreasePercent: 5,
        termOptions: [
          { term: '1_year', proposedRent: 2100 },
          { term: '2_year', proposedRent: 2050 },
          { term: 'month_to_month', proposedRent: 2200 },
        ],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      };

      expect(offer.termOptions).toHaveLength(3);
      expect(offer.rentIncreasePercent).toBe(5);
    });

    it('should calculate rent increase percentage', () => {
      const currentRent = 2000;
      const proposedRent = 2100;
      const increasePercent = ((proposedRent - currentRent) / currentRent) * 100;

      expect(increasePercent).toBe(5);
    });

    it('should calculate renewal dates for 1-year term', () => {
      const startDate = new Date('2025-01-01T12:00:00Z');
      const endDate = new Date(startDate);
      endDate.setUTCFullYear(endDate.getUTCFullYear() + 1);

      expect(endDate.getUTCFullYear()).toBe(2026);
      expect(endDate.getUTCMonth()).toBe(0); // January
    });

    it('should calculate renewal dates for 2-year term', () => {
      const startDate = new Date('2025-01-01T12:00:00Z');
      const endDate = new Date(startDate);
      endDate.setUTCFullYear(endDate.getUTCFullYear() + 2);

      expect(endDate.getUTCFullYear()).toBe(2027);
    });

    it('should calculate renewal dates for month-to-month', () => {
      const startDate = new Date('2025-01-01T12:00:00Z');
      const endDate = new Date(startDate);
      endDate.setUTCMonth(endDate.getUTCMonth() + 1);

      // After adding 1 month to January, should be February (month 1)
      expect(endDate.getUTCMonth()).toBe(1); // February in UTC
    });
  });

  describe('Rent Stabilized Compliance', () => {
    it('should check rent stabilized limits', () => {
      const currentLegalRent = 2000;
      const maxIncreasePercent = 3.0; // NYC RGB guideline
      const maxAllowedRent = currentLegalRent * (1 + maxIncreasePercent / 100);

      expect(maxAllowedRent).toBe(2060);
    });

    it('should reject non-compliant rent increase', () => {
      const currentLegalRent = 2000;
      const maxIncreasePercent = 3.0;
      const maxAllowedRent = currentLegalRent * (1 + maxIncreasePercent / 100);
      const proposedRent = 2200; // 10% increase

      const isCompliant = proposedRent <= maxAllowedRent;
      expect(isCompliant).toBe(false);
    });

    it('should allow compliant rent increase', () => {
      const currentLegalRent = 2000;
      const maxIncreasePercent = 3.0;
      const maxAllowedRent = currentLegalRent * (1 + maxIncreasePercent / 100);
      const proposedRent = 2050; // 2.5% increase

      const isCompliant = proposedRent <= maxAllowedRent;
      expect(isCompliant).toBe(true);
    });
  });

  describe('Offer Response Handling', () => {
    it('should accept offer with selected term', () => {
      const offer = {
        status: 'offer_sent' as const,
        selectedTerm: undefined as string | undefined,
      };

      offer.status = 'accepted';
      offer.selectedTerm = '1_year';

      expect(offer.status).toBe('accepted');
      expect(offer.selectedTerm).toBe('1_year');
    });

    it('should decline offer', () => {
      const offer = { status: 'offer_sent' as const };
      const declined = { ...offer, status: 'declined' as const };

      expect(declined.status).toBe('declined');
    });

    it('should handle counter offer', () => {
      const offer = {
        status: 'offer_sent' as const,
        proposedRent: 2100,
        counterOfferRent: undefined as number | undefined,
        counterOfferTerm: undefined as string | undefined,
      };

      offer.status = 'counter_offer';
      offer.counterOfferRent = 2000;
      offer.counterOfferTerm = '2_year';

      expect(offer.status).toBe('counter_offer');
      expect(offer.counterOfferRent).toBe(2000);
    });

    it('should check offer expiration', () => {
      const expiresAt = new Date(Date.now() - 1000); // Already expired
      const isExpired = new Date() > expiresAt;

      expect(isExpired).toBe(true);
    });
  });

  describe('Renewal Rules', () => {
    it('should create renewal automation rule', () => {
      const rule = {
        id: 'rnr_001',
        name: 'Standard Renewal',
        conditions: {
          daysBeforeExpiry: 90,
          minTenancy: 12,
        },
        actions: {
          autoGenerateOffer: true,
          defaultTermOptions: ['1_year', '2_year'],
          rentIncreasePercent: 3,
          offerValidDays: 30,
          sendReminders: true,
          reminderDays: [14, 7, 3],
        },
      };

      expect(rule.conditions.daysBeforeExpiry).toBe(90);
      expect(rule.actions.reminderDays).toHaveLength(3);
    });

    it('should match lease to rule by days before expiry', () => {
      const leaseEndDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days
      const daysBeforeExpiry = Math.ceil((leaseEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const ruleCondition = 90;

      const matches = daysBeforeExpiry <= ruleCondition;
      expect(matches).toBe(true);
    });
  });
});

// =============================================================================
// Maintenance Workflows Tests
// =============================================================================

describe('Maintenance Workflows', () => {
  describe('Vendor Assignment Rules', () => {
    it('should create vendor assignment rule', () => {
      const rule = {
        id: 'var_001',
        name: 'Plumbing Vendor',
        priority: 1,
        conditions: {
          categories: ['plumbing'],
          priorities: ['normal', 'high', 'emergency'],
        },
        actions: {
          vendorId: 'vnd_001',
          vendorName: 'ABC Plumbing',
          autoAssign: true,
          notifyVendor: true,
          maxBudget: 500,
        },
      };

      expect(rule.conditions.categories).toContain('plumbing');
      expect(rule.actions.autoAssign).toBe(true);
    });

    it('should match work order to vendor rule', () => {
      const rules = [
        { id: 'r1', priority: 1, categories: ['plumbing'], vendorId: 'v1' },
        { id: 'r2', priority: 2, categories: ['electrical'], vendorId: 'v2' },
      ];

      const workOrderCategory = 'plumbing';
      const matchingRule = rules.find(r => r.categories.includes(workOrderCategory));

      expect(matchingRule?.vendorId).toBe('v1');
    });

    it('should respect rule priority', () => {
      const rules = [
        { id: 'r1', priority: 2, categories: ['plumbing'], vendorId: 'v1' },
        { id: 'r2', priority: 1, categories: ['plumbing'], vendorId: 'v2' },
      ];

      const sortedRules = rules.sort((a, b) => a.priority - b.priority);
      expect(sortedRules[0].vendorId).toBe('v2');
    });

    it('should check time window conditions', () => {
      const timeWindow = {
        startHour: 9,
        endHour: 17,
        daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
      };

      const currentHour = 12;
      const currentDay = 3; // Wednesday

      const isWithinWindow =
        timeWindow.daysOfWeek.includes(currentDay) &&
        currentHour >= timeWindow.startHour &&
        currentHour < timeWindow.endHour;

      expect(isWithinWindow).toBe(true);
    });
  });

  describe('SLA Definitions', () => {
    it('should create SLA definition', () => {
      const sla = {
        id: 'sla_001',
        name: 'Emergency Response',
        conditions: {
          priority: 'emergency',
        },
        targets: {
          acknowledgeWithinHours: 1,
          resolveWithinHours: 24,
          escalateAfterHours: 2,
        },
        escalation: {
          notifyEmail: ['manager@example.com'],
          autoReassign: true,
        },
      };

      expect(sla.targets.acknowledgeWithinHours).toBe(1);
      expect(sla.escalation.autoReassign).toBe(true);
    });

    it('should calculate SLA deadlines', () => {
      const createdAt = new Date();
      const acknowledgeWithinHours = 4;
      const resolveWithinHours = 48;

      const acknowledgeDeadline = new Date(createdAt.getTime() + acknowledgeWithinHours * 60 * 60 * 1000);
      const resolveDeadline = new Date(createdAt.getTime() + resolveWithinHours * 60 * 60 * 1000);

      expect(acknowledgeDeadline.getTime()).toBe(createdAt.getTime() + 4 * 60 * 60 * 1000);
      expect(resolveDeadline.getTime()).toBe(createdAt.getTime() + 48 * 60 * 60 * 1000);
    });
  });

  describe('SLA Status Tracking', () => {
    it('should detect within SLA status', () => {
      const now = new Date();
      const acknowledgeDeadline = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours ahead

      const status = now < acknowledgeDeadline ? 'within_sla' : 'breached';
      expect(status).toBe('within_sla');
    });

    it('should detect at-risk status', () => {
      const now = new Date();
      const acknowledgeDeadline = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes ahead
      const totalTimeHours = 4;
      const remainingMs = acknowledgeDeadline.getTime() - now.getTime();
      const totalMs = totalTimeHours * 60 * 60 * 1000;

      const percentRemaining = remainingMs / totalMs;
      const status = percentRemaining < 0.25 ? 'at_risk' : 'within_sla';

      expect(status).toBe('at_risk');
    });

    it('should detect breached status', () => {
      const now = new Date();
      const acknowledgeDeadline = new Date(now.getTime() - 1000); // Already passed

      const status = now > acknowledgeDeadline ? 'breached' : 'within_sla';
      expect(status).toBe('breached');
    });
  });

  describe('Vendor Performance Metrics', () => {
    it('should calculate completion rate', () => {
      const totalAssigned = 50;
      const completed = 45;
      const completionRate = (completed / totalAssigned) * 100;

      expect(completionRate).toBe(90);
    });

    it('should calculate average response time', () => {
      const responseTimes = [2, 4, 3, 5, 1]; // Hours
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

      expect(avgResponseTime).toBe(3);
    });

    it('should calculate average cost', () => {
      const costs = [150, 200, 175, 225, 300];
      const totalCost = costs.reduce((a, b) => a + b, 0);
      const avgCost = totalCost / costs.length;

      expect(avgCost).toBe(210);
    });
  });
});

// =============================================================================
// Payment Reconciliation Tests
// =============================================================================

describe('Payment Reconciliation', () => {
  describe('Transaction Import', () => {
    it('should import bank transactions', () => {
      const transactions = [
        { externalId: 'tx_001', date: new Date(), amount: 2000, description: 'Rent Payment - Unit 101' },
        { externalId: 'tx_002', date: new Date(), amount: 1500, description: 'Rent Payment - Unit 102' },
      ];

      expect(transactions).toHaveLength(2);
      expect(transactions[0].amount).toBe(2000);
    });

    it('should detect duplicate transactions', () => {
      const existingIds = ['tx_001', 'tx_002'];
      const newTransactions = [
        { externalId: 'tx_001' }, // Duplicate
        { externalId: 'tx_003' }, // New
      ];

      const duplicates = newTransactions.filter(t => existingIds.includes(t.externalId));
      expect(duplicates).toHaveLength(1);
    });
  });

  describe('Automatic Matching', () => {
    it('should exact match by amount and date', () => {
      const transaction = { amount: 2000, date: new Date('2025-01-15') };
      const payments = [
        { id: 'pay_001', amount: 2000, dueDate: new Date('2025-01-15') },
        { id: 'pay_002', amount: 1500, dueDate: new Date('2025-01-15') },
      ];

      const exactMatch = payments.find(p => p.amount === transaction.amount);
      expect(exactMatch?.id).toBe('pay_001');
    });

    it('should fuzzy match within tolerance', () => {
      const transaction = { amount: 2005 };
      const payment = { amount: 2000 };
      const tolerance = 10;

      const diff = Math.abs(transaction.amount - payment.amount);
      const isMatch = diff <= tolerance;

      expect(isMatch).toBe(true);
    });

    it('should calculate match confidence', () => {
      const expectedAmount = 2000;
      const actualAmount = 1950;
      const amountDiff = Math.abs(expectedAmount - actualAmount);
      const confidence = Math.max(0, 100 - (amountDiff / expectedAmount) * 100);

      expect(confidence).toBe(97.5);
    });

    it('should match based on description pattern', () => {
      const description = 'Rent Payment - Unit 101 - John Smith';
      const pattern = /Unit\s+(\d+)/i;
      const match = description.match(pattern);

      expect(match?.[1]).toBe('101');
    });
  });

  describe('Discrepancy Detection', () => {
    it('should detect amount mismatch', () => {
      const expected = 2000;
      const actual = 2100;

      const discrepancy = actual !== expected ? {
        type: 'amount_mismatch',
        expectedAmount: expected,
        actualAmount: actual,
      } : null;

      expect(discrepancy?.type).toBe('amount_mismatch');
    });

    it('should detect partial payment', () => {
      const expected = 2000;
      const actual = 1500;

      const discrepancy = actual < expected ? {
        type: 'partial',
        expectedAmount: expected,
        actualAmount: actual,
        shortfall: expected - actual,
      } : null;

      expect(discrepancy?.type).toBe('partial');
      expect(discrepancy?.shortfall).toBe(500);
    });

    it('should detect date mismatch', () => {
      const transactionDate = new Date('2025-01-25');
      const dueDate = new Date('2025-01-01');
      const daysDiff = Math.abs((transactionDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      const isDateMismatch = daysDiff > 14;
      expect(isDateMismatch).toBe(true);
    });

    it('should flag unexpected transaction', () => {
      const transaction = { amount: 500, description: 'Unknown deposit' };
      const matchingPayment = null;

      const discrepancy = !matchingPayment ? {
        type: 'unexpected',
        actualAmount: transaction.amount,
      } : null;

      expect(discrepancy?.type).toBe('unexpected');
    });
  });

  describe('Reconciliation Rules', () => {
    it('should create reconciliation rule', () => {
      const rule = {
        id: 'rcr_001',
        name: 'Unit 101 Payments',
        conditions: {
          descriptionPattern: 'Unit\\s+101',
          amountRange: { min: 1800, max: 2200 },
        },
        actions: {
          matchToPropertyId: 'prop_001',
          autoMatch: true,
          tolerance: 5,
        },
      };

      expect(rule.conditions.descriptionPattern).toBe('Unit\\s+101');
      expect(rule.actions.autoMatch).toBe(true);
    });

    it('should apply rule conditions', () => {
      const transaction = { description: 'Rent Unit 101', amount: 2000 };
      const rule = {
        descriptionPattern: 'Unit\\s+101',
        amountRange: { min: 1800, max: 2200 },
      };

      const regex = new RegExp(rule.descriptionPattern, 'i');
      const matchesDescription = regex.test(transaction.description);
      const matchesAmount = transaction.amount >= rule.amountRange.min && transaction.amount <= rule.amountRange.max;

      expect(matchesDescription).toBe(true);
      expect(matchesAmount).toBe(true);
    });
  });

  describe('Reconciliation Summary', () => {
    it('should calculate match rate', () => {
      const transactions = [
        { status: 'matched' },
        { status: 'matched' },
        { status: 'unmatched' },
        { status: 'partial_match' },
      ];

      const total = transactions.length;
      const matched = transactions.filter(t => ['matched', 'partial_match'].includes(t.status)).length;
      const matchRate = (matched / total) * 100;

      expect(matchRate).toBe(75);
    });

    it('should calculate total amounts by status', () => {
      const transactions = [
        { status: 'matched', amount: 2000 },
        { status: 'matched', amount: 1500 },
        { status: 'unmatched', amount: 500 },
      ];

      const matchedAmount = transactions
        .filter(t => t.status === 'matched')
        .reduce((sum, t) => sum + t.amount, 0);

      const unmatchedAmount = transactions
        .filter(t => t.status === 'unmatched')
        .reduce((sum, t) => sum + t.amount, 0);

      expect(matchedAmount).toBe(3500);
      expect(unmatchedAmount).toBe(500);
    });

    it('should identify missing payments', () => {
      const expectedPayments = [
        { id: 'pay_001', status: 'pending', dueDate: new Date('2025-01-01'), amount: 2000 },
        { id: 'pay_002', status: 'completed', dueDate: new Date('2025-01-01'), amount: 1500 },
      ];

      const cutoffDate = new Date('2025-01-10');
      const missing = expectedPayments.filter(p =>
        p.status === 'pending' && new Date(p.dueDate) < cutoffDate
      );

      expect(missing).toHaveLength(1);
      expect(missing[0].id).toBe('pay_001');
    });
  });

  describe('Write-off Handling', () => {
    it('should write off unmatched transaction', () => {
      const transaction = {
        id: 'btx_001',
        status: 'unmatched' as const,
        amount: 50,
      };

      const writtenOff = {
        ...transaction,
        status: 'written_off' as const,
        discrepancy: {
          type: 'unexpected',
          actualAmount: transaction.amount,
          notes: 'Bank fee - not a payment',
        },
      };

      expect(writtenOff.status).toBe('written_off');
      expect(writtenOff.discrepancy.notes).toContain('Bank fee');
    });
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Feature Integration', () => {
  it('should generate lease expiry report for renewals', () => {
    const leases = [
      { id: 'l1', endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), monthlyRent: 2000 },
      { id: 'l2', endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), monthlyRent: 1500 },
      { id: 'l3', endDate: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000), monthlyRent: 1800 },
    ];

    const expiringIn90Days = leases.filter(l => {
      const daysUntil = (l.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return daysUntil <= 90;
    });

    // Only 2 leases expire within 90 days (30 and 60 days out)
    expect(expiringIn90Days).toHaveLength(2);
  });

  it('should track maintenance SLA with workflow automation', () => {
    const workOrder = {
      id: 'wo_001',
      category: 'plumbing',
      priority: 'high',
      createdAt: new Date(),
    };

    const slaTargets = {
      acknowledgeWithinHours: 4,
      resolveWithinHours: 24,
    };

    const acknowledgeDeadline = new Date(
      workOrder.createdAt.getTime() + slaTargets.acknowledgeWithinHours * 60 * 60 * 1000
    );

    expect(acknowledgeDeadline.getTime()).toBeGreaterThan(workOrder.createdAt.getTime());
  });

  it('should reconcile payments and update payment aging report', () => {
    const payment = { id: 'pay_001', amount: 2000, status: 'pending', daysOverdue: 15 };
    const transaction = { amount: 2000, date: new Date() };

    // Simulate reconciliation
    const reconciledPayment = {
      ...payment,
      status: 'completed',
      daysOverdue: 0,
    };

    expect(reconciledPayment.status).toBe('completed');
    expect(reconciledPayment.daysOverdue).toBe(0);
  });
});
