/**
 * Insurent Provider Adapter
 *
 * Lease guarantor service integration.
 * Insurent is one of the largest institutional guarantors,
 * primarily serving NYC and major metropolitan markets.
 */

import { randomUUID } from 'crypto';

import type {
  BindRequest,
  CancelRequest,
  CancelResponse,
  PartnerProductType,
  PolicyArtifact,
  QuoteRequest,
  QuoteResponse,
  RenewRequest,
} from '../../types';
import {
  BasePartnerProvider,
  ProviderError,
  QuoteDeclinedError,
  type ProviderConfig,
} from '../provider-interface';

// =============================================================================
// Insurent-Specific Types
// =============================================================================

interface InsurentApplicant {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  date_of_birth?: string;
  ssn_last_four?: string;
  employment: {
    status: 'employed' | 'self_employed' | 'student' | 'retired' | 'other';
    employer_name?: string;
    annual_income?: number;
    start_date?: string;
  };
  credit_info?: {
    score?: number;
    has_bankruptcy?: boolean;
    has_eviction?: boolean;
  };
}

interface InsurentQuoteResponse {
  quote_id: string;
  status: 'approved' | 'conditionally_approved' | 'declined' | 'pending_documents';
  guarantor_fee: {
    amount: number;
    payment_type: 'one_time' | 'monthly';
    annual_equivalent: number;
  };
  coverage: {
    lease_months: number;
    max_coverage: number;
    coverage_multiplier: number; // e.g., 1.0 = 100% of rent
  };
  partner_commission: {
    rate: number;
    amount: number;
  };
  expires_at: string;
  conditions?: string[];
  decline_reason?: string;
  decline_code?: string;
}

interface InsurentContractResponse {
  contract_id: string;
  contract_number: string;
  status: 'active' | 'pending' | 'cancelled' | 'expired' | 'defaulted';
  effective_date: string;
  expiration_date: string;
  coverage: {
    monthly_rent: number;
    lease_months: number;
    max_liability: number;
  };
  fee: {
    amount: number;
    paid_at?: string;
  };
  documents: {
    guaranty_agreement_url?: string;
    certificate_url?: string;
  };
  landlord_info: {
    name: string;
    contact_email?: string;
  };
}

// =============================================================================
// Insurent Provider
// =============================================================================

export class InsurentProvider extends BasePartnerProvider {
  readonly providerId = 'insurent' as const;
  readonly supportedProducts: PartnerProductType[] = ['guarantor'];

  private defaultCommissionRate = 0.10; // 10% commission

  constructor(config: ProviderConfig) {
    super(config);
  }

  /**
   * Get a quote for lease guarantor coverage.
   * Insurent typically charges 70-110% of one month's rent as a one-time fee.
   */
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    this.log('Getting guarantor quote', { applicantId: request.applicantId });

    if (!await this.isAvailable()) {
      return this.getMockQuote(request);
    }

