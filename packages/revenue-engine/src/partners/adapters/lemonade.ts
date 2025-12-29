/**
 * Lemonade Provider Adapter
 *
 * Renters insurance provider integration.
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
  type ProviderConfig,
} from '../provider-interface';

// =============================================================================
// Lemonade Provider
// =============================================================================

export class LemonadeProvider extends BasePartnerProvider {
  readonly providerId = 'lemonade' as const;
  readonly supportedProducts: PartnerProductType[] = ['renters_insurance'];

  private defaultCommissionRate = 0.20; // 20% commission

  constructor(config: ProviderConfig) {
    super(config);
  }

  /**
   * Get a quote for renters insurance.
   */
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    this.log('Getting quote', { applicantId: request.applicantId });

    if (!await this.isAvailable()) {
      return this.getMockQuote(request);
    }

    try {
      const response = await this.makeRequest<{
        quote_id: string;
        status: string;
        monthly_premium: number;
        personal_property_coverage: number;
        liability_coverage: number;
        deductible: number;
        partner_commission: number;
        expires_at: string;
      }>(
        'POST',
        '/api/partners/quotes',
        {
          applicant: {
            first_name: request.applicantInfo.firstName,
            last_name: request.applicantInfo.lastName,
            email: request.applicantInfo.email,
            date_of_birth: request.applicantInfo.dateOfBirth?.toISOString().split('T')[0],
          },
          property: {
            address: request.propertyInfo.address,
            city: request.propertyInfo.city,
            state: request.propertyInfo.state,
            zip: request.propertyInfo.zip,
            type: request.propertyInfo.propertyType || 'apartment',
            square_feet: request.propertyInfo.squareFeet,
          },
          coverage: {
            personal_property: request.coverageAmount || 30000,
            liability: 100000,
            deductible: 500,
          },
        }
      );

      return {
        quoteId: `quote_${randomUUID()}`,
        provider: this.providerId,
        productType: 'renters_insurance',
        status: 'success',
        premium: response.monthly_premium,
        premiumFrequency: 'monthly',
        coverageAmount: response.personal_property_coverage,
        deductible: response.deductible,
        commissionRate: this.defaultCommissionRate,
        commissionAmount: response.partner_commission,
        validUntil: new Date(response.expires_at),
        providerQuoteId: response.quote_id,
        providerData: {
          liability_coverage: response.liability_coverage,
        },
      };
    } catch (error) {
      this.log('Quote error', error);
      throw new ProviderError(
        this.providerId,
        'QUOTE_ERROR',
        'Failed to get Lemonade quote',
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
      const response = await this.makeRequest<{
        policy_id: string;
        policy_number: string;
        effective_date: string;
        expiration_date: string;
        coverage: {
          personal_property: number;
          liability: number;
          deductible: number;
        };
        premium: {
          monthly: number;
          annual: number;
        };
        documents: {
          policy_url: string;
          id_card_url: string;
        };
      }>(
        'POST',
        `/api/partners/quotes/${request.providerQuoteId}/bind`,
        {
          terms_accepted: request.termsAccepted,
          payment_method_id: request.paymentMethodId,
          idempotency_key: request.idempotencyKey,
        }
      );

      const now = new Date();
      return {
        policyId: `pol_${randomUUID()}`,
        provider: this.providerId,
        productType: 'renters_insurance',
        status: 'active',
        policyNumber: response.policy_number,
        effectiveDate: new Date(response.effective_date),
        expirationDate: new Date(response.expiration_date),
        coverageAmount: response.coverage.personal_property,
        premium: response.premium.monthly,
        premiumFrequency: 'monthly',
        policyDocumentUrl: response.documents.policy_url,
        certificateUrl: response.documents.id_card_url,
        commissionRate: this.defaultCommissionRate,
        commissionAmount: response.premium.monthly * this.defaultCommissionRate,
        quoteId: request.quoteId,
        applicantId: '',
        propertyId: '',
        providerPolicyId: response.policy_id,
        providerData: {
          liability_coverage: response.coverage.liability,
          deductible: response.coverage.deductible,
          annual_premium: response.premium.annual,
        },
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      this.log('Bind error', error);
      throw new ProviderError(
        this.providerId,
        'BIND_ERROR',
        'Failed to bind Lemonade policy',
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
      const response = await this.makeRequest<{
        success: boolean;
        refund_amount?: number;
      }>(
        'POST',
        `/api/partners/policies/${request.providerPolicyId}/cancel`,
        {
          reason: request.reason,
          effective_date: request.effectiveDate?.toISOString(),
          idempotency_key: request.idempotencyKey,
        }
      );

      return {
        success: response.success,
        policyId: request.policyId,
        cancelledAt: new Date(),
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
   * Renew a policy.
   */
  async renew(request: RenewRequest): Promise<QuoteResponse> {
    this.log('Renewing policy', { policyId: request.policyId });

    // Lemonade renewal returns same coverage terms
    await this.isAvailable();

    return {
      quoteId: `quote_${randomUUID()}`,
      provider: this.providerId,
      productType: 'renters_insurance',
      status: 'success',
      premium: 18,
      premiumFrequency: 'monthly',
      coverageAmount: 30000,
      deductible: 500,
      commissionRate: this.defaultCommissionRate,
      commissionAmount: 3.6,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      providerQuoteId: `lm_renew_${randomUUID().substring(0, 8)}`,
    };
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
      const response = await this.makeRequest<{
        policy_id: string;
        policy_number: string;
        status: string;
        effective_date: string;
        expiration_date: string;
        coverage: { personal_property: number };
        premium: { monthly: number };
      }>(
        'GET',
        `/api/partners/policies/${providerPolicyId}`
      );

      const now = new Date();
      return {
        policyId: `pol_${randomUUID()}`,
        provider: this.providerId,
        productType: 'renters_insurance',
        status: response.status === 'active' ? 'active' : 'cancelled',
        policyNumber: response.policy_number,
        effectiveDate: new Date(response.effective_date),
        expirationDate: new Date(response.expiration_date),
        coverageAmount: response.coverage.personal_property,
        premium: response.premium.monthly,
        premiumFrequency: 'monthly',
        commissionRate: this.defaultCommissionRate,
        commissionAmount: response.premium.monthly * this.defaultCommissionRate,
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
  // Mock Responses
  // =============================================================================

  private getMockQuote(request: QuoteRequest): QuoteResponse {
    const premium = 18; // $18/month base
    const coverageAmount = request.coverageAmount || 30000;
    const commissionAmount = premium * this.defaultCommissionRate;

    return {
      quoteId: `quote_${randomUUID()}`,
      provider: this.providerId,
      productType: 'renters_insurance',
      status: 'success',
      premium,
      premiumFrequency: 'monthly',
      coverageAmount,
      deductible: 500,
      commissionRate: this.defaultCommissionRate,
      commissionAmount,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      providerQuoteId: `lm_quote_${randomUUID().substring(0, 8)}`,
      providerData: {
        liability_coverage: 100000,
      },
    };
  }

  private getMockPolicy(request: BindRequest): PolicyArtifact {
    const now = new Date();
    const expirationDate = new Date(now);
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);

    return {
      policyId: `pol_${randomUUID()}`,
      provider: this.providerId,
      productType: 'renters_insurance',
      status: 'active',
      policyNumber: `LM-${Date.now().toString(36).toUpperCase()}`,
      effectiveDate: now,
      expirationDate,
      coverageAmount: 30000,
      premium: 18,
      premiumFrequency: 'monthly',
      commissionRate: this.defaultCommissionRate,
      commissionAmount: 3.6,
      quoteId: request.quoteId,
      applicantId: '',
      propertyId: '',
      providerPolicyId: `lm_pol_${randomUUID().substring(0, 8)}`,
      providerData: {
        liability_coverage: 100000,
        deductible: 500,
      },
      createdAt: now,
      updatedAt: now,
    };
  }
}
