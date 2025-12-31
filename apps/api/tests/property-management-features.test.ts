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
