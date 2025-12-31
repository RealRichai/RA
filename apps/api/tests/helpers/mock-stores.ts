/**
 * Mock Stores for Testing
 *
 * These mock stores replace the in-memory Maps that were removed
 * during the Prisma migration. Tests can use these to set up
 * test data without needing a real database.
 */

// Violations stores
export const leaseViolations = new Map<string, unknown>();
export const violationNotices = new Map<string, unknown>();
export const violationFines = new Map<string, unknown>();
export const violationHearings = new Map<string, unknown>();
export const violationTemplates = new Map<string, unknown>();
export const violationPolicies = new Map<string, unknown>();

// Rent Roll stores
export const rentRollEntries = new Map<string, unknown>();
export const rentRollSnapshots = new Map<string, unknown>();
export const scheduledReports = new Map<string, unknown>();
export const reportExecutions = new Map<string, unknown>();

// Property Comparison stores
export const propertyMetrics = new Map<string, unknown>();
export const comparisonReports = new Map<string, unknown>();
export const benchmarks = new Map<string, unknown>();
export const savedComparisons = new Map<string, unknown>();
export const trendDataStore = new Map<string, unknown>();

// HOA stores
export const associations = new Map<string, unknown>();
export const hoaAssessments = new Map<string, unknown>();
export const violations = new Map<string, unknown>();
export const architecturalRequests = new Map<string, unknown>();
export const boardMeetings = new Map<string, unknown>();
export const associationDocuments = new Map<string, unknown>();

// Guest stores
export const guestPasses = new Map<string, unknown>();
export const guestCheckIns = new Map<string, unknown>();
export const guestParking = new Map<string, unknown>();
export const guestPolicies = new Map<string, unknown>();
export const guestIncidents = new Map<string, unknown>();

// Pet stores
export const pets = new Map<string, unknown>();
export const petApplications = new Map<string, unknown>();
export const petPolicies = new Map<string, unknown>();
export const petIncidents = new Map<string, unknown>();

// Package stores
export const packages = new Map<string, unknown>();
export const packageLockers = new Map<string, unknown>();

// Parking stores
export const parkingSpots = new Map<string, unknown>();
export const parkingAssignments = new Map<string, unknown>();
export const parkingWaitlist = new Map<string, unknown>();

// Storage stores
export const storageUnits = new Map<string, unknown>();
export const storageAssignments = new Map<string, unknown>();
export const storageWaitlist = new Map<string, unknown>();

// Key stores
export const keys = new Map<string, unknown>();
export const keyAssignments = new Map<string, unknown>();
export const keyRequests = new Map<string, unknown>();
export const keyAccessLogs = new Map<string, unknown>();

// Building System stores
export const buildingSystems = new Map<string, unknown>();
export const systemReadings = new Map<string, unknown>();
export const systemAlerts = new Map<string, unknown>();
export const systemSchedules = new Map<string, unknown>();

// Common Area stores
export const commonAreas = new Map<string, unknown>();
export const commonAreaBookings = new Map<string, unknown>();
export const commonAreaEquipment = new Map<string, unknown>();
export const commonAreaPolicies = new Map<string, unknown>();

// Amenity stores
export const amenities = new Map<string, unknown>();
export const amenityBookings = new Map<string, unknown>();
export const amenityPolicies = new Map<string, unknown>();

// Tax Document stores
export const taxYears = new Map<string, unknown>();
export const taxRecipients = new Map<string, unknown>();
export const taxDocuments = new Map<string, unknown>();
export const taxPayments = new Map<string, unknown>();
export const ownerTaxPackets = new Map<string, unknown>();
export const depreciationItems = new Map<string, unknown>();

// Rental Assistance stores
export const assistancePrograms = new Map<string, unknown>();
export const assistanceApplications = new Map<string, unknown>();
export const assistancePayments = new Map<string, unknown>();
export const assistanceFundings = new Map<string, unknown>();

// Reconciliation stores
export const reconciliations = new Map<string, unknown>();
export const reconciliationItems = new Map<string, unknown>();

// Communications stores
export const threads = new Map<string, unknown>();
export const messages = new Map<string, unknown>();
export const smsMessages = new Map<string, unknown>();
export const messageTemplates = new Map<string, unknown>();
export const broadcasts = new Map<string, unknown>();

// Notification stores
export const pushSubscriptions = new Map<string, unknown>();

// Tenant Portal stores
export const tenantPreferences = new Map<string, unknown>();
export const tenantRequests = new Map<string, unknown>();

// Owner Portal stores
export const owners = new Map<string, unknown>();
export const ownerships = new Map<string, unknown>();
export const ownerStatements = new Map<string, unknown>();
export const distributions = new Map<string, unknown>();

