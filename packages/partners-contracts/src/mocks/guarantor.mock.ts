import type {
  GuarantorApplication,
  GuarantorProvider,
  PollStatusRequest,
  RequiredDocument,
  SubmitApplicationRequest,
} from '../contracts/guarantor';
import type { ProviderError } from '../types/errors';
import { createProviderError } from '../types/errors';
import type { Result } from '../types/result';
import { failure, success } from '../types/result';

import { BaseMockProvider, createSeed, SeededRandom } from './base';

/**
 * Mock implementation of GuarantorProvider
 */
export class MockGuarantorProvider
  extends BaseMockProvider
  implements GuarantorProvider
{
  private applications: Map<string, GuarantorApplication> = new Map();

  constructor(options?: { simulateLatency?: boolean }) {
    super('mock_guarantor', 'Mock Guarantor Provider', options);
  }

  async submitApplication(
    request: SubmitApplicationRequest
  ): Promise<Result<GuarantorApplication, ProviderError>> {
    const startTime = Date.now();
    const seed = createSeed(request);
    const rng = new SeededRandom(seed);

    await this.maybeDelay();

    const applicationId = rng.nextId('app');
    const now = new Date();

    // Determine approval based on income ratio (deterministic based on input)
    const monthlyIncome = request.applicant.annualIncome / 12;
    const rentToIncomeRatio = request.rental.monthlyRent / monthlyIncome;
    const wouldApprove = rentToIncomeRatio <= 0.4 && !request.bankruptcyHistory && (request.previousEvictions ?? 0) === 0;

    const application: GuarantorApplication = {
      applicationId,
      status: 'SUBMITTED',
      applicant: {
        firstName: request.applicant.firstName,
        lastName: request.applicant.lastName,
        email: request.applicant.email,
        phone: request.applicant.phone,
      },
      rental: {
        propertyAddress: request.rental.propertyAddress,
        monthlyRent: { amount: request.rental.monthlyRent, currency: 'USD' },
        leaseTermMonths: request.rental.leaseTermMonths,
      },
      requiredDocuments: [
        {
          type: 'PAYSTUB',
          description: 'Last 2 pay stubs',
          required: true,
          uploaded: false,
        },
        {
          type: 'ID',
          description: 'Government-issued photo ID',
          required: true,
          uploaded: false,
        },
      ],
      requiredActions: [
        {
          type: 'UPLOAD_DOCUMENT',
          description: 'Upload required documents',
          completed: false,
        },
        {
          type: 'VERIFY_INCOME',
          description: 'Complete income verification',
          completed: false,
          url: 'https://mock.example.com/verify-income',
        },
      ],
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    };

    // If would approve, add pricing preview
    if (wouldApprove) {
      const coverageAmount = request.rental.monthlyRent * request.rental.leaseTermMonths;
      const feePercentage = rng.nextFloat(0.05, 0.08);

      application.pricing = {
        coverageAmount: { amount: coverageAmount, currency: 'USD' },
        oneTimeFee: { amount: Math.round(coverageAmount * feePercentage), currency: 'USD' },
        feeType: 'ONE_TIME',
      };
    }

    this.applications.set(applicationId, application);

    return success(application, this.createMetadata(seed, startTime));
  }

  async pollStatus(
    request: PollStatusRequest
  ): Promise<Result<GuarantorApplication, ProviderError>> {
    const startTime = Date.now();
    const seed = createSeed(request);
    const rng = new SeededRandom(seed);

    await this.maybeDelay();

    const application = this.applications.get(request.applicationId);

    if (!application) {
      return failure(
        createProviderError('RESOURCE_NOT_FOUND', `Application ${request.applicationId} not found`),
        this.createMetadata(seed, startTime)
      );
    }

    // Simulate status progression based on time since creation
    const hoursSinceCreation =
      (Date.now() - application.createdAt.getTime()) / (1000 * 60 * 60);

    let updatedApplication = { ...application };

    if (application.status === 'SUBMITTED' && hoursSinceCreation > 0.01) {
      // Quick progression for mock - would be hours in real world
      updatedApplication = {
        ...updatedApplication,
        status: 'PENDING_REVIEW',
        updatedAt: new Date(),
      };
    }

    if (updatedApplication.status === 'PENDING_REVIEW' && hoursSinceCreation > 0.02) {
      // Make decision
      const hasGoodPricing = !!application.pricing;

      if (hasGoodPricing) {
        updatedApplication = {
          ...updatedApplication,
          status: 'APPROVED',
          decision: {
            status: 'APPROVED',
            decisionDate: new Date(),
          },
          coverage: {
            maxCoverage: application.pricing!.coverageAmount,
            coverageMonths: application.rental.leaseTermMonths,
            includedCoverages: ['UNPAID_RENT', 'LEASE_BREAK', 'LEGAL_FEES'],
          },
          updatedAt: new Date(),
        };
      } else {
        updatedApplication = {
          ...updatedApplication,
          status: 'DECLINED',
          decision: {
            status: 'DECLINED',
            decisionDate: new Date(),
            declineReasons: [rng.pick(['RENT_TO_INCOME_RATIO', 'CREDIT_HISTORY', 'INSUFFICIENT_INCOME'])],
          },
          updatedAt: new Date(),
        };
      }
    }

    this.applications.set(request.applicationId, updatedApplication);

    return success(updatedApplication, this.createMetadata(seed, startTime));
  }

  async getApplication(
    applicationId: string
  ): Promise<Result<GuarantorApplication, ProviderError>> {
    const startTime = Date.now();
    const seed = createSeed({ applicationId });

    await this.maybeDelay();

    const application = this.applications.get(applicationId);

    if (!application) {
      return failure(
        createProviderError('RESOURCE_NOT_FOUND', `Application ${applicationId} not found`),
        this.createMetadata(seed, startTime)
      );
    }

    return success(application, this.createMetadata(seed, startTime));
  }

  async uploadDocument(
    applicationId: string,
    documentType: RequiredDocument['type'],
    _file: { name: string; content: Buffer; mimeType: string }
  ): Promise<Result<RequiredDocument, ProviderError>> {
    const startTime = Date.now();
    const seed = createSeed({ applicationId, documentType });
    const rng = new SeededRandom(seed);

    await this.maybeDelay();

    const application = this.applications.get(applicationId);

    if (!application) {
      return failure(
        createProviderError('RESOURCE_NOT_FOUND', `Application ${applicationId} not found`),
        this.createMetadata(seed, startTime)
      );
    }

    const document: RequiredDocument = {
      type: documentType,
      description: `Uploaded ${documentType}`,
      required: true,
      uploaded: true,
      documentId: rng.nextId('doc'),
    };

    // Update application with uploaded document
    if (application.requiredDocuments) {
      const docIndex = application.requiredDocuments.findIndex(
        (d) => d.type === documentType
      );
      if (docIndex >= 0) {
        application.requiredDocuments[docIndex] = document;
      }
    }

    application.updatedAt = new Date();
    this.applications.set(applicationId, application);

    return success(document, this.createMetadata(seed, startTime));
  }

  async acceptTerms(
    applicationId: string,
    _paymentMethodToken?: string
  ): Promise<Result<GuarantorApplication, ProviderError>> {
    const startTime = Date.now();
    const seed = createSeed({ applicationId });

    await this.maybeDelay();

    const application = this.applications.get(applicationId);

    if (!application) {
      return failure(
        createProviderError('RESOURCE_NOT_FOUND', `Application ${applicationId} not found`),
        this.createMetadata(seed, startTime)
      );
    }

    if (application.status !== 'APPROVED' && application.status !== 'CONDITIONALLY_APPROVED') {
      return failure(
        createProviderError(
          'BUSINESS_RULE_VIOLATION',
          'Can only accept terms for approved applications'
        ),
        this.createMetadata(seed, startTime)
      );
    }

    // Mark actions as completed
    const updatedApplication: GuarantorApplication = {
      ...application,
      requiredActions: application.requiredActions?.map((action) =>
        action.type === 'SIGN_AGREEMENT' || action.type === 'PAY_FEE'
          ? { ...action, completed: true, completedAt: new Date() }
          : action
      ),
      updatedAt: new Date(),
    };

    this.applications.set(applicationId, updatedApplication);

    return success(updatedApplication, this.createMetadata(seed, startTime));
  }

  async cancelApplication(
    applicationId: string,
    reason?: string
  ): Promise<Result<GuarantorApplication, ProviderError>> {
    const startTime = Date.now();
    const seed = createSeed({ applicationId, reason });

    await this.maybeDelay();

    const application = this.applications.get(applicationId);

    if (!application) {
      return failure(
        createProviderError('RESOURCE_NOT_FOUND', `Application ${applicationId} not found`),
        this.createMetadata(seed, startTime)
      );
    }

    const updatedApplication: GuarantorApplication = {
      ...application,
      status: 'CANCELLED',
      updatedAt: new Date(),
    };

    this.applications.set(applicationId, updatedApplication);

    return success(updatedApplication, this.createMetadata(seed, startTime));
  }
}