    try {
      const applicant: InsurentApplicant = {
        first_name: request.applicantInfo.firstName,
        last_name: request.applicantInfo.lastName,
        email: request.applicantInfo.email,
        phone: request.applicantInfo.phone,
        date_of_birth: request.applicantInfo.dateOfBirth?.toISOString().split('T')[0],
        employment: {
          status: 'employed',
          annual_income: request.applicantInfo.annualIncome,
        },
        credit_info: request.applicantInfo.creditScore ? {
          score: request.applicantInfo.creditScore,
        } : undefined,
      };

      const response = await this.makeRequest<InsurentQuoteResponse>(
        'POST',
        '/api/v2/quotes',
        {
          applicant,
          property: {
            address: request.propertyInfo.address,
            city: request.propertyInfo.city,
            state: request.propertyInfo.state,
            zip: request.propertyInfo.zip,
            monthly_rent: request.propertyInfo.monthlyRent,
          },
          lease: {
            start_date: request.startDate?.toISOString().split('T')[0],
            term_months: request.term || 12,
          },
        }
      );

      return this.mapQuoteResponse(response, request);
    } catch (error) {
      this.log('Quote error', error);
      throw new ProviderError(
        this.providerId,
        'QUOTE_ERROR',
        'Failed to get Insurent quote',
        error as Error
      );
    }
  }

  /**
   * Bind a quote to create a guarantor contract.
   */
  async bind(request: BindRequest): Promise<PolicyArtifact> {
    this.log('Binding guarantor quote', { quoteId: request.quoteId });

    if (!await this.isAvailable()) {
      return this.getMockPolicy(request);
    }

    try {
      const response = await this.makeRequest<InsurentContractResponse>(
        'POST',
        `/api/v2/quotes/${request.providerQuoteId}/bind`,
        {
          payment: {
            method_id: request.paymentMethodId,
            process_now: request.payNow,
          },
          consent: {
            terms_accepted: request.termsAccepted,
            accepted_at: request.termsAcceptedAt.toISOString(),
            electronic_signature: true,
          },
          landlord: request.additionalInfo?.landlordInfo || {
            name: 'Property Management',
          },
          idempotency_key: request.idempotencyKey,
        }
      );

      return this.mapContractResponse(response, request);
    } catch (error) {
      this.log('Bind error', error);
      throw new ProviderError(
        this.providerId,
        'BIND_ERROR',
        'Failed to bind Insurent contract',
        error as Error
      );
    }
  }

  /**
   * Cancel a guarantor contract.
   * Note: Insurent contracts typically cannot be cancelled for refund
   * once the lease has started.
   */
  async cancel(request: CancelRequest): Promise<CancelResponse> {
    this.log('Cancelling contract', { policyId: request.policyId });

    if (!await this.isAvailable()) {
      return {
        success: true,
        policyId: request.policyId,
        cancelledAt: new Date(),
        refundAmount: 0, // Guarantor fees typically non-refundable
      };
    }

    try {
      const response = await this.makeRequest<{
        success: boolean;
        cancellation_date: string;
        refund_eligible: boolean;
        refund_amount?: number;
        reason_code: string;
      }>(
        'POST',
        `/api/v2/contracts/${request.providerPolicyId}/cancel`,
        {
          reason: request.reason,
          effective_date: request.effectiveDate?.toISOString().split('T')[0],
          idempotency_key: request.idempotencyKey,
        }
      );

      return {
        success: response.success,
        policyId: request.policyId,
        cancelledAt: new Date(response.cancellation_date),
        refundAmount: response.refund_amount,
      };
    } catch (error) {
      return {
        success: false,
        policyId: request.policyId,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Renew a guarantor contract for lease renewal.
   */
  async renew(request: RenewRequest): Promise<QuoteResponse> {
    this.log('Renewing contract', { policyId: request.policyId });

    if (!await this.isAvailable()) {
      return this.getMockRenewalQuote();
    }

    try {
      const response = await this.makeRequest<InsurentQuoteResponse>(
        'POST',
        `/api/v2/contracts/${request.providerPolicyId}/renewal-quote`,
        {
          new_term_months: request.newTerm || 12,
          idempotency_key: request.idempotencyKey,
        }
      );

      return {
        quoteId: `quote_${randomUUID()}`,
        provider: this.providerId,
        productType: 'guarantor',
        status: 'success',
        premium: response.guarantor_fee.amount,
        premiumFrequency: 'one_time',
        coverageAmount: response.coverage.max_coverage,
        commissionRate: response.partner_commission.rate,
        commissionAmount: response.partner_commission.amount,
        validUntil: new Date(response.expires_at),
        providerQuoteId: response.quote_id,
      };
    } catch (error) {
      throw new ProviderError(
        this.providerId,
        'RENEWAL_ERROR',
        'Failed to get Insurent renewal quote',
        error as Error
      );
    }
  }

  /**
   * Get contract status.
   */
  async getPolicyStatus(providerPolicyId: string): Promise<PolicyArtifact | null> {
    this.log('Getting contract status', { providerPolicyId });

    if (!await this.isAvailable()) {
      return null;
    }

    try {
      const response = await this.makeRequest<InsurentContractResponse>(
        'GET',
        `/api/v2/contracts/${providerPolicyId}`
      );

      const now = new Date();
      const statusMap: Record<string, PolicyArtifact['status']> = {
        active: 'active',
        pending: 'pending_bind',
        cancelled: 'cancelled',
        expired: 'expired',
        defaulted: 'cancelled',
      };

      return {
        policyId: `pol_${randomUUID()}`,
        provider: this.providerId,
        productType: 'guarantor',
        status: statusMap[response.status] || 'active',
        policyNumber: response.contract_number,
        effectiveDate: new Date(response.effective_date),
        expirationDate: new Date(response.expiration_date),
        coverageAmount: response.coverage.max_liability,
        premium: response.fee.amount,
        premiumFrequency: 'one_time',
        policyDocumentUrl: response.documents.guaranty_agreement_url,
        certificateUrl: response.documents.certificate_url,
        commissionRate: this.defaultCommissionRate,
        commissionAmount: response.fee.amount * this.defaultCommissionRate,
        quoteId: '',
        applicantId: '',
        propertyId: '',
        providerPolicyId: response.contract_id,
        createdAt: now,
        updatedAt: now,
      };
    } catch {
      return null;
    }
  }

  // =============================================================================
  // Response Mappers
  // =============================================================================

  private mapQuoteResponse(
    response: InsurentQuoteResponse,
    _request: QuoteRequest
  ): QuoteResponse {
    if (response.status === 'declined') {
      throw new QuoteDeclinedError(
        this.providerId,
        response.decline_reason || 'Application declined',
        response.decline_code
      );
    }

    const status = response.status === 'approved' ? 'success' :
      response.status === 'conditionally_approved' ? 'success' : 'pending_review';

    return {
      quoteId: `quote_${randomUUID()}`,
      provider: this.providerId,
      productType: 'guarantor',
      status,
      premium: response.guarantor_fee.amount,
      premiumFrequency: 'one_time',
      coverageAmount: response.coverage.max_coverage,
      commissionRate: response.partner_commission.rate,
      commissionAmount: response.partner_commission.amount,
      validUntil: new Date(response.expires_at),
      providerQuoteId: response.quote_id,
      providerData: {
        conditions: response.conditions,
        coverage_multiplier: response.coverage.coverage_multiplier,
        lease_months: response.coverage.lease_months,
      },
    };
  }

  private mapContractResponse(
    response: InsurentContractResponse,
    request: BindRequest
  ): PolicyArtifact {
    const now = new Date();
    return {
      policyId: `pol_${randomUUID()}`,
      provider: this.providerId,
      productType: 'guarantor',
      status: response.status === 'active' ? 'active' : 'pending_bind',
      policyNumber: response.contract_number,
      effectiveDate: new Date(response.effective_date),
      expirationDate: new Date(response.expiration_date),
      coverageAmount: response.coverage.max_liability,
      premium: response.fee.amount,
      premiumFrequency: 'one_time',
      policyDocumentUrl: response.documents.guaranty_agreement_url,
      certificateUrl: response.documents.certificate_url,
      commissionRate: this.defaultCommissionRate,
      commissionAmount: response.fee.amount * this.defaultCommissionRate,
      quoteId: request.quoteId,
      applicantId: '',
      propertyId: '',
      providerPolicyId: response.contract_id,
      providerData: {
        landlord_info: response.landlord_info,
        monthly_rent: response.coverage.monthly_rent,
        lease_months: response.coverage.lease_months,
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  // =============================================================================
  // Mock Responses
  // =============================================================================

  private getMockQuote(request: QuoteRequest): QuoteResponse {
    const monthlyRent = request.propertyInfo.monthlyRent;
    const leaseMonths = request.term || 12;

    // Insurent typically charges 70-110% of one month's rent
    // Rate depends on credit profile - using 85% as average
    const feeMultiplier = 0.85;
    const premium = Math.round(monthlyRent * feeMultiplier * 100) / 100;
    const maxCoverage = monthlyRent * leaseMonths;
    const commissionAmount = premium * this.defaultCommissionRate;

    return {
      quoteId: `quote_${randomUUID()}`,
      provider: this.providerId,
      productType: 'guarantor',
      status: 'success',
      premium,
      premiumFrequency: 'one_time',
      coverageAmount: maxCoverage,
      commissionRate: this.defaultCommissionRate,
      commissionAmount,
      validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
      providerQuoteId: `ins_quote_${randomUUID().substring(0, 8)}`,
      providerData: {
        coverage_multiplier: 1.0,
        lease_months: leaseMonths,
        fee_percentage: feeMultiplier * 100,
      },
    };
  }

  private getMockPolicy(request: BindRequest): PolicyArtifact {
    const now = new Date();
    const expirationDate = new Date(now);
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);

    // Typical guarantor coverage
    const monthlyRent = 2500;
    const premium = monthlyRent * 0.85;
    const maxCoverage = monthlyRent * 12;

    return {
      policyId: `pol_${randomUUID()}`,
      provider: this.providerId,
      productType: 'guarantor',
      status: 'active',
      policyNumber: `INS-${Date.now().toString(36).toUpperCase()}`,
      effectiveDate: now,
      expirationDate,
      coverageAmount: maxCoverage,
      premium,
      premiumFrequency: 'one_time',
      commissionRate: this.defaultCommissionRate,
      commissionAmount: premium * this.defaultCommissionRate,
      quoteId: request.quoteId,
      applicantId: '',
      propertyId: '',
      providerPolicyId: `ins_contract_${randomUUID().substring(0, 8)}`,
      providerData: {
        landlord_info: { name: 'Property Management' },
        monthly_rent: monthlyRent,
        lease_months: 12,
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  private getMockRenewalQuote(): QuoteResponse {
    const monthlyRent = 2500;
    const premium = monthlyRent * 0.75; // Renewal discount
    const maxCoverage = monthlyRent * 12;

    return {
      quoteId: `quote_${randomUUID()}`,
      provider: this.providerId,
      productType: 'guarantor',
      status: 'success',
      premium,
      premiumFrequency: 'one_time',
      coverageAmount: maxCoverage,
      commissionRate: this.defaultCommissionRate,
      commissionAmount: premium * this.defaultCommissionRate,
      validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      providerQuoteId: `ins_renew_${randomUUID().substring(0, 8)}`,
    };
  }
}