// Comparable stores
export const comparableSearches = new Map<string, unknown>();

// Utility stores
export const utilityProviders = new Map<string, unknown>();
export const utilityAccounts = new Map<string, unknown>();
export const utilityBills = new Map<string, unknown>();
export const rubsConfigs = new Map<string, unknown>();

// Insurance stores
export const policies = new Map<string, unknown>();
export const certificates = new Map<string, unknown>();
export const claims = new Map<string, unknown>();
export const alerts = new Map<string, unknown>();

// Move Workflow stores
export const workflows = new Map<string, unknown>();
export const checklistTemplates = new Map<string, unknown>();
export const checklistItems = new Map<string, unknown>();
export const conditionReports = new Map<string, unknown>();
export const keyRecords = new Map<string, unknown>();
export const depositRecords = new Map<string, unknown>();
export const depositDeductions = new Map<string, unknown>();
export const utilityTransfers = new Map<string, unknown>();

// Showing stores
export const showings = new Map<string, unknown>();
export const prospects = new Map<string, unknown>();
export const showingAgents = new Map<string, unknown>();
export const listingAvailability = new Map<string, unknown>();

// Budget stores
export const budgets = new Map<string, unknown>();
export const budgetActuals = new Map<string, unknown>();
export const forecasts = new Map<string, unknown>();
export const capExItems = new Map<string, unknown>();

// Screening stores
export const applications = new Map<string, unknown>();
export const screeningCriteria = new Map<string, unknown>();

// Inspection stores
export const inspections = new Map<string, unknown>();
export const inspectionTemplates = new Map<string, unknown>();

// Vendor stores
export const vendors = new Map<string, unknown>();
export const workOrders = new Map<string, unknown>();
export const invoices = new Map<string, unknown>();
export const ratings = new Map<string, unknown>();

// Lease Template stores
export const leaseTemplates = new Map<string, unknown>();
export const clauses = new Map<string, unknown>();
export const generatedLeases = new Map<string, unknown>();

// Portfolio stores
export const portfolioProperties = new Map<string, unknown>();
export const occupancyHistory = new Map<string, unknown>();
export const revenueHistory = new Map<string, unknown>();

// Rent Collection stores
export const schedules = new Map<string, unknown>();
export const charges = new Map<string, unknown>();
export const paymentMethods = new Map<string, unknown>();

/**
 * Clear all mock stores - useful in beforeEach hooks
 */
export function clearAllStores(): void {
  // Get all exports and clear any that are Maps
  const stores = [
    leaseViolations, violationNotices, violationFines, violationHearings,
    violationTemplates, violationPolicies, rentRollEntries, rentRollSnapshots,
    scheduledReports, reportExecutions, propertyMetrics, comparisonReports,
    benchmarks, savedComparisons, trendDataStore, associations, hoaAssessments,
    violations, architecturalRequests, boardMeetings, associationDocuments,
    guestPasses, guestCheckIns, guestParking, guestPolicies, guestIncidents,
    pets, petApplications, petPolicies, petIncidents, packages, packageLockers,
    parkingSpots, parkingAssignments, parkingWaitlist, storageUnits,
    storageAssignments, storageWaitlist, keys, keyAssignments, keyRequests,
    keyAccessLogs, buildingSystems, systemReadings, systemAlerts, systemSchedules,
    commonAreas, commonAreaBookings, commonAreaEquipment, commonAreaPolicies,
    amenities, amenityBookings, amenityPolicies, taxYears, taxRecipients,
    taxDocuments, taxPayments, ownerTaxPackets, depreciationItems,
    assistancePrograms, assistanceApplications, assistancePayments,
    assistanceFundings, reconciliations, reconciliationItems, threads,
    messages, smsMessages, messageTemplates, broadcasts, pushSubscriptions,
    tenantPreferences, tenantRequests, owners, ownerships, ownerStatements,
    distributions, comparableSearches, utilityProviders, utilityAccounts,
    utilityBills, rubsConfigs, policies, certificates, claims, alerts,
    workflows, checklistTemplates, checklistItems, conditionReports,
    keyRecords, depositRecords, depositDeductions, utilityTransfers,
    showings, prospects, showingAgents, listingAvailability, budgets,
    budgetActuals, forecasts, capExItems, applications, screeningCriteria,
    inspections, inspectionTemplates, vendors, workOrders, invoices, ratings,
    leaseTemplates, clauses, generatedLeases, portfolioProperties,
    occupancyHistory, revenueHistory, schedules, charges, paymentMethods,
  ];

  stores.forEach(store => store.clear());
}
