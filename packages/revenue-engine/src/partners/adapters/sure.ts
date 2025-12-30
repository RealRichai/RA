/**
 * Sure Provider Adapter
 *
 * Embedded insurance API platform integration.
 * Sure provides white-label insurance APIs for renters and
 * personal property insurance.
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
// Sure Provider
// =============================================================================

export class SureProvider extends BasePartnerProvider {
  readonly providerId = 'sure' as const;
  readonly supportedProducts: PartnerProductType[] = ['renters_insurance'];

  private defaultCommissionRate = 0.18; // 18% commission (Sure has higher partner rates)

  constructor(config: ProviderConfig) {
    super(config);
  }

  /**
   * Get a quote for renters insurance.
   * Sure uses a two-step process: create quote request, then get quote response.
   */
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    this.log('Getting quote', { applicantId: request.applicantId });

    if (!await this.isAvailable()) {
      return this.getMockQuote(request);
    }

    try {
      // Sure's API uses a create-then-fetch pattern
      const createResponse = await this.makeRequest<{
        quote_request_id: string;
        status: 'processing' | 'ready' | 'declined';
      }>(
        'POST',
        '/v1/renters/quote-requests',
        {
          customer: {
            first_name: request.applicantInfo.firstName,
            last_name: request.applicantInfo.lastName,
            email: request.applicantInfo.email,
            phone_number: request.applicantInfo.phone,
            date_of_birth: request.applicantInfo.dateOfBirth?.toISOString().split('T')[0],
          },
          address: {
            line1: request.propertyInfo.address,
            city: request.propertyInfo.city,
            state: request.propertyInfo.state,
            postal_code: request.propertyInfo.zip,
          },
          property: {
            type: this.mapPropertyType(request.propertyInfo.propertyType),
            square_feet: request.propertyInfo.squareFeet,
            year_built: 2000, // Default if not provided
          },
          coverage: {
            personal_property: request.coverageAmount || 30000,
            liability: 100000,
            medical_payments: 1000,
            deductible: 500,
          },
          effective_date: request.startDate?.toISOString().split('T')[0] ||
            new Date().toISOString().split('T')[0],
        }
      );

      if (createResponse.status === 'declined') {
        throw new QuoteDeclinedError(
          this.providerId,
          'Quote declined by underwriting',
          'UNDERWRITING_DECLINE'
        );
      }

      // Fetch the quote details
      const quoteResponse = await this.makeRequest<{
        quote_id: string;
        status: string;
        premium: {
          monthly: number;
          annual: number;
        };
        coverage: {
          personal_property: number;
          liability: number;
          deductible: number;
          medical_payments: number;
        };
        partner: {
          commission_rate: number;
          commission_amount: number;
        };
        valid_until: string;
        carrier: string;
      }>(
        'GET',
        `/v1/renters/quote-requests/${createResponse.quote_request_id}/quote`
      );

      return {
        quoteId: `quote_${randomUUID()}`,
        provider: this.providerId,
        productType: 'renters_insurance',
        status: 'success',
        premium: quoteResponse.premium.monthly,
        premiumFrequency: 'monthly',
        coverageAmount: quoteResponse.coverage.personal_property,
        deductible: quoteResponse.coverage.deductible,
        commissionRate: quoteResponse.partner.commission_rate,
        commissionAmount: quoteResponse.partner.commission_amount,
        validUntil: new Date(quoteResponse.valid_until),
        providerQuoteId: quoteResponse.quote_id,
        providerData: {
          liability_coverage: quoteResponse.coverage.liability,
          medical_payments: quoteResponse.coverage.medical_payments,
          carrier: quoteResponse.carrier,
          annual_premium: quoteResponse.premium.annual,
        },
      };
    } catch (error) {
      if (error instanceof QuoteDeclinedError) {
        return {
          quoteId: `quote_${randomUUID()}`,
          provider: this.providerId,
          productType: 'renters_insurance',
          status: 'declined',
          declineReason: error.reason,
          declineCode: error.declineCode,
        };
      }

      this.log('Quote error', error);
      throw new ProviderError(
        this.providerId,
        'QUOTE_ERROR',
        'Failed to get Sure quote',
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
        status: string;
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
          declarations_url: string;
          insurance_card_url: string;
        };
        carrier: string;
      }>(
        'POST',
        `/v1/renters/quotes/${request.providerQuoteId}/bind`,
        {
          payment: {
            method_token: request.paymentMethodId,
            billing_same_as_insured: true,
          },
          consent: {
            terms_accepted: request.termsAccepted,
            timestamp: request.termsAcceptedAt.toISOString(),
            ip_address: request.additionalInfo?.ipAddress,
          },
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
        certificateUrl: response.documents.insurance_card_url,
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
          carrier: response.carrier,
          declarations_url: response.documents.declarations_url,
        },
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      this.log('Bind error', error);
      throw new ProviderError(
        this.providerId,
        'BIND_ERROR',
        'Failed to bind Sure policy',
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
        effective_date: string;
        refund: {
          amount: number;
          method: string;
          processing_days: number;
        } | null;
      }>(
        'POST',
        `/v1/renters/policies/${request.providerPolicyId}/cancel`,
        {
          reason: request.reason,
          effective_date: request.effectiveDate?.toISOString().split('T')[0],
          idempotency_key: request.idempotencyKey,
        }
      );

      return {
        success: response.success,
        policyId: request.policyId,
        cancelledAt: new Date(response.effective_date),
        refundAmount: response.refund?.amount,
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

    if (!await this.isAvailable()) {
      return {
        quoteId: `quote_${randomUUID()}`,
        provider: this.providerId,
        productType: 'renters_insurance',
        status: 'success',
        premium: 15,
        premiumFrequency: 'monthly',
        coverageAmount: 30000,
        deductible: 500,
        commissionRate: this.defaultCommissionRate,
        commissionAmount: 2.7,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        providerQuoteId: `sure_renew_${randomUUID().substring(0, 8)}`,
      };
    }

    try {
      const response = await this.makeRequest<{
        renewal_quote_id: string;
        premium: { monthly: number };
        coverage: { personal_property: number; deductible: number };
        valid_until: string;
      }>(
        'POST',
        `/v1/renters/policies/${request.providerPolicyId}/renewal-quote`,
        {
          term_months: request.newTerm || 12,
          idempotency_key: request.idempotencyKey,
        }
      );

      return {
        quoteId: `quote_${randomUUID()}`,
        provider: this.providerId,
        productType: 'renters_insurance',
        status: 'success',
        premium: response.premium.monthly,
        premiumFrequency: 'monthly',
        coverageAmount: response.coverage.personal_property,
        deductible: response.coverage.deductible,
        commissionRate: this.defaultCommissionRate,
        commissionAmount: response.premium.monthly * this.defaultCommissionRate,
        validUntil: new Date(response.valid_until),
        providerQuoteId: response.renewal_quote_id,
      };
    } catch (error) {
      throw new ProviderError(
        this.providerId,
        'RENEWAL_ERROR',
        'Failed to get Sure renewal quote',
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
      const response = await this.makeRequest<{
        policy_id: string;
        policy_number: string;
        status: string;
        effective_date: string;
        expiration_date: string;
        coverage: { personal_property: number };
        premium: { monthly: number };
        carrier: string;
      }>(
        'GET',
        `/v1/renters/policies/${providerPolicyId}`
      );

      const now = new Date();
      return {
        policyId: `pol_${randomUUID()}`,
        provider: this.providerId,
        productType: 'renters_insurance',
        status: this.mapPolicyStatus(response.status),
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
        providerData: { carrier: response.carrier },
        createdAt: now,
        updatedAt: now,
      };
    } catch {
      return null;
    }
  }

  // =============================================================================
  // Helper Methods
  // =============================================================================

  private mapPropertyType(type: string | undefined): string {
    const typeMap: Record<string, string> = {
      'apartment': 'apartment',
      'condo': 'condo',
      'townhouse': 'townhouse',
      'house': 'single_family',
      'duplex': 'multi_family',
      'studio': 'apartment',
    };
    return typeMap[type?.toLowerCase() || 'apartment'] || 'apartment';
  }

  private mapPolicyStatus(status: string): 'active' | 'cancelled' | 'expired' {
    switch (status.toLowerCase()) {
      case 'active':
      case 'in_force':
        return 'active';
      case 'cancelled':
      case 'terminated':
        return 'cancelled';
      case 'expired':
      case 'lapsed':
        return 'expired';
      default:
        return 'active';
    }
  }

  // =============================================================================
  // Mock Responses
  // =============================================================================

  private getMockQuote(request: QuoteRequest): QuoteResponse {
    // Sure typically positions itself as tech-forward with competitive rates
    const basePremium = 12; // $12/month base (competitive)
    const coverageAmount = request.coverageAmount || 30000;
    const coverageMultiplier = Math.max(1, coverageAmount / 30000);
    const premium = Math.round(basePremium * coverageMultiplier * 100) / 100;
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
      providerQuoteId: `sure_quote_${randomUUID().substring(0, 8)}`,
      providerData: {
        liability_coverage: 100000,
        medical_payments: 1000,
        carrier: 'Markel Insurance',
        annual_premium: Math.round(premium * 12 * 0.95 * 100) / 100, // 5% annual discount
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
      policyNumber: `SURE-${Date.now().toString(36).toUpperCase()}`,
      effectiveDate: now,
      expirationDate,
      coverageAmount: 30000,
      premium: 12,
      premiumFrequency: 'monthly',
      commissionRate: this.defaultCommissionRate,
      commissionAmount: 2.16,
      quoteId: request.quoteId,
      applicantId: '',
      propertyId: '',
      providerPolicyId: `sure_pol_${randomUUID().substring(0, 8)}`,
      providerData: {
        liability_coverage: 100000,
        deductible: 500,
        carrier: 'Markel Insurance',
        medical_payments: 1000,
      },
      createdAt: now,
      updatedAt: now,
    };
  }
}
