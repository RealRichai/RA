/**
 * Test Setup
 *
 * Provides mocks and utilities for testing API modules.
 */

import { vi } from 'vitest';

// Mock Redis
export const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
  pipeline: vi.fn(() => ({
    setex: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  })),
};

// Helper to create a standard model mock with common Prisma methods
const createModelMock = () => ({
  findUnique: vi.fn().mockResolvedValue(null),
  findFirst: vi.fn().mockResolvedValue(null),
  findMany: vi.fn().mockResolvedValue([]),
  create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'mock-id', ...args.data })),
  createMany: vi.fn().mockResolvedValue({ count: 0 }),
  update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
  updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  delete: vi.fn().mockResolvedValue({}),
  deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  count: vi.fn().mockResolvedValue(0),
  aggregate: vi.fn().mockResolvedValue({}),
  groupBy: vi.fn().mockResolvedValue([]),
  upsert: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'mock-id', ...args.create })),
});

// Mock Prisma
export const mockPrisma = {
  // Core models
  user: createModelMock(),
  session: createModelMock(),
  refreshToken: createModelMock(),
  auditLog: createModelMock(),
  property: createModelMock(),
  unit: createModelMock(),
  lease: createModelMock(),

  // Property Comparison models
  propertyMetric: createModelMock(),
  comparisonReport: createModelMock(),
  benchmark: createModelMock(),
  savedPropertyComparison: createModelMock(),
  comparableSearch: createModelMock(),

  // HOA models
  hOAAssociation: createModelMock(),
  hOAAssessment: createModelMock(),
  hOAViolation: createModelMock(),
  architecturalRequest: createModelMock(),
  boardMeeting: createModelMock(),
  associationDocument: createModelMock(),

  // Violation models
  leaseViolation: createModelMock(),
  violationNotice: createModelMock(),
  violationFine: createModelMock(),
  violationHearing: createModelMock(),
  violationTemplate: createModelMock(),
  violationPolicy: createModelMock(),

  // Rent Roll models
  rentRollEntry: createModelMock(),
  rentRollSnapshot: createModelMock(),
  scheduledReport: createModelMock(),
  reportExecution: createModelMock(),
  rentRollChange: createModelMock(),

  // Guest models
  guestPass: createModelMock(),
  guestCheckIn: createModelMock(),
  guestParkingSpot: createModelMock(),
  guestParking: createModelMock(),
  guestPolicy: createModelMock(),
  guestIncident: createModelMock(),
  guestNotification: createModelMock(),

  // Common Area models
  commonArea: createModelMock(),
  commonAreaBooking: createModelMock(),
  areaReservation: createModelMock(),
  areaWaitlist: createModelMock(),
  areaIncident: createModelMock(),
  areaRating: createModelMock(),
  communityEvent: createModelMock(),

  // Building System models
  buildingSystem: createModelMock(),
  systemSensor: createModelMock(),
  sensorReading: createModelMock(),
  systemAlert: createModelMock(),
  maintenanceSchedule: createModelMock(),
  energyUsage: createModelMock(),
  systemDowntime: createModelMock(),
  alertRule: createModelMock(),

  // Key & Access models
  propertyKey: createModelMock(),
  physicalKey: createModelMock(),
  accessDevice: createModelMock(),
  accessZone: createModelMock(),
  accessPoint: createModelMock(),
  keyAssignment: createModelMock(),
  accessAuditLog: createModelMock(),
  lockoutEvent: createModelMock(),
  keyRequest: createModelMock(),
  temporaryAccess: createModelMock(),

  // Storage models
  storageUnit: createModelMock(),
  storageRental: createModelMock(),
  storagePayment: createModelMock(),
  storageAccessLog: createModelMock(),
  storageWaitlist: createModelMock(),
  storagePromotion: createModelMock(),
  lienAuction: createModelMock(),

  // Parking models
  parkingLot: createModelMock(),
  parkingSpace: createModelMock(),
  vehicle: createModelMock(),
  parkingPermit: createModelMock(),
  parkingGuestPass: createModelMock(),
  parkingViolation: createModelMock(),
  towRecord: createModelMock(),

  // Pet models
  pet: createModelMock(),
  breedRestriction: createModelMock(),
  petPolicy: createModelMock(),
  vaccinationRecord: createModelMock(),
  petIncident: createModelMock(),
  petScreening: createModelMock(),
  petFee: createModelMock(),

  // Package models
  packageLocker: createModelMock(),
  package: createModelMock(),
  pickupLog: createModelMock(),
  proxyAuthorization: createModelMock(),
  forwardingAddress: createModelMock(),

  // Amenity models
  amenity: createModelMock(),
  amenityReservation: createModelMock(),
  amenityWaitlist: createModelMock(),
  recurringBooking: createModelMock(),
  usageLog: createModelMock(),

  // Rental Assistance models
  rentalAssistanceProgram: createModelMock(),
  rentalAssistanceApplication: createModelMock(),
  voucher: createModelMock(),
  assistanceInspection: createModelMock(),
  assistancePayment: createModelMock(),
  landlordCertification: createModelMock(),
  complianceReport: createModelMock(),

  // Tax Document models
  taxYear: createModelMock(),
  taxRecipient: createModelMock(),
  taxDocument: createModelMock(),
  taxPayment: createModelMock(),
  ownerTaxPacket: createModelMock(),
  depreciationItem: createModelMock(),

  // Move Workflow models
  workflow: createModelMock(),
  checklistTemplate: createModelMock(),
  checklistItem: createModelMock(),
  conditionReport: createModelMock(),
  keyRecord: createModelMock(),
  depositRecord: createModelMock(),
  depositDeduction: createModelMock(),
  utilityTransfer: createModelMock(),

  // Showing models
  showing: createModelMock(),
  prospect: createModelMock(),
  showingAgent: createModelMock(),
  listingAvailability: createModelMock(),

  // Listing models
  listing: createModelMock(),
  listingMedia: createModelMock(),

  // Budget models
  budget: createModelMock(),
  budgetActual: createModelMock(),
  forecast: createModelMock(),
  capExItem: createModelMock(),

  // Owner Portal models
  owner: createModelMock(),
  ownership: createModelMock(),
  ownerStatement: createModelMock(),
  distribution: createModelMock(),

  // Utility models
  utilityProvider: createModelMock(),
  utilityAccount: createModelMock(),
  utilityBill: createModelMock(),
  rubsConfig: createModelMock(),

  // Insurance models
  insurancePolicy: createModelMock(),
  insuranceCertificate: createModelMock(),
  insuranceClaim: createModelMock(),
  insuranceAlert: createModelMock(),

  // Communication models
  messageThread: createModelMock(),
  message: createModelMock(),
  smsMessage: createModelMock(),
  messageTemplate: createModelMock(),
  broadcast: createModelMock(),

  // Screening models
  screeningApplication: createModelMock(),
  screeningCriteria: createModelMock(),

  // Portfolio models
  portfolioProperty: createModelMock(),
  occupancyHistoryRecord: createModelMock(),
  revenueHistoryRecord: createModelMock(),

  // Lease Template models
  leaseTemplate: createModelMock(),
  clause: createModelMock(),
  generatedLease: createModelMock(),

  // Vendor models
  vendor: createModelMock(),
  workOrder: createModelMock(),
  invoice: createModelMock(),
  vendorRating: createModelMock(),

  // Inspection models
  inspection: createModelMock(),
  inspectionTemplate: createModelMock(),

  // Rent Collection models
  rentSchedule: createModelMock(),
  rentCharge: createModelMock(),
  paymentMethod: createModelMock(),
};

