/**
 * Assurant Provider Adapter
 *
 * Renters insurance provider integration.
 * Assurant is one of the largest providers of renters insurance,
 * partnering with property managers and landlords.
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
// Assurant Provider
// =============================================================================

export class AssurantProvider extends BasePartnerProvider {
  readonly providerId = 'assurant' as const;
  readonly supportedProducts: PartnerProductType[] = ['renters_insurance'];

  private defaultCommissionRate = 0.15; // 15% commission

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
        contents_coverage: number;
        liability_coverage: number;
        deductible: number;
        partner_commission_rate: number;
        expires_at: string;
        policy_options: {
          replacement_cost: boolean;
          water_backup: boolean;
          identity_theft: boolean;
        };
      }>(
        'POST',
        '/api/v2/partners/quotes',
        {
          applicant: {
            first_name: request.applicantInfo.firstName,
            last_name: request.applicantInfo.lastName,
            email: request.applicantInfo.email,
            date_of_birth: request.applicantInfo.dateOfBirth?.toISOString().split('T')[0],
            phone: request.applicantInfo.phone,
          },
          property: {
            street_address: request.propertyInfo.address,
            city: request.propertyInfo.city,
            state: request.propertyInfo.state,
            postal_code: request.propertyInfo.zip,
            dwelling_type: this.mapPropertyType(request.propertyInfo.propertyType),
            square_footage: request.propertyInfo.squareFeet,
            monthly_rent: request.propertyInfo.monthlyRent,
          },
          coverage_request: {
            contents_coverage: request.coverageAmount || 25000,
            liability_coverage: 100000,
            deductible: 500,
            term_months: request.term || 12,
          },
        }
      );

      const commissionAmount = response.monthly_premium * response.partner_commission_rate;

      return {
        quoteId: `quote_${randomUUID()}`,
        provider: this.providerId,
        productType: 'renters_insurance',
        status: 'success',
        premium: response.monthly_premium,
        premiumFrequency: 'monthly',
        coverageAmount: response.contents_coverage,
        deductible: response.deductible,
        commissionRate: response.partner_commission_rate,
        commissionAmount,
        validUntil: new Date(response.expires_at),
        providerQuoteId: response.quote_id,
        providerData: {
          liability_coverage: response.liability_coverage,
          policy_options: response.policy_options,
        },
      };
    } catch (error) {
      this.log('Quote error', error);
      throw new ProviderError(
        this.providerId,
        'QUOTE_ERROR',
        'Failed to get Assurant quote',
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
          contents: number;
          liability: number;
          deductible: number;
        };
        premium: {
          monthly: number;
          annual: number;
        };
        documents: {
          policy_document_url: string;
          declarations_page_url: string;
          id_card_url: string;
        };
        commission: {
          rate: number;
          monthly_amount: number;
        };
      }>(
        'POST',
        `/api/v2/partners/quotes/${request.providerQuoteId}/bind`,
        {
          payment: {
            method_id: request.paymentMethodId,
            pay_first_month: request.payNow,
          },
          consent: {
            terms_accepted: request.termsAccepted,
            accepted_at: request.termsAcceptedAt.toISOString(),
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
        coverageAmount: response.coverage.contents,
        premium: response.premium.monthly,
        premiumFrequency: 'monthly',
        policyDocumentUrl: response.documents.policy_document_url,
        certificateUrl: response.documents.id_card_url,
        commissionRate: response.commission.rate,
        commissionAmount: response.commission.monthly_amount,
        quoteId: request.quoteId,
        applicantId: '',
        propertyId: '',
        providerPolicyId: response.policy_id,
        providerData: {
          liability_coverage: response.coverage.liability,
          deductible: response.coverage.deductible,
          annual_premium: response.premium.annual,
          declarations_page_url: response.documents.declarations_page_url,
        },
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      this.log('Bind error', error);
      throw new ProviderError(
        this.providerId,
        'BIND_ERROR',
        'Failed to bind Assurant policy',
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
        cancellation_date: string;
        refund_amount?: number;
        proration_details?: {
          days_remaining: number;
          daily_rate: number;
        };
      }>(
        'POST',
        `/api/v2/partners/policies/${request.providerPolicyId}/cancel`,
        {
          reason_code: this.mapCancelReason(request.reason),
          effective_date: request.effectiveDate?.toISOString().split('T')[0],
          request_refund: request.refundRequested,
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
   * Renew a policy.
   */
  async renew(request: RenewRequest): Promise<QuoteResponse> {
    this.log('Renewing policy', { policyId: request.policyId });

    if (!await this.isAvailable()) {
      // Return mock renewal quote
      return {
        quoteId: `quote_${randomUUID()}`,
        provider: this.providerId,
        productType: 'renters_insurance',
        status: 'success',
        premium: 16,
        premiumFrequency: 'monthly',
        coverageAmount: 25000,
        deductible: 500,
        commissionRate: this.defaultCommissionRate,
        commissionAmount: 2.4,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        providerQuoteId: `asr_renew_${randomUUID().substring(0, 8)}`,
      };
    }

    try {
      const response = await this.makeRequest<{
        renewal_quote_id: string;
        monthly_premium: number;
        contents_coverage: number;
        deductible: number;
        commission_rate: number;
        expires_at: string;
      }>(
        'POST',
        `/api/v2/partners/policies/${request.providerPolicyId}/renew`,
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
        premium: response.monthly_premium,
        premiumFrequency: 'monthly',
        coverageAmount: response.contents_coverage,
        deductible: response.deductible,
        commissionRate: response.commission_rate,
        commissionAmount: response.monthly_premium * response.commission_rate,
        validUntil: new Date(response.expires_at),
        providerQuoteId: response.renewal_quote_id,
      };
    } catch (error) {
      throw new ProviderError(
        this.providerId,
        'RENEWAL_ERROR',
        'Failed to get Assurant renewal quote',
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
        coverage: {
          contents: number;
          liability: number;
        };
        premium: { monthly: number };
        commission: { rate: number; amount: number };
      }>(
        'GET',
        `/api/v2/partners/policies/${providerPolicyId}`
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
        coverageAmount: response.coverage.contents,
        premium: response.premium.monthly,
        premiumFrequency: 'monthly',
        commissionRate: response.commission.rate,
        commissionAmount: response.commission.amount,
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
  // Helper Methods
  // =============================================================================

  private mapPropertyType(type: string | undefined): string {
    const typeMap: Record<string, string> = {
      'apartment': 'APT',
      'condo': 'CONDO',
      'townhouse': 'TOWN',
      'house': 'SFH',
      'duplex': 'DUP',
      'studio': 'APT',
    };
    return typeMap[type?.toLowerCase() || 'apartment'] || 'APT';
  }

  private mapCancelReason(reason: string): string {
    const reasonMap: Record<string, string> = {
      'moved_out': 'MOVE_OUT',
      'found_better_rate': 'BETTER_COVERAGE',
      'no_longer_needed': 'NOT_NEEDED',
      'lease_ended': 'LEASE_END',
      'other': 'OTHER',
    };
    return reasonMap[reason.toLowerCase()] || 'OTHER';
  }

  private mapPolicyStatus(status: string): 'active' | 'cancelled' | 'expired' {
    switch (status.toUpperCase()) {
      case 'ACTIVE':
      case 'IN_FORCE':
        return 'active';
      case 'CANCELLED':
      case 'TERMINATED':
        return 'cancelled';
      case 'EXPIRED':
      case 'LAPSED':
        return 'expired';
      default:
        return 'active';
    }
  }

  // =============================================================================
  // Mock Responses
  // =============================================================================

  private getMockQuote(request: QuoteRequest): QuoteResponse {
    // Assurant typically has competitive rates for property manager partnerships
    const basePremium = 14; // $14/month base
    const coverageAmount = request.coverageAmount || 25000;
    // Adjust premium based on coverage (every $10k adds ~$3)
    const coverageMultiplier = Math.max(1, coverageAmount / 25000);
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
      providerQuoteId: `asr_quote_${randomUUID().substring(0, 8)}`,
      providerData: {
        liability_coverage: 100000,
        policy_options: {
          replacement_cost: true,
          water_backup: false,
          identity_theft: false,
        },
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
      policyNumber: `ASR-${Date.now().toString(36).toUpperCase()}`,
      effectiveDate: now,
      expirationDate,
      coverageAmount: 25000,
      premium: 14,
      premiumFrequency: 'monthly',
      commissionRate: this.defaultCommissionRate,
      commissionAmount: 2.1,
      quoteId: request.quoteId,
      applicantId: '',
      propertyId: '',
      providerPolicyId: `asr_pol_${randomUUID().substring(0, 8)}`,
      providerData: {
        liability_coverage: 100000,
        deductible: 500,
        replacement_cost: true,
      },
      createdAt: now,
      updatedAt: now,
    };
  }
}
