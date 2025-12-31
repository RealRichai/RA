import { describe, it, expect, beforeEach } from 'vitest';

// Import stores for cleanup
import {
  schedules,
  charges,
  paymentMethods,
  calculateLateFee,
  calculateNextChargeDate,
  type LateFeeConfig,
} from '../src/modules/payments/rent-collection';

import {
  inspections,
  templates as inspectionTemplates,
  calculateOverallCondition,
  generateSummary,
  type InspectionItem,
  type InspectionRoom,
} from '../src/modules/inspections/routes';

import {
  vendors,
  workOrders,
  invoices,
  ratings,
  findBestVendor,
} from '../src/modules/vendors/routes';

import {
  templates as leaseTemplates,
  clauses,
  generatedLeases,
  interpolateVariables,
  evaluateCondition,
  shouldIncludeClause,
  type ClauseCondition,
  type TemplateClause,
} from '../src/modules/leases/templates';

// Portfolio Dashboard imports
import {
  properties as portfolioProperties,
  occupancyHistory,
  revenueHistory,
  calculateNOI,
  calculateCapRate,
  calculateCashOnCash,
  calculateLTV,
  calculateTrend,
} from '../src/modules/portfolio/routes';

// Applicant Screening imports
import {
  applications,
  screeningCriteria,
  calculateApplicantScore,
  determineRiskLevel,
  generateRiskFactors,
  generateMockCreditReport,
  generateMockCriminalReport,
  generateMockEvictionReport,
  type Applicant,
  type ScreeningCriteria,
} from '../src/modules/screening/routes';

// Communication Hub imports
import {
  threads,
  messages,
  smsMessages,
  templates as messageTemplates,
  broadcasts,
  extractVariables,
  interpolateTemplate,
  truncatePreview,
} from '../src/modules/communications/routes';

// Insurance Tracking imports
import {
  policies,
  certificates,
  claims,
  alerts,
  daysUntil,
  createExpirationAlert,
  analyzeCoverage,
  type InsurancePolicy,
} from '../src/modules/insurance/routes';