// Mock Email Service
export const mockEmailService = {
  send: vi.fn().mockResolvedValue(undefined),
};

// Mock Fastify JWT
export const mockJwt = {
  sign: vi.fn().mockReturnValue('mock-access-token'),
};

// Mock Fastify App
export const createMockApp = () => ({
  redis: mockRedis,
  emailService: mockEmailService,
  jwt: mockJwt,
});

// Reset all mocks between tests
export const resetMocks = () => {
  vi.clearAllMocks();
  mockRedis.get.mockReset();
  mockRedis.set.mockReset();
  mockRedis.setex.mockReset();
  mockRedis.del.mockReset();
  mockRedis.exists.mockReset();
  mockRedis.incr.mockReset();
  mockRedis.expire.mockReset();
  mockRedis.ttl.mockReset();
};

// Mock modules
vi.mock('@realriches/database', () => ({
  prisma: mockPrisma,
}));

vi.mock('@realriches/config', () => ({
  getConfig: () => ({
    jwt: {
      secret: 'test-secret',
      accessExpiresIn: '15m',
      refreshExpiresIn: '7d',
    },
    web: {
      appUrl: 'http://localhost:3000',
    },
  }),
}));

vi.mock('@realriches/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@realriches/utils')>();
  return {
    ...actual,
    generatePrefixedId: vi.fn((prefix: string) => `${prefix}_test123`),
    generateToken: vi.fn(() => 'mock-token-64chars'),
    sha256: vi.fn((input: string) => `sha256_${input}`),
  };
});

vi.mock('argon2', () => ({
  hash: vi.fn().mockResolvedValue('hashed-password'),
  verify: vi.fn(),
}));
