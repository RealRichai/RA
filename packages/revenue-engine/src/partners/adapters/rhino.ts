/**
 * Rhino Provider Adapter
 *
 * Deposit alternative and guarantor provider integration.
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
// Rhino-Specific Types
// =============================================================================

interface RhinoQuoteRequest {
  product_type: 'deposit_insurance' | 'guarantor';
  property: {
    id: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    monthly_rent: number;
  };
  applicant: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    date_of_birth?: string;
    ssn_last_four?: string;
    annual_income?: number;
  };
  lease: {
    start_date?: string;
    end_date?: string;
    term_months?: number;
  };
}

interface RhinoQuoteResponse {
  id: string;
  product_type: string;
  status: 'approved' | 'declined' | 'manual_review';
  premium: {
    amount: number;
    frequency: 'monthly' | 'annual' | 'one_time';
  };
  coverage: {
    amount: number;
    type: string;
  };
  partner_commission: {
    rate: number;
    amount: number;
  };
  expires_at: string;
  decline_info?: {
    reason: string;
    code: string;
  };
}

interface RhinoPolicyResponse {
  id: string;
  policy_number: string;
  product_type: string;
  status: 'active' | 'cancelled' | 'expired' | 'pending';
  premium: {
    amount: number;
    frequency: string;
  };
  coverage: {
    amount: number;
  };
  dates: {
    effective: string;
    expiration: string;
  };
  documents: {
    policy_url?: string;
    certificate_url?: string;
  };
}

// =============================================================================
// Rhino Provider
// =============================================================================

export class RhinoProvider extends BasePartnerProvider {
  readonly providerId = 'rhino' as const;
  readonly supportedProducts: PartnerProductType[] = ['deposit_alternative', 'guarantor'];

  private defaultCommissionRate = 0.12; // 12% commission

  constructor(config: ProviderConfig) {
    super(config);
  }

  /**
   * Get a quote for deposit alternative or guarantor coverage.
   */
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    this.log('Getting quote', { applicantId: request.applicantId, product: request.productType });

    if (!await this.isAvailable()) {
      return this.getMockQuote(request);
    }

    try {
      const rhinoRequest: RhinoQuoteRequest = {
        product_type: request.productType === 'guarantor' ? 'guarantor' : 'deposit_insurance',
        property: {
          id: request.propertyId,
          address: request.propertyInfo.address,
          city: request.propertyInfo.city,
          state: request.propertyInfo.state,
          zip: request.propertyInfo.zip,
          monthly_rent: request.propertyInfo.monthlyRent,
        },
        applicant: {
          first_name: request.applicantInfo.firstName,
          last_name: request.applicantInfo.lastName,
          email: request.applicantInfo.email,
          phone: request.applicantInfo.phone,
          date_of_birth: request.applicantInfo.dateOfBirth?.toISOString().split('T')[0],
          annual_income: request.applicantInfo.annualIncome,
        },
        lease: {
          term_months: request.term || 12,
          start_date: request.startDate?.toISOString().split('T')[0],
        },
      };

      const response = await this.makeRequest<RhinoQuoteResponse>(
        'POST',
        '/v2/quotes',
        rhinoRequest
      );

      return this.mapQuoteResponse(response, request);
    } catch (error) {
      this.log('Quote error', error);
      throw new ProviderError(
        this.providerId,
        'QUOTE_ERROR',
        'Failed to get Rhino quote',
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
      const response = await this.makeRequest<RhinoPolicyResponse>(
        'POST',
        `/v2/quotes/${request.providerQuoteId}/bind`,
        {
          consent: {
            terms_accepted: request.termsAccepted,
            accepted_at: request.termsAcceptedAt.toISOString(),
          },
          payment_method_id: request.paymentMethodId,
          idempotency_key: request.idempotencyKey,
        }
      );

      return this.mapPolicyResponse(response, request);
    } catch (error) {
      this.log('Bind error', error);
      throw new ProviderError(
        this.providerId,
        'BIND_ERROR',
        'Failed to bind Rhino policy',
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
      };
    }

    try {
      const response = await this.makeRequest<{
        success: boolean;
        refund_amount?: number;
        clawback_amount?: number;
      }>(
        'POST',
        `/v2/policies/${request.providerPolicyId}/cancel`,
        {
          reason: request.reason,
          effective_date: request.effectiveDate?.toISOString(),
          request_refund: request.refundRequested,
          idempotency_key: request.idempotencyKey,
        }
      );

      return {
        success: response.success,
        policyId: request.policyId,
        cancelledAt: new Date(),
        refundAmount: response.refund_amount,
        commissionClawbackAmount: response.clawback_amount,
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
      const response = await this.makeRequest<RhinoQuoteResponse>(
        'POST',
        `/v2/policies/${request.providerPolicyId}/renew`,
        {
          term_months: request.newTerm,
          idempotency_key: request.idempotencyKey,
        }
      );

      return {
        quoteId: `quote_${randomUUID()}`,
        provider: this.providerId,
        productType: 'deposit_alternative',
        status: 'success',
        premium: response.premium.amount,
        premiumFrequency: response.premium.frequency,
        coverageAmount: response.coverage.amount,
        commissionRate: response.partner_commission.rate,
        commissionAmount: response.partner_commission.amount,
        validUntil: new Date(response.expires_at),
        providerQuoteId: response.id,
      };
    } catch (error) {
      this.log('Renew error', error);
      throw new ProviderError(
        this.providerId,
        'RENEW_ERROR',
        'Failed to renew Rhino policy',
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
      const response = await this.makeRequest<RhinoPolicyResponse>(
        'GET',
        `/v2/policies/${providerPolicyId}`
      );

      const now = new Date();
      const statusMap: Record<string, PolicyArtifact['status']> = {
        active: 'active',
        cancelled: 'cancelled',
        expired: 'expired',
        pending: 'pending_bind',
      };

      return {
        policyId: `pol_${randomUUID()}`,
        provider: this.providerId,
        productType: response.product_type === 'guarantor' ? 'guarantor' : 'deposit_alternative',
        status: statusMap[response.status] || 'active',
        policyNumber: response.policy_number,
        effectiveDate: new Date(response.dates.effective),
        expirationDate: new Date(response.dates.expiration),
        coverageAmount: response.coverage.amount,
        premium: response.premium.amount,
        premiumFrequency: response.premium.frequency as 'one_time' | 'monthly' | 'annual',
        policyDocumentUrl: response.documents.policy_url,
        certificateUrl: response.documents.certificate_url,
        commissionRate: this.defaultCommissionRate,
        commissionAmount: response.premium.amount * this.defaultCommissionRate,
        quoteId: '',
        applicantId: '',
        propertyId: '',
        providerPolicyId: response.id,
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
    response: RhinoQuoteResponse,
    request: QuoteRequest
  ): QuoteResponse {
    if (response.status === 'declined') {
      throw new QuoteDeclinedError(
        this.providerId,
        response.decline_info?.reason || 'Application declined',
        response.decline_info?.code
      );
    }

    return {
      quoteId: `quote_${randomUUID()}`,
      provider: this.providerId,
      productType: request.productType,
      status: response.status === 'approved' ? 'success' : 'pending_review',
      premium: response.premium.amount,
      premiumFrequency: response.premium.frequency,
      coverageAmount: response.coverage.amount,
      commissionRate: response.partner_commission.rate,
      commissionAmount: response.partner_commission.amount,
      validUntil: new Date(response.expires_at),
      providerQuoteId: response.id,
    };
  }

  private mapPolicyResponse(
    response: RhinoPolicyResponse,
    request: BindRequest
  ): PolicyArtifact {
    const now = new Date();
    return {
      policyId: `pol_${randomUUID()}`,
      provider: this.providerId,
      productType: response.product_type === 'guarantor' ? 'guarantor' : 'deposit_alternative',
      status: 'active',
      policyNumber: response.policy_number,
      effectiveDate: new Date(response.dates.effective),
      expirationDate: new Date(response.dates.expiration),
      coverageAmount: response.coverage.amount,
      premium: response.premium.amount,
      premiumFrequency: response.premium.frequency as 'one_time' | 'monthly' | 'annual',
      policyDocumentUrl: response.documents.policy_url,
      certificateUrl: response.documents.certificate_url,
      commissionRate: this.defaultCommissionRate,
      commissionAmount: response.premium.amount * this.defaultCommissionRate,
      quoteId: request.quoteId,
      applicantId: '',
      propertyId: '',
      providerPolicyId: response.id,
      createdAt: now,
      updatedAt: now,
    };
  }

  // =============================================================================
  // Mock Responses
  // =============================================================================

  private getMockQuote(request: QuoteRequest): QuoteResponse {
    const monthlyRent = request.propertyInfo.monthlyRent;
    const isGuarantor = request.productType === 'guarantor';

    const coverageAmount = isGuarantor ? monthlyRent * 12 : monthlyRent * 2;
    const premium = isGuarantor ? monthlyRent * 0.8 : monthlyRent * 0.035;
    const commissionAmount = premium * this.defaultCommissionRate;

    return {
      quoteId: `quote_${randomUUID()}`,
      provider: this.providerId,
      productType: request.productType,
      status: 'success',
      premium,
      premiumFrequency: isGuarantor ? 'one_time' : 'monthly',
      coverageAmount,
      commissionRate: this.defaultCommissionRate,
      commissionAmount,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      providerQuoteId: `rh_quote_${randomUUID().substring(0, 8)}`,
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
      policyNumber: `RH-${Date.now().toString(36).toUpperCase()}`,
      effectiveDate: now,
      expirationDate,
      coverageAmount: 4000,
      premium: 85,
      premiumFrequency: 'monthly',
      commissionRate: this.defaultCommissionRate,
      commissionAmount: 10.2,
      quoteId: request.quoteId,
      applicantId: '',
      propertyId: '',
      providerPolicyId: `rh_pol_${randomUUID().substring(0, 8)}`,
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
      premium: 85,
      premiumFrequency: 'monthly',
      coverageAmount: 4000,
      commissionRate: this.defaultCommissionRate,
      commissionAmount: 10.2,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      providerQuoteId: `rh_renew_${randomUUID().substring(0, 8)}`,
    };
  }
}
