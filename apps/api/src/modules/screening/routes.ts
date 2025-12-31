import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

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

// In-memory stores
const applications = new Map<string, RentalApplication>();
const screeningCriteria = new Map<string, ScreeningCriteria>();

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
      const months = r.moveOutDate
        ? (r.moveOutDate.getTime() - r.moveInDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
        : (Date.now() - r.moveInDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
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

// Initialize default criteria
function initializeDefaultCriteria(): void {
  const defaultCriteria: ScreeningCriteria = {
    id: 'default',
    name: 'Standard Screening Criteria',
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

  screeningCriteria.set(defaultCriteria.id, defaultCriteria);
}

initializeDefaultCriteria();

// Route handlers
export async function screeningRoutes(app: FastifyInstance): Promise<void> {
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

    const application: RentalApplication = {
      id: generateId(),
      propertyId: body.propertyId,
      unitId: body.unitId || null,
      listingId: body.listingId || null,
      status: 'pending',
      applicants,
      desiredMoveIn: new Date(body.desiredMoveIn),
      desiredLeaseTerm: body.desiredLeaseTerm,
      monthlyRent: body.monthlyRent,
      applicationFee: 50,
      applicationFeePaid: false,
      screeningConsent: body.screeningConsent,
      screeningConsentDate: body.screeningConsent ? now : null,
      overallScore: null,
      riskLevel: null,
      decision: null,
      notes: [],
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    };

    // Set application ID on applicants
    application.applicants.forEach((a) => {
      a.applicationId = application.id;
    });

    applications.set(application.id, application);

    return reply.status(201).send({
      success: true,
      data: application,
    });
  });

  // Get application by ID
  app.get('/applications/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const application = applications.get(id);

    if (!application) {
      return reply.status(404).send({
        success: false,
        error: 'Application not found',
      });
    }

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

    let results = Array.from(applications.values());

    if (query.propertyId) {
      results = results.filter((a) => a.propertyId === query.propertyId);
    }
    if (query.status) {
      results = results.filter((a) => a.status === query.status);
    }
    if (query.riskLevel) {
      results = results.filter((a) => a.riskLevel === query.riskLevel);
    }

    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

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
    const application = applications.get(id);

    if (!application) {
      return reply.status(404).send({
        success: false,
        error: 'Application not found',
      });
    }

    if (!application.screeningConsent) {
      return reply.status(400).send({
        success: false,
        error: 'Screening consent not provided',
      });
    }

    const types = body.types || ['credit', 'criminal', 'eviction'];
    const now = new Date();

    application.status = 'screening';

    for (const applicant of application.applicants) {
      for (const type of types) {
        const report: ScreeningReport = {
          id: generateId(),
          applicantId: applicant.id,
          type,
          provider: 'mock',
          status: 'completed',
          requestedAt: now,
          completedAt: now,
          expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          score: null,
          data: null,
          riskFactors: [],
          recommendations: [],
        };

        switch (type) {
          case 'credit':
            report.data = generateMockCreditReport();
            report.score = (report.data as CreditReport).creditScore;
            break;
          case 'criminal':
            report.data = generateMockCriminalReport();
            break;
          case 'eviction':
            report.data = generateMockEvictionReport();
            break;
        }

        applicant.screeningReports.push(report);
      }

      // Calculate applicant score
      const criteria = screeningCriteria.get('default')!;
      applicant.score = calculateApplicantScore(applicant, criteria);
      applicant.riskFactors = generateRiskFactors(applicant, criteria);
    }

    // Calculate overall score
    const scores = application.applicants.map((a) => a.score || 0);
    application.overallScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    application.riskLevel = determineRiskLevel(application.overallScore);
    application.status = 'review';
    application.updatedAt = now;

    applications.set(id, application);

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
    const application = applications.get(id);

    if (!application) {
      return reply.status(404).send({
        success: false,
        error: 'Application not found',
      });
    }

    if (application.status !== 'review') {
      return reply.status(400).send({
        success: false,
        error: 'Application must be in review status',
      });
    }

    const now = new Date();

    application.decision = {
      decision: body.decision,
      decidedAt: now,
      decidedBy: body.decidedBy,
      reason: body.reason,
      conditions: body.conditions || [],
      requiredDeposit: body.requiredDeposit || null,
      approvedRent: body.decision !== 'denied' ? application.monthlyRent : null,
      approvedLeaseTerm: body.decision !== 'denied' ? application.desiredLeaseTerm : null,
      validUntil: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    };

    application.status = body.decision === 'denied' ? 'denied' : body.decision;
    application.updatedAt = now;

    applications.set(id, application);

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

    const application = applications.get(appId);
    if (!application) {
      return reply.status(404).send({
        success: false,
        error: 'Application not found',
      });
    }

    const applicant = application.applicants.find((a) => a.id === applicantId);
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
    const results = Array.from(screeningCriteria.values());

    return reply.send({
      success: true,
      data: results,
    });
  });

  app.post('/criteria', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = criteriaSchema.parse(request.body);

    const criteria: ScreeningCriteria = {
      id: generateId(),
      ...body,
      propertyId: body.propertyId || null,
    };

    // If setting as default, unset other defaults
    if (body.isDefault) {
      for (const [id, c] of screeningCriteria) {
        if (c.isDefault) {
          c.isDefault = false;
          screeningCriteria.set(id, c);
        }
      }
    }

    screeningCriteria.set(criteria.id, criteria);

    return reply.status(201).send({
      success: true,
      data: criteria,
    });
  });

  app.get('/criteria/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const criteria = screeningCriteria.get(id);

    if (!criteria) {
      return reply.status(404).send({
        success: false,
        error: 'Criteria not found',
      });
    }

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
    const application = applications.get(id);

    if (!application) {
      return reply.status(404).send({
        success: false,
        error: 'Application not found',
      });
    }

    const applicant = application.applicants.find((a) => a.id === body.applicantId);
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
      data: {
        verified: true,
        reportedIncome: applicant.incomeInfo.annualIncome,
        verifiedIncome: body.verifiedIncome,
        discrepancy: Math.abs(applicant.incomeInfo.annualIncome - body.verifiedIncome),
        documents: body.documents,
        notes: body.notes || '',
      } as IncomeReport,
      riskFactors: [],
      recommendations: [],
    };

    applicant.screeningReports.push(incomeReport);
    application.updatedAt = now;
    applications.set(id, application);

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
    const application = applications.get(id);

    if (!application) {
      return reply.status(404).send({
        success: false,
        error: 'Application not found',
      });
    }

    const applicant = application.applicants.find((a) => a.id === body.applicantId);
    if (!applicant) {
      return reply.status(404).send({
        success: false,
        error: 'Applicant not found',
      });
    }

    const now = new Date();

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
      data: {
        verified: true,
        employer: body.employer,
        jobTitle: body.jobTitle,
        startDate: new Date(body.startDate),
        salary: body.salary || null,
        verifiedBy: body.verifiedBy,
        verifiedDate: now,
        notes: body.notes || '',
      } as EmploymentReport,
      riskFactors: [],
      recommendations: [],
    };

    applicant.screeningReports.push(employmentReport);
    application.updatedAt = now;
    applications.set(id, application);

    return reply.send({
      success: true,
      data: employmentReport,
    });
  });
}

// Export for testing
export {
  applications,
  screeningCriteria,
  calculateApplicantScore,
  determineRiskLevel,
  generateRiskFactors,
  generateMockCreditReport,
  generateMockCriminalReport,
  generateMockEvictionReport,
};
