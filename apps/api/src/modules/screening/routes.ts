import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  prisma,
  Prisma,
  type RiskLevel as PrismaRiskLevel,
  type ScreeningProviderEnum as PrismaScreeningProvider,
  type ScreeningTypeEnum as PrismaScreeningType,
  type ScreeningReportStatus as PrismaReportStatus,
} from '@realriches/database';

// Types
export type ScreeningProvider = 'transunion' | 'experian' | 'equifax' | 'checkr' | 'mock';
export type ApplicationStatus = 'pending' | 'screening' | 'review' | 'approved' | 'conditionally_approved' | 'denied' | 'withdrawn' | 'expired';
export type ScreeningType = 'credit' | 'criminal' | 'eviction' | 'income' | 'employment' | 'rental_history' | 'identity';
export type ReportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
export type RiskLevel = 'low' | 'medium' | 'high' | 'very_high';

export interface RentalApplication {
  id: string;
  propertyId: string;
  unitId: string | null;
  listingId: string | null;
  status: ApplicationStatus;
  applicants: Applicant[];
  desiredMoveIn: Date;
  desiredLeaseTerm: number;
  monthlyRent: number;
  applicationFee: number;
  applicationFeePaid: boolean;
  screeningConsent: boolean;
  screeningConsentDate: Date | null;
  overallScore: number | null;
  riskLevel: RiskLevel | null;
  decision: ApplicationDecision | null;
  notes: string[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface Applicant {
  id: string;
  applicationId: string;
  type: 'primary' | 'co_applicant' | 'guarantor';
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: Date;
  ssn: string;
  currentAddress: Address;
  employmentInfo: EmploymentInfo;
  incomeInfo: IncomeInfo;
  rentalHistory: RentalHistoryEntry[];
  references: Reference[];
  screeningReports: ScreeningReport[];
  score: number | null;
  riskFactors: string[];
}

export interface Address {
  street: string;
  unit: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  residenceSince: Date;
  monthlyRent: number | null;
  landlordName: string | null;
  landlordPhone: string | null;
}

export interface EmploymentInfo {
  status: 'employed' | 'self_employed' | 'unemployed' | 'retired' | 'student';
  employerName: string | null;
  employerPhone: string | null;
  jobTitle: string | null;
  startDate: Date | null;
  annualSalary: number | null;
  supervisorName: string | null;
  supervisorPhone: string | null;
}

export interface IncomeInfo {
  annualIncome: number;
  monthlyIncome: number;
  incomeSources: IncomeSource[];
  incomeToRentRatio: number;
  verified: boolean;
  verificationMethod: string | null;
  verificationDate: Date | null;
}

export interface IncomeSource {
  type: 'employment' | 'self_employment' | 'rental' | 'investment' | 'retirement' | 'alimony' | 'child_support' | 'government' | 'other';
  description: string;
  monthlyAmount: number;
  verified: boolean;
  documents: string[];
}

export interface RentalHistoryEntry {
  address: string;
  landlordName: string;
  landlordPhone: string | null;
  moveInDate: Date;
  moveOutDate: Date | null;
  monthlyRent: number;
  reasonForLeaving: string | null;
  verified: boolean;
  verificationNotes: string | null;
}

export interface Reference {
  name: string;
  relationship: string;
  phone: string;
  email: string | null;
  verified: boolean;
  notes: string | null;
}

export interface ScreeningReport {
  id: string;
  applicantId: string;
  type: ScreeningType;
  provider: ScreeningProvider;
  status: ReportStatus;
  requestedAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
  score: number | null;
  data: CreditReport | CriminalReport | EvictionReport | IncomeReport | EmploymentReport | null;
  riskFactors: string[];
  recommendations: string[];
}

export interface CreditReport {
  creditScore: number;
  scoreRange: { min: number; max: number };
  scoreRating: 'excellent' | 'good' | 'fair' | 'poor' | 'very_poor';
  tradelines: Tradeline[];
  collections: Collection[];
  publicRecords: PublicRecord[];
  inquiries: Inquiry[];
  totalDebt: number;
  availableCredit: number;
  creditUtilization: number;
  oldestAccount: Date | null;
  paymentHistory: { onTime: number; late: number; percentage: number };
}

export interface Tradeline {
  creditor: string;
  accountType: string;
  balance: number;
  creditLimit: number | null;
  monthlyPayment: number;
  status: 'current' | 'late' | 'collections' | 'closed';
  openDate: Date;
  lastPaymentDate: Date | null;
}

export interface Collection {
  creditor: string;
  originalCreditor: string | null;
  amount: number;
  dateReported: Date;
  status: 'open' | 'paid' | 'settled';
}

export interface PublicRecord {
  type: 'bankruptcy' | 'judgment' | 'lien' | 'foreclosure';
  filedDate: Date;
  amount: number | null;
  status: string;
  court: string | null;
}

export interface Inquiry {
  creditor: string;
  date: Date;
  type: 'hard' | 'soft';
}

export interface CriminalReport {
  hasRecords: boolean;
  records: CriminalRecord[];
  sexOffenderCheck: boolean;
  terroristWatchlist: boolean;
}

export interface CriminalRecord {
  offense: string;
  category: 'felony' | 'misdemeanor' | 'infraction';
  date: Date;
  jurisdiction: string;
  disposition: string;
  sentence: string | null;
}

export interface EvictionReport {
  hasEvictions: boolean;
  evictions: EvictionRecord[];
}

export interface EvictionRecord {
  plaintiff: string;
  defendant: string;
  filingDate: Date;
  caseNumber: string;
  court: string;
  disposition: string;
  judgmentAmount: number | null;
}

export interface IncomeReport {
  verified: boolean;
  reportedIncome: number;
  verifiedIncome: number;
  discrepancy: number;
  documents: string[];
  notes: string;
}

export interface EmploymentReport {
  verified: boolean;
  employer: string;
  jobTitle: string;
  startDate: Date;
  salary: number | null;
  verifiedBy: string;
  verifiedDate: Date;
  notes: string;
}

export interface ApplicationDecision {
  decision: 'approved' | 'conditionally_approved' | 'denied';
  decidedAt: Date;
  decidedBy: string;
  reason: string;
  conditions: string[];
  requiredDeposit: number | null;
  approvedRent: number | null;
  approvedLeaseTerm: number | null;
  validUntil: Date;
}

export interface ScreeningCriteria {
  id: string;
  name: string;
  propertyId: string | null;
  isDefault: boolean;
  minCreditScore: number;
  maxDebtToIncomeRatio: number;
  minIncomeToRentRatio: number;
  maxLatePayments: number;
  maxCollections: number;
  allowBankruptcy: boolean;
  bankruptcyLookbackYears: number;
  allowEvictions: boolean;
  evictionLookbackYears: number;
  allowFelonies: boolean;
  felonyLookbackYears: number;
  allowMisdemeanors: boolean;
  misdemeanorLookbackYears: number;
  requireEmploymentVerification: boolean;
  requireIncomeVerification: boolean;
  requireRentalHistory: boolean;
  minRentalHistoryMonths: number;
}

// Schemas
const addressSchema = z.object({
  street: z.string().min(1),
  unit: z.string().optional(),
  city: z.string().min(1),
  state: z.string().length(2),
  zip: z.string().min(5),
  country: z.string().default('US'),
  residenceSince: z.string().datetime(),
  monthlyRent: z.number().nonnegative().optional(),
  landlordName: z.string().optional(),
  landlordPhone: z.string().optional(),
});

const applicantSchema = z.object({
  type: z.enum(['primary', 'co_applicant', 'guarantor']),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(10),
  dateOfBirth: z.string().datetime(),
  ssn: z.string().regex(/^\d{3}-?\d{2}-?\d{4}$/),
  currentAddress: addressSchema,
  employmentStatus: z.enum(['employed', 'self_employed', 'unemployed', 'retired', 'student']),
  employerName: z.string().optional(),
  jobTitle: z.string().optional(),
  annualIncome: z.number().nonnegative(),
});

const createApplicationSchema = z.object({
  propertyId: z.string().uuid(),
  unitId: z.string().uuid().optional(),
  listingId: z.string().uuid().optional(),
  desiredMoveIn: z.string().datetime(),
  desiredLeaseTerm: z.number().int().min(1).max(36),
  monthlyRent: z.number().positive(),
  applicants: z.array(applicantSchema).min(1),
  screeningConsent: z.boolean(),
});

const criteriaSchema = z.object({
  name: z.string().min(1),
  propertyId: z.string().uuid().optional(),
  isDefault: z.boolean().default(false),
  minCreditScore: z.number().int().min(300).max(850).default(650),
  maxDebtToIncomeRatio: z.number().min(0).max(100).default(43),
  minIncomeToRentRatio: z.number().min(1).max(10).default(3),
  maxLatePayments: z.number().int().min(0).default(3),
  maxCollections: z.number().int().min(0).default(2),
  allowBankruptcy: z.boolean().default(false),
  bankruptcyLookbackYears: z.number().int().min(1).max(10).default(7),
  allowEvictions: z.boolean().default(false),
  evictionLookbackYears: z.number().int().min(1).max(10).default(7),
  allowFelonies: z.boolean().default(false),
  felonyLookbackYears: z.number().int().min(1).max(10).default(7),
  allowMisdemeanors: z.boolean().default(true),
  misdemeanorLookbackYears: z.number().int().min(1).max(10).default(3),
  requireEmploymentVerification: z.boolean().default(true),
  requireIncomeVerification: z.boolean().default(true),
  requireRentalHistory: z.boolean().default(true),
  minRentalHistoryMonths: z.number().int().min(0).default(12),
});

// Helper functions
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function mapScreeningType(type: ScreeningType): PrismaScreeningType {
  const typeMap: Record<ScreeningType, PrismaScreeningType> = {
    credit: 'credit',
    criminal: 'criminal',
    eviction: 'eviction',
    income: 'income',
    employment: 'employment',
    rental_history: 'rental_history',
    identity: 'identity',
  };
  return typeMap[type];
}

function generateMockCreditReport(): CreditReport {
  const score = Math.floor(Math.random() * 300) + 550;
  let scoreRating: CreditReport['scoreRating'];
  if (score >= 750) scoreRating = 'excellent';
  else if (score >= 700) scoreRating = 'good';
  else if (score >= 650) scoreRating = 'fair';
  else if (score >= 550) scoreRating = 'poor';
  else scoreRating = 'very_poor';

  return {
    creditScore: score,
    scoreRange: { min: 300, max: 850 },
    scoreRating,
    tradelines: [
      {
        creditor: 'Chase Bank',
        accountType: 'Credit Card',
        balance: 2500,
        creditLimit: 10000,
        monthlyPayment: 100,
        status: 'current',
        openDate: new Date('2020-01-15'),
        lastPaymentDate: new Date(),
      },
      {
        creditor: 'Auto Loan Corp',
        accountType: 'Auto Loan',
        balance: 15000,
        creditLimit: null,
        monthlyPayment: 450,
        status: 'current',
        openDate: new Date('2021-06-01'),
        lastPaymentDate: new Date(),
      },
    ],
    collections: score < 600 ? [
      {
        creditor: 'Collections Agency',
        originalCreditor: 'Medical Provider',
        amount: 500,
        dateReported: new Date('2022-03-15'),
        status: 'open',
      },
    ] : [],
    publicRecords: [],
    inquiries: [
      { creditor: 'Landlord Check', date: new Date(), type: 'soft' },
    ],
    totalDebt: 17500,
    availableCredit: 7500,
    creditUtilization: 25,
    oldestAccount: new Date('2018-05-01'),
    paymentHistory: { onTime: 95, late: 5, percentage: 95 },
  };
}

function generateMockCriminalReport(): CriminalReport {
  const hasRecords = Math.random() < 0.1;
  return {
    hasRecords,
    records: hasRecords ? [
      {
        offense: 'Minor Traffic Violation',
        category: 'infraction',
        date: new Date('2021-08-15'),
        jurisdiction: 'County Court',
        disposition: 'Fine Paid',
        sentence: '$150 fine',
      },
    ] : [],
    sexOffenderCheck: false,
    terroristWatchlist: false,
  };
}

function generateMockEvictionReport(): EvictionReport {
  const hasEvictions = Math.random() < 0.05;
  return {
    hasEvictions,
    evictions: hasEvictions ? [
      {
        plaintiff: 'Previous Landlord LLC',
        defendant: 'Applicant Name',
        filingDate: new Date('2019-03-01'),
        caseNumber: 'CV-2019-12345',
        court: 'County Civil Court',
        disposition: 'Dismissed',
        judgmentAmount: null,
      },
    ] : [],
  };
}

function calculateApplicantScore(applicant: Applicant, criteria: ScreeningCriteria): number {
  let score = 0;
  const creditReport = applicant.screeningReports.find((r) => r.type === 'credit')?.data as CreditReport | undefined;
  const criminalReport = applicant.screeningReports.find((r) => r.type === 'criminal')?.data as CriminalReport | undefined;
  const evictionReport = applicant.screeningReports.find((r) => r.type === 'eviction')?.data as EvictionReport | undefined;

  // Credit score component (40 points max)
  if (creditReport) {
    const creditScore = creditReport.creditScore;
    if (creditScore >= 750) score += 40;
    else if (creditScore >= 700) score += 35;
    else if (creditScore >= 650) score += 25;
    else if (creditScore >= 600) score += 15;
    else score += 5;
  }

  // Income ratio component (25 points max)
  const incomeRatio = applicant.incomeInfo.monthlyIncome / (applicant.incomeInfo.monthlyIncome > 0 ? 2000 : 1);
  if (incomeRatio >= criteria.minIncomeToRentRatio) score += 25;
  else if (incomeRatio >= criteria.minIncomeToRentRatio * 0.8) score += 15;
  else score += 5;

  // Criminal history component (15 points max)
  if (criminalReport) {
    if (!criminalReport.hasRecords) score += 15;
    else if (criminalReport.records.every((r) => r.category === 'infraction')) score += 10;
    else score += 0;
  }

  // Eviction history component (15 points max)
  if (evictionReport) {
    if (!evictionReport.hasEvictions) score += 15;
    else score += 0;
  }

  // Rental history component (5 points max)
  if (applicant.rentalHistory.length > 0) {
    const totalMonths = applicant.rentalHistory.reduce((sum, r) => {
      const moveInTime = r.moveInDate instanceof Date ? r.moveInDate.getTime() : new Date(r.moveInDate).getTime();
      const moveOutTime = r.moveOutDate
        ? (r.moveOutDate instanceof Date ? r.moveOutDate.getTime() : new Date(r.moveOutDate).getTime())
        : Date.now();
      const months = (moveOutTime - moveInTime) / (1000 * 60 * 60 * 24 * 30);
      return sum + months;
    }, 0);
    if (totalMonths >= criteria.minRentalHistoryMonths) score += 5;
  }

  return Math.min(100, Math.max(0, score));
}

function determineRiskLevel(score: number): RiskLevel {
  if (score >= 80) return 'low';
  if (score >= 60) return 'medium';
  if (score >= 40) return 'high';
  return 'very_high';
}

function generateRiskFactors(applicant: Applicant, criteria: ScreeningCriteria): string[] {
  const factors: string[] = [];
  const creditReport = applicant.screeningReports.find((r) => r.type === 'credit')?.data as CreditReport | undefined;
  const criminalReport = applicant.screeningReports.find((r) => r.type === 'criminal')?.data as CriminalReport | undefined;
  const evictionReport = applicant.screeningReports.find((r) => r.type === 'eviction')?.data as EvictionReport | undefined;

  if (creditReport) {
    if (creditReport.creditScore < criteria.minCreditScore) {
      factors.push(`Credit score ${creditReport.creditScore} below minimum ${criteria.minCreditScore}`);
    }
    if (creditReport.collections.length > criteria.maxCollections) {
      factors.push(`${creditReport.collections.length} collections exceed maximum ${criteria.maxCollections}`);
    }
    if (creditReport.paymentHistory.late > criteria.maxLatePayments) {
      factors.push(`${creditReport.paymentHistory.late} late payments exceed maximum ${criteria.maxLatePayments}`);
    }
  }

  if (applicant.incomeInfo.incomeToRentRatio < criteria.minIncomeToRentRatio) {
    factors.push(`Income to rent ratio ${applicant.incomeInfo.incomeToRentRatio.toFixed(1)}x below minimum ${criteria.minIncomeToRentRatio}x`);
  }

  if (criminalReport?.hasRecords && !criteria.allowFelonies) {
    const felonies = criminalReport.records.filter((r) => r.category === 'felony');
    if (felonies.length > 0) {
      factors.push('Felony conviction on record');
    }
  }

  if (evictionReport?.hasEvictions && !criteria.allowEvictions) {
    factors.push('Prior eviction on record');
  }

  return factors;
}

// Helper to convert DB record to RentalApplication
function dbToApplication(
  dbApp: Awaited<ReturnType<typeof prisma.tenantApplication.findUnique>> & { screeningReports?: unknown[] },
): RentalApplication | null {
  if (!dbApp) return null;
  const applicantsData = (dbApp.applicantsData || []) as Applicant[];

  return {
    id: dbApp.id,
    propertyId: dbApp.propertyId || dbApp.listingId, // fallback
    unitId: dbApp.unitId,
    listingId: dbApp.listingId,
    status: dbApp.status as ApplicationStatus,
    applicants: applicantsData,
    desiredMoveIn: dbApp.desiredMoveIn || dbApp.createdAt,
    desiredLeaseTerm: dbApp.desiredLeaseTerm || 12,
    monthlyRent: dbApp.requestedMonthlyRent || 0,
    applicationFee: dbApp.applicationFeeAmount || 50,
    applicationFeePaid: dbApp.applicationFeePaid,
    screeningConsent: dbApp.screeningConsent,
    screeningConsentDate: dbApp.screeningConsentDate,
    overallScore: dbApp.overallScore,
    riskLevel: dbApp.riskLevel as RiskLevel | null,
    decision: dbApp.decision as ApplicationDecision | null,
    notes: dbApp.applicationNotes || [],
    createdAt: dbApp.createdAt,
    updatedAt: dbApp.updatedAt,
    expiresAt: dbApp.expiresAt || new Date(dbApp.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
  };
}

// Helper to convert DB ScreeningCriteria to interface
function dbToCriteria(dbCriteria: Awaited<ReturnType<typeof prisma.screeningCriteria.findUnique>>): ScreeningCriteria | null {
  if (!dbCriteria) return null;
  return {
    id: dbCriteria.id,
    name: dbCriteria.name,
    propertyId: dbCriteria.propertyId,
    isDefault: dbCriteria.isDefault,
    minCreditScore: dbCriteria.minCreditScore || 650,
    maxDebtToIncomeRatio: dbCriteria.maxDebtToIncomeRatio || 43,
    minIncomeToRentRatio: dbCriteria.minIncomeToRentRatio || 3,
    maxLatePayments: dbCriteria.maxLatePayments,
    maxCollections: dbCriteria.maxCollections,
    allowBankruptcy: dbCriteria.allowBankruptcy,
    bankruptcyLookbackYears: dbCriteria.bankruptcyLookbackYears,
    allowEvictions: dbCriteria.allowEvictions,
    evictionLookbackYears: dbCriteria.evictionLookbackYears,
    allowFelonies: dbCriteria.allowFelonies,
    felonyLookbackYears: dbCriteria.felonyLookbackYears,
    allowMisdemeanors: dbCriteria.allowMisdemeanors,
    misdemeanorLookbackYears: dbCriteria.misdemeanorLookbackYears,
    requireEmploymentVerification: dbCriteria.requireEmploymentVerification,
    requireIncomeVerification: dbCriteria.requireIncomeVerification,
    requireRentalHistory: dbCriteria.requireRentalHistory,
    minRentalHistoryMonths: dbCriteria.minRentalHistoryMonths,
  };
}

// Initialize default criteria
async function initializeDefaultCriteria(): Promise<void> {
  const existing = await prisma.screeningCriteria.findFirst({
    where: { isDefault: true },
  });

  if (!existing) {
    await prisma.screeningCriteria.create({
      data: {
        name: 'Standard Screening Criteria',
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
      },
    });
  }
}

// Route handlers
export async function screeningRoutes(app: FastifyInstance): Promise<void> {
  // Initialize default criteria on startup
  await initializeDefaultCriteria();

  // Create rental application
  app.post('/applications', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createApplicationSchema.parse(request.body);
    const now = new Date();

    const applicants: Applicant[] = body.applicants.map((a) => ({
      id: generateId(),
      applicationId: '',
      type: a.type,
      firstName: a.firstName,
      lastName: a.lastName,
      email: a.email,
      phone: a.phone,
      dateOfBirth: new Date(a.dateOfBirth),
      ssn: a.ssn.replace(/-/g, ''),
      currentAddress: {
        ...a.currentAddress,
        unit: a.currentAddress.unit || null,
        residenceSince: new Date(a.currentAddress.residenceSince),
        monthlyRent: a.currentAddress.monthlyRent || null,
        landlordName: a.currentAddress.landlordName || null,
        landlordPhone: a.currentAddress.landlordPhone || null,
      },
      employmentInfo: {
        status: a.employmentStatus,
        employerName: a.employerName || null,
        employerPhone: null,
        jobTitle: a.jobTitle || null,
        startDate: null,
        annualSalary: a.annualIncome,
        supervisorName: null,
        supervisorPhone: null,
      },
      incomeInfo: {
        annualIncome: a.annualIncome,
        monthlyIncome: a.annualIncome / 12,
        incomeSources: [{
          type: a.employmentStatus === 'employed' ? 'employment' : 'other',
          description: a.employerName || 'Primary Income',
          monthlyAmount: a.annualIncome / 12,
          verified: false,
          documents: [],
        }],
        incomeToRentRatio: (a.annualIncome / 12) / body.monthlyRent,
        verified: false,
        verificationMethod: null,
        verificationDate: null,
      },
      rentalHistory: [],
      references: [],
      screeningReports: [],
      score: null,
      riskFactors: [],
    }));

    // Find or create a listing reference (required by the model)
    let listing = await prisma.listing.findFirst({
      where: { propertyId: body.propertyId },
    });

    if (!listing) {
      // Create a placeholder listing if none exists
      listing = await prisma.listing.create({
        data: {
          propertyId: body.propertyId,
          price: body.monthlyRent,
          status: 'active',
          type: 'rent',
          title: 'Rental Application',
          description: '',
        },
      });
    }

    // Get or create the applicant user
    const primaryApplicant = applicants.find((a) => a.type === 'primary') || applicants[0];
    let applicantUser = await prisma.user.findFirst({
      where: { email: primaryApplicant.email },
    });

    if (!applicantUser) {
      applicantUser = await prisma.user.create({
        data: {
          email: primaryApplicant.email,
          firstName: primaryApplicant.firstName,
          lastName: primaryApplicant.lastName,
          phone: primaryApplicant.phone,
          role: 'tenant',
        },
      });
    }

    const dbApp = await prisma.tenantApplication.create({
      data: {
        listingId: listing.id,
        applicantId: applicantUser.id,
        propertyId: body.propertyId,
        unitId: body.unitId,
        status: 'pending',
        desiredMoveIn: new Date(body.desiredMoveIn),
        desiredLeaseTerm: body.desiredLeaseTerm,
        requestedMonthlyRent: Math.round(body.monthlyRent),
        applicationFeeAmount: 50,
        applicationFeePaid: false,
        screeningConsent: body.screeningConsent,
        screeningConsentDate: body.screeningConsent ? now : null,
        applicantsData: applicants as unknown as Prisma.JsonValue,
        applicationNotes: [],
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Update applicants with application ID
    const updatedApplicants = applicants.map((a) => ({ ...a, applicationId: dbApp.id }));
    await prisma.tenantApplication.update({
      where: { id: dbApp.id },
      data: { applicantsData: updatedApplicants as unknown as Prisma.JsonValue },
    });

    const application = dbToApplication({ ...dbApp, applicantsData: updatedApplicants });

    return reply.status(201).send({
      success: true,
      data: application,
    });
  });

  // Get application by ID
  app.get('/applications/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const dbApp = await prisma.tenantApplication.findUnique({
      where: { id },
      include: { screeningReports: true },
    });

    if (!dbApp) {
      return reply.status(404).send({
        success: false,
        error: 'Application not found',
      });
    }

    const application = dbToApplication(dbApp);

    return reply.send({
      success: true,
      data: application,
    });
  });

  // List applications
  app.get('/applications', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      propertyId?: string;
      status?: ApplicationStatus;
      riskLevel?: RiskLevel;
    };

    const where: Prisma.TenantApplicationWhereInput = {};
    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.status) where.status = query.status;
    if (query.riskLevel) where.riskLevel = query.riskLevel as PrismaRiskLevel;

    const dbApps = await prisma.tenantApplication.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { screeningReports: true },
    });

    const results = dbApps.map((app) => dbToApplication(app)).filter(Boolean);

    return reply.send({
      success: true,
      data: results,
      total: results.length,
    });
  });

  // Run screening on application
  app.post('/applications/:id/screen', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { types?: ScreeningType[] };

    const dbApp = await prisma.tenantApplication.findUnique({
      where: { id },
      include: { screeningReports: true },
    });

    if (!dbApp) {
      return reply.status(404).send({
        success: false,
        error: 'Application not found',
      });
    }

    if (!dbApp.screeningConsent) {
      return reply.status(400).send({
        success: false,
        error: 'Screening consent not provided',
      });
    }

    const types = body.types || ['credit', 'criminal', 'eviction'];
    const now = new Date();
    const applicantsData = (dbApp.applicantsData || []) as Applicant[];

    // Update status to screening
    await prisma.tenantApplication.update({
      where: { id },
      data: { status: 'screening' },
    });

    // Create screening reports for each applicant
    for (const applicant of applicantsData) {
      for (const type of types) {
        let reportData: CreditReport | CriminalReport | EvictionReport | null = null;
        let score: number | null = null;

        switch (type) {
          case 'credit':
            reportData = generateMockCreditReport();
            score = reportData.creditScore;
            break;
          case 'criminal':
            reportData = generateMockCriminalReport();
            break;
          case 'eviction':
            reportData = generateMockEvictionReport();
            break;
        }

        // Create the report in the database
        await prisma.screeningReport.create({
          data: {
            applicationId: id,
            applicantName: `${applicant.firstName} ${applicant.lastName}`,
            applicantEmail: applicant.email,
            type: mapScreeningType(type),
            provider: 'mock' as PrismaScreeningProvider,
            status: 'completed' as PrismaReportStatus,
            requestedAt: now,
            completedAt: now,
            expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            score,
            data: reportData as unknown as Prisma.JsonValue,
            riskFactors: [],
            recommendations: [],
          },
        });

        // Add to applicant's local reports
        applicant.screeningReports.push({
          id: generateId(),
          applicantId: applicant.id,
          type,
          provider: 'mock',
          status: 'completed',
          requestedAt: now,
          completedAt: now,
          expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          score,
          data: reportData,
          riskFactors: [],
          recommendations: [],
        });
      }

      // Get default criteria and calculate scores
      const defaultCriteria = await prisma.screeningCriteria.findFirst({
        where: { isDefault: true },
      });
      const criteria = dbToCriteria(defaultCriteria) || {
        id: 'default',
        name: 'Default',
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

      applicant.score = calculateApplicantScore(applicant, criteria);
      applicant.riskFactors = generateRiskFactors(applicant, criteria);
    }

    // Calculate overall score
    const scores = applicantsData.map((a) => a.score || 0);
    const overallScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const riskLevel = determineRiskLevel(overallScore);

    // Update application with scores and new status
    const updatedApp = await prisma.tenantApplication.update({
      where: { id },
      data: {
        status: 'review',
        overallScore,
        riskLevel: riskLevel as PrismaRiskLevel,
        applicantsData: applicantsData as unknown as Prisma.JsonValue,
        updatedAt: now,
      },
      include: { screeningReports: true },
    });

    const application = dbToApplication(updatedApp);

    return reply.send({
      success: true,
      data: application,
    });
  });

  // Make decision on application
  app.post('/applications/:id/decide', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      decision: 'approved' | 'conditionally_approved' | 'denied';
      decidedBy: string;
      reason: string;
      conditions?: string[];
      requiredDeposit?: number;
    };

    const dbApp = await prisma.tenantApplication.findUnique({
      where: { id },
    });

    if (!dbApp) {
      return reply.status(404).send({
        success: false,
        error: 'Application not found',
      });
    }

    if (dbApp.status !== 'review') {
      return reply.status(400).send({
        success: false,
        error: 'Application must be in review status',
      });
    }

    const now = new Date();
    const decision: ApplicationDecision = {
      decision: body.decision,
      decidedAt: now,
      decidedBy: body.decidedBy,
      reason: body.reason,
      conditions: body.conditions || [],
      requiredDeposit: body.requiredDeposit || null,
      approvedRent: body.decision !== 'denied' ? (dbApp.requestedMonthlyRent || 0) : null,
      approvedLeaseTerm: body.decision !== 'denied' ? (dbApp.desiredLeaseTerm || 12) : null,
      validUntil: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    };

    const updatedApp = await prisma.tenantApplication.update({
      where: { id },
      data: {
        status: body.decision === 'denied' ? 'denied' : body.decision,
        decision: decision as unknown as Prisma.JsonValue,
        reviewedBy: body.decidedBy,
        reviewedAt: now,
        updatedAt: now,
      },
    });

    const application = dbToApplication(updatedApp);

    return reply.send({
      success: true,
      data: application,
    });
  });

  // Get screening report
  app.get('/applications/:appId/applicants/:applicantId/reports/:reportId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { appId, applicantId, reportId } = request.params as {
      appId: string;
      applicantId: string;
      reportId: string;
    };

    const dbApp = await prisma.tenantApplication.findUnique({
      where: { id: appId },
    });

    if (!dbApp) {
      return reply.status(404).send({
        success: false,
        error: 'Application not found',
      });
    }

    const applicantsData = (dbApp.applicantsData || []) as Applicant[];
    const applicant = applicantsData.find((a) => a.id === applicantId);
    if (!applicant) {
      return reply.status(404).send({
        success: false,
        error: 'Applicant not found',
      });
    }

    const report = applicant.screeningReports.find((r) => r.id === reportId);
    if (!report) {
      return reply.status(404).send({
        success: false,
        error: 'Report not found',
      });
    }

    return reply.send({
      success: true,
      data: report,
    });
  });

  // Screening criteria routes
  app.get('/criteria', async (_request: FastifyRequest, reply: FastifyReply) => {
    const dbCriteria = await prisma.screeningCriteria.findMany({
      orderBy: { isDefault: 'desc' },
    });

    const results = dbCriteria.map((c) => dbToCriteria(c)).filter(Boolean);

    return reply.send({
      success: true,
      data: results,
    });
  });

  app.post('/criteria', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = criteriaSchema.parse(request.body);

    // If setting as default, unset other defaults
    if (body.isDefault) {
      await prisma.screeningCriteria.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const dbCriteria = await prisma.screeningCriteria.create({
      data: {
        name: body.name,
        propertyId: body.propertyId,
        isDefault: body.isDefault,
        minCreditScore: body.minCreditScore,
        maxDebtToIncomeRatio: body.maxDebtToIncomeRatio,
        minIncomeToRentRatio: body.minIncomeToRentRatio,
        maxLatePayments: body.maxLatePayments,
        maxCollections: body.maxCollections,
        allowBankruptcy: body.allowBankruptcy,
        bankruptcyLookbackYears: body.bankruptcyLookbackYears,
        allowEvictions: body.allowEvictions,
        evictionLookbackYears: body.evictionLookbackYears,
        allowFelonies: body.allowFelonies,
        felonyLookbackYears: body.felonyLookbackYears,
        allowMisdemeanors: body.allowMisdemeanors,
        misdemeanorLookbackYears: body.misdemeanorLookbackYears,
        requireEmploymentVerification: body.requireEmploymentVerification,
        requireIncomeVerification: body.requireIncomeVerification,
        requireRentalHistory: body.requireRentalHistory,
        minRentalHistoryMonths: body.minRentalHistoryMonths,
      },
    });

    const criteria = dbToCriteria(dbCriteria);

    return reply.status(201).send({
      success: true,
      data: criteria,
    });
  });

  app.get('/criteria/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const dbCriteria = await prisma.screeningCriteria.findUnique({
      where: { id },
    });

    if (!dbCriteria) {
      return reply.status(404).send({
        success: false,
        error: 'Criteria not found',
      });
    }

    const criteria = dbToCriteria(dbCriteria);

    return reply.send({
      success: true,
      data: criteria,
    });
  });

  // Verify income
  app.post('/applications/:id/verify-income', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      applicantId: string;
      verifiedIncome: number;
      documents: string[];
      notes?: string;
    };

    const dbApp = await prisma.tenantApplication.findUnique({
      where: { id },
    });

    if (!dbApp) {
      return reply.status(404).send({
        success: false,
        error: 'Application not found',
      });
    }

    const applicantsData = (dbApp.applicantsData || []) as Applicant[];
    const applicant = applicantsData.find((a) => a.id === body.applicantId);
    if (!applicant) {
      return reply.status(404).send({
        success: false,
        error: 'Applicant not found',
      });
    }

    const now = new Date();
    applicant.incomeInfo.verified = true;
    applicant.incomeInfo.verificationMethod = 'document_review';
    applicant.incomeInfo.verificationDate = now;

    const incomeReportData: IncomeReport = {
      verified: true,
      reportedIncome: applicant.incomeInfo.annualIncome,
      verifiedIncome: body.verifiedIncome,
      discrepancy: Math.abs(applicant.incomeInfo.annualIncome - body.verifiedIncome),
      documents: body.documents,
      notes: body.notes || '',
    };

    const incomeReport: ScreeningReport = {
      id: generateId(),
      applicantId: applicant.id,
      type: 'income',
      provider: 'mock',
      status: 'completed',
      requestedAt: now,
      completedAt: now,
      expiresAt: null,
      score: null,
      data: incomeReportData,
      riskFactors: [],
      recommendations: [],
    };

    applicant.screeningReports.push(incomeReport);

    // Save to database
    await prisma.screeningReport.create({
      data: {
        applicationId: id,
        applicantName: `${applicant.firstName} ${applicant.lastName}`,
        applicantEmail: applicant.email,
        type: 'income' as PrismaScreeningType,
        provider: 'mock' as PrismaScreeningProvider,
        status: 'completed' as PrismaReportStatus,
        requestedAt: now,
        completedAt: now,
        data: incomeReportData as unknown as Prisma.JsonValue,
        riskFactors: [],
        recommendations: [],
      },
    });

    await prisma.tenantApplication.update({
      where: { id },
      data: {
        applicantsData: applicantsData as unknown as Prisma.JsonValue,
        updatedAt: now,
      },
    });

    return reply.send({
      success: true,
      data: incomeReport,
    });
  });

  // Verify employment
  app.post('/applications/:id/verify-employment', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      applicantId: string;
      employer: string;
      jobTitle: string;
      startDate: string;
      salary?: number;
      verifiedBy: string;
      notes?: string;
    };

    const dbApp = await prisma.tenantApplication.findUnique({
      where: { id },
    });

    if (!dbApp) {
      return reply.status(404).send({
        success: false,
        error: 'Application not found',
      });
    }

    const applicantsData = (dbApp.applicantsData || []) as Applicant[];
    const applicant = applicantsData.find((a) => a.id === body.applicantId);
    if (!applicant) {
      return reply.status(404).send({
        success: false,
        error: 'Applicant not found',
      });
    }

    const now = new Date();

    const employmentReportData: EmploymentReport = {
      verified: true,
      employer: body.employer,
      jobTitle: body.jobTitle,
      startDate: new Date(body.startDate),
      salary: body.salary || null,
      verifiedBy: body.verifiedBy,
      verifiedDate: now,
      notes: body.notes || '',
    };

    const employmentReport: ScreeningReport = {
      id: generateId(),
      applicantId: applicant.id,
      type: 'employment',
      provider: 'mock',
      status: 'completed',
      requestedAt: now,
      completedAt: now,
      expiresAt: null,
      score: null,
      data: employmentReportData,
      riskFactors: [],
      recommendations: [],
    };

    applicant.screeningReports.push(employmentReport);

    // Save to database
    await prisma.screeningReport.create({
      data: {
        applicationId: id,
        applicantName: `${applicant.firstName} ${applicant.lastName}`,
        applicantEmail: applicant.email,
        type: 'employment' as PrismaScreeningType,
        provider: 'mock' as PrismaScreeningProvider,
        status: 'completed' as PrismaReportStatus,
        requestedAt: now,
        completedAt: now,
        data: employmentReportData as unknown as Prisma.JsonValue,
        riskFactors: [],
        recommendations: [],
      },
    });

    await prisma.tenantApplication.update({
      where: { id },
      data: {
        applicantsData: applicantsData as unknown as Prisma.JsonValue,
        updatedAt: now,
      },
    });

    return reply.send({
      success: true,
      data: employmentReport,
    });
  });
}

// Export for testing
export {
  calculateApplicantScore,
  determineRiskLevel,
  generateRiskFactors,
  generateMockCreditReport,
  generateMockCriminalReport,
  generateMockEvictionReport,
};
