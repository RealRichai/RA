/**
 * Jetty Provider Adapter
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
  type ProviderConfig,
} from '../provider-interface';

// =============================================================================
// Jetty Provider
// =============================================================================

export class JettyProvider extends BasePartnerProvider {
  readonly providerId = 'jetty' as const;
  readonly supportedProducts: PartnerProductType[] = ['deposit_alternative', 'renters_insurance'];

  private defaultCommissionRate = 0.10; // 10% commission

  constructor(config: ProviderConfig) {
    super(config);
  }

  /**
   * Get a quote for deposit alternative coverage.
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
        coverage_amount: number;
        commission_rate: number;
        valid_until: string;
      }>(
        'POST',
        '/api/v1/quotes',
        {
          product: request.productType === 'renters_insurance' ? 'renters' : 'deposit',
          property_id: request.propertyId,
          monthly_rent: request.propertyInfo.monthlyRent,
          applicant: {
            first_name: request.applicantInfo.firstName,
            last_name: request.applicantInfo.lastName,
            email: request.applicantInfo.email,
          },
          address: {
            street: request.propertyInfo.address,
            city: request.propertyInfo.city,
            state: request.propertyInfo.state,
            zip: request.propertyInfo.zip,
          },
        }
      );

      return {
        quoteId: `quote_${randomUUID()}`,
        provider: this.providerId,
        productType: request.productType,
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
      this.log('Quote error', error);
      throw new ProviderError(
        this.providerId,
        'QUOTE_ERROR',
        'Failed to get Jetty quote',
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
        coverage_amount: number;
        premium: number;
        certificate_url: string;
      }>(
        'POST',
        `/api/v1/quotes/${request.providerQuoteId}/bind`,
        {
          terms_accepted: request.termsAccepted,
          idempotency_key: request.idempotencyKey,
        }
      );

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
        premium: response.premium,
        premiumFrequency: 'monthly',
        certificateUrl: response.certificate_url,
        commissionRate: this.defaultCommissionRate,
        commissionAmount: response.premium * this.defaultCommissionRate,
        quoteId: request.quoteId,
        applicantId: '',
        propertyId: '',
        providerPolicyId: response.policy_id,
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      this.log('Bind error', error);
      throw new ProviderError(
        this.providerId,
        'BIND_ERROR',
        'Failed to bind Jetty policy',
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
      await this.makeRequest(
        'POST',
        `/api/v1/policies/${request.providerPolicyId}/cancel`,
        {
          reason: request.reason,
          idempotency_key: request.idempotencyKey,
        }
      );

      return {
        success: true,
        policyId: request.policyId,
        cancelledAt: new Date(),
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

    return {
      quoteId: `quote_${randomUUID()}`,
      provider: this.providerId,
      productType: 'deposit_alternative',
      status: 'success',
      premium: 75,
      premiumFrequency: 'monthly',
      coverageAmount: 3500,
      commissionRate: this.defaultCommissionRate,
      commissionAmount: 7.5,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      providerQuoteId: `jt_renew_${randomUUID().substring(0, 8)}`,
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
        coverage_amount: number;
        premium: number;
        effective_date: string;
        expiration_date: string;
      }>(
        'GET',
        `/api/v1/policies/${providerPolicyId}`
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
        premium: response.premium,
        premiumFrequency: 'monthly',
        commissionRate: this.defaultCommissionRate,
        commissionAmount: response.premium * this.defaultCommissionRate,
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
    const monthlyRent = request.propertyInfo.monthlyRent;
    const isInsurance = request.productType === 'renters_insurance';

    const coverageAmount = isInsurance ? 30000 : monthlyRent * 1.5;
    const premium = isInsurance ? 15 : monthlyRent * 0.03;
    const commissionAmount = premium * this.defaultCommissionRate;

    return {
      quoteId: `quote_${randomUUID()}`,
      provider: this.providerId,
      productType: request.productType,
      status: 'success',
      premium,
      premiumFrequency: 'monthly',
      coverageAmount,
      deductible: isInsurance ? 500 : undefined,
      commissionRate: this.defaultCommissionRate,
      commissionAmount,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      providerQuoteId: `jt_quote_${randomUUID().substring(0, 8)}`,
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
      policyNumber: `JT-${Date.now().toString(36).toUpperCase()}`,
      effectiveDate: now,
      expirationDate,
      coverageAmount: 3500,
      premium: 75,
      premiumFrequency: 'monthly',
      commissionRate: this.defaultCommissionRate,
      commissionAmount: 7.5,
      quoteId: request.quoteId,
      applicantId: '',
      propertyId: '',
      providerPolicyId: `jt_pol_${randomUUID().substring(0, 8)}`,
      createdAt: now,
      updatedAt: now,
    };
  }
}