describe('Automated Rent Collection', () => {
  beforeEach(() => {
    schedules.clear();
    charges.clear();
    paymentMethods.clear();
  });

  describe('calculateNextChargeDate', () => {
    it('should calculate next charge date for future day of month', () => {
      const now = new Date();
      const futureDay = 28;
      const result = calculateNextChargeDate(futureDay);

      expect(result.getDate()).toBe(futureDay);
      expect(result >= now).toBe(true);
    });

    it('should roll to next month if day has passed', () => {
      const result = calculateNextChargeDate(1);
      const now = new Date();

      if (now.getDate() > 1) {
        expect(result.getMonth()).toBe((now.getMonth() + 1) % 12);
      }
    });
  });

  describe('calculateLateFee', () => {
    it('should return 0 if within grace period', () => {
      const config: LateFeeConfig = {
        type: 'flat',
        amount: 50,
        maxAmount: null,
        startAfterDays: 5,
      };

      expect(calculateLateFee(config, 1000, 3)).toBe(0);
      expect(calculateLateFee(config, 1000, 4)).toBe(0);
    });

    it('should calculate flat late fee', () => {
      const config: LateFeeConfig = {
        type: 'flat',
        amount: 50,
        maxAmount: null,
        startAfterDays: 5,
      };

      expect(calculateLateFee(config, 1000, 5)).toBe(50);
      expect(calculateLateFee(config, 2000, 10)).toBe(50);
    });

    it('should calculate percentage late fee', () => {
      const config: LateFeeConfig = {
        type: 'percentage',
        amount: 5,
        maxAmount: null,
        startAfterDays: 5,
      };

      expect(calculateLateFee(config, 1000, 5)).toBe(50);
      expect(calculateLateFee(config, 2000, 10)).toBe(100);
    });

    it('should calculate daily late fee', () => {
      const config: LateFeeConfig = {
        type: 'daily',
        amount: 10,
        maxAmount: null,
        startAfterDays: 5,
      };

      expect(calculateLateFee(config, 1000, 5)).toBe(10);
      expect(calculateLateFee(config, 1000, 7)).toBe(30);
      expect(calculateLateFee(config, 1000, 10)).toBe(60);
    });

    it('should respect max amount', () => {
      const config: LateFeeConfig = {
        type: 'daily',
        amount: 20,
        maxAmount: 100,
        startAfterDays: 5,
      };

      expect(calculateLateFee(config, 1000, 15)).toBe(100);
    });

    it('should calculate tiered late fee', () => {
      const config: LateFeeConfig = {
        type: 'tiered',
        amount: 0,
        maxAmount: null,
        startAfterDays: 5,
        tiers: [
          { days: 1, amount: 25 },
          { days: 7, amount: 50 },
          { days: 14, amount: 100 },
        ],
      };

      expect(calculateLateFee(config, 1000, 5)).toBe(25);
      expect(calculateLateFee(config, 1000, 11)).toBe(50);
      expect(calculateLateFee(config, 1000, 20)).toBe(100);
    });
  });

  describe('Payment Schedule Management', () => {
    it('should create schedule with correct properties', () => {
      const id = `${Date.now()}-test`;
      schedules.set(id, {
        id,
        leaseId: 'lease-1',
        tenantId: 'tenant-1',
        propertyId: 'prop-1',
        amount: 1500,
        currency: 'USD',
        dayOfMonth: 1,
        gracePeriodDays: 5,
        paymentMethod: 'ach',
        paymentMethodId: null,
        autoCharge: true,
        status: 'active',
        nextChargeDate: new Date(),
        lastChargeDate: null,
        lateFeeConfig: {
          type: 'flat',
          amount: 50,
          maxAmount: null,
          startAfterDays: 5,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(schedules.size).toBe(1);
      const schedule = schedules.get(id);
      expect(schedule?.amount).toBe(1500);
      expect(schedule?.autoCharge).toBe(true);
    });

    it('should track multiple schedules per property', () => {
      const propertyId = 'prop-1';

      schedules.set('sched-1', {
        id: 'sched-1',
        leaseId: 'lease-1',
        tenantId: 'tenant-1',
        propertyId,
        amount: 1500,
        currency: 'USD',
        dayOfMonth: 1,
        gracePeriodDays: 5,
        paymentMethod: 'ach',
        paymentMethodId: null,
        autoCharge: true,
        status: 'active',
        nextChargeDate: new Date(),
        lastChargeDate: null,
        lateFeeConfig: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      schedules.set('sched-2', {
        id: 'sched-2',
        leaseId: 'lease-2',
        tenantId: 'tenant-2',
        propertyId,
        amount: 2000,
        currency: 'USD',
        dayOfMonth: 15,
        gracePeriodDays: 5,
        paymentMethod: 'credit_card',
        paymentMethodId: null,
        autoCharge: false,
        status: 'active',
        nextChargeDate: new Date(),
        lastChargeDate: null,
        lateFeeConfig: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const propertySchedules = Array.from(schedules.values()).filter(
        (s) => s.propertyId === propertyId
      );
      expect(propertySchedules.length).toBe(2);
    });
  });

  describe('Charge Tracking', () => {
    it('should track charge with late fee', () => {
      charges.set('charge-1', {
        id: 'charge-1',
        scheduleId: 'sched-1',
        leaseId: 'lease-1',
        tenantId: 'tenant-1',
        amount: 1500,
        lateFee: 50,
        totalAmount: 1550,
        dueDate: new Date(),
        chargeDate: new Date(),
        status: 'succeeded',
        paymentIntentId: 'pi_123',
        failureReason: null,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const charge = charges.get('charge-1');
      expect(charge?.totalAmount).toBe(1550);
      expect(charge?.lateFee).toBe(50);
    });

    it('should track failed charges for retry', () => {
      charges.set('charge-failed', {
        id: 'charge-failed',
        scheduleId: 'sched-1',
        leaseId: 'lease-1',
        tenantId: 'tenant-1',
        amount: 1500,
        lateFee: 0,
        totalAmount: 1500,
        dueDate: new Date(),
        chargeDate: null,
        status: 'failed',
        paymentIntentId: null,
        failureReason: 'Insufficient funds',
        retryCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const failedCharges = Array.from(charges.values()).filter(
        (c) => c.status === 'failed'
      );
      expect(failedCharges.length).toBe(1);
      expect(failedCharges[0].failureReason).toBe('Insufficient funds');
    });
  });

  describe('Payment Methods', () => {
    it('should store tenant payment method', () => {
      paymentMethods.set('pm-1', {
        id: 'pm-1',
        tenantId: 'tenant-1',
        type: 'ach',
        provider: 'plaid',
        last4: '1234',
        bankName: 'Chase',
        accountType: 'checking',
        isDefault: true,
        isVerified: true,
        stripePaymentMethodId: null,
        plaidAccountId: 'acct_123',
        createdAt: new Date(),
      });

      const pm = paymentMethods.get('pm-1');
      expect(pm?.type).toBe('ach');
      expect(pm?.isDefault).toBe(true);
    });
  });
});

describe('Inspection Scheduling', () => {
  beforeEach(() => {
    inspections.clear();
  });

  describe('calculateOverallCondition', () => {
    it('should return good for empty items', () => {
      expect(calculateOverallCondition([])).toBe('good');
    });

    it('should calculate average condition', () => {
      const items: InspectionItem[] = [
        { id: '1', roomId: 'r1', name: 'Item 1', description: null, condition: 'excellent', previousCondition: null, notes: null, requiresRepair: false, estimatedRepairCost: null, photos: [] },
        { id: '2', roomId: 'r1', name: 'Item 2', description: null, condition: 'good', previousCondition: null, notes: null, requiresRepair: false, estimatedRepairCost: null, photos: [] },
        { id: '3', roomId: 'r1', name: 'Item 3', description: null, condition: 'fair', previousCondition: null, notes: null, requiresRepair: false, estimatedRepairCost: null, photos: [] },
      ];

      expect(calculateOverallCondition(items)).toBe('good');
    });

    it('should reflect poor condition items', () => {
      const items: InspectionItem[] = [
        { id: '1', roomId: 'r1', name: 'Item 1', description: null, condition: 'poor', previousCondition: null, notes: null, requiresRepair: true, estimatedRepairCost: 100, photos: [] },
        { id: '2', roomId: 'r1', name: 'Item 2', description: null, condition: 'damaged', previousCondition: null, notes: null, requiresRepair: true, estimatedRepairCost: 200, photos: [] },
      ];

      expect(calculateOverallCondition(items)).toBe('poor');
    });
  });

  describe('generateSummary', () => {
    it('should generate accurate summary', () => {
      const rooms: InspectionRoom[] = [
        {
          id: 'room-1',
          inspectionId: 'insp-1',
          roomType: 'living_room',
          roomName: 'Living Room',
          items: [
            { id: '1', roomId: 'room-1', name: 'Walls', description: null, condition: 'good', previousCondition: null, notes: null, requiresRepair: false, estimatedRepairCost: null, photos: [] },
            { id: '2', roomId: 'room-1', name: 'Floor', description: null, condition: 'damaged', previousCondition: null, notes: null, requiresRepair: true, estimatedRepairCost: 500, photos: [] },
          ],
          photos: [],
          overallCondition: 'fair',
          notes: null,
        },
        {
          id: 'room-2',
          inspectionId: 'insp-1',
          roomType: 'kitchen',
          roomName: 'Kitchen',
          items: [
            { id: '3', roomId: 'room-2', name: 'Sink', description: null, condition: 'excellent', previousCondition: null, notes: null, requiresRepair: false, estimatedRepairCost: null, photos: [] },
          ],
          photos: [],
          overallCondition: 'excellent',
          notes: null,
        },
      ];

      const summary = generateSummary(rooms);

      expect(summary.totalRooms).toBe(2);
      expect(summary.totalItems).toBe(3);
      expect(summary.itemsRequiringRepair).toBe(1);
      expect(summary.estimatedTotalRepairCost).toBe(500);
      expect(summary.conditionBreakdown.damaged).toBe(1);
      expect(summary.conditionBreakdown.good).toBe(1);
      expect(summary.conditionBreakdown.excellent).toBe(1);
    });

    it('should generate recommendations for damaged items', () => {
      const rooms: InspectionRoom[] = [
        {
          id: 'room-1',
          inspectionId: 'insp-1',
          roomType: 'bathroom',
          roomName: 'Bathroom',
          items: [
            { id: '1', roomId: 'room-1', name: 'Toilet', description: null, condition: 'damaged', previousCondition: null, notes: null, requiresRepair: true, estimatedRepairCost: 200, photos: [] },
            { id: '2', roomId: 'room-1', name: 'Sink', description: null, condition: 'missing', previousCondition: null, notes: null, requiresRepair: true, estimatedRepairCost: 300, photos: [] },
          ],
          photos: [],
          overallCondition: 'damaged',
          notes: null,
        },
      ];

      const summary = generateSummary(rooms);

      expect(summary.recommendations.length).toBeGreaterThan(0);
      expect(summary.recommendations.some((r) => r.includes('damage'))).toBe(true);
      expect(summary.recommendations.some((r) => r.includes('missing'))).toBe(true);
    });
  });

  describe('Inspection Management', () => {
    it('should create inspection with template rooms', () => {
      const now = new Date();
      inspections.set('insp-1', {
        id: 'insp-1',
        propertyId: 'prop-1',
        unitId: 'unit-1',
        leaseId: 'lease-1',
        tenantId: 'tenant-1',
        type: 'move_in',
        status: 'scheduled',
        scheduledDate: now,
        completedDate: null,
        inspectorId: 'user-1',
        inspectorName: 'John Inspector',
        notes: null,
        tenantPresent: null,
        tenantSignature: null,
        inspectorSignature: null,
        rooms: [
          {
            id: 'room-1',
            inspectionId: 'insp-1',
            roomType: 'living_room',
            roomName: 'Living Room',
            items: [],
            photos: [],
            overallCondition: null,
            notes: null,
          },
        ],
        summary: null,
        createdAt: now,
        updatedAt: now,
      });

      const inspection = inspections.get('insp-1');
      expect(inspection?.rooms.length).toBe(1);
      expect(inspection?.type).toBe('move_in');
    });

    it('should track inspection status transitions', () => {
      const inspection = inspections.get('insp-1') || {
        id: 'insp-2',
        propertyId: 'prop-1',
        unitId: null,
        leaseId: null,
        tenantId: null,
        type: 'routine' as const,
        status: 'scheduled' as const,
        scheduledDate: new Date(),
        completedDate: null,
        inspectorId: 'user-1',
        inspectorName: 'Jane',
        notes: null,
        tenantPresent: null,
        tenantSignature: null,
        inspectorSignature: null,
        rooms: [],
        summary: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      inspections.set(inspection.id, inspection);

      // Transition to in_progress
      inspection.status = 'in_progress';
      inspections.set(inspection.id, inspection);
      expect(inspections.get(inspection.id)?.status).toBe('in_progress');

      // Transition to completed
      inspection.status = 'completed';
      inspection.completedDate = new Date();
      inspections.set(inspection.id, inspection);
      expect(inspections.get(inspection.id)?.status).toBe('completed');
    });
  });

  describe('Inspection Templates', () => {
    it('should have default apartment template', () => {
      const defaultTemplate = Array.from(inspectionTemplates.values()).find(
        (t) => t.isDefault && t.propertyType === 'apartment'
      );

      expect(defaultTemplate).toBeDefined();
      expect(defaultTemplate?.rooms.length).toBeGreaterThan(0);
    });
  });
});

describe('Vendor Management', () => {
  beforeEach(() => {
    vendors.clear();
    workOrders.clear();
    invoices.clear();
    ratings.clear();
  });

  describe('Vendor Creation', () => {
    it('should create vendor with categories', () => {
      const now = new Date();
      vendors.set('vendor-1', {
        id: 'vendor-1',
        name: 'Bob Plumber',
        companyName: 'Bob\'s Plumbing',
        email: 'bob@plumbing.com',
        phone: '555-1234',
        address: '123 Main St',
        categories: ['plumbing', 'hvac'],
        status: 'active',
        licenseNumber: 'PLB-12345',
        licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        insuranceProvider: 'InsureCo',
        insuranceExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        w9OnFile: true,
        hourlyRate: 75,
        emergencyRate: 150,
        notes: null,
        rating: 4.5,
        totalJobs: 50,
        completedJobs: 48,
        averageResponseTime: 2,
        preferredProperties: [],
        createdAt: now,
        updatedAt: now,
      });

      const vendor = vendors.get('vendor-1');
      expect(vendor?.categories).toContain('plumbing');
      expect(vendor?.rating).toBe(4.5);
    });
  });

  describe('findBestVendor', () => {
    beforeEach(() => {
      // Add test vendors
      vendors.set('v1', {
        id: 'v1',
        name: 'Best Plumber',
        companyName: null,
        email: 'best@plumber.com',
        phone: '555-0001',
        address: null,
        categories: ['plumbing'],
        status: 'active',
        licenseNumber: null,
        licenseExpiry: null,
        insuranceProvider: null,
        insuranceExpiry: null,
        w9OnFile: false,
        hourlyRate: 80,
        emergencyRate: 160,
        notes: null,
        rating: 4.8,
        totalJobs: 100,
        completedJobs: 95,
        averageResponseTime: 1,
        preferredProperties: ['prop-1'],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vendors.set('v2', {
        id: 'v2',
        name: 'Average Plumber',
        companyName: null,
        email: 'avg@plumber.com',
        phone: '555-0002',
        address: null,
        categories: ['plumbing'],
        status: 'active',
        licenseNumber: null,
        licenseExpiry: null,
        insuranceProvider: null,
        insuranceExpiry: null,
        w9OnFile: false,
        hourlyRate: 60,
        emergencyRate: null,
        notes: null,
        rating: 3.5,
        totalJobs: 20,
        completedJobs: 18,
        averageResponseTime: 4,
        preferredProperties: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vendors.set('v3', {
        id: 'v3',
        name: 'Inactive Plumber',
        companyName: null,
        email: 'inactive@plumber.com',
        phone: '555-0003',
        address: null,
        categories: ['plumbing'],
        status: 'inactive',
        licenseNumber: null,
        licenseExpiry: null,
        insuranceProvider: null,
        insuranceExpiry: null,
        w9OnFile: false,
        hourlyRate: 50,
        emergencyRate: null,
        notes: null,
        rating: 4.9,
        totalJobs: 200,
        completedJobs: 198,
        averageResponseTime: 0.5,
        preferredProperties: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('should find best vendor by rating and score', () => {
      const best = findBestVendor('plumbing', 'prop-1', 'medium');

      expect(best).not.toBeNull();
      expect(best?.id).toBe('v1');
    });

    it('should exclude inactive vendors', () => {
      const best = findBestVendor('plumbing', 'prop-2', 'medium');

      expect(best?.status).toBe('active');
    });

    it('should return null for no matching category', () => {
      const best = findBestVendor('roofing', 'prop-1', 'medium');

      expect(best).toBeNull();
    });

    it('should prefer vendors with emergency rate for emergencies', () => {
      const best = findBestVendor('plumbing', 'prop-2', 'emergency');

      expect(best?.emergencyRate).not.toBeNull();
    });
  });

  describe('Work Order Management', () => {
    it('should create work order with correct status', () => {
      workOrders.set('wo-1', {
        id: 'wo-1',
        propertyId: 'prop-1',
        unitId: 'unit-1',
        vendorId: null,
        maintenanceRequestId: 'maint-1',
        title: 'Fix leaky faucet',
        description: 'Kitchen faucet is dripping',
        category: 'plumbing',
        priority: 'medium',
        status: 'pending',
        scheduledDate: null,
        startedAt: null,
        completedAt: null,
        estimatedCost: 150,
        actualCost: null,
        laborHours: null,
        materialsCost: null,
        notes: null,
        photos: [],
        tenantNotified: false,
        tenantAvailability: 'Weekdays 9-5',
        accessInstructions: 'Key under mat',
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const wo = workOrders.get('wo-1');
      expect(wo?.status).toBe('pending');
      expect(wo?.priority).toBe('medium');
    });

    it('should track work order lifecycle', () => {
      const wo = {
        id: 'wo-2',
        propertyId: 'prop-1',
        unitId: null,
        vendorId: 'vendor-1',
        maintenanceRequestId: null,
        title: 'HVAC repair',
        description: 'AC not cooling',
        category: 'hvac' as const,
        priority: 'high' as const,
        status: 'assigned' as const,
        scheduledDate: new Date(),
        startedAt: null,
        completedAt: null,
        estimatedCost: 500,
        actualCost: null,
        laborHours: null,
        materialsCost: null,
        notes: null,
        photos: [],
        tenantNotified: true,
        tenantAvailability: null,
        accessInstructions: null,
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      workOrders.set(wo.id, wo);

      // Accept
      wo.status = 'accepted';
      workOrders.set(wo.id, wo);
      expect(workOrders.get(wo.id)?.status).toBe('accepted');

      // Start
      wo.status = 'in_progress';
      wo.startedAt = new Date();
      workOrders.set(wo.id, wo);
      expect(workOrders.get(wo.id)?.startedAt).not.toBeNull();

      // Complete
      wo.status = 'completed';
      wo.completedAt = new Date();
      wo.actualCost = 450;
      wo.laborHours = 3;
      workOrders.set(wo.id, wo);
      expect(workOrders.get(wo.id)?.status).toBe('completed');
      expect(workOrders.get(wo.id)?.actualCost).toBe(450);
    });
  });

  describe('Invoice Management', () => {
    it('should calculate invoice totals correctly', () => {
      const lineItems = [
        { description: 'Labor', quantity: 3, unitPrice: 75, total: 225, type: 'labor' as const },
        { description: 'Parts', quantity: 1, unitPrice: 50, total: 50, type: 'materials' as const },
      ];

      const laborAmount = lineItems.filter((i) => i.type === 'labor').reduce((sum, i) => sum + i.total, 0);
      const materialsAmount = lineItems.filter((i) => i.type === 'materials').reduce((sum, i) => sum + i.total, 0);
      const subtotal = lineItems.reduce((sum, i) => sum + i.total, 0);
      const taxAmount = subtotal * 0.08;
      const totalAmount = subtotal + taxAmount;

      expect(laborAmount).toBe(225);
      expect(materialsAmount).toBe(50);
      expect(subtotal).toBe(275);
      expect(taxAmount).toBe(22);
      expect(totalAmount).toBe(297);
    });

    it('should track invoice status', () => {
      invoices.set('inv-1', {
        id: 'inv-1',
        vendorId: 'vendor-1',
        workOrderId: 'wo-1',
        invoiceNumber: 'INV-001',
        amount: 300,
        laborAmount: 225,
        materialsAmount: 50,
        taxAmount: 25,
        description: 'Plumbing repair',
        lineItems: [],
        status: 'submitted',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        paidDate: null,
        paymentMethod: null,
        paymentReference: null,
        attachments: [],
        notes: null,
        submittedAt: new Date(),
        approvedAt: null,
        approvedById: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const inv = invoices.get('inv-1');
      expect(inv?.status).toBe('submitted');

      // Approve
      inv!.status = 'approved';
      inv!.approvedAt = new Date();
      inv!.approvedById = 'admin-1';
      invoices.set('inv-1', inv!);
      expect(invoices.get('inv-1')?.status).toBe('approved');
    });
  });

  describe('Vendor Ratings', () => {
    it('should track vendor ratings', () => {
      ratings.set('rating-1', {
        id: 'rating-1',
        vendorId: 'vendor-1',
        workOrderId: 'wo-1',
        rating: 5,
        qualityScore: 5,
        timelinessScore: 4,
        communicationScore: 5,
        valueScore: 4,
        comment: 'Excellent work!',
        ratedById: 'user-1',
        createdAt: new Date(),
      });

      const vendorRatings = Array.from(ratings.values()).filter(
        (r) => r.vendorId === 'vendor-1'
      );
      expect(vendorRatings.length).toBe(1);
      expect(vendorRatings[0].rating).toBe(5);
    });

    it('should calculate average rating', () => {
      const vendorRatings = [
        { rating: 5 },
        { rating: 4 },
        { rating: 5 },
        { rating: 3 },
      ];

      const avgRating = vendorRatings.reduce((sum, r) => sum + r.rating, 0) / vendorRatings.length;
      expect(avgRating).toBe(4.25);
    });
  });
});

describe('Lease Templates', () => {
  beforeEach(() => {
    generatedLeases.clear();
  });

  describe('interpolateVariables', () => {
    it('should replace simple variables', () => {
      const content = 'Hello {{name}}, your rent is {{rent}}.';
      const variables = { name: 'John', rent: 1500 };

      const result = interpolateVariables(content, variables);

      expect(result).toBe('Hello John, your rent is $1,500.00.');
    });

    it('should handle currency amounts', () => {
      const content = 'Security deposit: {{security_deposit_amount}}';
      const variables = { security_deposit_amount: 2500 };

      const result = interpolateVariables(content, variables);

      expect(result).toContain('$2,500.00');
    });

    it('should handle dates', () => {
      const content = 'Lease starts on {{lease_start_date}}';
      const date = new Date('2024-01-15T12:00:00Z');
      const variables = { lease_start_date: date };

      const result = interpolateVariables(content, variables);

      expect(result).toContain('January');
      expect(result).toContain('2024');
      // Date may vary by timezone, just check it's a valid date format
      expect(result).toMatch(/January \d+, 2024/);
    });

    it('should handle boolean values', () => {
      const content = 'Pets allowed: {{pets_allowed}}';
      const variables = { pets_allowed: true };

      const result = interpolateVariables(content, variables);

      expect(result).toBe('Pets allowed: Yes');
    });

    it('should handle variables with spaces', () => {
      const content = 'Tenant: {{ tenant_name }}';
      const variables = { tenant_name: 'Jane Doe' };

      const result = interpolateVariables(content, variables);

      expect(result).toBe('Tenant: Jane Doe');
    });
  });

  describe('evaluateCondition', () => {
    it('should evaluate equals condition', () => {
      const condition: ClauseCondition = { field: 'property_type', operator: 'equals', value: 'apartment' };
      const variables = { property_type: 'apartment' };

      expect(evaluateCondition(condition, variables)).toBe(true);
    });

    it('should evaluate not_equals condition', () => {
      const condition: ClauseCondition = { field: 'state', operator: 'not_equals', value: 'NY' };
      const variables = { state: 'CA' };

      expect(evaluateCondition(condition, variables)).toBe(true);
    });

    it('should evaluate contains condition', () => {
      const condition: ClauseCondition = { field: 'address', operator: 'contains', value: 'NYC' };
      const variables = { address: '123 Main St, NYC, NY 10001' };

      expect(evaluateCondition(condition, variables)).toBe(true);
    });

    it('should evaluate greater_than condition', () => {
      const condition: ClauseCondition = { field: 'rent', operator: 'greater_than', value: 1000 };
      const variables = { rent: 1500 };

      expect(evaluateCondition(condition, variables)).toBe(true);
    });

    it('should evaluate less_than condition', () => {
      const condition: ClauseCondition = { field: 'bedrooms', operator: 'less_than', value: 3 };
      const variables = { bedrooms: 2 };

      expect(evaluateCondition(condition, variables)).toBe(true);
    });

    it('should evaluate is_true condition', () => {
      const condition: ClauseCondition = { field: 'has_pets', operator: 'is_true', value: true };
      const variables = { has_pets: true };

      expect(evaluateCondition(condition, variables)).toBe(true);
    });

    it('should evaluate is_false condition', () => {
      const condition: ClauseCondition = { field: 'smoking_allowed', operator: 'is_false', value: false };
      const variables = { smoking_allowed: false };

      expect(evaluateCondition(condition, variables)).toBe(true);
    });

    it('should return false for missing variable', () => {
      const condition: ClauseCondition = { field: 'missing_field', operator: 'equals', value: 'test' };
      const variables = {};

      expect(evaluateCondition(condition, variables)).toBe(false);
    });
  });

  describe('shouldIncludeClause', () => {
    it('should include clause with no conditions', () => {
      const templateClause: TemplateClause = {
        id: 'tc-1',
        templateId: 't-1',
        clauseId: 'c-1',
        order: 0,
        isRequired: false,
        customContent: null,
        conditions: [],
      };

      expect(shouldIncludeClause(templateClause, {})).toBe(true);
    });

    it('should include clause when all conditions are met', () => {
      const templateClause: TemplateClause = {
        id: 'tc-2',
        templateId: 't-1',
        clauseId: 'c-2',
        order: 1,
        isRequired: false,
        customContent: null,
        conditions: [
          { field: 'has_pets', operator: 'is_true', value: true },
          { field: 'pet_count', operator: 'greater_than', value: 0 },
        ],
      };

      const variables = { has_pets: true, pet_count: 2 };

      expect(shouldIncludeClause(templateClause, variables)).toBe(true);
    });

    it('should exclude clause when any condition is not met', () => {
      const templateClause: TemplateClause = {
        id: 'tc-3',
        templateId: 't-1',
        clauseId: 'c-3',
        order: 2,
        isRequired: false,
        customContent: null,
        conditions: [
          { field: 'has_pets', operator: 'is_true', value: true },
          { field: 'pet_count', operator: 'greater_than', value: 0 },
        ],
      };

      const variables = { has_pets: false, pet_count: 0 };

      expect(shouldIncludeClause(templateClause, variables)).toBe(false);
    });
  });

  describe('Clause Library', () => {
    it('should have default clauses', () => {
      expect(clauses.size).toBeGreaterThan(0);
    });

    it('should have required clauses', () => {
      const requiredClauses = Array.from(clauses.values()).filter(
        (c) => c.requirement === 'required'
      );

      expect(requiredClauses.length).toBeGreaterThan(0);
    });

    it('should have jurisdiction-specific clauses', () => {
      const nycClauses = Array.from(clauses.values()).filter(
        (c) => c.jurisdiction === 'NYC'
      );

      expect(nycClauses.length).toBeGreaterThan(0);
    });

    it('should track clause variables', () => {
      const rentClause = Array.from(clauses.values()).find(
        (c) => c.name === 'rent_payment'
      );

      expect(rentClause).toBeDefined();
      expect(rentClause?.variables).toContain('monthly_rent');
    });
  });

  describe('Template Management', () => {
    it('should create template with clauses', () => {
      const clauseIds = Array.from(clauses.values()).slice(0, 3).map((c) => c.id);

      leaseTemplates.set('template-1', {
        id: 'template-1',
        name: 'Standard NYC Lease',
        description: 'Standard lease for NYC apartments',
        propertyType: 'apartment',
        jurisdiction: 'NYC',
        jurisdictionType: 'city',
        status: 'draft',
        version: 1,
        parentVersionId: null,
        clauses: clauseIds.map((id, index) => ({
          id: `tc-${index}`,
          templateId: 'template-1',
          clauseId: id,
          order: index,
          isRequired: true,
          customContent: null,
          conditions: [],
        })),
        variables: [
          {
            name: 'monthly_rent',
            type: 'currency',
            label: 'Monthly Rent',
            description: 'Monthly rent amount',
            required: true,
            defaultValue: null,
            validation: { min: 0 },
          },
        ],
        metadata: {
          estimatedPages: 10,
          requiredSignatures: 2,
          notarizationRequired: false,
          witnessRequired: false,
          lastLegalReview: null,
          complianceNotes: [],
        },
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        publishedAt: null,
      });

      const template = leaseTemplates.get('template-1');
      expect(template?.clauses.length).toBe(3);
      expect(template?.jurisdiction).toBe('NYC');
    });
  });

  describe('Lease Generation', () => {
    it('should generate lease with interpolated content', () => {
      const variables = {
        landlord_name: 'ABC Properties LLC',
        tenant_names: 'John Smith and Jane Smith',
        property_address: '123 Main St, Apt 4B, New York, NY 10001',
        lease_start_date: new Date('2024-02-01'),
        lease_end_date: new Date('2025-01-31'),
        monthly_rent: 2500,
        security_deposit_amount: 2500,
      };

      const content = 'This lease is between {{landlord_name}} and {{tenant_names}} for {{property_address}}. Monthly rent: {{monthly_rent}}.';
      const result = interpolateVariables(content, variables);

      expect(result).toContain('ABC Properties LLC');
      expect(result).toContain('John Smith and Jane Smith');
      expect(result).toContain('$2,500.00');
    });

    it('should store generated lease', () => {
      generatedLeases.set('gen-1', {
        id: 'gen-1',
        templateId: 'template-1',
        templateVersion: 1,
        propertyId: 'prop-1',
        unitId: 'unit-1',
        landlordId: 'landlord-1',
        tenantIds: ['tenant-1', 'tenant-2'],
        variables: {
          monthly_rent: 2500,
          lease_start_date: new Date('2024-02-01'),
        },
        content: 'Full lease content here...',
        clauses: [
          { clauseId: 'c-1', title: 'Parties', content: 'Content...', order: 0 },
          { clauseId: 'c-2', title: 'Rent', content: 'Content...', order: 1 },
        ],
        status: 'draft',
        signatureRequests: [],
        generatedAt: new Date(),
        expiresAt: null,
      });

      const lease = generatedLeases.get('gen-1');
      expect(lease?.status).toBe('draft');
      expect(lease?.clauses.length).toBe(2);
    });
  });
});

describe('Portfolio Dashboard', () => {
  describe('Financial Calculations', () => {
    describe('calculateNOI', () => {
      it('should calculate net operating income', () => {
        expect(calculateNOI(10000, 4000)).toBe(6000);
        expect(calculateNOI(50000, 20000)).toBe(30000);
      });

      it('should handle zero values', () => {
        expect(calculateNOI(0, 0)).toBe(0);
        expect(calculateNOI(10000, 0)).toBe(10000);
      });

      it('should handle negative NOI', () => {
        expect(calculateNOI(5000, 8000)).toBe(-3000);
      });
    });

    describe('calculateCapRate', () => {
      it('should calculate cap rate as percentage', () => {
        // NOI of $50,000/month = $600,000/year, property value $10M = 6% cap rate
        const capRate = calculateCapRate(50000, 10000000);
        expect(capRate).toBe(6);
      });

      it('should handle zero property value', () => {
        expect(calculateCapRate(50000, 0)).toBe(0);
      });

      it('should handle high cap rates', () => {
        const capRate = calculateCapRate(100000, 1000000);
        expect(capRate).toBe(120); // 100k * 12 / 1M * 100 = 120%
      });
    });

    describe('calculateCashOnCash', () => {
      it('should calculate cash on cash return', () => {
        // $50,000 annual cash flow / $500,000 investment = 10%
        const coc = calculateCashOnCash(50000, 500000);
        expect(coc).toBe(10);
      });

      it('should handle zero investment', () => {
        expect(calculateCashOnCash(50000, 0)).toBe(0);
      });

      it('should handle negative cash flow', () => {
        const coc = calculateCashOnCash(-10000, 500000);
        expect(coc).toBe(-2);
      });
    });

    describe('calculateLTV', () => {
      it('should calculate loan to value ratio', () => {
        // $800,000 debt / $1,000,000 value = 80%
        expect(calculateLTV(800000, 1000000)).toBe(80);
      });

      it('should handle zero property value', () => {
        expect(calculateLTV(500000, 0)).toBe(0);
      });

      it('should handle no debt', () => {
        expect(calculateLTV(0, 1000000)).toBe(0);
      });

      it('should handle over-leveraged properties', () => {
        expect(calculateLTV(1200000, 1000000)).toBe(120);
      });
    });

    describe('calculateTrend', () => {
      it('should identify upward trend', () => {
        expect(calculateTrend(100, 90)).toBe('up');
        expect(calculateTrend(50000, 45000)).toBe('up');
      });

      it('should identify downward trend', () => {
        expect(calculateTrend(90, 100)).toBe('down');
        expect(calculateTrend(45000, 50000)).toBe('down');
      });

      it('should identify flat trend for minimal changes', () => {
        expect(calculateTrend(100, 100)).toBe('flat');
        expect(calculateTrend(100.005, 100)).toBe('flat');
      });
    });
  });

  describe('Portfolio Data', () => {
    it('should have initial mock properties', () => {
      expect(portfolioProperties.size).toBeGreaterThan(0);
    });

    it('should have occupancy history for properties', () => {
      expect(occupancyHistory.size).toBeGreaterThan(0);
      const firstHistory = Array.from(occupancyHistory.values())[0];
      expect(firstHistory.length).toBe(12);
    });

    it('should have revenue history for properties', () => {
      expect(revenueHistory.size).toBeGreaterThan(0);
      const firstHistory = Array.from(revenueHistory.values())[0];
      expect(firstHistory.length).toBe(12);
    });

    it('should calculate property-level metrics', () => {
      const props = Array.from(portfolioProperties.values());
      const prop = props[0];

      expect(prop.propertyId).toBeDefined();
      expect(prop.units).toBeGreaterThan(0);
      expect(prop.occupiedUnits).toBeLessThanOrEqual(prop.units);
      expect(prop.occupancyRate).toBeGreaterThan(0);
      expect(prop.noi).toBeDefined();
      expect(prop.capRate).toBeDefined();
    });
  });

  describe('Portfolio Aggregation', () => {
    it('should aggregate across properties', () => {
      const props = Array.from(portfolioProperties.values());
      const totalUnits = props.reduce((sum, p) => sum + p.units, 0);
      const occupiedUnits = props.reduce((sum, p) => sum + p.occupiedUnits, 0);
      const totalValue = props.reduce((sum, p) => sum + p.value, 0);

      expect(totalUnits).toBeGreaterThan(0);
      expect(occupiedUnits).toBeLessThanOrEqual(totalUnits);
      expect(totalValue).toBeGreaterThan(0);
    });

    it('should calculate portfolio-level occupancy', () => {
      const props = Array.from(portfolioProperties.values());
      const totalUnits = props.reduce((sum, p) => sum + p.units, 0);
      const occupiedUnits = props.reduce((sum, p) => sum + p.occupiedUnits, 0);
      const occupancyRate = (occupiedUnits / totalUnits) * 100;

      expect(occupancyRate).toBeGreaterThan(0);
      expect(occupancyRate).toBeLessThanOrEqual(100);
    });
  });
});

describe('Applicant Screening', () => {
  beforeEach(() => {
    applications.clear();
  });

  describe('Mock Report Generation', () => {
    describe('generateMockCreditReport', () => {
      it('should generate valid credit report', () => {
        const report = generateMockCreditReport();

        expect(report.creditScore).toBeGreaterThanOrEqual(300);
        expect(report.creditScore).toBeLessThanOrEqual(850);
        expect(report.scoreRange.min).toBe(300);
        expect(report.scoreRange.max).toBe(850);
        expect(report.scoreRating).toBeDefined();
        expect(report.tradelines).toBeDefined();
        expect(report.paymentHistory).toBeDefined();
      });

      it('should assign correct score rating', () => {
        for (let i = 0; i < 10; i++) {
          const report = generateMockCreditReport();
          if (report.creditScore >= 750) expect(report.scoreRating).toBe('excellent');
          else if (report.creditScore >= 700) expect(report.scoreRating).toBe('good');
          else if (report.creditScore >= 650) expect(report.scoreRating).toBe('fair');
          else if (report.creditScore >= 550) expect(report.scoreRating).toBe('poor');
          else expect(report.scoreRating).toBe('very_poor');
        }
      });

      it('should include tradelines', () => {
        const report = generateMockCreditReport();
        expect(report.tradelines.length).toBeGreaterThan(0);
        expect(report.tradelines[0].creditor).toBeDefined();
        expect(report.tradelines[0].balance).toBeDefined();
      });
    });

    describe('generateMockCriminalReport', () => {
      it('should generate valid criminal report', () => {
        const report = generateMockCriminalReport();

        expect(typeof report.hasRecords).toBe('boolean');
        expect(report.sexOffenderCheck).toBe(false);
        expect(report.terroristWatchlist).toBe(false);
      });

      it('should have records array matching hasRecords flag', () => {
        for (let i = 0; i < 20; i++) {
          const report = generateMockCriminalReport();
          if (report.hasRecords) {
            expect(report.records.length).toBeGreaterThan(0);
          } else {
            expect(report.records.length).toBe(0);
          }
        }
      });
    });

    describe('generateMockEvictionReport', () => {
      it('should generate valid eviction report', () => {
        const report = generateMockEvictionReport();

        expect(typeof report.hasEvictions).toBe('boolean');
        expect(Array.isArray(report.evictions)).toBe(true);
      });

      it('should have evictions array matching hasEvictions flag', () => {
        for (let i = 0; i < 20; i++) {
          const report = generateMockEvictionReport();
          if (report.hasEvictions) {
            expect(report.evictions.length).toBeGreaterThan(0);
          } else {
            expect(report.evictions.length).toBe(0);
          }
        }
      });
    });
  });

  describe('Scoring and Risk Assessment', () => {
    const defaultCriteria: ScreeningCriteria = {
      id: 'test',
      name: 'Test Criteria',
      propertyId: null,
      isDefault: true,
      minCreditScore: 650,
      maxDebtToIncomeRatio: 43,
      minIncomeToRentRatio: 3,
      maxLatePayments: 3,
      maxCollections: 2,
      allowBankruptcy: false,
      bankruptcyLookbackYears: 7,
      allowEvictions: false,
      evictionLookbackYears: 7,
      allowFelonies: false,
      felonyLookbackYears: 7,
      allowMisdemeanors: true,
      misdemeanorLookbackYears: 3,
      requireEmploymentVerification: true,
      requireIncomeVerification: true,
      requireRentalHistory: true,
      minRentalHistoryMonths: 12,
    };

    describe('determineRiskLevel', () => {
      it('should classify low risk for high scores', () => {
        expect(determineRiskLevel(80)).toBe('low');
        expect(determineRiskLevel(90)).toBe('low');
        expect(determineRiskLevel(100)).toBe('low');
      });

      it('should classify medium risk for moderate scores', () => {
        expect(determineRiskLevel(60)).toBe('medium');
        expect(determineRiskLevel(70)).toBe('medium');
        expect(determineRiskLevel(79)).toBe('medium');
      });

      it('should classify high risk for low scores', () => {
        expect(determineRiskLevel(40)).toBe('high');
        expect(determineRiskLevel(50)).toBe('high');
        expect(determineRiskLevel(59)).toBe('high');
      });

      it('should classify very high risk for very low scores', () => {
        expect(determineRiskLevel(0)).toBe('very_high');
        expect(determineRiskLevel(20)).toBe('very_high');
        expect(determineRiskLevel(39)).toBe('very_high');
      });
    });

    describe('generateRiskFactors', () => {
      it('should identify low credit score as risk factor', () => {
        const applicant: Partial<Applicant> = {
          screeningReports: [{
            id: 'r1',
            applicantId: 'a1',
            type: 'credit',
            provider: 'mock',
            status: 'completed',
            requestedAt: new Date(),
            completedAt: new Date(),
            expiresAt: null,
            score: 580,
            data: {
              creditScore: 580,
              scoreRange: { min: 300, max: 850 },
              scoreRating: 'poor',
              tradelines: [],
              collections: [],
              publicRecords: [],
              inquiries: [],
              totalDebt: 0,
              availableCredit: 0,
              creditUtilization: 0,
              oldestAccount: null,
              paymentHistory: { onTime: 90, late: 10, percentage: 90 },
            },
            riskFactors: [],
            recommendations: [],
          }],
          incomeInfo: {
            annualIncome: 72000,
            monthlyIncome: 6000,
            incomeSources: [],
            incomeToRentRatio: 3,
            verified: false,
            verificationMethod: null,
            verificationDate: null,
          },
          rentalHistory: [],
        };

        const factors = generateRiskFactors(applicant as Applicant, defaultCriteria);
        expect(factors.some((f) => f.includes('Credit score'))).toBe(true);
      });

      it('should identify low income ratio as risk factor', () => {
        const applicant: Partial<Applicant> = {
          screeningReports: [],
          incomeInfo: {
            annualIncome: 36000,
            monthlyIncome: 3000,
            incomeSources: [],
            incomeToRentRatio: 1.5,
            verified: false,
            verificationMethod: null,
            verificationDate: null,
          },
          rentalHistory: [],
        };

        const factors = generateRiskFactors(applicant as Applicant, defaultCriteria);
        expect(factors.some((f) => f.includes('Income to rent ratio'))).toBe(true);
      });
    });
  });

  describe('Screening Criteria', () => {
    it('should have default screening criteria', () => {
      expect(screeningCriteria.size).toBeGreaterThan(0);
      const defaultC = screeningCriteria.get('default');
      expect(defaultC).toBeDefined();
      expect(defaultC?.isDefault).toBe(true);
    });

    it('should have reasonable default values', () => {
      const defaultC = screeningCriteria.get('default');
      expect(defaultC?.minCreditScore).toBeGreaterThanOrEqual(500);
      expect(defaultC?.minCreditScore).toBeLessThanOrEqual(750);
      expect(defaultC?.minIncomeToRentRatio).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Application Management', () => {
    it('should store applications', () => {
      const now = new Date();
      applications.set('app-1', {
        id: 'app-1',
        propertyId: 'prop-1',
        unitId: 'unit-1',
        listingId: null,
        status: 'pending',
        applicants: [],
        desiredMoveIn: now,
        desiredLeaseTerm: 12,
        monthlyRent: 2000,
        applicationFee: 50,
        applicationFeePaid: false,
        screeningConsent: true,
        screeningConsentDate: now,
        overallScore: null,
        riskLevel: null,
        decision: null,
        notes: [],
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      });

      expect(applications.size).toBe(1);
      const app = applications.get('app-1');
      expect(app?.status).toBe('pending');
    });

    it('should track application status transitions', () => {
      const now = new Date();
      const app = {
        id: 'app-2',
        propertyId: 'prop-1',
        unitId: null,
        listingId: null,
        status: 'pending' as const,
        applicants: [],
        desiredMoveIn: now,
        desiredLeaseTerm: 12,
        monthlyRent: 2000,
        applicationFee: 50,
        applicationFeePaid: true,
        screeningConsent: true,
        screeningConsentDate: now,
        overallScore: null,
        riskLevel: null,
        decision: null,
        notes: [],
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      };

      applications.set(app.id, app);
      expect(applications.get(app.id)?.status).toBe('pending');

      // Transition to screening
      app.status = 'screening';
      applications.set(app.id, app);
      expect(applications.get(app.id)?.status).toBe('screening');

      // Transition to review
      app.status = 'review';
      app.overallScore = 75;
      app.riskLevel = 'medium';
      applications.set(app.id, app);
      expect(applications.get(app.id)?.overallScore).toBe(75);
    });
  });
});

describe('Communication Hub', () => {
  beforeEach(() => {
    threads.clear();
    messages.clear();
    smsMessages.clear();
    broadcasts.clear();
  });

  describe('Template Variable Extraction', () => {
    describe('extractVariables', () => {
      it('should extract simple variables', () => {
        const template = 'Hello {{name}}, your rent is {{amount}}.';
        const vars = extractVariables(template);

        expect(vars).toContain('name');
        expect(vars).toContain('amount');
        expect(vars.length).toBe(2);
      });

      it('should extract unique variables only', () => {
        const template = '{{name}} is great. Hello {{name}}, welcome {{name}}!';
        const vars = extractVariables(template);

        expect(vars).toContain('name');
        expect(vars.length).toBe(1);
      });

      it('should return empty array for no variables', () => {
        const template = 'Hello, this is a static message.';
        const vars = extractVariables(template);

        expect(vars.length).toBe(0);
      });

      it('should handle complex templates', () => {
        const template = 'Dear {{tenant_name}}, your rent of {{amount}} is due on {{due_date}}. Property: {{property_name}}.';
        const vars = extractVariables(template);

        expect(vars).toContain('tenant_name');
        expect(vars).toContain('amount');
        expect(vars).toContain('due_date');
        expect(vars).toContain('property_name');
        expect(vars.length).toBe(4);
      });
    });

    describe('interpolateTemplate', () => {
      it('should replace variables with values', () => {
        const template = 'Hello {{name}}, your balance is {{balance}}.';
        const variables = { name: 'John', balance: '$500' };

        const result = interpolateTemplate(template, variables);

        expect(result).toBe('Hello John, your balance is $500.');
      });

      it('should replace multiple occurrences', () => {
        const template = '{{name}} is here. Welcome {{name}}!';
        const variables = { name: 'Alice' };

        const result = interpolateTemplate(template, variables);

        expect(result).toBe('Alice is here. Welcome Alice!');
      });

      it('should leave unmatched variables as-is', () => {
        const template = 'Hello {{name}}, {{missing}} is not replaced.';
        const variables = { name: 'Bob' };

        const result = interpolateTemplate(template, variables);

        expect(result).toBe('Hello Bob, {{missing}} is not replaced.');
      });

      it('should handle empty variables object', () => {
        const template = 'Static {{content}} here.';
        const result = interpolateTemplate(template, {});

        expect(result).toBe('Static {{content}} here.');
      });
    });
  });

  describe('Message Preview', () => {
    describe('truncatePreview', () => {
      it('should return short text unchanged', () => {
        expect(truncatePreview('Hello', 100)).toBe('Hello');
        expect(truncatePreview('Short message', 100)).toBe('Short message');
      });

      it('should truncate long text with ellipsis', () => {
        const longText = 'This is a very long message that should be truncated because it exceeds the maximum length allowed for preview.';
        const result = truncatePreview(longText, 50);

        expect(result.length).toBe(50);
        expect(result.endsWith('...')).toBe(true);
      });

      it('should handle exact length text', () => {
        const text = 'Exactly 10';
        expect(truncatePreview(text, 10)).toBe('Exactly 10');
      });

      it('should use default max length', () => {
        const longText = 'A'.repeat(150);
        const result = truncatePreview(longText);

        expect(result.length).toBe(100);
        expect(result.endsWith('...')).toBe(true);
      });
    });
  });

  describe('Thread Management', () => {
    it('should create message thread', () => {
      const now = new Date();
      threads.set('thread-1', {
        id: 'thread-1',
        propertyId: 'prop-1',
        unitId: 'unit-1',
        subject: 'Maintenance Request',
        participants: [
          { id: 'p1', type: 'tenant', name: 'John Doe', email: 'john@example.com', phone: null, userId: null },
          { id: 'p2', type: 'staff', name: 'Property Manager', email: 'pm@example.com', phone: null, userId: 'user-1' },
        ],
        status: 'open',
        priority: 'normal',
        labels: ['maintenance'],
        assignedTo: 'user-1',
        lastMessageAt: now,
        messageCount: 0,
        unreadCount: 0,
        createdAt: now,
        updatedAt: now,
      });

      expect(threads.size).toBe(1);
      const thread = threads.get('thread-1');
      expect(thread?.subject).toBe('Maintenance Request');
      expect(thread?.participants.length).toBe(2);
    });

    it('should track thread status changes', () => {
      const now = new Date();
      const thread = {
        id: 'thread-2',
        propertyId: null,
        unitId: null,
        subject: 'Question',
        participants: [],
        status: 'open' as const,
        priority: 'normal' as const,
        labels: [],
        assignedTo: null,
        lastMessageAt: now,
        messageCount: 1,
        unreadCount: 1,
        createdAt: now,
        updatedAt: now,
      };

      threads.set(thread.id, thread);
      expect(threads.get(thread.id)?.status).toBe('open');

      thread.status = 'pending';
      threads.set(thread.id, thread);
      expect(threads.get(thread.id)?.status).toBe('pending');

      thread.status = 'resolved';
      threads.set(thread.id, thread);
      expect(threads.get(thread.id)?.status).toBe('resolved');
    });
  });

  describe('SMS Messages', () => {
    it('should store SMS message', () => {
      const now = new Date();
      smsMessages.set('sms-1', {
        id: 'sms-1',
        to: '+15551234567',
        from: '+15559876543',
        body: 'Your rent is due tomorrow.',
        status: 'sent',
        direction: 'outbound',
        provider: 'mock',
        providerMessageId: 'msg_123',
        segments: 1,
        sentAt: now,
        deliveredAt: null,
        failureReason: null,
        cost: 0.0075,
        createdAt: now,
      });

      const sms = smsMessages.get('sms-1');
      expect(sms?.body).toBe('Your rent is due tomorrow.');
      expect(sms?.segments).toBe(1);
    });

    it('should calculate SMS segments correctly', () => {
      const shortMessage = 'Hello!';
      const longMessage = 'A'.repeat(200);

      // 160 chars per segment
      expect(Math.ceil(shortMessage.length / 160)).toBe(1);
      expect(Math.ceil(longMessage.length / 160)).toBe(2);
    });
  });

  describe('Message Templates', () => {
    it('should have default templates', () => {
      expect(messageTemplates.size).toBeGreaterThan(0);
    });

    it('should have payment category templates', () => {
      const paymentTemplates = Array.from(messageTemplates.values()).filter(
        (t) => t.category === 'payment'
      );
      expect(paymentTemplates.length).toBeGreaterThan(0);
    });

    it('should have templates with variables', () => {
      const templatesWithVars = Array.from(messageTemplates.values()).filter(
        (t) => t.variables.length > 0
      );
      expect(templatesWithVars.length).toBeGreaterThan(0);
    });
  });

  describe('Broadcast Messages', () => {
    it('should create broadcast with recipients', () => {
      const now = new Date();
      broadcasts.set('broadcast-1', {
        id: 'broadcast-1',
        name: 'Rent Reminder',
        templateId: null,
        channel: 'sms',
        subject: null,
        body: 'Rent is due on the 1st.',
        recipients: [
          { id: 'r1', type: 'tenant', name: 'John', email: null, phone: '+15551111111', status: 'queued', sentAt: null, error: null },
          { id: 'r2', type: 'tenant', name: 'Jane', email: null, phone: '+15552222222', status: 'queued', sentAt: null, error: null },
        ],
        filters: {},
        status: 'draft',
        scheduledAt: null,
        sentAt: null,
        stats: {
          totalRecipients: 2,
          sent: 0,
          delivered: 0,
          failed: 0,
          opened: 0,
          clicked: 0,
        },
        createdById: 'user-1',
        createdAt: now,
      });

      const broadcast = broadcasts.get('broadcast-1');
      expect(broadcast?.recipients.length).toBe(2);
      expect(broadcast?.stats.totalRecipients).toBe(2);
    });

    it('should track broadcast status', () => {
      const now = new Date();
      const broadcast = {
        id: 'broadcast-2',
        name: 'Test',
        templateId: null,
        channel: 'email' as const,
        subject: 'Test',
        body: 'Test message',
        recipients: [],
        filters: {},
        status: 'draft' as const,
        scheduledAt: null,
        sentAt: null,
        stats: {
          totalRecipients: 0,
          sent: 0,
          delivered: 0,
          failed: 0,
          opened: 0,
          clicked: 0,
        },
        createdById: 'user-1',
        createdAt: now,
      };

      broadcasts.set(broadcast.id, broadcast);
      expect(broadcasts.get(broadcast.id)?.status).toBe('draft');

      broadcast.status = 'scheduled';
      broadcast.scheduledAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      broadcasts.set(broadcast.id, broadcast);
      expect(broadcasts.get(broadcast.id)?.status).toBe('scheduled');
    });
  });
});

describe('Insurance Tracking', () => {
  beforeEach(() => {
    policies.clear();
    certificates.clear();
    claims.clear();
    alerts.clear();
  });

  describe('Date Calculations', () => {
    describe('daysUntil', () => {
      it('should return positive days for future date', () => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 30);

        const days = daysUntil(futureDate);
        expect(days).toBe(30);
      });

      it('should return negative days for past date', () => {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 10);

        const days = daysUntil(pastDate);
        expect(days).toBeLessThan(0);
      });

      it('should return 0 or 1 for today', () => {
        const today = new Date();
        const days = daysUntil(today);
        expect(days).toBeLessThanOrEqual(1);
        expect(days).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Expiration Alerts', () => {
    describe('createExpirationAlert', () => {
      it('should create critical alert for expired policy', () => {
        const expiredPolicy: InsurancePolicy = {
          id: 'pol-1',
          propertyId: 'prop-1',
          entityId: null,
          entityType: 'property',
          policyType: 'property',
          policyNumber: 'POL-001',
          carrier: 'ABC Insurance',
          carrierContact: null,
          status: 'active',
          effectiveDate: new Date('2023-01-01'),
          expirationDate: new Date('2023-12-31'),
          premium: 5000,
          premiumFrequency: 'annual',
          deductible: 2500,
          coverageAmount: 500000,
          coverageDetails: [],
          additionalInsured: [],
          documents: [],
          autoRenew: false,
          renewalReminder: 30,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const alert = createExpirationAlert(expiredPolicy);

        expect(alert).not.toBeNull();
        expect(alert?.type).toBe('expiration');
        expect(alert?.priority).toBe('critical');
        expect(alert?.title).toBe('Policy Expired');
      });

      it('should create high priority alert for policy expiring within 7 days', () => {
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + 5);

        const policy: InsurancePolicy = {
          id: 'pol-2',
          propertyId: 'prop-1',
          entityId: null,
          entityType: 'property',
          policyType: 'liability',
          policyNumber: 'POL-002',
          carrier: 'XYZ Insurance',
          carrierContact: null,
          status: 'active',
          effectiveDate: new Date('2024-01-01'),
          expirationDate,
          premium: 3000,
          premiumFrequency: 'annual',
          deductible: 1000,
          coverageAmount: 1000000,
          coverageDetails: [],
          additionalInsured: [],
          documents: [],
          autoRenew: false,
          renewalReminder: 30,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const alert = createExpirationAlert(policy);

        expect(alert).not.toBeNull();
        expect(alert?.priority).toBe('high');
        expect(alert?.title).toBe('Policy Expiring Soon');
      });

      it('should create medium priority alert for policy expiring within renewal reminder period', () => {
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + 20);

        const policy: InsurancePolicy = {
          id: 'pol-3',
          propertyId: 'prop-1',
          entityId: null,
          entityType: 'property',
          policyType: 'property',
          policyNumber: 'POL-003',
          carrier: 'DEF Insurance',
          carrierContact: null,
          status: 'active',
          effectiveDate: new Date('2024-01-01'),
          expirationDate,
          premium: 4000,
          premiumFrequency: 'annual',
          deductible: 2000,
          coverageAmount: 750000,
          coverageDetails: [],
          additionalInsured: [],
          documents: [],
          autoRenew: false,
          renewalReminder: 30,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const alert = createExpirationAlert(policy);

        expect(alert).not.toBeNull();
        expect(alert?.priority).toBe('medium');
        expect(alert?.type).toBe('renewal');
      });

      it('should return null for policy not expiring soon', () => {
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + 90);

        const policy: InsurancePolicy = {
          id: 'pol-4',
          propertyId: 'prop-1',
          entityId: null,
          entityType: 'property',
          policyType: 'property',
          policyNumber: 'POL-004',
          carrier: 'GHI Insurance',
          carrierContact: null,
          status: 'active',
          effectiveDate: new Date('2024-01-01'),
          expirationDate,
          premium: 5000,
          premiumFrequency: 'annual',
          deductible: 2500,
          coverageAmount: 1000000,
          coverageDetails: [],
          additionalInsured: [],
          documents: [],
          autoRenew: false,
          renewalReminder: 30,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const alert = createExpirationAlert(policy);

        expect(alert).toBeNull();
      });
    });
  });

  describe('Coverage Analysis', () => {
    beforeEach(() => {
      // Add test policies
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      policies.set('pol-test-1', {
        id: 'pol-test-1',
        propertyId: 'prop-coverage-test',
        entityId: null,
        entityType: 'property',
        policyType: 'property',
        policyNumber: 'POL-T1',
        carrier: 'Test Insurance',
        carrierContact: null,
        status: 'active',
        effectiveDate: new Date(),
        expirationDate: futureDate,
        premium: 5000,
        premiumFrequency: 'annual',
        deductible: 2500,
        coverageAmount: 800000,
        coverageDetails: [],
        additionalInsured: [],
        documents: [],
        autoRenew: false,
        renewalReminder: 30,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      policies.set('pol-test-2', {
        id: 'pol-test-2',
        propertyId: 'prop-coverage-test',
        entityId: null,
        entityType: 'property',
        policyType: 'liability',
        policyNumber: 'POL-T2',
        carrier: 'Test Insurance',
        carrierContact: null,
        status: 'active',
        effectiveDate: new Date(),
        expirationDate: futureDate,
        premium: 3000,
        premiumFrequency: 'annual',
        deductible: 1000,
        coverageAmount: 1000000,
        coverageDetails: [],
        additionalInsured: [],
        documents: [],
        autoRenew: false,
        renewalReminder: 30,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    describe('analyzeCoverage', () => {
      it('should analyze coverage for property', () => {
        const analysis = analyzeCoverage('prop-coverage-test', 1000000);

        expect(analysis.propertyId).toBe('prop-coverage-test');
        expect(analysis.propertyValue).toBe(1000000);
        expect(analysis.policies.length).toBe(2);
        expect(analysis.totalCoverage).toBe(1800000);
      });

      it('should calculate coverage ratio', () => {
        const analysis = analyzeCoverage('prop-coverage-test', 1000000);

        // 1,800,000 coverage / 1,000,000 value = 1.8
        expect(analysis.coverageRatio).toBe(1.8);
      });

      it('should identify coverage gaps for underinsured property', () => {
        // Clear existing policies
        policies.clear();

        // Add only partial property coverage (50% of value)
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1);

        policies.set('pol-partial', {
          id: 'pol-partial',
          propertyId: 'prop-underinsured',
          entityId: null,
          entityType: 'property',
          policyType: 'property',
          policyNumber: 'POL-P1',
          carrier: 'Test',
          carrierContact: null,
          status: 'active',
          effectiveDate: new Date(),
          expirationDate: futureDate,
          premium: 2000,
          premiumFrequency: 'annual',
          deductible: 1000,
          coverageAmount: 500000,
          coverageDetails: [],
          additionalInsured: [],
          documents: [],
          autoRenew: false,
          renewalReminder: 30,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const analysis = analyzeCoverage('prop-underinsured', 1000000);

        expect(analysis.gaps.length).toBeGreaterThan(0);
        expect(analysis.gaps.some((g) => g.type === 'property')).toBe(true);
        expect(analysis.gaps.some((g) => g.type === 'liability')).toBe(true);
      });

      it('should generate recommendations', () => {
        const analysis = analyzeCoverage('prop-no-policies', 1000000);

        expect(analysis.recommendations.length).toBeGreaterThan(0);
        expect(analysis.recommendations.some((r) => r.includes('property insurance'))).toBe(true);
      });

      it('should recommend umbrella for high-value properties', () => {
        // Clear and add policies for high-value property without umbrella
        policies.clear();

        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1);

        policies.set('pol-hv-prop', {
          id: 'pol-hv-prop',
          propertyId: 'prop-high-value',
          entityId: null,
          entityType: 'property',
          policyType: 'property',
          policyNumber: 'POL-HV1',
          carrier: 'Test',
          carrierContact: null,
          status: 'active',
          effectiveDate: new Date(),
          expirationDate: futureDate,
          premium: 10000,
          premiumFrequency: 'annual',
          deductible: 5000,
          coverageAmount: 2500000,
          coverageDetails: [],
          additionalInsured: [],
          documents: [],
          autoRenew: false,
          renewalReminder: 30,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        policies.set('pol-hv-liab', {
          id: 'pol-hv-liab',
          propertyId: 'prop-high-value',
          entityId: null,
          entityType: 'property',
          policyType: 'liability',
          policyNumber: 'POL-HV2',
          carrier: 'Test',
          carrierContact: null,
          status: 'active',
          effectiveDate: new Date(),
          expirationDate: futureDate,
          premium: 5000,
          premiumFrequency: 'annual',
          deductible: 2500,
          coverageAmount: 2000000,
          coverageDetails: [],
          additionalInsured: [],
          documents: [],
          autoRenew: false,
          renewalReminder: 30,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const analysis = analyzeCoverage('prop-high-value', 3000000);

        expect(analysis.recommendations.some((r) => r.toLowerCase().includes('umbrella'))).toBe(true);
      });
    });
  });

  describe('Policy Management', () => {
    it('should store policy', () => {
      const now = new Date();
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      policies.set('pol-mgmt-1', {
        id: 'pol-mgmt-1',
        propertyId: 'prop-1',
        entityId: null,
        entityType: 'property',
        policyType: 'property',
        policyNumber: 'POL-2024-001',
        carrier: 'Allstate',
        carrierContact: {
          name: 'Allstate Claims',
          phone: '1-800-255-7828',
          email: 'claims@allstate.com',
          agentName: 'John Agent',
          agentPhone: '555-1234',
          agentEmail: 'john@allstate.com',
          claimsPhone: '1-800-255-7828',
        },
        status: 'active',
        effectiveDate: now,
        expirationDate: futureDate,
        premium: 4500,
        premiumFrequency: 'annual',
        deductible: 2500,
        coverageAmount: 750000,
        coverageDetails: [
          { type: 'dwelling', description: 'Building coverage', limit: 750000, deductible: 2500, perOccurrence: false },
          { type: 'contents', description: 'Personal property', limit: 100000, deductible: 1000, perOccurrence: false },
        ],
        additionalInsured: [],
        documents: [],
        autoRenew: true,
        renewalReminder: 45,
        notes: 'Primary property coverage',
        createdAt: now,
        updatedAt: now,
      });

      expect(policies.size).toBe(1);
      const policy = policies.get('pol-mgmt-1');
      expect(policy?.carrier).toBe('Allstate');
      expect(policy?.coverageDetails.length).toBe(2);
    });
  });

  describe('Certificate Management', () => {
    it('should store certificate', () => {
      const now = new Date();
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      certificates.set('cert-1', {
        id: 'cert-1',
        policyId: 'pol-vendor',
        vendorId: 'vendor-1',
        tenantId: null,
        holderName: "Bob's Plumbing",
        holderType: 'vendor',
        certificateNumber: 'CERT-2024-001',
        policyType: 'liability',
        carrier: 'Hartford',
        policyNumber: 'HL-123456',
        effectiveDate: now,
        expirationDate: futureDate,
        coverageAmount: 1000000,
        additionalInsuredIncluded: true,
        waiverOfSubrogation: true,
        status: 'pending_verification',
        documentUrl: 'https://example.com/cert.pdf',
        verifiedAt: null,
        verifiedBy: null,
        rejectionReason: null,
        notes: null,
        createdAt: now,
        updatedAt: now,
      });

      expect(certificates.size).toBe(1);
      const cert = certificates.get('cert-1');
      expect(cert?.status).toBe('pending_verification');
      expect(cert?.additionalInsuredIncluded).toBe(true);
    });

    it('should track certificate verification', () => {
      const now = new Date();
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const cert = {
        id: 'cert-2',
        policyId: 'pol-vendor',
        vendorId: 'vendor-2',
        tenantId: null,
        holderName: 'HVAC Pro',
        holderType: 'vendor' as const,
        certificateNumber: 'CERT-2024-002',
        policyType: 'liability' as const,
        carrier: 'State Farm',
        policyNumber: 'SF-654321',
        effectiveDate: now,
        expirationDate: futureDate,
        coverageAmount: 2000000,
        additionalInsuredIncluded: true,
        waiverOfSubrogation: false,
        status: 'pending_verification' as const,
        documentUrl: null,
        verifiedAt: null,
        verifiedBy: null,
        rejectionReason: null,
        notes: null,
        createdAt: now,
        updatedAt: now,
      };

      certificates.set(cert.id, cert);

      // Verify the certificate
      cert.status = 'valid';
      cert.verifiedAt = now;
      cert.verifiedBy = 'admin-1';
      certificates.set(cert.id, cert);

      expect(certificates.get(cert.id)?.status).toBe('valid');
      expect(certificates.get(cert.id)?.verifiedAt).not.toBeNull();
    });
  });

  describe('Claims Management', () => {
    it('should create claim with timeline', () => {
      const now = new Date();
      const incidentDate = new Date();
      incidentDate.setDate(incidentDate.getDate() - 3);

      claims.set('claim-1', {
        id: 'claim-1',
        policyId: 'pol-1',
        propertyId: 'prop-1',
        claimNumber: 'CLM-2024-001',
        incidentDate,
        reportedDate: now,
        description: 'Water damage from burst pipe in unit 2B',
        claimType: 'water_damage',
        status: 'reported',
        estimatedAmount: 15000,
        approvedAmount: null,
        paidAmount: null,
        deductibleApplied: null,
        adjusterName: null,
        adjusterPhone: null,
        adjusterEmail: null,
        documents: [],
        timeline: [
          { date: now, event: 'Claim Reported', description: 'Initial claim filed', userId: null },
        ],
        notes: null,
        closedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const claim = claims.get('claim-1');
      expect(claim?.status).toBe('reported');
      expect(claim?.timeline.length).toBe(1);
      expect(claim?.estimatedAmount).toBe(15000);
    });

    it('should track claim status progression', () => {
      const now = new Date();
      const claim = {
        id: 'claim-2',
        policyId: 'pol-1',
        propertyId: null,
        claimNumber: 'CLM-2024-002',
        incidentDate: now,
        reportedDate: now,
        description: 'Fire damage',
        claimType: 'fire',
        status: 'reported' as const,
        estimatedAmount: 50000,
        approvedAmount: null,
        paidAmount: null,
        deductibleApplied: null,
        adjusterName: null,
        adjusterPhone: null,
        adjusterEmail: null,
        documents: [],
        timeline: [{ date: now, event: 'Reported', description: 'Filed', userId: null }],
        notes: null,
        closedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      claims.set(claim.id, claim);

      // Under review
      claim.status = 'under_review';
      claim.adjusterName = 'Jane Adjuster';
      claim.timeline.push({ date: now, event: 'Under Review', description: 'Adjuster assigned', userId: null });
      claims.set(claim.id, claim);
      expect(claims.get(claim.id)?.status).toBe('under_review');

      // Approved
      claim.status = 'approved';
      claim.approvedAmount = 45000;
      claim.deductibleApplied = 2500;
      claim.timeline.push({ date: now, event: 'Approved', description: 'Claim approved', userId: null });
      claims.set(claim.id, claim);
      expect(claims.get(claim.id)?.approvedAmount).toBe(45000);

      // Paid
      claim.status = 'paid';
      claim.paidAmount = 42500;
      claims.set(claim.id, claim);
      expect(claims.get(claim.id)?.paidAmount).toBe(42500);
    });
  });

  describe('Alert Management', () => {
    it('should store and filter alerts', () => {
      const now = new Date();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);

      alerts.set('alert-1', {
        id: 'alert-1',
        policyId: 'pol-1',
        certificateId: null,
        claimId: null,
        type: 'expiration',
        priority: 'high',
        title: 'Policy Expiring Soon',
        message: 'Property policy expires in 7 days',
        dueDate,
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
        createdAt: now,
      });

      alerts.set('alert-2', {
        id: 'alert-2',
        policyId: null,
        certificateId: 'cert-1',
        claimId: null,
        type: 'certificate_expiring',
        priority: 'medium',
        title: 'Certificate Expiring',
        message: 'Vendor certificate expires in 30 days',
        dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
        createdAt: now,
      });

      expect(alerts.size).toBe(2);

      const highPriorityAlerts = Array.from(alerts.values()).filter(
        (a) => a.priority === 'high'
      );
      expect(highPriorityAlerts.length).toBe(1);

      const unacknowledgedAlerts = Array.from(alerts.values()).filter(
        (a) => !a.acknowledgedAt
      );
      expect(unacknowledgedAlerts.length).toBe(2);
    });

    it('should acknowledge alerts', () => {
      const now = new Date();
      const alert = {
        id: 'alert-ack',
        policyId: 'pol-1',
        certificateId: null,
        claimId: null,
        type: 'renewal' as const,
        priority: 'medium' as const,
        title: 'Renewal Reminder',
        message: 'Consider renewal options',
        dueDate: null,
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
        createdAt: now,
      };

      alerts.set(alert.id, alert);
      expect(alerts.get(alert.id)?.acknowledgedAt).toBeNull();

      alert.acknowledgedAt = now;
      alert.acknowledgedBy = 'admin-1';
      alerts.set(alert.id, alert);

      expect(alerts.get(alert.id)?.acknowledgedAt).not.toBeNull();
      expect(alerts.get(alert.id)?.acknowledgedBy).toBe('admin-1');
    });
  });
});
