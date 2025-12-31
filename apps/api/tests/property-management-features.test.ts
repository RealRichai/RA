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

// Utility Management imports
import {
  providers as utilityProviders,
  accounts as utilityAccounts,
  bills as utilityBills,
  rubsConfigs,
  calculateRUBSAllocation,
  calculateUsage,
  estimateMonthlyAverage,
  type RUBSConfig,
  type UtilityBill,
} from '../src/modules/utilities/routes';

// Owner Portal imports
import {
  owners,
  ownerships,
  statements as ownerStatements,
  distributions,
  calculateIncome,
  calculateExpenses,
  calculateStatementSummary,
  calculateManagementFee,
  type StatementLineItem,
} from '../src/modules/owner-portal/routes';

// Budget & Forecasting imports
import {
  budgets,
  budgetActuals,
  forecasts,
  capExItems,
  calculateVariance,
  getVarianceStatus,
  distributeAnnualToMonths,
  aggregateMonthlyToQuarterly,
  applyGrowthRate,
  calculateNPV,
  generateVarianceInsights,
} from '../src/modules/budgets/routes';

// Showing Scheduler imports
import {
  showings,
  prospects,
  agents as showingAgents,
  listingAvailability,
  generateTimeSlots,
  getDayOfWeek,
  timeToMinutes,
  minutesToTime,
  calculateShowingStats,
  type ListingAvailability,
  type Showing,
} from '../src/modules/showings/routes';

// Move-In/Move-Out Workflow imports
import {
  workflows,
  checklistTemplates,
  checklistItems,
  conditionReports,
  keyRecords,
  depositRecords,
  depositDeductions,
  utilityTransfers,
  calculateDepositRefund,
  generateChecklistFromTemplate,
  calculateWorkflowProgress,
  compareConditions,
  generateDepositItemization,
  getDepositDeadline,
  type DepositDeduction,
} from '../src/modules/move-workflows/routes';

// HOA/COA Management imports
import {
  associations,
  assessments as hoaAssessments,
  violations,
  architecturalRequests,
  boardMeetings,
  associationDocuments,
  calculateAssessmentSchedule,
  calculateLateFee as calculateHOALateFee,
  getViolationEscalationLevel,
  calculateAnnualHOACost,
  getAssessmentSummary,
} from '../src/modules/hoa/routes';

// Tax Document Management imports
import {
  taxYears,
  taxRecipients,
  taxDocuments,
  taxPayments,
  ownerTaxPackets,
  depreciationItems,
  calculateReportablePayments,
  determineFormType,
  calculateStraightLineDepreciation,
  calculateMACRSDepreciation,
  generateTaxSummary,
  validateTIN,
} from '../src/modules/tax-documents/routes';

// Rental Assistance imports
import {
  programs as assistancePrograms,
  applications as assistanceApplications,
  vouchers,
  inspections as assistanceInspections,
  assistancePayments,
  landlordCertifications,
  complianceReports,
  calculateHAPPayment,
  isInspectionDue,
  calculateInspectionPassRate,
  getDeficiencySummary,
  calculatePaymentSummary,
  getVoucherExpirationDays,
} from '../src/modules/rental-assistance/routes';

// Amenity Booking imports
import {
  amenities as amenityStore,
  reservations as amenityReservations,
  waitlists as amenityWaitlists,
  recurringBookings as amenityRecurringBookings,
  usageLogs as amenityUsageLogs,
  generateConfirmationCode as generateAmenityConfirmationCode,
} from '../src/modules/amenities/routes';

// Package Tracking imports
import {
  lockers as packageLockers,
  packages as packageStore,
  pickupLogs as packagePickupLogs,
  proxyAuthorizations as packageProxyAuthorizations,
  forwardingAddresses as packageForwardingAddresses,
  generateAccessCode,
  findAvailableLocker,
  isPackageOverdue,
  calculatePackageStats,
  getLockerUtilization,
  validateTrackingNumber,
  type Package,
  type PackageLocker,
} from '../src/modules/packages/routes';

// Pet Management imports
import {
  pets as petStore,
  breedRestrictions as petBreedRestrictions,
  petPolicies as petPolicyStore,
  vaccinationRecords as petVaccinationRecords,
  petIncidents as petIncidentStore,
  petScreenings as petScreeningStore,
  petFees as petFeeStore,
  checkBreedRestriction,
  validatePetAgainstPolicy,
  calculatePetFees,
  getVaccinationStatus,
  getIncidentHistory,
  calculateRiskScore,
  getPropertyPetCensus,
  type Pet,
  type PetPolicy,
  type VaccinationRecord,
  type PetIncident,
} from '../src/modules/pets/routes';

// Parking Management imports
import {
  parkingLots as parkingLotStore,
  parkingSpaces as parkingSpaceStore,
  vehicles as vehicleStore,
  parkingPermits as parkingPermitStore,
  guestPasses as guestPassStore,
  parkingViolations as parkingViolationStore,
  towRecords as towRecordStore,
  generatePermitNumber,
  generatePassCode,
  getLotOccupancy,
  getSpacesByType,
  findAvailableSpace,
  isPermitValid,
  getActivePermitsForTenant,
  isGuestPassValid,
  calculateViolationStats,
  getViolationFineAmount,
  calculateParkingRevenue,
  type ParkingLot,
  type ParkingSpace,
  type ParkingPermit,
  type GuestPass,
  type ParkingViolation,
} from '../src/modules/parking/routes';

// Storage Unit Management imports
import {
  storageUnits,
  storageRentals,
  storagePayments,
  storageAccessLogs,
  storageWaitlists,
  storagePromotions,
  lienAuctions,
  generateAccessCode as generateStorageAccessCode,
  calculateSquareFeet,
  calculateCubicFeet,
  getUnitPricing,
  getAvailableUnits,
  isRentalPastDue,
  getOccupancyStats as getStorageOccupancyStats,
  applyPromotion,
  type StorageUnit,
  type StorageRental,
  type StoragePromotion,
} from '../src/modules/storage/routes';

// Key & Access Management imports
import {
  physicalKeys,
  accessDevices,
  accessZones,
  accessPoints,
  keyAssignments,
  accessAuditLogs,
  lockoutEvents,
  keyRequests,
  temporaryAccesses,
  generateKeyNumber,
  generateAccessCode as generateKeyAccessCode,
  generateDeviceId,
  isAccessValid,
  getKeyInventory,
  getDeviceStats,
  checkTemporaryAccess,
  type PhysicalKey,
  type AccessDevice,
  type AccessZone,
  type TemporaryAccess,
} from '../src/modules/keys/routes';

// Building Systems Monitoring imports
import {
  buildingSystems,
  systemSensors,
  sensorReadings,
  systemAlerts,
  maintenanceSchedules,
  energyUsages,
  systemDowntimes,
  alertRules,
  checkThresholds,
  calculateSystemHealth,
  getMaintenanceSummary,
  getSystemUptime,
  evaluateAlertRule,
  type BuildingSystem,
  type SystemSensor,
  type SystemAlert,
  type MaintenanceSchedule,
  type AlertRule,
} from '../src/modules/building-systems/routes';

// Common Area Scheduling imports
import {
  commonAreas,
  areaReservations,
  areaWaitlists,
  areaIncidents,
  areaRatings,
  communityEvents,
  generateConfirmationCode as generateAreaConfirmationCode,
  getOperatingHoursForDay,
  isTimeSlotAvailable,
  addMinutesToTime,
  calculateReservationFee,
  getAvailableSlots,
  getAreaUtilization,
  checkCancellationEligibility,
  type CommonArea,
  type AreaReservation,
  type CommunityEvent,
} from '../src/modules/common-areas/routes';

// Guest Management imports
import {
  guestPasses as guestPassStore2,
  guestCheckIns,
  guestParkingSpots,
  guestPolicies,
  guestIncidents,
  guestNotifications,
  generateAccessCode as generateGuestAccessCode,
  isPassValid,
  getAvailableParkingSpots,
  getActivePassesForUnit,
  getGuestStats,
  checkPolicyCompliance,
  expireOldPasses,
  type GuestPass as GuestPassType,
  type GuestCheckIn,
  type GuestPolicy,
} from '../src/modules/guests/routes';

// Lease Violation Tracking imports
import {
  leaseViolations,
  violationNotices,
  violationFines,
  violationHearings,
  violationTemplates,
  violationPolicies,
  getViolationCount,
  calculateFine,
  shouldEscalate,
  getCurePeriod,
  getViolationStats,
  getTenantViolationHistory,
  generateNoticeContent,
  type LeaseViolation,
  type ViolationNotice,
  type ViolationFine,
  type ViolationPolicy,
  type ViolationTemplate,
} from '../src/modules/violations/routes';

// Rent Roll Reporting imports
import {
  rentRollEntries,
  rentRollSnapshots,
  scheduledReports,
  reportExecutions,
  rentRollChanges,
  calculateSummary,
  getRentRollForProperty,
  getVacancyAnalysis,
  getCollectionsAnalysis,
  getRenewalAnalysis,
  compareSummaries,
  calculateNextRunDate,
  formatCurrency,
  formatPercent,
  type RentRollEntry,
  type RentRollSnapshot,
  type RentRollSummary,
  type ScheduledReport,
} from '../src/modules/rent-roll/routes';

// Property Comparison imports
import {
  propertyMetrics,
  comparisonReports,
  benchmarks,
  savedComparisons,
  availableMetrics,
  getMetricDefinition,
  compareProperties,
  calculatePortfolioAverages,
  rankPropertyInPortfolio,
  findSimilarProperties,
  generateTrendData,
  compareToBenchmark,
  type PropertyMetrics,
  type ComparisonReport,
  type Benchmark,
} from '../src/modules/property-comparison/routes';

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

