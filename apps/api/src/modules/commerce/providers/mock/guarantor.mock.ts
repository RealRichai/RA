/**
 * Mock Guarantor Provider
 *
 * Provides realistic mock guarantor options and application processing.
 */

import { generatePrefixedId } from '@realriches/utils';

import type {
  GuarantorApplication,
  GuarantorApplicationRequest,
  GuarantorOption,
  IGuarantorProvider,
  ProviderMeta,
  Result,
} from '../provider.types';
import { ok, err } from '../provider.types';

// Mock guarantor providers
const GUARANTOR_PROVIDERS = [
  {
    id: 'the-guarantors-basic',
    provider: 'The Guarantors',
    providerId: 'the-guarantors',
    name: 'Basic Coverage',
    coverageMultiple: 1,
    feePercentage: 5,
    description: 'Standard guarantor coverage for 1x monthly rent',
    requirements: ['Proof of income', 'Photo ID', 'Lease agreement'],
    minIncome: 0, // No minimum
    maxRentMultiple: 50, // Max 50x rent
  },
  {
    id: 'the-guarantors-premium',
    provider: 'The Guarantors',
    providerId: 'the-guarantors',
    name: 'Premium Coverage',
    coverageMultiple: 2,
    feePercentage: 8,
    description: 'Enhanced coverage for 2x monthly rent',
    requirements: ['Proof of income', 'Photo ID', 'Lease agreement', 'Bank statements'],
    minIncome: 0,
    maxRentMultiple: 40,
  },
  {
    id: 'insurent-standard',
    provider: 'Insurent',
    providerId: 'insurent',
    name: 'Institutional Guarantee',
    coverageMultiple: 2,
    feePercentage: 6.5,
    description: 'Institutional guarantor service accepted by 90% of NYC landlords',
    requirements: ['Proof of income', 'Photo ID', 'Lease agreement'],
    minIncome: 27500, // $27.5k minimum
    maxRentMultiple: 50,
  },
  {
    id: 'rhino-deposit',
    provider: 'Rhino',
    providerId: 'rhino',
    name: 'Deposit Alternative',
    coverageMultiple: 1,
    feePercentage: 4,
    oneTimeFee: 0,
    description: 'Pay a small monthly fee instead of a large security deposit',
    requirements: ['Photo ID', 'Lease agreement'],
    minIncome: 0,
    maxRentMultiple: 100,
  },
];

// In-memory application store
const applicationStore = new Map<string, GuarantorApplication>();

export class MockGuarantorProvider implements IGuarantorProvider {
  readonly providerId = 'mock-guarantor';

  private getMeta(requestId?: string): ProviderMeta {
    return {
      provider: this.providerId,
      isMock: true,
      requestId: requestId || generatePrefixedId('req'),
      timestamp: new Date(),
    };
  }

  async getOptions(monthlyRent: number): Promise<Result<GuarantorOption[]>> {
    const options: GuarantorOption[] = GUARANTOR_PROVIDERS.map((provider) => ({
      id: provider.id,
      provider: provider.provider,
      providerId: provider.providerId,
      name: provider.name,
      coverageMultiple: provider.coverageMultiple,
      feePercentage: provider.feePercentage,
      oneTimeFee: provider.oneTimeFee,
      description: provider.description,
      requirements: provider.requirements,
    }));

    // Sort by fee percentage
    options.sort((a, b) => a.feePercentage - b.feePercentage);

    return ok(options, this.getMeta());
  }

  async submitApplication(request: GuarantorApplicationRequest): Promise<Result<GuarantorApplication>> {
    const option = GUARANTOR_PROVIDERS.find((p) => p.id === request.optionId);

    if (!option) {
      return err(new Error('Invalid guarantor option'), this.getMeta());
    }

    // Validate income requirements
    const incomeToRentRatio = request.annualIncome / (request.monthlyRent * 12);

    // Simulate approval logic
    let status: GuarantorApplication['status'] = 'PENDING';
    let declineReason: string | undefined;
    let requiredDocuments: string[] | undefined;

    if (request.annualIncome < option.minIncome) {
      status = 'DECLINED';
      declineReason = `Minimum annual income of $${option.minIncome.toLocaleString()} required`;
    } else if (incomeToRentRatio < 2.0) {
      // Income less than 2x rent - need more docs
      status = 'DOCUMENTS_REQUIRED';
      requiredDocuments = ['Additional proof of income', 'Bank statements (3 months)', 'Employment verification'];
    } else if (incomeToRentRatio > option.maxRentMultiple) {
      status = 'DECLINED';
      declineReason = 'Income exceeds maximum rent multiple for this product';
    }

    const coverageAmount = request.monthlyRent * option.coverageMultiple;
    const feeAmount = Math.round(request.monthlyRent * 12 * (option.feePercentage / 100));

    const application: GuarantorApplication = {
      id: generatePrefixedId('gua'),
      provider: option.provider,
      providerId: option.providerId,
      status,
      applicationId: request.applicationId,
      providerApplicationId: `${option.providerId.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
      coverageAmount,
      feeAmount,
      declineReason,
      requiredDocuments,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    applicationStore.set(application.id, application);

    // Simulate async approval for pending applications
    if (status === 'PENDING') {
      setTimeout(() => {
        const stored = applicationStore.get(application.id);
        if (stored && stored.status === 'PENDING') {
          // 90% approval rate for mock
          const approved = Math.random() > 0.1;
          stored.status = approved ? 'APPROVED' : 'DECLINED';
          stored.decisionDate = new Date();
          stored.updatedAt = new Date();

          if (approved) {
            stored.contractUrl = `https://mock-guarantor.example.com/contracts/${generatePrefixedId('contract')}.pdf`;
          } else {
            stored.declineReason = 'Unable to verify employment information';
          }

          applicationStore.set(application.id, stored);
        }
      }, 5000); // 5 second delay
    }

    return ok(application, this.getMeta());
  }

  async pollStatus(applicationId: string): Promise<Result<GuarantorApplication | null>> {
    // Find by our ID or provider application ID
    let application: GuarantorApplication | null = null;

    for (const app of applicationStore.values()) {
      if (app.id === applicationId || app.providerApplicationId === applicationId) {
        application = app;
        break;
      }
    }

    return ok(application, this.getMeta());
  }

  async cancelApplication(applicationId: string): Promise<Result<boolean>> {
    const application = applicationStore.get(applicationId);

    if (!application) {
      return err(new Error('Application not found'), this.getMeta());
    }

    if (application.status === 'APPROVED') {
      return err(new Error('Cannot cancel approved application'), this.getMeta());
    }

    applicationStore.delete(applicationId);

    return ok(true, this.getMeta());
  }
}

// Singleton instance
let instance: MockGuarantorProvider | null = null;

export function getMockGuarantorProvider(): MockGuarantorProvider {
  if (!instance) {
    instance = new MockGuarantorProvider();
  }
  return instance;
}
