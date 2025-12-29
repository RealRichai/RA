/**
 * LeaseLock Provider Adapter
 *
 * Deposit alternative provider integration.
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
// LeaseLock-Specific Types
// =============================================================================

interface LeaseLockQuoteRequest {
  property_id: string;
  unit_id?: string;
  monthly_rent: number;
  lease_term_months: number;
  applicant: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    credit_score?: number;
  };
  property: {
    address: string;
    city: string;
    state: string;
    zip: string;
  };
}

interface LeaseLockQuoteResponse {
  quote_id: string;
  status: 'approved' | 'declined' | 'pending_review';
  coverage_amount: number;
  monthly_premium: number;
  commission_rate: number;
  valid_until: string;
  decline_reason?: string;
}

interface LeaseLockPolicyResponse {
  policy_id: string;
  policy_number: string;
  status: 'active' | 'cancelled' | 'expired';
  coverage_amount: number;
  monthly_premium: number;
  effective_date: string;
  expiration_date: string;
  certificate_url?: string;
}

// =============================================================================
// LeaseLock Provider
// =============================================================================

export class LeaseLockProvider extends BasePartnerProvider {
  readonly providerId = 'leaselock' as const;
  readonly supportedProducts: PartnerProductType[] = ['deposit_alternative'];

  private defaultCommissionRate = 0.15; // 15% commission

  constructor(config: ProviderConfig) {
    super(config);
  }

  /**
   * Get a quote for deposit alternative coverage.
   */
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    this.log('Getting quote', { applicantId: request.applicantId });

    if (!await this.isAvailable()) {
      // Return mock quote in development
      return this.getMockQuote(request);
    }

    try {
      const leaselockRequest: LeaseLockQuoteRequest = {
        property_id: request.propertyId,
        unit_id: request.unitId,
        monthly_rent: request.propertyInfo.monthlyRent,
        lease_term_months: request.term || 12,
        applicant: {
          first_name: request.applicantInfo.firstName,
          last_name: request.applicantInfo.lastName,
          email: request.applicantInfo.email,
          phone: request.applicantInfo.phone,
          credit_score: request.applicantInfo.creditScore,
        },
        property: {
          address: request.propertyInfo.address,
          city: request.propertyInfo.city,
          state: request.propertyInfo.state,
          zip: request.propertyInfo.zip,
        },
      };

      const response = await this.makeRequest<LeaseLockQuoteResponse>(
        'POST',
        '/v1/quotes',
        leaselockRequest
      );

      return this.mapQuoteResponse(response, request);
    } catch (error) {
      this.log('Quote error', error);
      throw new ProviderError(
        this.providerId,
        'QUOTE_ERROR',
        'Failed to get LeaseLock quote',
        error as Error
      );
    }
  }

  /**
   * Bind a quote to create a policy.
   */
  async bind(request: BindRequest): Promise<PolicyArtifact> {
    this.log('Binding quote', { quoteId: request.quoteId });

    if (!await this.isAvailable()) {
      return this.getMockPolicy(request);
    }

    try {
      const response = await this.makeRequest<LeaseLockPolicyResponse>(
        'POST',
        `/v1/quotes/${request.providerQuoteId}/bind`,
        {
          terms_accepted: request.termsAccepted,
          terms_accepted_at: request.termsAcceptedAt.toISOString(),
          idempotency_key: request.idempotencyKey,
        }
      );

      return this.mapPolicyResponse(response, request);
    } catch (error) {
      this.log('Bind error', error);
      throw new ProviderError(
        this.providerId,
        'BIND_ERROR',
        'Failed to bind LeaseLock policy',
        error as Error
      );
    }
  }

  /**
   * Cancel a policy.
   */
  async cancel(request: CancelRequest): Promise<CancelResponse> {
    this.log('Cancelling policy', { policyId: request.policyId });

    if (!await this.isAvailable()) {
      return {
        success: true,
        policyId: request.policyId,
        cancelledAt: new Date(),
        refundAmount: 0,
      };
    }

    try {
      await this.makeRequest<{ success: boolean }>(
        'POST',
        `/v1/policies/${request.providerPolicyId}/cancel`,
        {
          reason: request.reason,
          effective_date: request.effectiveDate?.toISOString(),
          refund_requested: request.refundRequested,
          idempotency_key: request.idempotencyKey,
        }
      );

      return {
        success: true,
        policyId: request.policyId,
        cancelledAt: new Date(),
      };
    } catch (error) {
      this.log('Cancel error', error);
      return {
        success: false,
        policyId: request.policyId,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Renew a policy.
   */
  async renew(request: RenewRequest): Promise<QuoteResponse> {
    this.log('Renewing policy', { policyId: request.policyId });

    if (!await this.isAvailable()) {
      return this.getMockRenewalQuote(request);
    }

    try {
      const response = await this.makeRequest<LeaseLockQuoteResponse>(
        'POST',
        `/v1/policies/${request.providerPolicyId}/renew`,
        {
          new_term_months: request.newTerm,
          idempotency_key: request.idempotencyKey,
        }
      );

      return {
        quoteId: `quote_${randomUUID()}`,
        provider: this.providerId,
        productType: 'deposit_alternative',
        status: 'success',
        premium: response.monthly_premium,
        premiumFrequency: 'monthly',
        coverageAmount: response.coverage_amount,
        commissionRate: response.commission_rate,
        commissionAmount: response.monthly_premium * response.commission_rate,
        validUntil: new Date(response.valid_until),
        providerQuoteId: response.quote_id,
      };
    } catch (error) {
      this.log('Renew error', error);
      throw new ProviderError(
        this.providerId,
        'RENEW_ERROR',
        'Failed to renew LeaseLock policy',
        error as Error
      );
    }
  }

  /**
   * Get policy status.
   */
  async getPolicyStatus(providerPolicyId: string): Promise<PolicyArtifact | null> {
    this.log('Getting policy status', { providerPolicyId });

    if (!await this.isAvailable()) {
      return null;
    }

    try {
      const response = await this.makeRequest<LeaseLockPolicyResponse>(
        'GET',
        `/v1/policies/${providerPolicyId}`
      );

      const now = new Date();
      return {
        policyId: `pol_${randomUUID()}`,
        provider: this.providerId,
        productType: 'deposit_alternative',
        status: response.status === 'active' ? 'active' : 'cancelled',
        policyNumber: response.policy_number,
        effectiveDate: new Date(response.effective_date),
        expirationDate: new Date(response.expiration_date),
        coverageAmount: response.coverage_amount,
        premium: response.monthly_premium,
        premiumFrequency: 'monthly',
        certificateUrl: response.certificate_url,
        commissionRate: this.defaultCommissionRate,
        commissionAmount: response.monthly_premium * this.defaultCommissionRate,
        quoteId: '',
        applicantId: '',
        propertyId: '',
        providerPolicyId: response.policy_id,
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
    response: LeaseLockQuoteResponse,
    _request: QuoteRequest
  ): QuoteResponse {
    if (response.status === 'declined') {
      throw new QuoteDeclinedError(
        this.providerId,
        response.decline_reason || 'Application declined',
        'DECLINED'
      );
    }

    return {
      quoteId: `quote_${randomUUID()}`,
      provider: this.providerId,
      productType: 'deposit_alternative',
      status: response.status === 'approved' ? 'success' : 'pending_review',
      premium: response.monthly_premium,
      premiumFrequency: 'monthly',
      coverageAmount: response.coverage_amount,
      commissionRate: response.commission_rate,
      commissionAmount: response.monthly_premium * response.commission_rate,
      validUntil: new Date(response.valid_until),
      providerQuoteId: response.quote_id,
    };
  }

  private mapPolicyResponse(
    response: LeaseLockPolicyResponse,
    request: BindRequest
  ): PolicyArtifact {
    const now = new Date();
    return {
      policyId: `pol_${randomUUID()}`,
      provider: this.providerId,
      productType: 'deposit_alternative',
      status: 'active',
      policyNumber: response.policy_number,
      effectiveDate: new Date(response.effective_date),
      expirationDate: new Date(response.expiration_date),
      coverageAmount: response.coverage_amount,
      premium: response.monthly_premium,
      premiumFrequency: 'monthly',
      certificateUrl: response.certificate_url,
      commissionRate: this.defaultCommissionRate,
      commissionAmount: response.monthly_premium * this.defaultCommissionRate,
      quoteId: request.quoteId,
      applicantId: '',
      propertyId: '',
      providerPolicyId: response.policy_id,
      createdAt: now,
      updatedAt: now,
    };
  }

  // =============================================================================
  // Mock Responses (Development/Testing)
  // =============================================================================

  private getMockQuote(request: QuoteRequest): QuoteResponse {
    const monthlyRent = request.propertyInfo.monthlyRent;
    const coverageAmount = monthlyRent * 2; // 2 months coverage
    const premium = monthlyRent * 0.04; // 4% of rent
    const commissionAmount = premium * this.defaultCommissionRate;

    return {
      quoteId: `quote_${randomUUID()}`,
      provider: this.providerId,
      productType: 'deposit_alternative',
      status: 'success',
      premium,
      premiumFrequency: 'monthly',
      coverageAmount,
      commissionRate: this.defaultCommissionRate,
      commissionAmount,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      providerQuoteId: `ll_quote_${randomUUID().substring(0, 8)}`,
    };
  }

  private getMockPolicy(request: BindRequest): PolicyArtifact {
    const now = new Date();
    const expirationDate = new Date(now);
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);

    return {
      policyId: `pol_${randomUUID()}`,
      provider: this.providerId,
      productType: 'deposit_alternative',
      status: 'active',
      policyNumber: `LL-${Date.now().toString(36).toUpperCase()}`,
      effectiveDate: now,
      expirationDate,
      coverageAmount: 5000,
      premium: 100,
      premiumFrequency: 'monthly',
      commissionRate: this.defaultCommissionRate,
      commissionAmount: 15,
      quoteId: request.quoteId,
      applicantId: '',
      propertyId: '',
      providerPolicyId: `ll_pol_${randomUUID().substring(0, 8)}`,
      createdAt: now,
      updatedAt: now,
    };
  }

  private getMockRenewalQuote(_request: RenewRequest): QuoteResponse {
    return {
      quoteId: `quote_${randomUUID()}`,
      provider: this.providerId,
      productType: 'deposit_alternative',
      status: 'success',
      premium: 100,
      premiumFrequency: 'monthly',
      coverageAmount: 5000,
      commissionRate: this.defaultCommissionRate,
      commissionAmount: 15,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      providerQuoteId: `ll_renew_${randomUUID().substring(0, 8)}`,
    };
  }
}