describe('Utility Management', () => {
  beforeEach(() => {
    utilityProviders.clear();
    utilityAccounts.clear();
    utilityBills.clear();
    rubsConfigs.clear();
  });

  describe('Usage Calculations', () => {
    describe('calculateUsage', () => {
      it('should calculate usage difference', () => {
        expect(calculateUsage(1500, 1200)).toBe(300);
        expect(calculateUsage(2000, 1500)).toBe(500);
      });

      it('should handle zero usage', () => {
        expect(calculateUsage(1000, 1000)).toBe(0);
      });

      it('should handle negative difference (meter reset)', () => {
        expect(calculateUsage(100, 9900)).toBe(0);
      });
    });

    describe('estimateMonthlyAverage', () => {
      it('should calculate average from bills', () => {
        const bills: Partial<UtilityBill>[] = [
          { totalAmount: 100 },
          { totalAmount: 120 },
          { totalAmount: 80 },
        ];
        expect(estimateMonthlyAverage(bills as UtilityBill[])).toBe(100);
      });

      it('should return 0 for empty array', () => {
        expect(estimateMonthlyAverage([])).toBe(0);
      });
    });
  });

  describe('RUBS Allocation', () => {
    const testConfig: RUBSConfig = {
      id: 'config-1',
      propertyId: 'prop-1',
      utilityType: 'water',
      allocationMethod: 'equal',
      adminFeeType: 'percentage',
      adminFeeAmount: 5,
      includeVacantUnits: false,
      minimumCharge: null,
      maximumCharge: null,
      customWeights: null,
      effectiveDate: new Date(),
      endDate: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const testUnits = [
      { id: 'u1', name: 'Unit 1', squareFootage: 800, bedrooms: 2, occupants: 2, tenantId: 't1', tenantName: 'John', isVacant: false },
      { id: 'u2', name: 'Unit 2', squareFootage: 1000, bedrooms: 3, occupants: 3, tenantId: 't2', tenantName: 'Jane', isVacant: false },
      { id: 'u3', name: 'Unit 3', squareFootage: 600, bedrooms: 1, occupants: 1, tenantId: null, tenantName: null, isVacant: true },
    ];

    describe('calculateRUBSAllocation', () => {
      it('should allocate equally', () => {
        const allocations = calculateRUBSAllocation(testConfig, 300, testUnits);

        // Should only include occupied units (2)
        expect(allocations.length).toBe(2);

        // Each unit gets 50% of base + admin fee
        const basePerUnit = 150; // 300 / 2
        const adminFee = 15; // 300 * 5%
        const adminPerUnit = 7.5;
        const expectedTotal = basePerUnit + adminPerUnit;

        expect(allocations[0].baseAmount).toBe(basePerUnit);
        expect(allocations[0].totalAmount).toBeCloseTo(expectedTotal, 1);
      });

      it('should allocate by square footage', () => {
        const sqftConfig = { ...testConfig, allocationMethod: 'square_footage' as const };
        const allocations = calculateRUBSAllocation(sqftConfig, 180, testUnits);

        // Total sqft = 800 + 1000 = 1800
        // Unit 1: 800/1800 = 44.44%
        // Unit 2: 1000/1800 = 55.56%
        expect(allocations[0].allocationPercentage).toBeCloseTo(44.44, 1);
        expect(allocations[1].allocationPercentage).toBeCloseTo(55.56, 1);
      });

      it('should allocate by bedroom count', () => {
        const bedroomConfig = { ...testConfig, allocationMethod: 'bedroom_count' as const };
        const allocations = calculateRUBSAllocation(bedroomConfig, 100, testUnits);

        // Total bedrooms = 2 + 3 = 5
        // Unit 1: 2/5 = 40%
        // Unit 2: 3/5 = 60%
        expect(allocations[0].allocationPercentage).toBe(40);
        expect(allocations[1].allocationPercentage).toBe(60);
      });

      it('should allocate by occupancy', () => {
        const occupancyConfig = { ...testConfig, allocationMethod: 'occupancy' as const };
        const allocations = calculateRUBSAllocation(occupancyConfig, 100, testUnits);

        // Total occupants = 2 + 3 = 5
        expect(allocations[0].allocationPercentage).toBe(40);
        expect(allocations[1].allocationPercentage).toBe(60);
      });

      it('should include vacant units when configured', () => {
        const includeVacantConfig = { ...testConfig, includeVacantUnits: true };
        const allocations = calculateRUBSAllocation(includeVacantConfig, 300, testUnits);

        expect(allocations.length).toBe(3);
        const vacantUnit = allocations.find((a) => a.isVacant);
        expect(vacantUnit).toBeDefined();
      });

      it('should apply minimum charge', () => {
        const minConfig = { ...testConfig, minimumCharge: 100 };
        const allocations = calculateRUBSAllocation(minConfig, 100, testUnits);

        // Even though 100/2 = 50, minimum is 100
        expect(allocations[0].totalAmount).toBeGreaterThanOrEqual(100);
      });

      it('should apply maximum charge', () => {
        const maxConfig = { ...testConfig, maximumCharge: 50 };
        const allocations = calculateRUBSAllocation(maxConfig, 1000, testUnits);

        // Even though 1000/2 = 500, maximum is 50
        expect(allocations[0].totalAmount).toBeLessThanOrEqual(50);
      });

      it('should handle flat admin fee', () => {
        const flatFeeConfig = { ...testConfig, adminFeeType: 'flat' as const, adminFeeAmount: 20 };
        const allocations = calculateRUBSAllocation(flatFeeConfig, 100, testUnits);

        const totalAdminFee = allocations.reduce((sum, a) => sum + a.adminFee, 0);
        expect(totalAdminFee).toBe(20);
      });
    });
  });

  describe('Bill Tracking', () => {
    it('should store utility bill', () => {
      const now = new Date();
      const dueDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      utilityBills.set('bill-1', {
        id: 'bill-1',
        accountId: 'acct-1',
        propertyId: 'prop-1',
        unitId: null,
        providerId: 'prov-1',
        utilityType: 'electric',
        billNumber: 'BILL-001',
        statementDate: now,
        dueDate,
        periodStart: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        periodEnd: new Date(now.getFullYear(), now.getMonth(), 0),
        previousReading: 1000,
        currentReading: 1200,
        usage: 200,
        usageUnit: 'kWh',
        amount: 45.00,
        taxes: 3.50,
        fees: 1.50,
        totalAmount: 50.00,
        status: 'pending',
        paidDate: null,
        paidAmount: null,
        paymentMethod: null,
        paymentReference: null,
        documentUrl: null,
        notes: null,
        createdAt: now,
        updatedAt: now,
      });

      const bill = utilityBills.get('bill-1');
      expect(bill?.totalAmount).toBe(50);
      expect(bill?.usage).toBe(200);
    });
  });
});

describe('Owner Portal', () => {
  beforeEach(() => {
    owners.clear();
    ownerships.clear();
    ownerStatements.clear();
    distributions.clear();
  });

  describe('Statement Calculations', () => {
    describe('calculateIncome', () => {
      it('should categorize income correctly', () => {
        const lineItems: StatementLineItem[] = [
          { id: '1', date: new Date(), category: 'rent', description: 'Rent', unit: null, amount: 2000, type: 'income', referenceId: null, referenceType: null },
          { id: '2', date: new Date(), category: 'late_fee', description: 'Late Fee', unit: null, amount: 50, type: 'income', referenceId: null, referenceType: null },
          { id: '3', date: new Date(), category: 'pet_fee', description: 'Pet Fee', unit: null, amount: 25, type: 'income', referenceId: null, referenceType: null },
        ];

        const income = calculateIncome(lineItems);

        expect(income.rent).toBe(2000);
        expect(income.lateFees).toBe(50);
        expect(income.petFees).toBe(25);
        expect(income.totalIncome).toBe(2075);
      });

      it('should exclude expense items', () => {
        const lineItems: StatementLineItem[] = [
          { id: '1', date: new Date(), category: 'rent', description: 'Rent', unit: null, amount: 1500, type: 'income', referenceId: null, referenceType: null },
          { id: '2', date: new Date(), category: 'maintenance', description: 'Repair', unit: null, amount: 200, type: 'expense', referenceId: null, referenceType: null },
        ];

        const income = calculateIncome(lineItems);
        expect(income.totalIncome).toBe(1500);
      });
    });

    describe('calculateExpenses', () => {
      it('should categorize expenses correctly', () => {
        const lineItems: StatementLineItem[] = [
          { id: '1', date: new Date(), category: 'maintenance', description: 'Repair', unit: null, amount: 200, type: 'expense', referenceId: null, referenceType: null },
          { id: '2', date: new Date(), category: 'utilities', description: 'Water', unit: null, amount: 75, type: 'expense', referenceId: null, referenceType: null },
          { id: '3', date: new Date(), category: 'insurance', description: 'Insurance', unit: null, amount: 150, type: 'expense', referenceId: null, referenceType: null },
        ];

        const expenses = calculateExpenses(lineItems);

        expect(expenses.maintenance).toBe(200);
        expect(expenses.utilities).toBe(75);
        expect(expenses.insurance).toBe(150);
        expect(expenses.totalExpenses).toBe(425);
      });
    });

    describe('calculateManagementFee', () => {
      it('should calculate percentage fee', () => {
        expect(calculateManagementFee(10000, 'percentage', 8)).toBe(800);
        expect(calculateManagementFee(5000, 'percentage', 10)).toBe(500);
      });

      it('should return flat fee', () => {
        expect(calculateManagementFee(10000, 'flat', 500)).toBe(500);
        expect(calculateManagementFee(5000, 'flat', 500)).toBe(500);
      });
    });

    describe('calculateStatementSummary', () => {
      it('should calculate owner share correctly', () => {
        const income = { rent: 3000, lateFees: 0, applicationFees: 0, petFees: 0, parkingFees: 0, utilityReimbursements: 0, otherIncome: 0, totalIncome: 3000 };
        const expenses = { managementFee: 240, maintenance: 200, utilities: 0, insurance: 0, propertyTax: 0, hoa: 0, mortgage: 0, reserves: 0, otherExpenses: 0, totalExpenses: 440 };

        const summary = calculateStatementSummary(income, expenses, 50, 5);

        expect(summary.netOperatingIncome).toBe(2560);
        expect(summary.ownershipPercentage).toBe(50);
        expect(summary.ownerShare).toBe(1280); // 50% of NOI
        expect(summary.reserveContribution).toBe(64); // 5% of owner share
        expect(summary.distributionAmount).toBe(1216); // owner share - reserves
      });

      it('should handle 100% ownership', () => {
        const income = { rent: 2000, lateFees: 0, applicationFees: 0, petFees: 0, parkingFees: 0, utilityReimbursements: 0, otherIncome: 0, totalIncome: 2000 };
        const expenses = { managementFee: 160, maintenance: 0, utilities: 0, insurance: 0, propertyTax: 0, hoa: 0, mortgage: 0, reserves: 0, otherExpenses: 0, totalExpenses: 160 };

        const summary = calculateStatementSummary(income, expenses, 100, 0);

        expect(summary.ownerShare).toBe(1840);
        expect(summary.distributionAmount).toBe(1840);
      });
    });
  });

  describe('Owner Management', () => {
    it('should store owner', () => {
      const now = new Date();
      owners.set('owner-1', {
        id: 'owner-1',
        userId: 'user-1',
        name: 'John Smith',
        email: 'john@example.com',
        phone: '555-1234',
        address: '123 Main St',
        taxId: '***-**-1234',
        taxIdType: 'ssn',
        ownershipType: 'individual',
        distributionMethod: 'ach',
        bankAccountId: null,
        holdDistributions: false,
        minimumDistributionAmount: 100,
        statementDelivery: 'email',
        portalEnabled: true,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      });

      expect(owners.size).toBe(1);
      const owner = owners.get('owner-1');
      expect(owner?.name).toBe('John Smith');
      expect(owner?.distributionMethod).toBe('ach');
    });
  });

  describe('Distribution Management', () => {
    it('should track distribution status', () => {
      const now = new Date();
      const distribution = {
        id: 'dist-1',
        ownerId: 'owner-1',
        statementId: 'stmt-1',
        propertyId: 'prop-1',
        amount: 1500,
        method: 'ach' as const,
        status: 'pending' as const,
        scheduledDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        processedDate: null,
        bankAccountId: 'bank-1',
        checkNumber: null,
        wireReference: null,
        achTransactionId: null,
        failureReason: null,
        notes: null,
        createdById: 'admin-1',
        createdAt: now,
        updatedAt: now,
      };

      distributions.set(distribution.id, distribution);
      expect(distributions.get(distribution.id)?.status).toBe('pending');

      // Process distribution
      distribution.status = 'completed';
      distribution.processedDate = now;
      distribution.achTransactionId = 'ach_12345';
      distributions.set(distribution.id, distribution);

      expect(distributions.get(distribution.id)?.status).toBe('completed');
      expect(distributions.get(distribution.id)?.achTransactionId).toBe('ach_12345');
    });
  });
});

describe('Budget & Forecasting', () => {
  beforeEach(() => {
    budgets.clear();
    budgetActuals.clear();
    forecasts.clear();
    capExItems.clear();
  });

  describe('Variance Calculations', () => {
    describe('calculateVariance', () => {
      it('should calculate positive variance', () => {
        const result = calculateVariance(1000, 1100);
        expect(result.variance).toBe(100);
        expect(result.percentage).toBe(10);
      });

      it('should calculate negative variance', () => {
        const result = calculateVariance(1000, 900);
        expect(result.variance).toBe(-100);
        expect(result.percentage).toBe(-10);
      });

      it('should handle zero budget', () => {
        const result = calculateVariance(0, 100);
        expect(result.variance).toBe(100);
        expect(result.percentage).toBe(100);
      });

      it('should handle both zero', () => {
        const result = calculateVariance(0, 0);
        expect(result.variance).toBe(0);
        expect(result.percentage).toBe(0);
      });
    });

    describe('getVarianceStatus', () => {
      it('should return on_track for small variances', () => {
        expect(getVarianceStatus('income', 3)).toBe('on_track');
        expect(getVarianceStatus('expense', -3)).toBe('on_track');
      });

      it('should classify income variances correctly', () => {
        expect(getVarianceStatus('income', 15)).toBe('significantly_over');
        expect(getVarianceStatus('income', 7)).toBe('over');
        expect(getVarianceStatus('income', -7)).toBe('under');
        expect(getVarianceStatus('income', -15)).toBe('significantly_under');
      });

      it('should classify expense variances correctly', () => {
        expect(getVarianceStatus('expense', 15)).toBe('significantly_over');
        expect(getVarianceStatus('expense', 7)).toBe('over');
        expect(getVarianceStatus('expense', -7)).toBe('under');
        expect(getVarianceStatus('expense', -15)).toBe('significantly_under');
      });
    });
  });

  describe('Budget Distribution', () => {
    describe('distributeAnnualToMonths', () => {
      it('should distribute monthly evenly', () => {
        const months = distributeAnnualToMonths(12000, 'monthly');
        expect(months.length).toBe(12);
        expect(months.every((m) => m === 1000)).toBe(true);
      });

      it('should distribute quarterly', () => {
        const months = distributeAnnualToMonths(4000, 'quarterly');
        expect(months.filter((m) => m === 1000).length).toBe(4);
        expect(months.filter((m) => m === 0).length).toBe(8);
      });

      it('should handle annual payment', () => {
        const months = distributeAnnualToMonths(5000, 'annual');
        expect(months[11]).toBe(5000);
        expect(months.slice(0, 11).every((m) => m === 0)).toBe(true);
      });

      it('should handle one-time payment', () => {
        const months = distributeAnnualToMonths(1000, 'one_time', 6);
        expect(months[5]).toBe(1000); // 0-indexed
        expect(months.filter((m) => m === 0).length).toBe(11);
      });
    });

    describe('aggregateMonthlyToQuarterly', () => {
      it('should aggregate correctly', () => {
        const monthly = [100, 100, 100, 200, 200, 200, 300, 300, 300, 400, 400, 400];
        const quarterly = aggregateMonthlyToQuarterly(monthly);

        expect(quarterly.length).toBe(4);
        expect(quarterly[0]).toBe(300);
        expect(quarterly[1]).toBe(600);
        expect(quarterly[2]).toBe(900);
        expect(quarterly[3]).toBe(1200);
      });
    });
  });

  describe('Financial Projections', () => {
    describe('applyGrowthRate', () => {
      it('should apply compound growth', () => {
        const projections = applyGrowthRate(1000, 10, 3);

        expect(projections.length).toBe(3);
        expect(projections[0]).toBe(1000);
        expect(projections[1]).toBe(1100);
        expect(projections[2]).toBe(1210);
      });

      it('should handle zero growth', () => {
        const projections = applyGrowthRate(1000, 0, 3);
        expect(projections.every((p) => p === 1000)).toBe(true);
      });

      it('should handle negative growth', () => {
        const projections = applyGrowthRate(1000, -10, 3);
        expect(projections[1]).toBe(900);
      });
    });

    describe('calculateNPV', () => {
      it('should calculate NPV correctly', () => {
        const cashFlows = [100, 100, 100];
        const npv = calculateNPV(cashFlows, 10);

        // NPV = 100/1.1 + 100/1.1^2 + 100/1.1^3
        expect(npv).toBeCloseTo(248.69, 1);
      });

      it('should handle single cash flow', () => {
        const npv = calculateNPV([1000], 10);
        expect(npv).toBeCloseTo(909.09, 1);
      });
    });
  });

  describe('Variance Insights', () => {
    describe('generateVarianceInsights', () => {
      it('should generate insights for significant variances', () => {
        const categories = [
          { category: 'rental_income' as const, name: 'Rent', type: 'income' as const, budgeted: 1000, actual: 1200, variance: 200, variancePercent: 20, status: 'significantly_over' as const },
          { category: 'maintenance' as const, name: 'Maintenance', type: 'expense' as const, budgeted: 500, actual: 600, variance: 100, variancePercent: 20, status: 'significantly_over' as const },
        ];

        const insights = generateVarianceInsights(categories);

        expect(insights.length).toBeGreaterThan(0);
        expect(insights.some((i) => i.includes('Rent'))).toBe(true);
        expect(insights.some((i) => i.includes('Maintenance'))).toBe(true);
      });

      it('should report overall performance', () => {
        const categories = [
          { category: 'rental_income' as const, name: 'Rent', type: 'income' as const, budgeted: 1000, actual: 1020, variance: 20, variancePercent: 2, status: 'on_track' as const },
          { category: 'maintenance' as const, name: 'Maintenance', type: 'expense' as const, budgeted: 500, actual: 510, variance: 10, variancePercent: 2, status: 'on_track' as const },
        ];

        const insights = generateVarianceInsights(categories);

        expect(insights.some((i) => i.includes('100%') && i.includes('on track'))).toBe(true);
      });
    });
  });

  describe('CapEx Planning', () => {
    it('should store CapEx item', () => {
      const now = new Date();
      const plannedDate = new Date(now.getFullYear() + 1, 6, 1);

      capExItems.set('capex-1', {
        id: 'capex-1',
        propertyId: 'prop-1',
        name: 'Roof Replacement',
        description: 'Full roof replacement',
        category: 'exterior',
        estimatedCost: 15000,
        actualCost: null,
        status: 'planned',
        priority: 'high',
        plannedDate,
        completedDate: null,
        usefulLife: 25,
        fundingSource: 'reserves',
        notes: null,
        createdAt: now,
        updatedAt: now,
      });

      const item = capExItems.get('capex-1');
      expect(item?.name).toBe('Roof Replacement');
      expect(item?.estimatedCost).toBe(15000);
      expect(item?.usefulLife).toBe(25);
    });

    it('should track CapEx completion', () => {
      const now = new Date();
      const item = {
        id: 'capex-2',
        propertyId: 'prop-1',
        name: 'HVAC Upgrade',
        description: null,
        category: 'mechanical',
        estimatedCost: 8000,
        actualCost: null,
        status: 'budgeted' as const,
        priority: 'medium' as const,
        plannedDate: now,
        completedDate: null,
        usefulLife: 15,
        fundingSource: 'operating' as const,
        notes: null,
        createdAt: now,
        updatedAt: now,
      };

      capExItems.set(item.id, item);

      // Complete it
      item.status = 'completed';
      item.completedDate = now;
      item.actualCost = 7500;
      capExItems.set(item.id, item);

      expect(capExItems.get(item.id)?.status).toBe('completed');
      expect(capExItems.get(item.id)?.actualCost).toBe(7500);
    });
  });
});

describe('Showing Scheduler', () => {
  beforeEach(() => {
    showings.clear();
    prospects.clear();
    showingAgents.clear();
    listingAvailability.clear();
  });

  describe('Time Utilities', () => {
    describe('getDayOfWeek', () => {
      it('should return correct day of week', () => {
        // Use local time constructor to avoid UTC timezone shift
        expect(getDayOfWeek(new Date(2024, 0, 1))).toBe('monday'); // Jan 1, 2024 is Monday
        expect(getDayOfWeek(new Date(2024, 0, 6))).toBe('saturday');
        expect(getDayOfWeek(new Date(2024, 0, 7))).toBe('sunday');
      });
    });

    describe('timeToMinutes', () => {
      it('should convert time string to minutes', () => {
        expect(timeToMinutes('00:00')).toBe(0);
        expect(timeToMinutes('09:00')).toBe(540);
        expect(timeToMinutes('12:30')).toBe(750);
        expect(timeToMinutes('23:59')).toBe(1439);
      });
    });

    describe('minutesToTime', () => {
      it('should convert minutes to time string', () => {
        expect(minutesToTime(0)).toBe('00:00');
        expect(minutesToTime(540)).toBe('09:00');
        expect(minutesToTime(750)).toBe('12:30');
        expect(minutesToTime(1439)).toBe('23:59');
      });
    });
  });

  describe('Time Slot Generation', () => {
    describe('generateTimeSlots', () => {
      it('should generate slots based on availability', () => {
        const availability: ListingAvailability = {
          id: 'avail-1',
          listingId: 'listing-1',
          propertyId: 'prop-1',
          defaultDuration: 30,
          bufferTime: 15,
          minNoticeHours: 2,
          maxAdvanceDays: 14,
          allowSelfSchedule: true,
          allowSelfGuided: false,
          requireApproval: false,
          weeklySchedule: [
            { dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00', status: 'available' },
          ],
          blockedDates: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // Find next Monday
        const today = new Date();
        const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
        const nextMonday = new Date(today);
        nextMonday.setDate(today.getDate() + daysUntilMonday);

        const slots = generateTimeSlots(availability, nextMonday, []);

        // 09:00-12:00 with 30min slots and 15min buffer = 4 slots
        // (09:00, 09:45, 10:30, 11:15)
        expect(slots.length).toBeGreaterThan(0);
        expect(slots[0].startTime).toBe('09:00');
      });

      it('should mark conflicting slots as unavailable', () => {
        const availability: ListingAvailability = {
          id: 'avail-2',
          listingId: 'listing-2',
          propertyId: 'prop-2',
          defaultDuration: 30,
          bufferTime: 0,
          minNoticeHours: 0,
          maxAdvanceDays: 14,
          allowSelfSchedule: true,
          allowSelfGuided: false,
          requireApproval: false,
          weeklySchedule: [
            { dayOfWeek: 'tuesday', startTime: '10:00', endTime: '12:00', status: 'available' },
          ],
          blockedDates: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // Find next Tuesday
        const today = new Date();
        const daysUntilTuesday = (9 - today.getDay()) % 7 || 7;
        const nextTuesday = new Date(today);
        nextTuesday.setDate(today.getDate() + daysUntilTuesday);

        const existingShowing: Partial<Showing> = {
          listingId: 'listing-2',
          scheduledDate: nextTuesday,
          startTime: '10:00',
          endTime: '10:30',
          status: 'confirmed',
        };

        const slots = generateTimeSlots(availability, nextTuesday, [existingShowing as Showing]);

        const conflictingSlot = slots.find((s) => s.startTime === '10:00');
        expect(conflictingSlot?.available).toBe(false);
      });
    });
  });

  describe('Showing Stats', () => {
    describe('calculateShowingStats', () => {
      it('should calculate stats correctly', () => {
        const testShowings: Partial<Showing>[] = [
          { status: 'completed', feedback: { rating: 4, interested: true, priceOpinion: null, conditionOpinion: null, locationOpinion: null, comments: null, followUpRequested: false, submittedAt: new Date() } },
          { status: 'completed', feedback: { rating: 5, interested: true, priceOpinion: null, conditionOpinion: null, locationOpinion: null, comments: null, followUpRequested: false, submittedAt: new Date() } },
          { status: 'completed', feedback: { rating: 3, interested: false, priceOpinion: null, conditionOpinion: null, locationOpinion: null, comments: null, followUpRequested: false, submittedAt: new Date() } },
          { status: 'cancelled', feedback: null },
          { status: 'no_show', feedback: null },
        ];

        const stats = calculateShowingStats(testShowings as Showing[]);

        expect(stats.total).toBe(5);
        expect(stats.completed).toBe(3);
        expect(stats.cancelled).toBe(1);
        expect(stats.noShow).toBe(1);
        expect(stats.feedbackCount).toBe(3);
        expect(stats.averageRating).toBe(4);
        expect(stats.conversionRate).toBe(67); // 2/3 interested
      });

      it('should handle empty showings', () => {
        const stats = calculateShowingStats([]);

        expect(stats.total).toBe(0);
        expect(stats.averageRating).toBe(0);
        expect(stats.conversionRate).toBe(0);
      });
    });
  });

  describe('Prospect Management', () => {
    it('should store prospect', () => {
      const now = new Date();
      prospects.set('prospect-1', {
        id: 'prospect-1',
        firstName: 'Alice',
        lastName: 'Johnson',
        email: 'alice@example.com',
        phone: '555-9876',
        preferredContactMethod: 'email',
        source: 'Zillow',
        prequalified: true,
        budget: 2500,
        desiredMoveIn: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        desiredBedrooms: 2,
        desiredBathrooms: 1,
        pets: true,
        notes: 'Has a small dog',
        listingIds: ['listing-1'],
        showingCount: 0,
        lastContactAt: null,
        status: 'new',
        lostReason: null,
        createdAt: now,
        updatedAt: now,
      });

      const prospect = prospects.get('prospect-1');
      expect(prospect?.firstName).toBe('Alice');
      expect(prospect?.budget).toBe(2500);
      expect(prospect?.prequalified).toBe(true);
    });

    it('should track prospect status changes', () => {
      const now = new Date();
      const prospect = {
        id: 'prospect-2',
        firstName: 'Bob',
        lastName: 'Smith',
        email: 'bob@example.com',
        phone: null,
        preferredContactMethod: 'email' as const,
        source: null,
        prequalified: false,
        budget: null,
        desiredMoveIn: null,
        desiredBedrooms: null,
        desiredBathrooms: null,
        pets: false,
        notes: null,
        listingIds: [],
        showingCount: 0,
        lastContactAt: null,
        status: 'new' as const,
        lostReason: null,
        createdAt: now,
        updatedAt: now,
      };

      prospects.set(prospect.id, prospect);
      expect(prospects.get(prospect.id)?.status).toBe('new');

      prospect.status = 'active';
      prospect.showingCount = 1;
      prospects.set(prospect.id, prospect);
      expect(prospects.get(prospect.id)?.status).toBe('active');

      prospect.status = 'qualified';
      prospects.set(prospect.id, prospect);
      expect(prospects.get(prospect.id)?.status).toBe('qualified');
    });
  });

  describe('Showing Management', () => {
    it('should store showing', () => {
      const now = new Date();
      const scheduledDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

      showings.set('showing-1', {
        id: 'showing-1',
        listingId: 'listing-1',
        propertyId: 'prop-1',
        unitId: 'unit-1',
        prospectId: 'prospect-1',
        agentId: 'agent-1',
        type: 'in_person',
        status: 'scheduled',
        scheduledDate,
        startTime: '14:00',
        endTime: '14:30',
        duration: 30,
        timezone: 'America/New_York',
        notes: null,
        prospectNotes: null,
        accessInstructions: 'Ring doorbell',
        lockboxCode: null,
        virtualMeetingUrl: null,
        confirmationSentAt: null,
        reminderSentAt: null,
        feedback: null,
        cancelledReason: null,
        cancelledBy: null,
        createdAt: now,
        updatedAt: now,
      });

      const showing = showings.get('showing-1');
      expect(showing?.type).toBe('in_person');
      expect(showing?.startTime).toBe('14:00');
      expect(showing?.duration).toBe(30);
    });

    it('should track showing lifecycle', () => {
      const now = new Date();
      const showing = {
        id: 'showing-2',
        listingId: 'listing-1',
        propertyId: 'prop-1',
        unitId: null,
        prospectId: 'prospect-1',
        agentId: null,
        type: 'virtual' as const,
        status: 'scheduled' as const,
        scheduledDate: now,
        startTime: '10:00',
        endTime: '10:30',
        duration: 30,
        timezone: 'America/New_York',
        notes: null,
        prospectNotes: null,
        accessInstructions: null,
        lockboxCode: null,
        virtualMeetingUrl: 'https://meet.example.com/abc123',
        confirmationSentAt: null,
        reminderSentAt: null,
        feedback: null,
        cancelledReason: null,
        cancelledBy: null,
        createdAt: now,
        updatedAt: now,
      };

      showings.set(showing.id, showing);

      // Confirm
      showing.status = 'confirmed';
      showing.confirmationSentAt = now;
      showings.set(showing.id, showing);
      expect(showings.get(showing.id)?.status).toBe('confirmed');

      // Start
      showing.status = 'in_progress';
      showings.set(showing.id, showing);
      expect(showings.get(showing.id)?.status).toBe('in_progress');

      // Complete with feedback
      showing.status = 'completed';
      showing.feedback = {
        rating: 4,
        interested: true,
        priceOpinion: 'fair',
        conditionOpinion: 'good',
        locationOpinion: 'excellent',
        comments: 'Great property',
        followUpRequested: true,
        submittedAt: now,
      };
      showings.set(showing.id, showing);

      expect(showings.get(showing.id)?.status).toBe('completed');
      expect(showings.get(showing.id)?.feedback?.rating).toBe(4);
      expect(showings.get(showing.id)?.feedback?.interested).toBe(true);
    });
  });
});

// ============================================================================
// MOVE-IN/MOVE-OUT WORKFLOWS
// ============================================================================

describe('Move-In/Move-Out Workflows', () => {
  beforeEach(() => {
    workflows.clear();
    checklistTemplates.clear();
    checklistItems.clear();
    conditionReports.clear();
    keyRecords.clear();
    depositRecords.clear();
    depositDeductions.clear();
    utilityTransfers.clear();
  });

  describe('calculateDepositRefund', () => {
    it('should calculate full refund with no deductions', () => {
      const deposit = {
        id: 'dep_1',
        leaseId: 'lease_1',
        tenantId: 'tenant_1',
        amount: 2000,
        depositType: 'security' as const,
        status: 'held' as const,
        interestAccrued: 50,
        deductions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = calculateDepositRefund(deposit, []);

      expect(result.totalDeductions).toBe(0);
      expect(result.refundAmount).toBe(2050); // deposit + interest
      expect(result.refundPercentage).toBeCloseTo(102.5, 1); // includes interest
    });

    it('should calculate partial refund with deductions', () => {
      const deposit = {
        id: 'dep_1',
        leaseId: 'lease_1',
        tenantId: 'tenant_1',
        amount: 2000,
        depositType: 'security' as const,
        status: 'held' as const,
        interestAccrued: 0,
        deductions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const deductions: DepositDeduction[] = [
        { id: 'ded_1', depositId: 'dep_1', category: 'Cleaning', description: 'Deep clean', amount: 300, photos: [], createdAt: new Date().toISOString() },
        { id: 'ded_2', depositId: 'dep_1', category: 'Repairs', description: 'Wall repair', amount: 200, photos: [], createdAt: new Date().toISOString() },
      ];

      const result = calculateDepositRefund(deposit, deductions);

      expect(result.totalDeductions).toBe(500);
      expect(result.refundAmount).toBe(1500);
      expect(result.refundPercentage).toBe(75);
    });

    it('should not go below zero refund', () => {
      const deposit = {
        id: 'dep_1',
        leaseId: 'lease_1',
        tenantId: 'tenant_1',
        amount: 500,
        depositType: 'security' as const,
        status: 'held' as const,
        interestAccrued: 0,
        deductions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const deductions: DepositDeduction[] = [
        { id: 'ded_1', depositId: 'dep_1', category: 'Damages', description: 'Major damage', amount: 1000, photos: [], createdAt: new Date().toISOString() },
      ];

      const result = calculateDepositRefund(deposit, deductions);

      expect(result.totalDeductions).toBe(1000);
      expect(result.refundAmount).toBe(0);
    });
  });

  describe('calculateWorkflowProgress', () => {
    it('should calculate progress correctly', () => {
      const items = [
        { id: '1', workflowId: 'w1', category: 'Keys', description: 'Return keys', status: 'completed' as const, photos: [], isRequired: true, order: 1 },
        { id: '2', workflowId: 'w1', category: 'Keys', description: 'Mailbox key', status: 'completed' as const, photos: [], isRequired: true, order: 2 },
        { id: '3', workflowId: 'w1', category: 'Utilities', description: 'Transfer utilities', status: 'pending' as const, photos: [], isRequired: true, order: 3 },
        { id: '4', workflowId: 'w1', category: 'Clean', description: 'Final clean', status: 'failed' as const, photos: [], isRequired: true, order: 4 },
      ];

      const result = calculateWorkflowProgress(items);

      expect(result.total).toBe(4);
      expect(result.completed).toBe(2);
      expect(result.pending).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.percentage).toBe(50);
    });

    it('should handle empty checklist', () => {
      const result = calculateWorkflowProgress([]);

      expect(result.total).toBe(0);
      expect(result.percentage).toBe(0);
    });
  });

  describe('compareConditions', () => {
    it('should detect no degradation', () => {
      expect(compareConditions('good', 'good')).toEqual({ degraded: false, severity: 'none' });
      expect(compareConditions('fair', 'good')).toEqual({ degraded: false, severity: 'none' }); // improved
    });

    it('should detect minor degradation', () => {
      expect(compareConditions('excellent', 'good')).toEqual({ degraded: true, severity: 'minor' });
      expect(compareConditions('good', 'fair')).toEqual({ degraded: true, severity: 'minor' });
    });

    it('should detect moderate degradation', () => {
      expect(compareConditions('excellent', 'fair')).toEqual({ degraded: true, severity: 'moderate' });
      expect(compareConditions('good', 'poor')).toEqual({ degraded: true, severity: 'moderate' });
    });

    it('should detect severe degradation', () => {
      expect(compareConditions('excellent', 'poor')).toEqual({ degraded: true, severity: 'severe' });
      expect(compareConditions('excellent', 'damaged')).toEqual({ degraded: true, severity: 'severe' });
    });
  });

  describe('getDepositDeadline', () => {
    it('should calculate deadline with default 30 days', () => {
      const moveOutDate = '2024-06-15';
      const deadline = getDepositDeadline(moveOutDate);
      expect(deadline).toBe('2024-07-15');
    });

    it('should calculate deadline with custom days', () => {
      const moveOutDate = '2024-06-15';
      const deadline = getDepositDeadline(moveOutDate, 21);
      expect(deadline).toBe('2024-07-06');
    });
  });

  describe('generateDepositItemization', () => {
    it('should generate correct itemization', () => {
      const deposit = {
        id: 'dep_1',
        leaseId: 'lease_1',
        tenantId: 'tenant_1',
        amount: 2000,
        depositType: 'security' as const,
        status: 'held' as const,
        interestAccrued: 25,
        deductions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const deductions: DepositDeduction[] = [
        { id: 'ded_1', depositId: 'dep_1', category: 'Cleaning', description: 'Carpet cleaning', amount: 150, photos: [], createdAt: new Date().toISOString() },
        { id: 'ded_2', depositId: 'dep_1', category: 'Repairs', description: 'Door repair', amount: 75, photos: [], createdAt: new Date().toISOString() },
      ];

      const itemization = generateDepositItemization(deposit, deductions);

      expect(itemization.depositAmount).toBe(2000);
      expect(itemization.interestAccrued).toBe(25);
      expect(itemization.deductionItems).toHaveLength(2);
      expect(itemization.totalDeductions).toBe(225);
      expect(itemization.refundAmount).toBe(1800); // 2000 + 25 - 225
    });
  });
});

// ============================================================================
// HOA/COA MANAGEMENT
// ============================================================================

describe('HOA/COA Management', () => {
  beforeEach(() => {
    associations.clear();
    hoaAssessments.clear();
    violations.clear();
    architecturalRequests.clear();
    boardMeetings.clear();
    associationDocuments.clear();
  });

  describe('calculateAssessmentSchedule', () => {
    it('should generate monthly schedule', () => {
      const schedule = calculateAssessmentSchedule(300, 'monthly', '2024-01-01', 6);

      expect(schedule).toHaveLength(6);
      expect(schedule[0].amount).toBe(300);
      expect(schedule[0].dueDate).toBe('2024-01-01');
      expect(schedule[5].dueDate).toBe('2024-06-01');
    });

    it('should generate quarterly schedule', () => {
      const schedule = calculateAssessmentSchedule(900, 'quarterly', '2024-01-01', 4);

      expect(schedule).toHaveLength(4);
      expect(schedule[0].dueDate).toBe('2024-01-01');
      expect(schedule[1].dueDate).toBe('2024-04-01');
      expect(schedule[2].dueDate).toBe('2024-07-01');
      expect(schedule[3].dueDate).toBe('2024-10-01');
    });

    it('should generate annual schedule', () => {
      const schedule = calculateAssessmentSchedule(3600, 'annual', '2024-01-01', 3);

      expect(schedule).toHaveLength(3);
      expect(schedule[0].dueDate).toBe('2024-01-01');
      expect(schedule[1].dueDate).toBe('2025-01-01');
      expect(schedule[2].dueDate).toBe('2026-01-01');
    });
  });

  describe('calculateHOALateFee', () => {
    it('should return 0 within grace period', () => {
      const assessment = {
        id: 'a1',
        associationId: 'hoa_1',
        propertyId: 'p1',
        type: 'regular' as const,
        description: 'Monthly',
        amount: 300,
        dueDate: new Date().toISOString().split('T')[0], // today
        status: 'pending' as const,
        paidAmount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(calculateHOALateFee(assessment, 10, 15)).toBe(0);
    });

    it('should calculate late fee after grace period', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 30); // 30 days ago

      const assessment = {
        id: 'a1',
        associationId: 'hoa_1',
        propertyId: 'p1',
        type: 'regular' as const,
        description: 'Monthly',
        amount: 300,
        dueDate: pastDate.toISOString().split('T')[0],
        status: 'pending' as const,
        paidAmount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(calculateHOALateFee(assessment, 10, 15)).toBe(30); // 10% of 300
    });

    it('should return 0 for paid assessments', () => {
      const assessment = {
        id: 'a1',
        associationId: 'hoa_1',
        propertyId: 'p1',
        type: 'regular' as const,
        description: 'Monthly',
        amount: 300,
        dueDate: '2024-01-01',
        status: 'paid' as const,
        paidAmount: 300,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(calculateHOALateFee(assessment)).toBe(0);
    });
  });

  describe('getViolationEscalationLevel', () => {
    it('should return level 1 for new violations', () => {
      const violation = {
        id: 'v1',
        associationId: 'hoa_1',
        propertyId: 'p1',
        type: 'parking' as const,
        description: 'Parked in fire lane',
        reportedDate: new Date().toISOString(),
        status: 'open' as const,
        finePaid: false,
        photos: [],
        timeline: [{ id: 'e1', date: new Date().toISOString(), action: 'reported' }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = getViolationEscalationLevel(violation);

      expect(result.level).toBe(1);
      expect(result.nextAction).toBe('Send warning letter');
    });

    it('should return level 2 after warning sent', () => {
      const violation = {
        id: 'v1',
        associationId: 'hoa_1',
        propertyId: 'p1',
        type: 'parking' as const,
        description: 'Parked in fire lane',
        reportedDate: new Date().toISOString(),
        status: 'warning_sent' as const,
        finePaid: false,
        photos: [],
        timeline: [
          { id: 'e1', date: new Date().toISOString(), action: 'reported' },
          { id: 'e2', date: new Date().toISOString(), action: 'warning_sent' },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = getViolationEscalationLevel(violation);

      expect(result.level).toBe(2);
      expect(result.nextAction).toBe('Issue fine');
    });

    it('should return level 3 after fine issued and unpaid', () => {
      const violation = {
        id: 'v1',
        associationId: 'hoa_1',
        propertyId: 'p1',
        type: 'parking' as const,
        description: 'Parked in fire lane',
        reportedDate: new Date().toISOString(),
        status: 'fine_issued' as const,
        finePaid: false,
        fineAmount: 100,
        photos: [],
        timeline: [
          { id: 'e1', date: new Date().toISOString(), action: 'reported' },
          { id: 'e2', date: new Date().toISOString(), action: 'warning_sent' },
          { id: 'e3', date: new Date().toISOString(), action: 'fine_issued' },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = getViolationEscalationLevel(violation);

      expect(result.level).toBe(3);
      expect(result.nextAction).toBe('Escalate to legal');
    });
  });

  describe('calculateAnnualHOACost', () => {
    it('should calculate annual cost from monthly assessments', () => {
      const association = {
        id: 'hoa_1',
        name: 'Test HOA',
        type: 'hoa' as const,
        propertyId: 'p1',
        regularAssessment: 300,
        assessmentFrequency: 'monthly' as const,
        specialAssessments: [],
        rules: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = calculateAnnualHOACost(association);

      expect(result.regularAssessments).toBe(3600); // 300 * 12
      expect(result.specialAssessments).toBe(0);
      expect(result.total).toBe(3600);
    });

    it('should include special assessments for current year', () => {
      const currentYear = new Date().getFullYear();
      const association = {
        id: 'hoa_1',
        name: 'Test HOA',
        type: 'hoa' as const,
        propertyId: 'p1',
        regularAssessment: 300,
        assessmentFrequency: 'monthly' as const,
        specialAssessments: [
          { id: 'sa1', description: 'Roof repair', amount: 500, dueDate: `${currentYear}-06-01`, reason: 'Maintenance', isOneTime: true },
          { id: 'sa2', description: 'Pool upgrade', amount: 300, dueDate: `${currentYear}-09-01`, reason: 'Improvement', isOneTime: true },
        ],
        rules: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = calculateAnnualHOACost(association);

      expect(result.regularAssessments).toBe(3600);
      expect(result.specialAssessments).toBe(800);
      expect(result.total).toBe(4400);
    });
  });

  describe('getAssessmentSummary', () => {
    it('should summarize assessments correctly', () => {
      const now = new Date();
      const pastDate = new Date(now);
      pastDate.setMonth(pastDate.getMonth() - 2);

      const assessmentList = [
        { id: 'a1', associationId: 'h1', propertyId: 'p1', type: 'regular' as const, description: 'Jan', amount: 300, dueDate: '2024-01-01', status: 'paid' as const, paidAmount: 300, createdAt: '', updatedAt: '' },
        { id: 'a2', associationId: 'h1', propertyId: 'p1', type: 'regular' as const, description: 'Feb', amount: 300, dueDate: '2024-02-01', status: 'paid' as const, paidAmount: 300, createdAt: '', updatedAt: '' },
        { id: 'a3', associationId: 'h1', propertyId: 'p1', type: 'regular' as const, description: 'Mar', amount: 300, dueDate: pastDate.toISOString().split('T')[0], status: 'pending' as const, paidAmount: 0, createdAt: '', updatedAt: '' },
      ];

      const summary = getAssessmentSummary(assessmentList);

      expect(summary.total).toBe(3);
      expect(summary.paid).toBe(2);
      expect(summary.totalAmount).toBe(900);
      expect(summary.paidAmount).toBe(600);
    });
  });
});

// ============================================================================
// TAX DOCUMENT MANAGEMENT
// ============================================================================

describe('Tax Document Management', () => {
  beforeEach(() => {
    taxYears.clear();
    taxRecipients.clear();
    taxDocuments.clear();
    taxPayments.clear();
    ownerTaxPackets.clear();
    depreciationItems.clear();
  });

  describe('calculateReportablePayments', () => {
    it('should group payments by recipient and filter by threshold', () => {
      const payments = [
        { id: 'p1', recipientId: 'r1', taxYearId: 'ty_2024', paymentDate: '2024-03-01', amount: 400, category: 'repairs', description: 'Plumbing', isReportable: true, createdAt: '' },
        { id: 'p2', recipientId: 'r1', taxYearId: 'ty_2024', paymentDate: '2024-06-01', amount: 300, category: 'repairs', description: 'Electrical', isReportable: true, createdAt: '' },
        { id: 'p3', recipientId: 'r2', taxYearId: 'ty_2024', paymentDate: '2024-04-01', amount: 200, category: 'repairs', description: 'Minor fix', isReportable: true, createdAt: '' },
      ];

      const result = calculateReportablePayments(payments, 600);

      expect(result.size).toBe(1); // Only r1 meets threshold
      expect(result.get('r1')?.total).toBe(700);
      expect(result.get('r1')?.payments).toHaveLength(2);
    });

    it('should exclude non-reportable payments', () => {
      const payments = [
        { id: 'p1', recipientId: 'r1', taxYearId: 'ty_2024', paymentDate: '2024-03-01', amount: 1000, category: 'materials', description: 'Lumber', isReportable: false, createdAt: '' },
      ];

      const result = calculateReportablePayments(payments, 600);

      expect(result.size).toBe(0);
    });
  });

  describe('determineFormType', () => {
    it('should return 1099-NEC for contractors', () => {
      expect(determineFormType('contractor', 'services')).toBe('1099-NEC');
    });

    it('should return 1099-MISC for rent payments', () => {
      expect(determineFormType('owner', 'rent')).toBe('1099-MISC');
      expect(determineFormType('vendor', 'lease')).toBe('1099-MISC');
    });

    it('should return 1099-INT for interest', () => {
      expect(determineFormType('tenant', 'interest')).toBe('1099-INT');
    });
  });

  describe('calculateStraightLineDepreciation', () => {
    it('should calculate annual depreciation correctly', () => {
      const result = calculateStraightLineDepreciation(100000, 10000, 27.5, 5);

      expect(result.annualDepreciation).toBeCloseTo(3272.73, 2);
      expect(result.accumulatedDepreciation).toBeCloseTo(16363.64, 2);
      expect(result.remainingValue).toBeCloseTo(83636.36, 2);
    });

    it('should not exceed depreciable base', () => {
      const result = calculateStraightLineDepreciation(100000, 10000, 27.5, 30);

      expect(result.accumulatedDepreciation).toBe(90000); // depreciable base
      expect(result.remainingValue).toBe(10000); // salvage value
    });
  });

  describe('calculateMACRSDepreciation', () => {
    it('should calculate residential MACRS depreciation', () => {
      const year1 = calculateMACRSDepreciation(100000, 'residential', 1);
      const year2 = calculateMACRSDepreciation(100000, 'residential', 2);

      expect(year1).toBe(3636); // 3.636% of 100000
      expect(year2).toBe(3636);
    });

    it('should calculate commercial MACRS depreciation', () => {
      const year1 = calculateMACRSDepreciation(100000, 'commercial', 1);

      expect(year1).toBe(2564); // 2.564% of 100000
    });

    it('should return 0 for years beyond useful life', () => {
      const year30 = calculateMACRSDepreciation(100000, 'residential', 30);

      expect(year30).toBe(0); // 27.5 year property
    });
  });

  describe('validateTIN', () => {
    it('should validate SSN format', () => {
      expect(validateTIN('123-45-6789', 'ssn')).toBe(true);
      expect(validateTIN('123456789', 'ssn')).toBe(true);
      expect(validateTIN('000-00-0000', 'ssn')).toBe(false); // all zeros
      expect(validateTIN('666-45-6789', 'ssn')).toBe(false); // invalid area
      expect(validateTIN('12345678', 'ssn')).toBe(false); // too short
    });

    it('should validate EIN format', () => {
      expect(validateTIN('12-3456789', 'ein')).toBe(true);
      expect(validateTIN('123456789', 'ein')).toBe(true);
      expect(validateTIN('07-1234567', 'ein')).toBe(false); // invalid prefix
      expect(validateTIN('1234567', 'ein')).toBe(false); // too short
    });
  });

  describe('generateTaxSummary', () => {
    it('should summarize tax documents by form type and status', () => {
      const docs = [
        { id: 'd1', taxYearId: 'ty_2024', year: 2024, formType: '1099-NEC' as const, recipientId: 'r1', payerId: 'p1', status: 'filed' as const, filingStatus: 'accepted' as const, totalAmount: 5000, breakdown: {}, createdAt: '', updatedAt: '' },
        { id: 'd2', taxYearId: 'ty_2024', year: 2024, formType: '1099-NEC' as const, recipientId: 'r2', payerId: 'p1', status: 'approved' as const, filingStatus: 'pending' as const, totalAmount: 3000, breakdown: {}, createdAt: '', updatedAt: '' },
        { id: 'd3', taxYearId: 'ty_2024', year: 2024, formType: '1099-MISC' as const, recipientId: 'r3', payerId: 'p1', status: 'draft' as const, filingStatus: 'not_filed' as const, totalAmount: 2000, breakdown: {}, createdAt: '', updatedAt: '' },
      ];

      const summary = generateTaxSummary(docs, 2024);

      expect(summary.totalDocuments).toBe(3);
      expect(summary.byFormType['1099-NEC']).toBe(2);
      expect(summary.byFormType['1099-MISC']).toBe(1);
      expect(summary.totalAmount).toBe(10000);
      expect(summary.filedCount).toBe(1);
      expect(summary.pendingCount).toBe(1);
    });
  });
});

// ============================================================================
// RENTAL ASSISTANCE PROGRAMS
// ============================================================================

describe('Rental Assistance Programs', () => {
  beforeEach(() => {
    assistancePrograms.clear();
    assistanceApplications.clear();
    vouchers.clear();
    assistanceInspections.clear();
    assistancePayments.clear();
    landlordCertifications.clear();
    complianceReports.clear();
  });

  describe('calculateHAPPayment', () => {
    it('should calculate HAP using 30% of income rule', () => {
      const result = calculateHAPPayment(1500, 2000, 1600, 100);

      // Tenant pays 30% of income = 600
      // Gross rent = 1500 + 100 = 1600
      // HAP = min(paymentStandard, grossRent) - tenantPortion = 1600 - 600 = 1000
      expect(result.tenantPortion).toBe(600);
      expect(result.grossRent).toBe(1600);
      expect(result.hapAmount).toBe(1000);
    });

    it('should cap HAP at payment standard', () => {
      const result = calculateHAPPayment(2000, 2000, 1500, 0);

      // Gross rent = 2000, but payment standard is 1500
      // Tenant portion = 600
      // HAP = min(1500, 2000) - 600 = 900
      expect(result.hapAmount).toBe(900);
    });

    it('should not go below zero HAP', () => {
      const result = calculateHAPPayment(500, 5000, 1500, 0);

      // Tenant portion = 1500 (30% of 5000)
      // Gross rent = 500
      // HAP would be negative, so 0
      expect(result.hapAmount).toBe(0);
    });
  });

  describe('isInspectionDue', () => {
    it('should return true if no previous inspection', () => {
      const voucher = {
        id: 'v1',
        programId: 'prog_1',
        applicationId: 'app_1',
        voucherNumber: 'V123',
        tenantId: 't1',
        propertyId: 'p1',
        unitId: 'u1',
        status: 'active' as const,
        hapAmount: 1000,
        tenantPortion: 500,
        totalRent: 1500,
        utilityAllowance: 100,
        effectiveDate: '2024-01-01',
        createdAt: '',
        updatedAt: '',
      };

      expect(isInspectionDue(voucher, undefined)).toBe(true);
    });

    it('should return true if inspection is overdue', () => {
      const voucher = {
        id: 'v1',
        programId: 'prog_1',
        applicationId: 'app_1',
        voucherNumber: 'V123',
        tenantId: 't1',
        propertyId: 'p1',
        unitId: 'u1',
        status: 'active' as const,
        hapAmount: 1000,
        tenantPortion: 500,
        totalRent: 1500,
        utilityAllowance: 100,
        effectiveDate: '2024-01-01',
        createdAt: '',
        updatedAt: '',
      };

      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 14);

      const lastInspection = {
        id: 'i1',
        programId: 'prog_1',
        propertyId: 'p1',
        unitId: 'u1',
        type: 'annual' as const,
        scheduledDate: oldDate.toISOString(),
        completedDate: oldDate.toISOString(),
        deficiencies: [],
        createdAt: '',
        updatedAt: '',
      };

      expect(isInspectionDue(voucher, lastInspection, 12)).toBe(true);
    });

    it('should return false if inspection is current', () => {
      const voucher = {
        id: 'v1',
        programId: 'prog_1',
        applicationId: 'app_1',
        voucherNumber: 'V123',
        tenantId: 't1',
        propertyId: 'p1',
        unitId: 'u1',
        status: 'active' as const,
        hapAmount: 1000,
        tenantPortion: 500,
        totalRent: 1500,
        utilityAllowance: 100,
        effectiveDate: '2024-01-01',
        createdAt: '',
        updatedAt: '',
      };

      const recentDate = new Date();
      recentDate.setMonth(recentDate.getMonth() - 6);

      const lastInspection = {
        id: 'i1',
        programId: 'prog_1',
        propertyId: 'p1',
        unitId: 'u1',
        type: 'annual' as const,
        scheduledDate: recentDate.toISOString(),
        completedDate: recentDate.toISOString(),
        deficiencies: [],
        createdAt: '',
        updatedAt: '',
      };

      expect(isInspectionDue(voucher, lastInspection, 12)).toBe(false);
    });
  });

  describe('calculateInspectionPassRate', () => {
    it('should calculate pass rate correctly', () => {
      const inspectionList = [
        { id: 'i1', programId: 'p1', propertyId: 'pr1', unitId: 'u1', type: 'annual' as const, scheduledDate: '', result: 'pass' as const, deficiencies: [], createdAt: '', updatedAt: '' },
        { id: 'i2', programId: 'p1', propertyId: 'pr2', unitId: 'u2', type: 'annual' as const, scheduledDate: '', result: 'pass' as const, deficiencies: [], createdAt: '', updatedAt: '' },
        { id: 'i3', programId: 'p1', propertyId: 'pr3', unitId: 'u3', type: 'annual' as const, scheduledDate: '', result: 'fail' as const, deficiencies: [], createdAt: '', updatedAt: '' },
        { id: 'i4', programId: 'p1', propertyId: 'pr4', unitId: 'u4', type: 'annual' as const, scheduledDate: '', result: 'pass' as const, deficiencies: [], createdAt: '', updatedAt: '' },
      ];

      const result = calculateInspectionPassRate(inspectionList);

      expect(result.total).toBe(4);
      expect(result.passed).toBe(3);
      expect(result.failed).toBe(1);
      expect(result.passRate).toBe(75);
    });

    it('should handle empty list', () => {
      const result = calculateInspectionPassRate([]);

      expect(result.total).toBe(0);
      expect(result.passRate).toBe(0);
    });
  });

  describe('getDeficiencySummary', () => {
    it('should summarize deficiencies by category and severity', () => {
      const deficiencies = [
        { id: 'd1', category: 'Plumbing', description: 'Leak', severity: 'major' as const, correctionVerified: false },
        { id: 'd2', category: 'Electrical', description: 'Outlet', severity: 'minor' as const, correctionVerified: false },
        { id: 'd3', category: 'Plumbing', description: 'Faucet', severity: 'minor' as const, correctedDate: '2024-01-15', correctionVerified: true },
        { id: 'd4', category: 'Safety', description: 'Smoke detector', severity: 'life_threatening' as const, correctionVerified: false },
      ];

      const summary = getDeficiencySummary(deficiencies);

      expect(summary.total).toBe(4);
      expect(summary.byCategory['Plumbing']).toBe(2);
      expect(summary.byCategory['Electrical']).toBe(1);
      expect(summary.byCategory['Safety']).toBe(1);
      expect(summary.bySeverity['minor']).toBe(2);
      expect(summary.bySeverity['major']).toBe(1);
      expect(summary.bySeverity['life_threatening']).toBe(1);
      expect(summary.corrected).toBe(1);
      expect(summary.pending).toBe(3);
    });
  });

  describe('calculatePaymentSummary', () => {
    it('should summarize payments correctly', () => {
      const payments = [
        { id: 'p1', voucherId: 'v1', programId: 'prog1', propertyId: 'pr1', landlordId: 'l1', period: '2024-01', hapAmount: 1000, adjustments: 0, netAmount: 1000, status: 'paid' as const, scheduledDate: '', paidDate: '2024-01-05', createdAt: '' },
        { id: 'p2', voucherId: 'v2', programId: 'prog1', propertyId: 'pr2', landlordId: 'l1', period: '2024-01', hapAmount: 1200, adjustments: -50, netAmount: 1150, status: 'paid' as const, scheduledDate: '', paidDate: '2024-01-05', createdAt: '' },
        { id: 'p3', voucherId: 'v3', programId: 'prog1', propertyId: 'pr3', landlordId: 'l1', period: '2024-01', hapAmount: 900, adjustments: 0, netAmount: 900, status: 'scheduled' as const, scheduledDate: '2024-01-10', createdAt: '' },
      ];

      const summary = calculatePaymentSummary(payments, '2024-01');

      expect(summary.totalPayments).toBe(3);
      expect(summary.totalAmount).toBe(3050);
      expect(summary.paidAmount).toBe(2150);
      expect(summary.pendingAmount).toBe(900);
      expect(summary.averagePayment).toBeCloseTo(1016.67, 2);
    });
  });

  describe('getVoucherExpirationDays', () => {
    it('should calculate days until expiration', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const voucher = {
        id: 'v1',
        programId: 'prog_1',
        applicationId: 'app_1',
        voucherNumber: 'V123',
        tenantId: 't1',
        propertyId: 'p1',
        unitId: 'u1',
        status: 'active' as const,
        hapAmount: 1000,
        tenantPortion: 500,
        totalRent: 1500,
        utilityAllowance: 100,
        effectiveDate: '2024-01-01',
        expirationDate: futureDate.toISOString().split('T')[0],
        createdAt: '',
        updatedAt: '',
      };

      const days = getVoucherExpirationDays(voucher);

      expect(days).toBeGreaterThanOrEqual(29);
      expect(days).toBeLessThanOrEqual(31);
    });

    it('should return -1 for vouchers without expiration', () => {
      const voucher = {
        id: 'v1',
        programId: 'prog_1',
        applicationId: 'app_1',
        voucherNumber: 'V123',
        tenantId: 't1',
        propertyId: 'p1',
        unitId: 'u1',
        status: 'active' as const,
        hapAmount: 1000,
        tenantPortion: 500,
        totalRent: 1500,
        utilityAllowance: 100,
        effectiveDate: '2024-01-01',
        createdAt: '',
        updatedAt: '',
      };

      expect(getVoucherExpirationDays(voucher)).toBe(-1);
    });
  });
});

// ===========================================================================
// AMENITY BOOKING TESTS
// ===========================================================================

describe('Amenity Booking', () => {
  beforeEach(() => {
    amenityStore.clear();
    amenityReservations.clear();
    amenityWaitlists.clear();
    amenityRecurringBookings.clear();
    amenityUsageLogs.clear();
  });

  describe('generateConfirmationCode', () => {
    it('should generate 6-character codes', () => {
      const code1 = generateAmenityConfirmationCode();
      const code2 = generateAmenityConfirmationCode();

      expect(code1).toHaveLength(6);
      expect(code2).toHaveLength(6);
      expect(code1).not.toBe(code2);
    });

    it('should generate alphanumeric codes', () => {
      const code = generateAmenityConfirmationCode();
      expect(code).toMatch(/^[A-Z0-9]+$/);
    });
  });
});

// ===========================================================================
// PACKAGE TRACKING TESTS
// ===========================================================================

describe('Package Tracking', () => {
  beforeEach(() => {
    packageLockers.clear();
    packageStore.clear();
    packagePickupLogs.clear();
    packageProxyAuthorizations.clear();
    packageForwardingAddresses.clear();
  });

  describe('generateAccessCode', () => {
    it('should generate codes of specified length', () => {
      const code6 = generateAccessCode(6);
      const code8 = generateAccessCode(8);

      expect(code6).toHaveLength(6);
      expect(code8).toHaveLength(8);
    });

    it('should generate numeric codes', () => {
      const code = generateAccessCode(6);
      expect(code).toMatch(/^\d+$/);
    });
  });

  describe('validateTrackingNumber', () => {
    it('should validate USPS tracking numbers', () => {
      expect(validateTrackingNumber('9400111899223033225712', 'usps')).toBe(true);
      expect(validateTrackingNumber('94001118992230332257', 'usps')).toBe(true);
      expect(validateTrackingNumber('12345', 'usps')).toBe(false);
    });

    it('should validate UPS tracking numbers', () => {
      expect(validateTrackingNumber('1Z999AA10123456784', 'ups')).toBe(true);
      expect(validateTrackingNumber('1Z12345E0291980793', 'ups')).toBe(true);
      expect(validateTrackingNumber('12345', 'ups')).toBe(false);
    });

    it('should validate FedEx tracking numbers', () => {
      expect(validateTrackingNumber('123456789012', 'fedex')).toBe(true);
      expect(validateTrackingNumber('123456789012345', 'fedex')).toBe(true); // 15 digits max
      expect(validateTrackingNumber('1234', 'fedex')).toBe(false);
    });

    it('should validate Amazon tracking numbers', () => {
      expect(validateTrackingNumber('TBA123456789000', 'amazon')).toBe(true);
      expect(validateTrackingNumber('TBA999888777666', 'amazon')).toBe(true);
      expect(validateTrackingNumber('ABC123', 'amazon')).toBe(false);
    });

    it('should validate DHL tracking numbers', () => {
      expect(validateTrackingNumber('1234567890', 'dhl')).toBe(true);
      expect(validateTrackingNumber('123456789', 'dhl')).toBe(false);
    });
  });

  describe('findAvailableLocker', () => {
    it('should find available locker of correct size', () => {
      const locker1: PackageLocker = {
        id: 'locker1',
        propertyId: 'p1',
        lockerNumber: 'L001',
        size: 'small',
        status: 'available',
        createdAt: '',
        updatedAt: '',
      };
      const locker2: PackageLocker = {
        id: 'locker2',
        propertyId: 'p1',
        lockerNumber: 'L002',
        size: 'large',
        status: 'available',
        createdAt: '',
        updatedAt: '',
      };
      const locker3: PackageLocker = {
        id: 'locker3',
        propertyId: 'p1',
        lockerNumber: 'L003',
        size: 'small',
        status: 'occupied',
        createdAt: '',
        updatedAt: '',
      };

      packageLockers.set('locker1', locker1);
      packageLockers.set('locker2', locker2);
      packageLockers.set('locker3', locker3);

      const found = findAvailableLocker('p1', 'large');

      expect(found).not.toBeNull();
      expect(found?.id).toBe('locker2');
      expect(found?.size).toBe('large');
    });

    it('should return null when no locker available', () => {
      const locker: PackageLocker = {
        id: 'locker1',
        propertyId: 'p1',
        lockerNumber: 'L001',
        size: 'small',
        status: 'occupied',
        createdAt: '',
        updatedAt: '',
      };
      packageLockers.set('locker1', locker);

      const found = findAvailableLocker('p1', 'small');

      expect(found).toBeNull();
    });
  });

  describe('isPackageOverdue', () => {
    it('should return true for packages held longer than threshold', () => {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      const pkg: Package = {
        id: 'pkg1',
        propertyId: 'p1',
        tenantId: 't1',
        carrier: 'usps',
        trackingNumber: '12345',
        size: 'small',
        status: 'in_locker',
        receivedAt: tenDaysAgo.toISOString(),
        createdAt: '',
        updatedAt: '',
      };

      expect(isPackageOverdue(pkg, 7)).toBe(true);
    });

    it('should return false for recent packages', () => {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const pkg: Package = {
        id: 'pkg1',
        propertyId: 'p1',
        tenantId: 't1',
        carrier: 'usps',
        trackingNumber: '12345',
        size: 'small',
        status: 'in_locker',
        receivedAt: twoDaysAgo.toISOString(),
        createdAt: '',
        updatedAt: '',
      };

      expect(isPackageOverdue(pkg, 7)).toBe(false);
    });
  });

  describe('calculatePackageStats', () => {
    it('should calculate package statistics correctly', () => {
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      const pkgList: Package[] = [
        {
          id: 'pkg1',
          propertyId: 'p1',
          tenantId: 't1',
          carrier: 'usps',
          trackingNumber: '12345',
          size: 'small',
          status: 'picked_up',
          receivedAt: threeDaysAgo.toISOString(),
          pickedUpAt: now.toISOString(),
          isOverdue: false,
          notificationCount: 0,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'pkg2',
          propertyId: 'p1',
          tenantId: 't1',
          carrier: 'ups',
          trackingNumber: '67890',
          size: 'medium',
          status: 'in_locker',
          receivedAt: threeDaysAgo.toISOString(),
          isOverdue: true,
          notificationCount: 3,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'pkg3',
          propertyId: 'p1',
          tenantId: 't2',
          carrier: 'fedex',
          trackingNumber: '11111',
          size: 'large',
          status: 'returned',
          receivedAt: threeDaysAgo.toISOString(),
          isOverdue: false,
          notificationCount: 0,
          createdAt: '',
          updatedAt: '',
        },
      ];

      const stats = calculatePackageStats(pkgList);

      expect(stats.totalReceived).toBe(3);
      expect(stats.totalPickedUp).toBe(1);
      expect(stats.totalOverdue).toBe(1);
      expect(stats.byCarrier.usps).toBe(1);
      expect(stats.byCarrier.ups).toBe(1);
      expect(stats.byCarrier.fedex).toBe(1);
    });
  });

  describe('getLockerUtilization', () => {
    it('should calculate locker utilization correctly', () => {
      packageLockers.set('l1', {
        id: 'l1',
        propertyId: 'p1',
        lockerNumber: 'L001',
        size: 'small',
        status: 'available',
        createdAt: '',
        updatedAt: '',
      });
      packageLockers.set('l2', {
        id: 'l2',
        propertyId: 'p1',
        lockerNumber: 'L002',
        size: 'small',
        status: 'occupied',
        createdAt: '',
        updatedAt: '',
      });
      packageLockers.set('l3', {
        id: 'l3',
        propertyId: 'p1',
        lockerNumber: 'L003',
        size: 'medium',
        status: 'occupied',
        createdAt: '',
        updatedAt: '',
      });
      packageLockers.set('l4', {
        id: 'l4',
        propertyId: 'p1',
        lockerNumber: 'L004',
        size: 'large',
        status: 'maintenance',
        createdAt: '',
        updatedAt: '',
      });

      const utilization = getLockerUtilization('p1');

      expect(utilization.total).toBe(4);
      expect(utilization.available).toBe(1);
      expect(utilization.occupied).toBe(2);
      expect(utilization.maintenance).toBe(1);
      expect(utilization.utilizationRate).toBe(50); // 2/4 = 50%
    });
  });
});

// ===========================================================================
// PET MANAGEMENT TESTS
// ===========================================================================

describe('Pet Management', () => {
  beforeEach(() => {
    petStore.clear();
    petBreedRestrictions.clear();
    petPolicyStore.clear();
    petVaccinationRecords.clear();
    petIncidentStore.clear();
    petScreeningStore.clear();
    petFeeStore.clear();
  });

  describe('checkBreedRestriction', () => {
    it('should detect restricted breeds', () => {
      petBreedRestrictions.set('r1', {
        id: 'r1',
        propertyId: 'p1',
        petType: 'dog',
        breed: 'pit bull',
        reason: 'Insurance restriction',
        createdAt: '',
      });

      const result = checkBreedRestriction('p1', 'dog', 'Pit Bull Terrier');

      expect(result.restricted).toBe(true);
      expect(result.reason).toBe('Insurance restriction');
    });

    it('should allow non-restricted breeds', () => {
      petBreedRestrictions.set('r1', {
        id: 'r1',
        propertyId: 'p1',
        petType: 'dog',
        breed: 'pit bull',
        reason: 'Insurance restriction',
        createdAt: '',
      });

      const result = checkBreedRestriction('p1', 'dog', 'Golden Retriever');

      expect(result.restricted).toBe(false);
    });
  });

  describe('validatePetAgainstPolicy', () => {
    const policy: PetPolicy = {
      id: 'policy1',
      propertyId: 'p1',
      maxPets: 2,
      allowedTypes: ['dog', 'cat'],
      maxWeight: 50,
      petDeposit: 300,
      monthlyPetRent: 25,
      oneTimePetFee: 100,
      serviceAnimalExempt: true,
      emotionalSupportExempt: true,
      requiresVaccinations: true,
      requiresLicense: false,
      requiresInsurance: false,
      insuranceMinCoverage: 100000,
      restrictedBreeds: ['pit bull', 'rottweiler'],
      createdAt: '',
      updatedAt: '',
    };

    it('should validate compliant pet', () => {
      const result = validatePetAgainstPolicy(
        { type: 'dog', breed: 'Labrador', weight: 45 },
        policy
      );

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect weight violation', () => {
      const result = validatePetAgainstPolicy(
        { type: 'dog', breed: 'Great Dane', weight: 120 },
        policy
      );

      expect(result.valid).toBe(false);
      expect(result.violations).toContain('Pet weight 120lbs exceeds maximum 50lbs');
    });

    it('should detect breed restriction', () => {
      const result = validatePetAgainstPolicy(
        { type: 'dog', breed: 'Pit Bull', weight: 40 },
        policy
      );

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes('restricted'))).toBe(true);
    });

    it('should detect disallowed pet type', () => {
      const result = validatePetAgainstPolicy(
        { type: 'reptile', breed: 'Ball Python', weight: 5 },
        policy
      );

      expect(result.valid).toBe(false);
      expect(result.violations).toContain("Pet type 'reptile' is not allowed");
    });

    it('should exempt service animals from restrictions', () => {
      const result = validatePetAgainstPolicy(
        { type: 'dog', breed: 'Pit Bull', weight: 80, isServiceAnimal: true },
        policy
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('calculatePetFees', () => {
    const policy: PetPolicy = {
      id: 'policy1',
      propertyId: 'p1',
      maxPets: 2,
      allowedTypes: ['dog', 'cat'],
      maxWeight: 50,
      petDeposit: 300,
      monthlyPetRent: 25,
      oneTimePetFee: 100,
      serviceAnimalExempt: true,
      emotionalSupportExempt: true,
      requiresVaccinations: true,
      requiresLicense: false,
      requiresInsurance: false,
      insuranceMinCoverage: 100000,
      restrictedBreeds: [],
      createdAt: '',
      updatedAt: '',
    };

    it('should calculate fees for regular pets', () => {
      const fees = calculatePetFees(policy, false, false);

      expect(fees.deposit).toBe(300);
      expect(fees.monthlyRent).toBe(25);
      expect(fees.oneTimeFee).toBe(100);
    });

    it('should waive fees for service animals', () => {
      const fees = calculatePetFees(policy, true, false);

      expect(fees.deposit).toBe(0);
      expect(fees.monthlyRent).toBe(0);
      expect(fees.oneTimeFee).toBe(0);
    });

    it('should waive fees for emotional support animals', () => {
      const fees = calculatePetFees(policy, false, true);

      expect(fees.deposit).toBe(0);
      expect(fees.monthlyRent).toBe(0);
      expect(fees.oneTimeFee).toBe(0);
    });
  });

  describe('getVaccinationStatus', () => {
    it('should detect expired vaccinations', () => {
      const pastDate = new Date();
      pastDate.setMonth(pastDate.getMonth() - 3);

      petVaccinationRecords.set('v1', {
        id: 'v1',
        petId: 'pet1',
        type: 'rabies',
        vaccineName: 'Rabies 3yr',
        administeredDate: '2022-01-01',
        expirationDate: pastDate.toISOString().split('T')[0],
        veterinarianName: 'Dr. Smith',
        verified: true,
        createdAt: '',
      });

      const status = getVaccinationStatus('pet1');

      expect(status.upToDate).toBe(false);
      expect(status.expired).toHaveLength(1);
    });

    it('should detect expiring soon vaccinations', () => {
      const soonDate = new Date();
      soonDate.setDate(soonDate.getDate() + 15);

      petVaccinationRecords.set('v1', {
        id: 'v1',
        petId: 'pet1',
        type: 'rabies',
        vaccineName: 'Rabies 3yr',
        administeredDate: '2022-01-01',
        expirationDate: soonDate.toISOString().split('T')[0],
        veterinarianName: 'Dr. Smith',
        verified: true,
        createdAt: '',
      });

      const status = getVaccinationStatus('pet1');

      expect(status.upToDate).toBe(true); // still valid
      expect(status.expiringSoon).toHaveLength(1);
    });

    it('should detect missing required vaccinations', () => {
      // No vaccinations added
      const status = getVaccinationStatus('pet1');

      expect(status.upToDate).toBe(false);
      expect(status.missing).toContain('rabies');
    });
  });

  describe('getIncidentHistory', () => {
    it('should calculate incident history correctly', () => {
      petIncidentStore.set('i1', {
        id: 'i1',
        petId: 'pet1',
        propertyId: 'p1',
        reportedBy: 'manager',
        incidentType: 'noise',
        severity: 'minor',
        description: 'Barking',
        incidentDate: '2024-01-01',
        location: 'Unit 101',
        fineAmount: 50,
        finePaid: true,
        resolved: true,
        createdAt: '',
      });

      petIncidentStore.set('i2', {
        id: 'i2',
        petId: 'pet1',
        propertyId: 'p1',
        reportedBy: 'neighbor',
        incidentType: 'aggression',
        severity: 'moderate',
        description: 'Lunged at another dog',
        incidentDate: '2024-02-01',
        location: 'Common area',
        fineAmount: 100,
        finePaid: false,
        resolved: false,
        createdAt: '',
      });

      const history = getIncidentHistory('pet1');

      expect(history.totalIncidents).toBe(2);
      expect(history.byType.noise).toBe(1);
      expect(history.byType.aggression).toBe(1);
      expect(history.totalFines).toBe(150);
      expect(history.unpaidFines).toBe(100);
    });
  });

  describe('calculateRiskScore', () => {
    it('should calculate risk score based on multiple factors', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      petStore.set('pet1', {
        id: 'pet1',
        leaseId: 'l1',
        propertyId: 'p1',
        tenantId: 't1',
        name: 'Buddy',
        type: 'dog',
        breed: 'Labrador',
        weight: 70,
        age: 3,
        color: 'Yellow',
        isServiceAnimal: false,
        isEmotionalSupport: false,
        status: 'approved',
        registrationDate: '2024-01-01',
        createdAt: '',
        updatedAt: '',
      });

      // Add current vaccination
      petVaccinationRecords.set('v1', {
        id: 'v1',
        petId: 'pet1',
        type: 'rabies',
        vaccineName: 'Rabies 3yr',
        administeredDate: '2024-01-01',
        expirationDate: futureDate.toISOString().split('T')[0],
        veterinarianName: 'Dr. Smith',
        verified: true,
        createdAt: '',
      });

      const result = calculateRiskScore('pet1');

      expect(result.score).toBe(100); // Perfect score with no incidents
      expect(result.factors).toHaveLength(0);
    });

    it('should deduct points for incidents and unpaid fines', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      petStore.set('pet1', {
        id: 'pet1',
        leaseId: 'l1',
        propertyId: 'p1',
        tenantId: 't1',
        name: 'Buddy',
        type: 'dog',
        breed: 'Labrador',
        weight: 70,
        age: 3,
        color: 'Yellow',
        isServiceAnimal: false,
        isEmotionalSupport: false,
        status: 'approved',
        registrationDate: '2024-01-01',
        createdAt: '',
        updatedAt: '',
      });

      petVaccinationRecords.set('v1', {
        id: 'v1',
        petId: 'pet1',
        type: 'rabies',
        vaccineName: 'Rabies 3yr',
        administeredDate: '2024-01-01',
        expirationDate: futureDate.toISOString().split('T')[0],
        veterinarianName: 'Dr. Smith',
        verified: true,
        createdAt: '',
      });

      petIncidentStore.set('i1', {
        id: 'i1',
        petId: 'pet1',
        propertyId: 'p1',
        reportedBy: 'manager',
        incidentType: 'aggression',
        severity: 'moderate',
        description: 'Aggressive behavior',
        incidentDate: '2024-02-01',
        location: 'Common area',
        fineAmount: 100,
        finePaid: false,
        resolved: false,
        createdAt: '',
      });

      const result = calculateRiskScore('pet1');

      expect(result.score).toBeLessThan(100);
      expect(result.factors.some((f) => f.includes('incident'))).toBe(true);
      expect(result.factors.some((f) => f.includes('unpaid'))).toBe(true);
      expect(result.factors.some((f) => f.includes('aggression'))).toBe(true);
    });
  });

  describe('getPropertyPetCensus', () => {
    it('should calculate property pet census correctly', () => {
      petStore.set('p1', {
        id: 'p1',
        leaseId: 'l1',
        propertyId: 'prop1',
        tenantId: 't1',
        name: 'Buddy',
        type: 'dog',
        breed: 'Labrador',
        weight: 70,
        age: 3,
        color: 'Yellow',
        isServiceAnimal: false,
        isEmotionalSupport: false,
        status: 'approved',
        registrationDate: '2024-01-01',
        createdAt: '',
        updatedAt: '',
      });

      petStore.set('p2', {
        id: 'p2',
        leaseId: 'l2',
        propertyId: 'prop1',
        tenantId: 't2',
        name: 'Whiskers',
        type: 'cat',
        breed: 'Persian',
        weight: 10,
        age: 2,
        color: 'White',
        isServiceAnimal: false,
        isEmotionalSupport: true,
        status: 'approved',
        registrationDate: '2024-01-01',
        createdAt: '',
        updatedAt: '',
      });

      petStore.set('p3', {
        id: 'p3',
        leaseId: 'l3',
        propertyId: 'prop1',
        tenantId: 't3',
        name: 'Max',
        type: 'dog',
        breed: 'German Shepherd',
        weight: 80,
        age: 4,
        color: 'Black',
        isServiceAnimal: true,
        isEmotionalSupport: false,
        status: 'approved',
        registrationDate: '2024-01-01',
        createdAt: '',
        updatedAt: '',
      });

      const census = getPropertyPetCensus('prop1');

      expect(census.totalPets).toBe(3);
      expect(census.byType.dog).toBe(2);
      expect(census.byType.cat).toBe(1);
      expect(census.byStatus.approved).toBe(3);
      expect(census.serviceAnimals).toBe(1);
      expect(census.emotionalSupport).toBe(1);
    });
  });
});

// ===========================================================================
// PARKING MANAGEMENT TESTS
// ===========================================================================

describe('Parking Management', () => {
  beforeEach(() => {
    parkingLotStore.clear();
    parkingSpaceStore.clear();
    vehicleStore.clear();
    parkingPermitStore.clear();
    guestPassStore.clear();
    parkingViolationStore.clear();
    towRecordStore.clear();
  });

  describe('generatePermitNumber', () => {
    it('should generate permit numbers in correct format', () => {
      const permit = generatePermitNumber();

      expect(permit).toMatch(/^PMT-[A-Z0-9]{8}$/);
    });

    it('should generate unique permit numbers', () => {
      const permit1 = generatePermitNumber();
      const permit2 = generatePermitNumber();

      expect(permit1).not.toBe(permit2);
    });
  });

  describe('generatePassCode', () => {
    it('should generate 6-character alphanumeric codes', () => {
      const code = generatePassCode();

      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[A-Z0-9]+$/);
    });
  });

  describe('getLotOccupancy', () => {
    it('should calculate lot occupancy correctly', () => {
      parkingSpaceStore.set('s1', {
        id: 's1',
        lotId: 'lot1',
        propertyId: 'p1',
        spaceNumber: '001',
        type: 'standard',
        status: 'available',
        createdAt: '',
        updatedAt: '',
      });
      parkingSpaceStore.set('s2', {
        id: 's2',
        lotId: 'lot1',
        propertyId: 'p1',
        spaceNumber: '002',
        type: 'standard',
        status: 'assigned',
        createdAt: '',
        updatedAt: '',
      });
      parkingSpaceStore.set('s3', {
        id: 's3',
        lotId: 'lot1',
        propertyId: 'p1',
        spaceNumber: '003',
        type: 'handicap',
        status: 'reserved',
        createdAt: '',
        updatedAt: '',
      });
      parkingSpaceStore.set('s4', {
        id: 's4',
        lotId: 'lot1',
        propertyId: 'p1',
        spaceNumber: '004',
        type: 'ev_charging',
        status: 'maintenance',
        createdAt: '',
        updatedAt: '',
      });

      const occupancy = getLotOccupancy('lot1');

      expect(occupancy.total).toBe(4);
      expect(occupancy.available).toBe(1);
      expect(occupancy.assigned).toBe(1);
      expect(occupancy.reserved).toBe(1);
      expect(occupancy.maintenance).toBe(1);
      expect(occupancy.occupancyRate).toBe(75); // 3/4 = 75%
    });
  });

  describe('getSpacesByType', () => {
    it('should group spaces by type with availability', () => {
      parkingSpaceStore.set('s1', {
        id: 's1',
        lotId: 'lot1',
        propertyId: 'p1',
        spaceNumber: '001',
        type: 'standard',
        status: 'available',
        createdAt: '',
        updatedAt: '',
      });
      parkingSpaceStore.set('s2', {
        id: 's2',
        lotId: 'lot1',
        propertyId: 'p1',
        spaceNumber: '002',
        type: 'standard',
        status: 'assigned',
        createdAt: '',
        updatedAt: '',
      });
      parkingSpaceStore.set('s3', {
        id: 's3',
        lotId: 'lot1',
        propertyId: 'p1',
        spaceNumber: '003',
        type: 'handicap',
        status: 'available',
        createdAt: '',
        updatedAt: '',
      });

      const byType = getSpacesByType('lot1');

      expect(byType.standard.total).toBe(2);
      expect(byType.standard.available).toBe(1);
      expect(byType.handicap.total).toBe(1);
      expect(byType.handicap.available).toBe(1);
    });
  });

  describe('findAvailableSpace', () => {
    it('should find available space of requested type', () => {
      parkingSpaceStore.set('s1', {
        id: 's1',
        lotId: 'lot1',
        propertyId: 'p1',
        spaceNumber: '001',
        type: 'standard',
        status: 'assigned',
        createdAt: '',
        updatedAt: '',
      });
      parkingSpaceStore.set('s2', {
        id: 's2',
        lotId: 'lot1',
        propertyId: 'p1',
        spaceNumber: '002',
        type: 'ev_charging',
        status: 'available',
        createdAt: '',
        updatedAt: '',
      });

      const space = findAvailableSpace('lot1', 'ev_charging');

      expect(space).not.toBeNull();
      expect(space?.type).toBe('ev_charging');
    });

    it('should return null when no space available', () => {
      parkingSpaceStore.set('s1', {
        id: 's1',
        lotId: 'lot1',
        propertyId: 'p1',
        spaceNumber: '001',
        type: 'standard',
        status: 'assigned',
        createdAt: '',
        updatedAt: '',
      });

      const space = findAvailableSpace('lot1', 'standard');

      expect(space).toBeNull();
    });
  });

  describe('isPermitValid', () => {
    it('should return true for active permit within date range', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const permit: ParkingPermit = {
        id: 'permit1',
        propertyId: 'p1',
        tenantId: 't1',
        leaseId: 'l1',
        vehicleId: 'v1',
        permitNumber: 'PMT-12345678',
        type: 'assigned',
        status: 'active',
        startDate: '2024-01-01',
        endDate: tomorrow.toISOString().split('T')[0],
        monthlyFee: 50,
        issuedAt: '2024-01-01',
        createdAt: '',
        updatedAt: '',
      };

      expect(isPermitValid(permit)).toBe(true);
    });

    it('should return false for expired permit', () => {
      const permit: ParkingPermit = {
        id: 'permit1',
        propertyId: 'p1',
        tenantId: 't1',
        leaseId: 'l1',
        vehicleId: 'v1',
        permitNumber: 'PMT-12345678',
        type: 'assigned',
        status: 'active',
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        monthlyFee: 50,
        issuedAt: '2023-01-01',
        createdAt: '',
        updatedAt: '',
      };

      expect(isPermitValid(permit)).toBe(false);
    });

    it('should return false for suspended permit', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const permit: ParkingPermit = {
        id: 'permit1',
        propertyId: 'p1',
        tenantId: 't1',
        leaseId: 'l1',
        vehicleId: 'v1',
        permitNumber: 'PMT-12345678',
        type: 'assigned',
        status: 'suspended',
        startDate: '2024-01-01',
        endDate: tomorrow.toISOString().split('T')[0],
        monthlyFee: 50,
        issuedAt: '2024-01-01',
        createdAt: '',
        updatedAt: '',
      };

      expect(isPermitValid(permit)).toBe(false);
    });
  });

  describe('isGuestPassValid', () => {
    it('should return true for pass within validity window', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const pass: GuestPass = {
        id: 'pass1',
        propertyId: 'p1',
        tenantId: 't1',
        guestName: 'John Doe',
        vehicleLicensePlate: 'ABC123',
        passCode: 'XYZ789',
        validFrom: yesterday.toISOString(),
        validTo: tomorrow.toISOString(),
        isUsed: false,
        createdAt: '',
      };

      expect(isGuestPassValid(pass)).toBe(true);
    });

    it('should return false for expired pass', () => {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const pass: GuestPass = {
        id: 'pass1',
        propertyId: 'p1',
        tenantId: 't1',
        guestName: 'John Doe',
        vehicleLicensePlate: 'ABC123',
        passCode: 'XYZ789',
        validFrom: twoDaysAgo.toISOString(),
        validTo: yesterday.toISOString(),
        isUsed: false,
        createdAt: '',
      };

      expect(isGuestPassValid(pass)).toBe(false);
    });
  });

  describe('getViolationFineAmount', () => {
    it('should return correct fine amounts', () => {
      expect(getViolationFineAmount('no_permit')).toBe(50);
      expect(getViolationFineAmount('fire_lane')).toBe(150);
      expect(getViolationFineAmount('handicap')).toBe(250);
      expect(getViolationFineAmount('blocking')).toBe(75);
    });
  });

  describe('calculateViolationStats', () => {
    it('should calculate violation statistics correctly', () => {
      parkingViolationStore.set('v1', {
        id: 'v1',
        propertyId: 'p1',
        licensePlate: 'ABC123',
        violationType: 'no_permit',
        status: 'paid',
        description: 'No permit displayed',
        issuedAt: '2024-06-01',
        issuedBy: 'security',
        fineAmount: 50,
        dueDate: '2024-07-01',
        paidAt: '2024-06-15',
        createdAt: '',
      });

      parkingViolationStore.set('v2', {
        id: 'v2',
        propertyId: 'p1',
        licensePlate: 'DEF456',
        violationType: 'fire_lane',
        status: 'fine_due',
        description: 'Parked in fire lane',
        issuedAt: '2024-06-15',
        issuedBy: 'security',
        fineAmount: 150,
        dueDate: '2024-07-15',
        createdAt: '',
      });

      parkingViolationStore.set('v3', {
        id: 'v3',
        propertyId: 'p1',
        licensePlate: 'GHI789',
        violationType: 'abandoned',
        status: 'towed',
        description: 'Abandoned vehicle',
        issuedAt: '2024-06-20',
        issuedBy: 'security',
        fineAmount: 100,
        dueDate: '2024-07-20',
        createdAt: '',
      });

      const stats = calculateViolationStats('p1', '2024-06-01', '2024-06-30');

      expect(stats.total).toBe(3);
      expect(stats.byType.no_permit).toBe(1);
      expect(stats.byType.fire_lane).toBe(1);
      expect(stats.byType.abandoned).toBe(1);
      expect(stats.totalFines).toBe(300);
      expect(stats.collectedFines).toBe(50);
      expect(stats.outstandingFines).toBe(250);
      expect(stats.towedVehicles).toBe(1);
    });
  });

  describe('calculateParkingRevenue', () => {
    it('should calculate parking revenue from permits and fines', () => {
      parkingPermitStore.set('p1', {
        id: 'p1',
        propertyId: 'prop1',
        tenantId: 't1',
        leaseId: 'l1',
        vehicleId: 'v1',
        permitNumber: 'PMT-12345678',
        type: 'assigned',
        status: 'active',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        monthlyFee: 50,
        issuedAt: '2024-01-01',
        createdAt: '',
        updatedAt: '',
      });

      parkingViolationStore.set('v1', {
        id: 'v1',
        propertyId: 'prop1',
        licensePlate: 'ABC123',
        violationType: 'no_permit',
        status: 'paid',
        description: 'No permit',
        issuedAt: '2024-03-01',
        issuedBy: 'security',
        fineAmount: 50,
        dueDate: '2024-04-01',
        paidAt: '2024-03-15',
        createdAt: '',
      });

      const revenue = calculateParkingRevenue('prop1', '2024-01-01', '2024-06-30');

      expect(revenue.permitRevenue).toBeGreaterThan(0);
      expect(revenue.violationRevenue).toBe(50);
      expect(revenue.totalRevenue).toBe(revenue.permitRevenue + revenue.violationRevenue);
      expect(revenue.permitCount).toBe(1);
    });
  });

  describe('getActivePermitsForTenant', () => {
    it('should return only valid active permits', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      parkingPermitStore.set('p1', {
        id: 'p1',
        propertyId: 'prop1',
        tenantId: 't1',
        leaseId: 'l1',
        vehicleId: 'v1',
        permitNumber: 'PMT-11111111',
        type: 'assigned',
        status: 'active',
        startDate: '2024-01-01',
        endDate: tomorrow.toISOString().split('T')[0],
        monthlyFee: 50,
        issuedAt: '2024-01-01',
        createdAt: '',
        updatedAt: '',
      });

      parkingPermitStore.set('p2', {
        id: 'p2',
        propertyId: 'prop1',
        tenantId: 't1',
        leaseId: 'l1',
        vehicleId: 'v2',
        permitNumber: 'PMT-22222222',
        type: 'general',
        status: 'expired',
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        monthlyFee: 25,
        issuedAt: '2023-01-01',
        createdAt: '',
        updatedAt: '',
      });

      const activePermits = getActivePermitsForTenant('t1');

      expect(activePermits).toHaveLength(1);
      expect(activePermits[0].permitNumber).toBe('PMT-11111111');
    });
  });
});

// ===========================================================================
// STORAGE UNIT MANAGEMENT TESTS
// ===========================================================================

describe('Storage Unit Management', () => {
  beforeEach(() => {
    storageUnits.clear();
    storageRentals.clear();
    storagePayments.clear();
    storageAccessLogs.clear();
    storageWaitlists.clear();
    storagePromotions.clear();
    lienAuctions.clear();
  });

  describe('generateAccessCode', () => {
    it('should generate numeric codes of specified length', () => {
      const code6 = generateStorageAccessCode(6);
      const code8 = generateStorageAccessCode(8);

      expect(code6).toHaveLength(6);
      expect(code8).toHaveLength(8);
      expect(code6).toMatch(/^\d+$/);
      expect(code8).toMatch(/^\d+$/);
    });
  });

  describe('calculateSquareFeet', () => {
    it('should calculate area correctly', () => {
      expect(calculateSquareFeet(5, 5)).toBe(25);
      expect(calculateSquareFeet(10, 10)).toBe(100);
      expect(calculateSquareFeet(10, 20)).toBe(200);
    });
  });

  describe('calculateCubicFeet', () => {
    it('should calculate volume correctly', () => {
      expect(calculateCubicFeet(5, 5, 8)).toBe(200);
      expect(calculateCubicFeet(10, 10, 10)).toBe(1000);
    });
  });

  describe('getUnitPricing', () => {
    it('should return correct base prices by size', () => {
      expect(getUnitPricing('locker', 'standard')).toBe(25);
      expect(getUnitPricing('5x5', 'standard')).toBe(50);
      expect(getUnitPricing('10x10', 'standard')).toBe(125);
      expect(getUnitPricing('10x20', 'standard')).toBe(225);
    });

    it('should apply type multipliers', () => {
      expect(getUnitPricing('10x10', 'climate_controlled')).toBe(175); // 125 * 1.4
      expect(getUnitPricing('10x10', 'outdoor')).toBe(100); // 125 * 0.8
    });
  });

  describe('getAvailableUnits', () => {
    it('should return available units matching criteria', () => {
      storageUnits.set('u1', {
        id: 'u1',
        propertyId: 'p1',
        unitNumber: 'A101',
        size: '10x10',
        type: 'standard',
        status: 'available',
        floor: 1,
        dimensions: { width: 10, depth: 10, height: 8 },
        squareFeet: 100,
        cubicFeet: 800,
        monthlyRate: 125,
        features: [],
        accessType: 'keypad',
        hasElectricity: false,
        insuranceRequired: true,
        createdAt: '',
        updatedAt: '',
      });

      storageUnits.set('u2', {
        id: 'u2',
        propertyId: 'p1',
        unitNumber: 'A102',
        size: '10x10',
        type: 'standard',
        status: 'rented',
        floor: 1,
        dimensions: { width: 10, depth: 10, height: 8 },
        squareFeet: 100,
        cubicFeet: 800,
        monthlyRate: 125,
        features: [],
        accessType: 'keypad',
        hasElectricity: false,
        insuranceRequired: true,
        createdAt: '',
        updatedAt: '',
      });

      const available = getAvailableUnits('p1', '10x10');

      expect(available).toHaveLength(1);
      expect(available[0].id).toBe('u1');
    });
  });

  describe('isRentalPastDue', () => {
    it('should return true for past due rentals', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const rental: StorageRental = {
        id: 'r1',
        unitId: 'u1',
        propertyId: 'p1',
        tenantId: 't1',
        status: 'active',
        startDate: '2024-01-01',
        monthlyRate: 125,
        paymentFrequency: 'monthly',
        nextPaymentDate: yesterday.toISOString().split('T')[0],
        autopayEnabled: false,
        securityDeposit: 0,
        moveInDate: '2024-01-01',
        balance: 125,
        createdAt: '',
        updatedAt: '',
      };

      expect(isRentalPastDue(rental)).toBe(true);
    });

    it('should return false for current rentals', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const rental: StorageRental = {
        id: 'r1',
        unitId: 'u1',
        propertyId: 'p1',
        tenantId: 't1',
        status: 'active',
        startDate: '2024-01-01',
        monthlyRate: 125,
        paymentFrequency: 'monthly',
        nextPaymentDate: tomorrow.toISOString().split('T')[0],
        autopayEnabled: false,
        securityDeposit: 0,
        moveInDate: '2024-01-01',
        balance: 0,
        createdAt: '',
        updatedAt: '',
      };

      expect(isRentalPastDue(rental)).toBe(false);
    });
  });

  describe('getOccupancyStats', () => {
    it('should calculate occupancy statistics correctly', () => {
      storageUnits.set('u1', {
        id: 'u1',
        propertyId: 'p1',
        unitNumber: 'A101',
        size: '10x10',
        type: 'standard',
        status: 'rented',
        floor: 1,
        dimensions: { width: 10, depth: 10, height: 8 },
        squareFeet: 100,
        cubicFeet: 800,
        monthlyRate: 125,
        features: [],
        accessType: 'keypad',
        hasElectricity: false,
        insuranceRequired: true,
        createdAt: '',
        updatedAt: '',
      });

      storageUnits.set('u2', {
        id: 'u2',
        propertyId: 'p1',
        unitNumber: 'A102',
        size: '5x5',
        type: 'standard',
        status: 'available',
        floor: 1,
        dimensions: { width: 5, depth: 5, height: 8 },
        squareFeet: 25,
        cubicFeet: 200,
        monthlyRate: 50,
        features: [],
        accessType: 'keypad',
        hasElectricity: false,
        insuranceRequired: true,
        createdAt: '',
        updatedAt: '',
      });

      const stats = getStorageOccupancyStats('p1');

      expect(stats.total).toBe(2);
      expect(stats.rented).toBe(1);
      expect(stats.available).toBe(1);
      expect(stats.occupancyRate).toBe(50);
    });
  });

  describe('applyPromotion', () => {
    it('should apply percentage discount', () => {
      const unit: StorageUnit = {
        id: 'u1',
        propertyId: 'p1',
        unitNumber: 'A101',
        size: '10x10',
        type: 'standard',
        status: 'available',
        floor: 1,
        dimensions: { width: 10, depth: 10, height: 8 },
        squareFeet: 100,
        cubicFeet: 800,
        monthlyRate: 100,
        features: [],
        accessType: 'keypad',
        hasElectricity: false,
        insuranceRequired: true,
        createdAt: '',
        updatedAt: '',
      };

      const promotion: StoragePromotion = {
        id: 'promo1',
        propertyId: 'p1',
        name: '20% Off',
        description: '20% discount',
        discountType: 'percentage',
        discountValue: 20,
        applicableSizes: ['10x10'],
        applicableTypes: ['standard'],
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        currentUses: 0,
        isActive: true,
        createdAt: '',
      };

      const result = applyPromotion(unit, promotion);

      expect(result.discountedRate).toBe(80);
      expect(result.savingsAmount).toBe(20);
    });
  });
});

// ===========================================================================
// KEY & ACCESS MANAGEMENT TESTS
// ===========================================================================

describe('Key & Access Management', () => {
  beforeEach(() => {
    physicalKeys.clear();
    accessDevices.clear();
    accessZones.clear();
    accessPoints.clear();
    keyAssignments.clear();
    accessAuditLogs.clear();
    lockoutEvents.clear();
    keyRequests.clear();
    temporaryAccesses.clear();
  });

  describe('generateKeyNumber', () => {
    it('should generate key numbers with correct format', () => {
      const keyNum1 = generateKeyNumber();
      const keyNum2 = generateKeyNumber();

      expect(keyNum1).toMatch(/^KEY-\d{8}$/);
      expect(keyNum2).toMatch(/^KEY-\d{8}$/);
      expect(keyNum1).not.toBe(keyNum2);
    });
  });

  describe('generateAccessCode', () => {
    it('should generate numeric codes', () => {
      const code = generateKeyAccessCode(6);

      expect(code).toHaveLength(6);
      expect(code).toMatch(/^\d+$/);
    });
  });

  describe('generateDeviceId', () => {
    it('should generate alphanumeric device IDs', () => {
      const id1 = generateDeviceId();
      const id2 = generateDeviceId();

      expect(id1).toHaveLength(12);
      expect(id1).toMatch(/^[A-Z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('isAccessValid', () => {
    it('should validate access for authorized device', () => {
      const device: AccessDevice = {
        id: 'd1',
        propertyId: 'p1',
        deviceId: 'DEV123',
        type: 'fob',
        status: 'active',
        accessLevel: 'resident',
        accessZones: ['zone1'],
        usageCount: 0,
        createdAt: '',
        updatedAt: '',
      };

      const zone: AccessZone = {
        id: 'zone1',
        propertyId: 'p1',
        name: 'Main Building',
        type: 'building',
        accessPoints: [],
        requiredLevel: 'resident',
        createdAt: '',
        updatedAt: '',
      };

      const result = isAccessValid(device, zone);

      expect(result.valid).toBe(true);
    });

    it('should deny access for inactive device', () => {
      const device: AccessDevice = {
        id: 'd1',
        propertyId: 'p1',
        deviceId: 'DEV123',
        type: 'fob',
        status: 'inactive',
        accessLevel: 'resident',
        accessZones: ['zone1'],
        usageCount: 0,
        createdAt: '',
        updatedAt: '',
      };

      const zone: AccessZone = {
        id: 'zone1',
        propertyId: 'p1',
        name: 'Main Building',
        type: 'building',
        accessPoints: [],
        requiredLevel: 'resident',
        createdAt: '',
        updatedAt: '',
      };

      const result = isAccessValid(device, zone);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Device is inactive');
    });

    it('should deny access for unauthorized zone', () => {
      const device: AccessDevice = {
        id: 'd1',
        propertyId: 'p1',
        deviceId: 'DEV123',
        type: 'fob',
        status: 'active',
        accessLevel: 'resident',
        accessZones: ['zone1'],
        usageCount: 0,
        createdAt: '',
        updatedAt: '',
      };

      const zone: AccessZone = {
        id: 'zone2',
        propertyId: 'p1',
        name: 'Restricted Area',
        type: 'restricted',
        accessPoints: [],
        requiredLevel: 'staff',
        createdAt: '',
        updatedAt: '',
      };

      const result = isAccessValid(device, zone);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Device not authorized for this zone');
    });
  });

  describe('getKeyInventory', () => {
    it('should calculate key inventory correctly', () => {
      physicalKeys.set('k1', {
        id: 'k1',
        propertyId: 'p1',
        keyNumber: 'KEY-00000001',
        type: 'unit',
        status: 'assigned',
        copies: 2,
        createdAt: '',
        updatedAt: '',
      });

      physicalKeys.set('k2', {
        id: 'k2',
        propertyId: 'p1',
        keyNumber: 'KEY-00000002',
        type: 'master',
        status: 'available',
        copies: 1,
        createdAt: '',
        updatedAt: '',
      });

      const inventory = getKeyInventory('p1');

      expect(inventory.total).toBe(3);
      expect(inventory.byType.unit).toBe(2);
      expect(inventory.byType.master).toBe(1);
      expect(inventory.assignedCount).toBe(2);
      expect(inventory.availableCount).toBe(1);
    });
  });

  describe('checkTemporaryAccess', () => {
    it('should validate active temporary access', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      temporaryAccesses.set('ta1', {
        id: 'ta1',
        propertyId: 'p1',
        grantedTo: 'Guest',
        grantedToType: 'guest',
        grantedBy: 'staff1',
        accessZones: ['zone1'],
        accessCode: '12345678',
        validFrom: yesterday.toISOString(),
        validTo: tomorrow.toISOString(),
        currentUses: 0,
        status: 'active',
        createdAt: '',
        updatedAt: '',
      });

      const result = checkTemporaryAccess('ta1');

      expect(result.valid).toBe(true);
    });

    it('should reject expired temporary access', () => {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      temporaryAccesses.set('ta1', {
        id: 'ta1',
        propertyId: 'p1',
        grantedTo: 'Guest',
        grantedToType: 'guest',
        grantedBy: 'staff1',
        accessZones: ['zone1'],
        validFrom: twoDaysAgo.toISOString(),
        validTo: yesterday.toISOString(),
        currentUses: 0,
        status: 'active',
        createdAt: '',
        updatedAt: '',
      });

      const result = checkTemporaryAccess('ta1');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Access has expired');
    });
  });
});

// ===========================================================================
// BUILDING SYSTEMS MONITORING TESTS
// ===========================================================================

describe('Building Systems Monitoring', () => {
  beforeEach(() => {
    buildingSystems.clear();
    systemSensors.clear();
    sensorReadings.clear();
    systemAlerts.clear();
    maintenanceSchedules.clear();
    energyUsages.clear();
    systemDowntimes.clear();
    alertRules.clear();
  });

  describe('checkThresholds', () => {
    it('should detect values below minimum threshold', () => {
      const sensor: SystemSensor = {
        id: 's1',
        systemId: 'sys1',
        propertyId: 'p1',
        name: 'Temperature Sensor',
        type: 'temperature',
        unit: 'F',
        location: 'Lobby',
        minThreshold: 60,
        maxThreshold: 80,
        status: 'active',
        isWireless: false,
        createdAt: '',
        updatedAt: '',
      };

      const result = checkThresholds(sensor, 55);

      expect(result.isAnomaly).toBe(true);
      expect(result.severity).toBe('warning');
    });

    it('should detect values above maximum threshold', () => {
      const sensor: SystemSensor = {
        id: 's1',
        systemId: 'sys1',
        propertyId: 'p1',
        name: 'Temperature Sensor',
        type: 'temperature',
        unit: 'F',
        location: 'Lobby',
        minThreshold: 60,
        maxThreshold: 80,
        status: 'active',
        isWireless: false,
        createdAt: '',
        updatedAt: '',
      };

      const result = checkThresholds(sensor, 85);

      expect(result.isAnomaly).toBe(true);
      expect(result.severity).toBe('warning');
    });

    it('should return no anomaly for values within range', () => {
      const sensor: SystemSensor = {
        id: 's1',
        systemId: 'sys1',
        propertyId: 'p1',
        name: 'Temperature Sensor',
        type: 'temperature',
        unit: 'F',
        location: 'Lobby',
        minThreshold: 60,
        maxThreshold: 80,
        status: 'active',
        isWireless: false,
        createdAt: '',
        updatedAt: '',
      };

      const result = checkThresholds(sensor, 70);

      expect(result.isAnomaly).toBe(false);
    });
  });

  describe('calculateSystemHealth', () => {
    it('should return healthy status for online system', () => {
      buildingSystems.set('sys1', {
        id: 'sys1',
        propertyId: 'p1',
        name: 'HVAC Unit 1',
        type: 'hvac',
        status: 'online',
        location: 'Roof',
        operatingHours: 1000,
        isAutomated: true,
        createdAt: '',
        updatedAt: '',
      });

      const health = calculateSystemHealth('sys1');

      expect(health.score).toBeGreaterThanOrEqual(80);
      expect(health.status).toBe('healthy');
    });

    it('should return critical status for offline system', () => {
      buildingSystems.set('sys1', {
        id: 'sys1',
        propertyId: 'p1',
        name: 'HVAC Unit 1',
        type: 'hvac',
        status: 'offline',
        location: 'Roof',
        operatingHours: 1000,
        isAutomated: true,
        createdAt: '',
        updatedAt: '',
      });

      const health = calculateSystemHealth('sys1');

      expect(health.score).toBeLessThan(80);
      expect(health.factors).toContain('System offline');
    });
  });

  describe('evaluateAlertRule', () => {
    it('should evaluate greater than condition', () => {
      const rule: AlertRule = {
        id: 'rule1',
        propertyId: 'p1',
        name: 'High Temp Alert',
        isActive: true,
        condition: {
          metric: 'temperature',
          operator: 'gt',
          value: 80,
        },
        severity: 'warning',
        notifications: {
          channels: ['email'],
          recipients: ['admin@test.com'],
        },
        cooldownMinutes: 15,
        triggerCount: 0,
        createdAt: '',
        updatedAt: '',
      };

      expect(evaluateAlertRule(rule, 's1', 85)).toBe(true);
      expect(evaluateAlertRule(rule, 's1', 75)).toBe(false);
    });

    it('should evaluate between condition', () => {
      const rule: AlertRule = {
        id: 'rule1',
        propertyId: 'p1',
        name: 'Normal Range',
        isActive: true,
        condition: {
          metric: 'temperature',
          operator: 'between',
          value: 60,
          value2: 80,
        },
        severity: 'info',
        notifications: {
          channels: ['email'],
          recipients: ['admin@test.com'],
        },
        cooldownMinutes: 15,
        triggerCount: 0,
        createdAt: '',
        updatedAt: '',
      };

      expect(evaluateAlertRule(rule, 's1', 70)).toBe(true);
      expect(evaluateAlertRule(rule, 's1', 55)).toBe(false);
      expect(evaluateAlertRule(rule, 's1', 85)).toBe(false);
    });
  });

  describe('getSystemUptime', () => {
    it('should calculate uptime correctly', () => {
      buildingSystems.set('sys1', {
        id: 'sys1',
        propertyId: 'p1',
        name: 'HVAC Unit 1',
        type: 'hvac',
        status: 'online',
        location: 'Roof',
        operatingHours: 1000,
        isAutomated: true,
        createdAt: '',
        updatedAt: '',
      });

      const uptime = getSystemUptime('sys1', 30);

      expect(uptime.uptimePercentage).toBe(100);
      expect(uptime.totalDowntimeMinutes).toBe(0);
      expect(uptime.incidents).toBe(0);
    });
  });
});

// ===========================================================================
// COMMON AREA SCHEDULING TESTS
// ===========================================================================

describe('Common Area Scheduling', () => {
  beforeEach(() => {
    commonAreas.clear();
    areaReservations.clear();
    areaWaitlists.clear();
    areaIncidents.clear();
    areaRatings.clear();
    communityEvents.clear();
  });

  describe('generateConfirmationCode', () => {
    it('should generate 8-character alphanumeric codes', () => {
      const code1 = generateAreaConfirmationCode();
      const code2 = generateAreaConfirmationCode();

      expect(code1).toHaveLength(8);
      expect(code2).toHaveLength(8);
      expect(code1).toMatch(/^[A-Z0-9]+$/);
      expect(code1).not.toBe(code2);
    });
  });

  describe('addMinutesToTime', () => {
    it('should add minutes to time correctly', () => {
      expect(addMinutesToTime('09:00', 30)).toBe('09:30');
      expect(addMinutesToTime('09:30', 45)).toBe('10:15');
      expect(addMinutesToTime('23:30', 60)).toBe('00:30');
    });
  });

  describe('calculateReservationFee', () => {
    it('should calculate fee based on hourly rate', () => {
      const area: CommonArea = {
        id: 'a1',
        propertyId: 'p1',
        name: 'Party Room',
        type: 'party_room',
        status: 'available',
        location: '1st Floor',
        capacity: 50,
        amenities: [],
        equipment: [],
        rules: [],
        requiresApproval: false,
        requiresDeposit: true,
        depositAmount: 200,
        hourlyRate: 50,
        advanceBookingDays: 30,
        cancellationHours: 24,
        cleanupTimeMinutes: 30,
        operatingHours: [],
        createdAt: '',
        updatedAt: '',
      };

      const result = calculateReservationFee(area, '10:00', '14:00');

      expect(result.hours).toBe(4);
      expect(result.fee).toBe(200);
    });

    it('should return zero for areas without hourly rate', () => {
      const area: CommonArea = {
        id: 'a1',
        propertyId: 'p1',
        name: 'Lounge',
        type: 'lounge',
        status: 'available',
        location: '1st Floor',
        capacity: 20,
        amenities: [],
        equipment: [],
        rules: [],
        requiresApproval: false,
        requiresDeposit: false,
        advanceBookingDays: 30,
        cancellationHours: 24,
        cleanupTimeMinutes: 15,
        operatingHours: [],
        createdAt: '',
        updatedAt: '',
      };

      const result = calculateReservationFee(area, '10:00', '14:00');

      expect(result.fee).toBe(0);
    });
  });

  describe('getOperatingHoursForDay', () => {
    it('should return hours for specified day', () => {
      const area: CommonArea = {
        id: 'a1',
        propertyId: 'p1',
        name: 'Party Room',
        type: 'party_room',
        status: 'available',
        location: '1st Floor',
        capacity: 50,
        amenities: [],
        equipment: [],
        rules: [],
        requiresApproval: false,
        requiresDeposit: false,
        advanceBookingDays: 30,
        cancellationHours: 24,
        cleanupTimeMinutes: 30,
        operatingHours: [
          { dayOfWeek: 1, openTime: '08:00', closeTime: '22:00', isClosed: false },
          { dayOfWeek: 6, openTime: '10:00', closeTime: '23:00', isClosed: false },
          { dayOfWeek: 0, openTime: '00:00', closeTime: '00:00', isClosed: true },
        ],
        createdAt: '',
        updatedAt: '',
      };

      const monday = getOperatingHoursForDay(area, 1);
      const saturday = getOperatingHoursForDay(area, 6);
      const sunday = getOperatingHoursForDay(area, 0);

      expect(monday?.openTime).toBe('08:00');
      expect(saturday?.openTime).toBe('10:00');
      expect(sunday?.isClosed).toBe(true);
    });
  });

  describe('isTimeSlotAvailable', () => {
    it('should return true for available slot', () => {
      commonAreas.set('a1', {
        id: 'a1',
        propertyId: 'p1',
        name: 'Party Room',
        type: 'party_room',
        status: 'available',
        location: '1st Floor',
        capacity: 50,
        amenities: [],
        equipment: [],
        rules: [],
        requiresApproval: false,
        requiresDeposit: false,
        advanceBookingDays: 30,
        cancellationHours: 24,
        cleanupTimeMinutes: 30,
        operatingHours: [
          { dayOfWeek: 0, openTime: '08:00', closeTime: '22:00', isClosed: false },
          { dayOfWeek: 1, openTime: '08:00', closeTime: '22:00', isClosed: false },
          { dayOfWeek: 2, openTime: '08:00', closeTime: '22:00', isClosed: false },
          { dayOfWeek: 3, openTime: '08:00', closeTime: '22:00', isClosed: false },
          { dayOfWeek: 4, openTime: '08:00', closeTime: '22:00', isClosed: false },
          { dayOfWeek: 5, openTime: '08:00', closeTime: '22:00', isClosed: false },
          { dayOfWeek: 6, openTime: '08:00', closeTime: '22:00', isClosed: false },
        ],
        createdAt: '',
        updatedAt: '',
      });

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];

      const available = isTimeSlotAvailable('a1', dateStr, '10:00', '12:00');

      expect(available).toBe(true);
    });

    it('should return false for conflicting reservation', () => {
      commonAreas.set('a1', {
        id: 'a1',
        propertyId: 'p1',
        name: 'Party Room',
        type: 'party_room',
        status: 'available',
        location: '1st Floor',
        capacity: 50,
        amenities: [],
        equipment: [],
        rules: [],
        requiresApproval: false,
        requiresDeposit: false,
        advanceBookingDays: 30,
        cancellationHours: 24,
        cleanupTimeMinutes: 0,
        operatingHours: [
          { dayOfWeek: 0, openTime: '08:00', closeTime: '22:00', isClosed: false },
          { dayOfWeek: 1, openTime: '08:00', closeTime: '22:00', isClosed: false },
          { dayOfWeek: 2, openTime: '08:00', closeTime: '22:00', isClosed: false },
          { dayOfWeek: 3, openTime: '08:00', closeTime: '22:00', isClosed: false },
          { dayOfWeek: 4, openTime: '08:00', closeTime: '22:00', isClosed: false },
          { dayOfWeek: 5, openTime: '08:00', closeTime: '22:00', isClosed: false },
          { dayOfWeek: 6, openTime: '08:00', closeTime: '22:00', isClosed: false },
        ],
        createdAt: '',
        updatedAt: '',
      });

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];

      areaReservations.set('r1', {
        id: 'r1',
        areaId: 'a1',
        propertyId: 'p1',
        tenantId: 't1',
        eventType: 'private',
        status: 'confirmed',
        date: dateStr,
        startTime: '10:00',
        endTime: '12:00',
        expectedGuests: 20,
        depositPaid: false,
        depositRefunded: false,
        feePaid: false,
        confirmationCode: 'ABC12345',
        createdAt: '',
        updatedAt: '',
      });

      const available = isTimeSlotAvailable('a1', dateStr, '11:00', '13:00');

      expect(available).toBe(false);
    });
  });

  describe('checkCancellationEligibility', () => {
    it('should allow cancellation with refund before deadline', () => {
      commonAreas.set('a1', {
        id: 'a1',
        propertyId: 'p1',
        name: 'Party Room',
        type: 'party_room',
        status: 'available',
        location: '1st Floor',
        capacity: 50,
        amenities: [],
        equipment: [],
        rules: [],
        requiresApproval: false,
        requiresDeposit: true,
        depositAmount: 200,
        advanceBookingDays: 30,
        cancellationHours: 24,
        cleanupTimeMinutes: 30,
        operatingHours: [],
        createdAt: '',
        updatedAt: '',
      });

      const twoDaysFromNow = new Date();
      twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
      const dateStr = twoDaysFromNow.toISOString().split('T')[0];

      const reservation: AreaReservation = {
        id: 'r1',
        areaId: 'a1',
        propertyId: 'p1',
        tenantId: 't1',
        eventType: 'private',
        status: 'confirmed',
        date: dateStr,
        startTime: '14:00',
        endTime: '18:00',
        expectedGuests: 20,
        depositPaid: true,
        depositRefunded: false,
        feePaid: false,
        confirmationCode: 'ABC12345',
        createdAt: '',
        updatedAt: '',
      };

      const eligibility = checkCancellationEligibility(reservation);

      expect(eligibility.eligible).toBe(true);
      expect(eligibility.refundEligible).toBe(true);
    });
  });

  describe('getAreaUtilization', () => {
    it('should calculate utilization statistics', () => {
      commonAreas.set('a1', {
        id: 'a1',
        propertyId: 'p1',
        name: 'Party Room',
        type: 'party_room',
        status: 'available',
        location: '1st Floor',
        capacity: 50,
        amenities: [],
        equipment: [],
        rules: [],
        requiresApproval: false,
        requiresDeposit: false,
        advanceBookingDays: 30,
        cancellationHours: 24,
        cleanupTimeMinutes: 30,
        operatingHours: [],
        createdAt: '',
        updatedAt: '',
      });

      areaReservations.set('r1', {
        id: 'r1',
        areaId: 'a1',
        propertyId: 'p1',
        tenantId: 't1',
        eventType: 'private',
        status: 'completed',
        date: '2024-06-01',
        startTime: '10:00',
        endTime: '14:00',
        expectedGuests: 20,
        actualGuests: 25,
        depositPaid: false,
        depositRefunded: false,
        rentalFee: 200,
        feePaid: true,
        confirmationCode: 'ABC12345',
        createdAt: '',
        updatedAt: '',
      });

      areaReservations.set('r2', {
        id: 'r2',
        areaId: 'a1',
        propertyId: 'p1',
        tenantId: 't2',
        eventType: 'private',
        status: 'cancelled',
        date: '2024-06-02',
        startTime: '14:00',
        endTime: '18:00',
        expectedGuests: 30,
        depositPaid: false,
        depositRefunded: false,
        feePaid: false,
        confirmationCode: 'DEF67890',
        createdAt: '',
        updatedAt: '',
      });

      const utilization = getAreaUtilization('a1');

      expect(utilization.totalReservations).toBe(2);
      expect(utilization.completedReservations).toBe(1);
      expect(utilization.cancelledReservations).toBe(1);
      expect(utilization.totalRevenue).toBe(200);
    });
  });
});

// ============================================================================
// BATCH 9: Guest Management, Lease Violations, Rent Roll, Property Comparison
// ============================================================================

describe('Guest Management', () => {
  beforeEach(() => {
    guestPassStore2.clear();
    guestCheckIns.clear();
    guestParkingSpots.clear();
    guestPolicies.clear();
    guestIncidents.clear();
    guestNotifications.clear();
  });

  describe('generateAccessCode', () => {
    it('should generate code of specified length', () => {
      const code = generateGuestAccessCode(6);
      expect(code).toHaveLength(6);
      expect(/^\d+$/.test(code)).toBe(true);
    });

    it('should generate 8 digit code when requested', () => {
      const code = generateGuestAccessCode(8);
      expect(code).toHaveLength(8);
    });
  });

  describe('isPassValid', () => {
    it('should return true for active pass within date range', () => {
      const now = new Date();
      const pass: GuestPassType = {
        id: 'p1',
        propertyId: 'prop1',
        unitId: 'u1',
        residentId: 'r1',
        guestName: 'John Doe',
        passType: 'one_time',
        purpose: 'visitor',
        validFrom: new Date(now.getTime() - 1000 * 60 * 60),
        validUntil: new Date(now.getTime() + 1000 * 60 * 60 * 24),
        status: 'active',
        checkIns: [],
        createdAt: now,
        updatedAt: now,
      };

      expect(isPassValid(pass)).toBe(true);
    });

    it('should return false for expired pass', () => {
      const now = new Date();
      const pass: GuestPassType = {
        id: 'p1',
        propertyId: 'prop1',
        unitId: 'u1',
        residentId: 'r1',
        guestName: 'John Doe',
        passType: 'one_time',
        purpose: 'visitor',
        validFrom: new Date(now.getTime() - 1000 * 60 * 60 * 48),
        validUntil: new Date(now.getTime() - 1000 * 60 * 60 * 24),
        status: 'active',
        checkIns: [],
        createdAt: now,
        updatedAt: now,
      };

      expect(isPassValid(pass)).toBe(false);
    });

    it('should return false for revoked pass', () => {
      const now = new Date();
      const pass: GuestPassType = {
        id: 'p1',
        propertyId: 'prop1',
        unitId: 'u1',
        residentId: 'r1',
        guestName: 'John Doe',
        passType: 'one_time',
        purpose: 'visitor',
        validFrom: new Date(now.getTime() - 1000 * 60 * 60),
        validUntil: new Date(now.getTime() + 1000 * 60 * 60 * 24),
        status: 'revoked',
        checkIns: [],
        createdAt: now,
        updatedAt: now,
      };

      expect(isPassValid(pass)).toBe(false);
    });
  });

  describe('checkPolicyCompliance', () => {
    it('should return compliant when no policy exists', () => {
      const result = checkPolicyCompliance(
        'prop1',
        'u1',
        new Date(),
        new Date(Date.now() + 1000 * 60 * 60 * 24),
        'visitor'
      );

      expect(result.compliant).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should flag violation for exceeding max consecutive days', () => {
      guestPolicies.set('policy1', {
        id: 'policy1',
        propertyId: 'prop1',
        maxGuestsPerUnit: 5,
        maxConsecutiveDays: 3,
        requiresPreRegistration: true,
        requiresIdVerification: false,
        parkingRequired: false,
        allowedPurposes: ['visitor', 'service'],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = checkPolicyCompliance(
        'prop1',
        'u1',
        new Date(),
        new Date(Date.now() + 1000 * 60 * 60 * 24 * 10), // 10 days
        'visitor'
      );

      expect(result.compliant).toBe(false);
      expect(result.violations.some(v => v.includes('exceeds maximum'))).toBe(true);
    });
  });

  describe('getGuestStats', () => {
    it('should calculate guest statistics for property', () => {
      const now = new Date();

      guestPassStore2.set('p1', {
        id: 'p1',
        propertyId: 'prop1',
        unitId: 'u1',
        residentId: 'r1',
        guestName: 'Guest 1',
        passType: 'one_time',
        purpose: 'visitor',
        validFrom: new Date(now.getTime() - 1000 * 60 * 60),
        validUntil: new Date(now.getTime() + 1000 * 60 * 60 * 24),
        status: 'active',
        checkIns: [],
        createdAt: now,
        updatedAt: now,
      });

      guestParkingSpots.set('spot1', {
        id: 'spot1',
        propertyId: 'prop1',
        spotNumber: 'V1',
        location: 'Lot A',
        type: 'visitor',
        status: 'available',
        createdAt: now,
      });

      const stats = getGuestStats('prop1');

      expect(stats.totalActivePasses).toBe(1);
      expect(stats.parkingSpotsAvailable).toBe(1);
      expect(stats.parkingSpotsTotal).toBe(1);
    });
  });

  describe('expireOldPasses', () => {
    it('should expire passes that are past their valid until date', () => {
      const now = new Date();

      guestPassStore2.set('p1', {
        id: 'p1',
        propertyId: 'prop1',
        unitId: 'u1',
        residentId: 'r1',
        guestName: 'Guest 1',
        passType: 'one_time',
        purpose: 'visitor',
        validFrom: new Date(now.getTime() - 1000 * 60 * 60 * 48),
        validUntil: new Date(now.getTime() - 1000 * 60 * 60 * 24),
        status: 'active',
        checkIns: [],
        createdAt: now,
        updatedAt: now,
      });

      const expiredCount = expireOldPasses();

      expect(expiredCount).toBe(1);
      expect(guestPassStore2.get('p1')?.status).toBe('expired');
    });
  });
});

describe('Lease Violation Tracking', () => {
  beforeEach(() => {
    leaseViolations.clear();
    violationNotices.clear();
    violationFines.clear();
    violationHearings.clear();
    violationTemplates.clear();
    violationPolicies.clear();
  });

  describe('getViolationCount', () => {
    it('should count violations for a tenant', () => {
      leaseViolations.set('v1', {
        id: 'v1',
        propertyId: 'prop1',
        unitId: 'u1',
        leaseId: 'l1',
        tenantId: 't1',
        violationType: 'noise',
        severity: 'minor',
        description: 'Loud music',
        occurredAt: new Date(),
        reportedAt: new Date(),
        reportedBy: 'staff1',
        status: 'reported',
        notices: [],
        fines: [],
        hearings: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      leaseViolations.set('v2', {
        id: 'v2',
        propertyId: 'prop1',
        unitId: 'u1',
        leaseId: 'l1',
        tenantId: 't1',
        violationType: 'noise',
        severity: 'moderate',
        description: 'Party noise',
        occurredAt: new Date(),
        reportedAt: new Date(),
        reportedBy: 'staff1',
        status: 'reported',
        notices: [],
        fines: [],
        hearings: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(getViolationCount('t1')).toBe(2);
      expect(getViolationCount('t1', 'noise')).toBe(2);
      expect(getViolationCount('t1', 'pet_violation')).toBe(0);
    });
  });

  describe('calculateFine', () => {
    it('should calculate first offense fine', () => {
      violationPolicies.set('policy1', {
        id: 'policy1',
        propertyId: 'prop1',
        violationType: 'noise',
        firstOffenseFine: 50,
        repeatOffenseFine: 100,
        curePeriodDays: 7,
        maxViolationsBeforeEviction: 3,
        escalationPath: ['warning', 'fine', 'eviction'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const fine = calculateFine('prop1', 'noise', 'new_tenant');
      expect(fine).toBe(50);
    });

    it('should calculate repeat offense fine', () => {
      violationPolicies.set('policy1', {
        id: 'policy1',
        propertyId: 'prop1',
        violationType: 'noise',
        firstOffenseFine: 50,
        repeatOffenseFine: 100,
        curePeriodDays: 7,
        maxViolationsBeforeEviction: 3,
        escalationPath: ['warning', 'fine', 'eviction'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      leaseViolations.set('v1', {
        id: 'v1',
        propertyId: 'prop1',
        unitId: 'u1',
        leaseId: 'l1',
        tenantId: 't1',
        violationType: 'noise',
        severity: 'minor',
        description: 'Previous violation',
        occurredAt: new Date(),
        reportedAt: new Date(),
        reportedBy: 'staff1',
        status: 'resolved',
        notices: [],
        fines: [],
        hearings: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const fine = calculateFine('prop1', 'noise', 't1');
      expect(fine).toBe(100);
    });
  });

  describe('getCurePeriod', () => {
    it('should return policy cure period', () => {
      violationPolicies.set('policy1', {
        id: 'policy1',
        propertyId: 'prop1',
        violationType: 'pet_violation',
        curePeriodDays: 10,
        maxViolationsBeforeEviction: 2,
        escalationPath: ['warning', 'eviction'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(getCurePeriod('prop1', 'pet_violation')).toBe(10);
    });

    it('should return default cure period when no policy', () => {
      expect(getCurePeriod('prop1', 'noise')).toBe(14);
    });
  });

  describe('getViolationStats', () => {
    it('should aggregate violation statistics', () => {
      leaseViolations.set('v1', {
        id: 'v1',
        propertyId: 'prop1',
        unitId: 'u1',
        leaseId: 'l1',
        tenantId: 't1',
        violationType: 'noise',
        severity: 'minor',
        description: 'Test',
        occurredAt: new Date(),
        reportedAt: new Date(),
        reportedBy: 'staff1',
        status: 'reported',
        notices: [],
        fines: [],
        hearings: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const stats = getViolationStats('prop1');

      expect(stats.totalActive).toBe(1);
      expect(stats.byType['noise']).toBe(1);
      expect(stats.bySeverity['minor']).toBe(1);
      expect(stats.byStatus['reported']).toBe(1);
    });
  });

  describe('getTenantViolationHistory', () => {
    it('should return violation history and fine totals', () => {
      leaseViolations.set('v1', {
        id: 'v1',
        propertyId: 'prop1',
        unitId: 'u1',
        leaseId: 'l1',
        tenantId: 't1',
        violationType: 'noise',
        severity: 'minor',
        description: 'Test',
        occurredAt: new Date(),
        reportedAt: new Date(),
        reportedBy: 'staff1',
        status: 'resolved',
        notices: [],
        fines: [],
        hearings: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      violationFines.set('f1', {
        id: 'f1',
        violationId: 'v1',
        amount: 50,
        reason: 'Noise violation',
        dueDate: new Date(),
        status: 'paid',
        paidAmount: 50,
        createdAt: new Date(),
      });

      const history = getTenantViolationHistory('t1');

      expect(history.violations).toHaveLength(1);
      expect(history.totalFinesPaid).toBe(50);
      expect(history.isRepeatOffender).toBe(false);
    });
  });
});

describe('Rent Roll Reporting', () => {
  beforeEach(() => {
    rentRollEntries.clear();
    rentRollSnapshots.clear();
    scheduledReports.clear();
    reportExecutions.clear();
    rentRollChanges.clear();
  });

  describe('calculateSummary', () => {
    it('should calculate rent roll summary', () => {
      const entries: RentRollEntry[] = [
        {
          id: 'e1',
          propertyId: 'prop1',
          unitId: 'u1',
          unitNumber: '101',
          unitType: '1BR',
          squareFeet: 750,
          bedrooms: 1,
          bathrooms: 1,
          status: 'occupied',
          marketRent: 1500,
          currentRent: 1400,
          balance: 0,
          depositHeld: 1400,
        },
        {
          id: 'e2',
          propertyId: 'prop1',
          unitId: 'u2',
          unitNumber: '102',
          unitType: '2BR',
          squareFeet: 1000,
          bedrooms: 2,
          bathrooms: 2,
          status: 'vacant',
          marketRent: 2000,
          currentRent: 0,
          balance: 0,
          depositHeld: 0,
        },
      ];

      const summary = calculateSummary(entries);

      expect(summary.totalUnits).toBe(2);
      expect(summary.occupiedUnits).toBe(1);
      expect(summary.vacantUnits).toBe(1);
      expect(summary.occupancyRate).toBe(50);
      expect(summary.totalCurrentRent).toBe(1400);
      expect(summary.lossToLease).toBe(100);
      expect(summary.lossToVacancy).toBe(2000);
    });
  });

  describe('formatCurrency', () => {
    it('should format currency correctly', () => {
      expect(formatCurrency(1500)).toBe('$1,500.00');
      expect(formatCurrency(0)).toBe('$0.00');
    });
  });

  describe('formatPercent', () => {
    it('should format percentage correctly', () => {
      expect(formatPercent(95.5)).toBe('95.5%');
      expect(formatPercent(100)).toBe('100.0%');
    });
  });

  describe('calculateNextRunDate', () => {
    it('should calculate next run for daily schedule', () => {
      const schedule: ScheduledReport = {
        id: 's1',
        propertyId: 'prop1',
        name: 'Daily Report',
        reportType: 'rent_roll',
        frequency: 'daily',
        recipients: ['test@example.com'],
        format: 'pdf',
        includeComparison: false,
        nextRunAt: new Date(),
        isActive: true,
        createdAt: new Date(),
      };

      const nextRun = calculateNextRunDate(schedule);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      expect(nextRun.getDate()).toBe(tomorrow.getDate());
    });

    it('should calculate next run for weekly schedule', () => {
      const schedule: ScheduledReport = {
        id: 's1',
        propertyId: 'prop1',
        name: 'Weekly Report',
        reportType: 'rent_roll',
        frequency: 'weekly',
        dayOfWeek: 1, // Monday
        recipients: ['test@example.com'],
        format: 'pdf',
        includeComparison: false,
        nextRunAt: new Date(),
        isActive: true,
        createdAt: new Date(),
      };

      const nextRun = calculateNextRunDate(schedule);

      expect(nextRun.getDay()).toBe(1);
    });
  });

  describe('compareSummaries', () => {
    it('should compare two summaries and show changes', () => {
      const current: RentRollSummary = {
        totalUnits: 100,
        occupiedUnits: 95,
        vacantUnits: 5,
        noticeUnits: 2,
        occupancyRate: 95,
        totalSquareFeet: 100000,
        occupiedSquareFeet: 95000,
        totalMarketRent: 150000,
        totalCurrentRent: 140000,
        totalConcessions: 2000,
        totalOtherIncome: 5000,
        effectiveRent: 143000,
        lossToLease: 10000,
        lossToVacancy: 7500,
        totalBalance: 5000,
        totalDeposits: 140000,
        averageRentPerUnit: 1473.68,
        averageRentPerSqFt: 1.47,
        expiringLeases30Days: 5,
        expiringLeases60Days: 10,
        expiringLeases90Days: 15,
      };

      const previous: RentRollSummary = {
        totalUnits: 100,
        occupiedUnits: 90,
        vacantUnits: 10,
        noticeUnits: 3,
        occupancyRate: 90,
        totalSquareFeet: 100000,
        occupiedSquareFeet: 90000,
        totalMarketRent: 145000,
        totalCurrentRent: 130000,
        totalConcessions: 3000,
        totalOtherIncome: 4000,
        effectiveRent: 131000,
        lossToLease: 15000,
        lossToVacancy: 14500,
        totalBalance: 8000,
        totalDeposits: 130000,
        averageRentPerUnit: 1444.44,
        averageRentPerSqFt: 1.44,
        expiringLeases30Days: 8,
        expiringLeases60Days: 15,
        expiringLeases90Days: 20,
      };

      const comparison = compareSummaries(current, previous);

      expect(comparison.occupiedUnits.change).toBe(5);
      expect(comparison.occupancyRate.change).toBe(5);
      expect(comparison.totalCurrentRent.change).toBe(10000);
    });
  });

  describe('getRentRollForProperty', () => {
    it('should return sorted entries for property', () => {
      rentRollEntries.set('e1', {
        id: 'e1',
        propertyId: 'prop1',
        unitId: 'u1',
        unitNumber: '102',
        unitType: '1BR',
        squareFeet: 750,
        bedrooms: 1,
        bathrooms: 1,
        status: 'occupied',
        marketRent: 1500,
        currentRent: 1400,
        balance: 0,
        depositHeld: 1400,
      });

      rentRollEntries.set('e2', {
        id: 'e2',
        propertyId: 'prop1',
        unitId: 'u2',
        unitNumber: '101',
        unitType: '1BR',
        squareFeet: 750,
        bedrooms: 1,
        bathrooms: 1,
        status: 'occupied',
        marketRent: 1500,
        currentRent: 1450,
        balance: 0,
        depositHeld: 1450,
      });

      const entries = getRentRollForProperty('prop1');

      expect(entries).toHaveLength(2);
      expect(entries[0].unitNumber).toBe('101');
      expect(entries[1].unitNumber).toBe('102');
    });
  });
});

describe('Property Comparison Tool', () => {
  beforeEach(() => {
    propertyMetrics.clear();
    comparisonReports.clear();
    benchmarks.clear();
    savedComparisons.clear();
  });

  describe('availableMetrics', () => {
    it('should have defined metrics with required fields', () => {
      expect(availableMetrics.length).toBeGreaterThan(0);

      for (const metric of availableMetrics) {
        expect(metric.key).toBeDefined();
        expect(metric.name).toBeDefined();
        expect(metric.category).toBeDefined();
        expect(metric.format).toBeDefined();
        expect(typeof metric.higherIsBetter).toBe('boolean');
      }
    });
  });

  describe('getMetricDefinition', () => {
    it('should return metric definition by key', () => {
      const metric = getMetricDefinition('occupancyRate');

      expect(metric).toBeDefined();
      expect(metric?.name).toBe('Occupancy Rate');
      expect(metric?.higherIsBetter).toBe(true);
    });

    it('should return undefined for unknown key', () => {
      const metric = getMetricDefinition('unknownMetric');
      expect(metric).toBeUndefined();
    });
  });

  describe('compareProperties', () => {
    it('should compare properties and generate rankings', () => {
      propertyMetrics.set('prop1', {
        propertyId: 'prop1',
        propertyName: 'Property A',
        recordedAt: new Date(),
        totalUnits: 100,
        totalSquareFeet: 100000,
        propertyType: 'multifamily',
        amenities: ['pool', 'gym'],
        grossPotentialRent: 150000,
        effectiveGrossIncome: 140000,
        operatingExpenses: 60000,
        netOperatingIncome: 80000,
        capRate: 6.5,
        occupancyRate: 95,
        physicalOccupancy: 95,
        economicOccupancy: 93,
        averageDaysVacant: 15,
        turnoverRate: 40,
        averageRentPerUnit: 1400,
        averageRentPerSqFt: 1.4,
        marketRentPerUnit: 1500,
        lossToLease: 10000,
        lossToLeasePercent: 6.7,
        collectionRate: 98,
        delinquencyRate: 2,
        badDebtWriteOff: 1000,
        maintenanceExpensePerUnit: 500,
        workOrdersPerUnit: 3,
        averageWorkOrderCompletionDays: 2,
        renewalRate: 65,
        averageLeaseTerm: 12,
        concessionRate: 3,
      });

      propertyMetrics.set('prop2', {
        propertyId: 'prop2',
        propertyName: 'Property B',
        recordedAt: new Date(),
        totalUnits: 80,
        totalSquareFeet: 80000,
        propertyType: 'multifamily',
        amenities: ['pool'],
        grossPotentialRent: 120000,
        effectiveGrossIncome: 110000,
        operatingExpenses: 50000,
        netOperatingIncome: 60000,
        capRate: 5.5,
        occupancyRate: 92,
        physicalOccupancy: 92,
        economicOccupancy: 90,
        averageDaysVacant: 20,
        turnoverRate: 45,
        averageRentPerUnit: 1375,
        averageRentPerSqFt: 1.375,
        marketRentPerUnit: 1450,
        lossToLease: 6000,
        lossToLeasePercent: 5.2,
        collectionRate: 96,
        delinquencyRate: 4,
        badDebtWriteOff: 2000,
        maintenanceExpensePerUnit: 550,
        workOrdersPerUnit: 4,
        averageWorkOrderCompletionDays: 3,
        renewalRate: 60,
        averageLeaseTerm: 12,
        concessionRate: 4,
      });

      const results = compareProperties(['prop1', 'prop2'], ['occupancyRate', 'collectionRate']);

      expect(results.properties).toHaveLength(2);
      expect(results.rankings).toHaveLength(2);
      expect(results.averages['occupancyRate']).toBe(93.5);
    });
  });

  describe('calculatePortfolioAverages', () => {
    it('should calculate averages across properties', () => {
      propertyMetrics.set('prop1', {
        propertyId: 'prop1',
        propertyName: 'Property A',
        recordedAt: new Date(),
        totalUnits: 100,
        totalSquareFeet: 100000,
        propertyType: 'multifamily',
        amenities: [],
        grossPotentialRent: 150000,
        effectiveGrossIncome: 140000,
        operatingExpenses: 60000,
        netOperatingIncome: 80000,
        capRate: 6,
        occupancyRate: 95,
        physicalOccupancy: 95,
        economicOccupancy: 93,
        averageDaysVacant: 15,
        turnoverRate: 40,
        averageRentPerUnit: 1400,
        averageRentPerSqFt: 1.4,
        marketRentPerUnit: 1500,
        lossToLease: 10000,
        lossToLeasePercent: 6.7,
        collectionRate: 98,
        delinquencyRate: 2,
        badDebtWriteOff: 1000,
        maintenanceExpensePerUnit: 500,
        workOrdersPerUnit: 3,
        averageWorkOrderCompletionDays: 2,
        renewalRate: 65,
        averageLeaseTerm: 12,
        concessionRate: 3,
      });

      propertyMetrics.set('prop2', {
        propertyId: 'prop2',
        propertyName: 'Property B',
        recordedAt: new Date(),
        totalUnits: 100,
        totalSquareFeet: 100000,
        propertyType: 'multifamily',
        amenities: [],
        grossPotentialRent: 150000,
        effectiveGrossIncome: 140000,
        operatingExpenses: 60000,
        netOperatingIncome: 80000,
        capRate: 6,
        occupancyRate: 90,
        physicalOccupancy: 90,
        economicOccupancy: 88,
        averageDaysVacant: 20,
        turnoverRate: 45,
        averageRentPerUnit: 1400,
        averageRentPerSqFt: 1.4,
        marketRentPerUnit: 1500,
        lossToLease: 10000,
        lossToLeasePercent: 6.7,
        collectionRate: 96,
        delinquencyRate: 4,
        badDebtWriteOff: 2000,
        maintenanceExpensePerUnit: 550,
        workOrdersPerUnit: 4,
        averageWorkOrderCompletionDays: 3,
        renewalRate: 60,
        averageLeaseTerm: 12,
        concessionRate: 4,
      });

      const averages = calculatePortfolioAverages(['prop1', 'prop2']);

      expect(averages.occupancyRate).toBe(92.5);
      expect(averages.collectionRate).toBe(97);
    });
  });

  describe('generateTrendData', () => {
    it('should generate trend data points', () => {
      propertyMetrics.set('prop1', {
        propertyId: 'prop1',
        propertyName: 'Property A',
        recordedAt: new Date(),
        totalUnits: 100,
        totalSquareFeet: 100000,
        propertyType: 'multifamily',
        amenities: [],
        grossPotentialRent: 150000,
        effectiveGrossIncome: 140000,
        operatingExpenses: 60000,
        netOperatingIncome: 80000,
        capRate: 6,
        occupancyRate: 95,
        physicalOccupancy: 95,
        economicOccupancy: 93,
        averageDaysVacant: 15,
        turnoverRate: 40,
        averageRentPerUnit: 1400,
        averageRentPerSqFt: 1.4,
        marketRentPerUnit: 1500,
        lossToLease: 10000,
        lossToLeasePercent: 6.7,
        collectionRate: 98,
        delinquencyRate: 2,
        badDebtWriteOff: 1000,
        maintenanceExpensePerUnit: 500,
        workOrdersPerUnit: 3,
        averageWorkOrderCompletionDays: 2,
        renewalRate: 65,
        averageLeaseTerm: 12,
        concessionRate: 3,
      });

      const trend = generateTrendData('prop1', 'occupancyRate', 6);

      expect(trend.propertyId).toBe('prop1');
      expect(trend.metric).toBe('occupancyRate');
      expect(trend.dataPoints).toHaveLength(6);
    });
  });

  describe('compareToBenchmark', () => {
    it('should compare property to benchmark', () => {
      propertyMetrics.set('prop1', {
        propertyId: 'prop1',
        propertyName: 'Property A',
        recordedAt: new Date(),
        totalUnits: 100,
        totalSquareFeet: 100000,
        propertyType: 'multifamily',
        amenities: [],
        grossPotentialRent: 150000,
        effectiveGrossIncome: 140000,
        operatingExpenses: 60000,
        netOperatingIncome: 80000,
        capRate: 6,
        occupancyRate: 95,
        physicalOccupancy: 95,
        economicOccupancy: 93,
        averageDaysVacant: 15,
        turnoverRate: 40,
        averageRentPerUnit: 1400,
        averageRentPerSqFt: 1.4,
        marketRentPerUnit: 1500,
        lossToLease: 10000,
        lossToLeasePercent: 6.7,
        collectionRate: 98,
        delinquencyRate: 2,
        badDebtWriteOff: 1000,
        maintenanceExpensePerUnit: 500,
        workOrdersPerUnit: 3,
        averageWorkOrderCompletionDays: 2,
        renewalRate: 65,
        averageLeaseTerm: 12,
        concessionRate: 3,
      });

      benchmarks.set('b1', {
        id: 'b1',
        name: 'Market Benchmark',
        propertyType: 'multifamily',
        source: 'market',
        metrics: {
          occupancyRate: { value: 85 }, // 95 vs 85 = 11.8% variance > 5% threshold
          collectionRate: { value: 95 },
        },
        effectiveDate: new Date(),
        createdAt: new Date(),
      });

      const comparison = compareToBenchmark('prop1', 'b1');

      expect(comparison.occupancyRate.value).toBe(95);
      expect(comparison.occupancyRate.benchmark).toBe(85);
      expect(comparison.occupancyRate.status).toBe('above');
    });
  });
});
