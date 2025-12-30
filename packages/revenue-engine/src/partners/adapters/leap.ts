/**
 * Leap Provider Adapter
 *
 * Lease guarantor service integration.
 * Leap provides co-signing services with flexible payment options
 * and quick approval times.
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
// Leap-Specific Types
// =============================================================================

interface LeapQuoteRequest {
  applicant: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    dob?: string;
    income: {
      annual_amount?: number;
      source?: 'employment' | 'self_employment' | 'retirement' | 'other';
      verified?: boolean;
    };
  };
  property: {
    street: string;
    city: string;
    state: string;
    zip: string;
    rent_amount: number;
    unit_number?: string;
  };
  lease: {
    start_date?: string;
    end_date?: string;
    months?: number;
  };
  payment_preference?: 'upfront' | 'monthly';
}

interface LeapQuoteResponse {
  id: string;
  decision: 'approved' | 'declined' | 'review';
  pricing: {
    upfront: {
      amount: number;
      discount_percent: number;
    };
    monthly: {
      amount: number;
      total: number;
    };
  };
  coverage: {
    rent_amount: number;
    months: number;
    total_coverage: number;
  };
  commission: {
    rate: number;
    upfront_amount: number;
    monthly_amount: number;
  };
  valid_until: string;
  decline_info?: {
    reason: string;
    code: string;
    appeal_eligible: boolean;
  };
}

interface LeapGuaranteeResponse {
  guarantee_id: string;
  guarantee_number: string;
  status: 'active' | 'pending_payment' | 'cancelled' | 'expired' | 'claim_filed';
  payment_plan: 'upfront' | 'monthly';
  dates: {
    effective: string;
    expiration: string;
    created: string;
  };
  coverage: {
    monthly_rent: number;
    term_months: number;
    max_liability: number;
  };
  payment: {
    total_fee: number;
    amount_paid: number;
    next_payment_date?: string;
    next_payment_amount?: number;
  };
  documents: {
    guarantee_letter_url?: string;
    agreement_url?: string;
  };
}

// =============================================================================
// Leap Provider
// =============================================================================

export class LeapProvider extends BasePartnerProvider {
  readonly providerId = 'leap' as const;
  readonly supportedProducts: PartnerProductType[] = ['guarantor'];

  private defaultCommissionRate = 0.12; // 12% commission

  constructor(config: ProviderConfig) {
    super(config);
  }

  /**
   * Get a quote for lease guarantor coverage.
   * Leap offers both upfront and monthly payment options.
   */
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    this.log('Getting guarantor quote', { applicantId: request.applicantId });

    if (!await this.isAvailable()) {
      return this.getMockQuote(request);
    }

    try {
      const leapRequest: LeapQuoteRequest = {
        applicant: {
          first_name: request.applicantInfo.firstName,
          last_name: request.applicantInfo.lastName,
          email: request.applicantInfo.email,
          phone: request.applicantInfo.phone,
          dob: request.applicantInfo.dateOfBirth?.toISOString().split('T')[0],
          income: {
            annual_amount: request.applicantInfo.annualIncome,
            source: 'employment',
          },
        },
        property: {
          street: request.propertyInfo.address,
          city: request.propertyInfo.city,
          state: request.propertyInfo.state,
          zip: request.propertyInfo.zip,
          rent_amount: request.propertyInfo.monthlyRent,
        },
        lease: {
          start_date: request.startDate?.toISOString().split('T')[0],
          months: request.term || 12,
        },
        payment_preference: 'upfront', // Default to upfront for quote
      };

      const response = await this.makeRequest<LeapQuoteResponse>(
        'POST',
        '/v1/quotes',
        leapRequest
      );

      return this.mapQuoteResponse(response, request);
    } catch (error) {
      this.log('Quote error', error);
      throw new ProviderError(
        this.providerId,
        'QUOTE_ERROR',
        'Failed to get Leap quote',
        error as Error
      );
    }
  }

  /**
   * Bind a quote to create a guarantee.
   */
  async bind(request: BindRequest): Promise<PolicyArtifact> {
    this.log('Binding guarantor quote', { quoteId: request.quoteId });

    if (!await this.isAvailable()) {
      return this.getMockPolicy(request);
    }

    try {
      const paymentPlan = request.additionalInfo?.paymentPlan || 'upfront';

      const response = await this.makeRequest<LeapGuaranteeResponse>(
        'POST',
        `/v1/quotes/${request.providerQuoteId}/activate`,
        {
          payment: {
            plan: paymentPlan,
            method_token: request.paymentMethodId,
            process_immediately: request.payNow,
          },
          consent: {
            terms_accepted: request.termsAccepted,
            timestamp: request.termsAcceptedAt.toISOString(),
          },
          idempotency_key: request.idempotencyKey,
        }
      );

      return this.mapGuaranteeResponse(response, request);
    } catch (error) {
      this.log('Bind error', error);
      throw new ProviderError(
        this.providerId,
        'BIND_ERROR',
        'Failed to activate Leap guarantee',
        error as Error
      );
    }
  }

  /**
   * Cancel a guarantee.
   */
  async cancel(request: CancelRequest): Promise<CancelResponse> {
    this.log('Cancelling guarantee', { policyId: request.policyId });

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
          eligible: boolean;
          amount?: number;
          reason?: string;
        };
      }>(
        'POST',
        `/v1/guarantees/${request.providerPolicyId}/cancel`,
        {
          reason: request.reason,
          requested_date: request.effectiveDate?.toISOString().split('T')[0],
          idempotency_key: request.idempotencyKey,
        }
      );

      return {
        success: response.success,
        policyId: request.policyId,
        cancelledAt: new Date(response.effective_date),
        refundAmount: response.refund.amount,
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
   * Renew a guarantee for lease renewal.
   */
  async renew(request: RenewRequest): Promise<QuoteResponse> {
    this.log('Renewing guarantee', { policyId: request.policyId });

    if (!await this.isAvailable()) {
      return this.getMockRenewalQuote();
    }

    try {
      const response = await this.makeRequest<LeapQuoteResponse>(
        'POST',
        `/v1/guarantees/${request.providerPolicyId}/renew`,
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
        premium: response.pricing.upfront.amount,
        premiumFrequency: 'one_time',
        coverageAmount: response.coverage.total_coverage,
        commissionRate: response.commission.rate,
        commissionAmount: response.commission.upfront_amount,
        validUntil: new Date(response.valid_until),
        providerQuoteId: response.id,
        providerData: {
          monthly_option: response.pricing.monthly,
          renewal_discount: true,
        },
      };
    } catch (error) {
      throw new ProviderError(
        this.providerId,
        'RENEWAL_ERROR',
        'Failed to get Leap renewal quote',
        error as Error
      );
    }
  }

  /**
   * Get guarantee status.
   */
  async getPolicyStatus(providerPolicyId: string): Promise<PolicyArtifact | null> {
    this.log('Getting guarantee status', { providerPolicyId });

    if (!await this.isAvailable()) {
      return null;
    }

    try {
      const response = await this.makeRequest<LeapGuaranteeResponse>(
        'GET',
        `/v1/guarantees/${providerPolicyId}`
      );

      const now = new Date();
      const statusMap: Record<string, PolicyArtifact['status']> = {
        active: 'active',
        pending_payment: 'pending_bind',
        cancelled: 'cancelled',
        expired: 'expired',
        claim_filed: 'active', // Still active during claim process
      };

      return {
        policyId: `pol_${randomUUID()}`,
        provider: this.providerId,
        productType: 'guarantor',
        status: statusMap[response.status] || 'active',
        policyNumber: response.guarantee_number,
        effectiveDate: new Date(response.dates.effective),
        expirationDate: new Date(response.dates.expiration),
        coverageAmount: response.coverage.max_liability,
        premium: response.payment.total_fee,
        premiumFrequency: response.payment_plan === 'monthly' ? 'monthly' : 'one_time',
        policyDocumentUrl: response.documents.agreement_url,
        certificateUrl: response.documents.guarantee_letter_url,
        commissionRate: this.defaultCommissionRate,
        commissionAmount: response.payment.total_fee * this.defaultCommissionRate,
        quoteId: '',
        applicantId: '',
        propertyId: '',
        providerPolicyId: response.guarantee_id,
        providerData: {
          payment_plan: response.payment_plan,
          amount_paid: response.payment.amount_paid,
          next_payment: response.payment.next_payment_date ? {
            date: response.payment.next_payment_date,
            amount: response.payment.next_payment_amount,
          } : undefined,
        },
        createdAt: new Date(response.dates.created),
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
    response: LeapQuoteResponse,
    _request: QuoteRequest
  ): QuoteResponse {
    if (response.decision === 'declined') {
      throw new QuoteDeclinedError(
        this.providerId,
        response.decline_info?.reason || 'Application declined',
        response.decline_info?.code
      );
    }

    const status = response.decision === 'approved' ? 'success' : 'pending_review';

    return {
      quoteId: `quote_${randomUUID()}`,
      provider: this.providerId,
      productType: 'guarantor',
      status,
      premium: response.pricing.upfront.amount,
      premiumFrequency: 'one_time',
      coverageAmount: response.coverage.total_coverage,
      commissionRate: response.commission.rate,
      commissionAmount: response.commission.upfront_amount,
      validUntil: new Date(response.valid_until),
      providerQuoteId: response.id,
      providerData: {
        monthly_pricing: response.pricing.monthly,
        upfront_discount: response.pricing.upfront.discount_percent,
        appeal_eligible: response.decline_info?.appeal_eligible,
      },
    };
  }

  private mapGuaranteeResponse(
    response: LeapGuaranteeResponse,
    request: BindRequest
  ): PolicyArtifact {
    const now = new Date();
    const premiumFrequency = response.payment_plan === 'monthly' ? 'monthly' : 'one_time';

    return {
      policyId: `pol_${randomUUID()}`,
      provider: this.providerId,
      productType: 'guarantor',
      status: response.status === 'active' ? 'active' : 'pending_bind',
      policyNumber: response.guarantee_number,
      effectiveDate: new Date(response.dates.effective),
      expirationDate: new Date(response.dates.expiration),
      coverageAmount: response.coverage.max_liability,
      premium: response.payment.total_fee,
      premiumFrequency,
      policyDocumentUrl: response.documents.agreement_url,
      certificateUrl: response.documents.guarantee_letter_url,
      commissionRate: this.defaultCommissionRate,
      commissionAmount: response.payment.total_fee * this.defaultCommissionRate,
      quoteId: request.quoteId,
      applicantId: '',
      propertyId: '',
      providerPolicyId: response.guarantee_id,
      providerData: {
        payment_plan: response.payment_plan,
        monthly_rent: response.coverage.monthly_rent,
        term_months: response.coverage.term_months,
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

    // Leap typically charges 5-8% of annual rent upfront
    // or ~1% of monthly rent per month
    const annualRent = monthlyRent * 12;
    const upfrontFeePercent = 0.065; // 6.5% of annual rent
    const upfrontPremium = Math.round(annualRent * upfrontFeePercent * 100) / 100;
    const monthlyPremium = Math.round(monthlyRent * 0.012 * 100) / 100; // 1.2% monthly

    const maxCoverage = monthlyRent * leaseMonths;
    const commissionAmount = upfrontPremium * this.defaultCommissionRate;

    return {
      quoteId: `quote_${randomUUID()}`,
      provider: this.providerId,
      productType: 'guarantor',
      status: 'success',
      premium: upfrontPremium,
      premiumFrequency: 'one_time',
      coverageAmount: maxCoverage,
      commissionRate: this.defaultCommissionRate,
      commissionAmount,
      validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      providerQuoteId: `leap_quote_${randomUUID().substring(0, 8)}`,
      providerData: {
        monthly_pricing: {
          amount: monthlyPremium,
          total: monthlyPremium * leaseMonths,
        },
        upfront_discount: 10, // 10% discount for upfront payment
        annual_rent: annualRent,
        fee_percentage: upfrontFeePercent * 100,
      },
    };
  }

  private getMockPolicy(request: BindRequest): PolicyArtifact {
    const now = new Date();
    const expirationDate = new Date(now);
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);

    const monthlyRent = 2500;
    const annualRent = monthlyRent * 12;
    const premium = annualRent * 0.065;
    const maxCoverage = annualRent;

    return {
      policyId: `pol_${randomUUID()}`,
      provider: this.providerId,
      productType: 'guarantor',
      status: 'active',
      policyNumber: `LEAP-${Date.now().toString(36).toUpperCase()}`,
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
      providerPolicyId: `leap_guarantee_${randomUUID().substring(0, 8)}`,
      providerData: {
        payment_plan: 'upfront',
        monthly_rent: monthlyRent,
        term_months: 12,
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  private getMockRenewalQuote(): QuoteResponse {
    const monthlyRent = 2500;
    const annualRent = monthlyRent * 12;
    const premium = annualRent * 0.055; // 5.5% renewal discount
    const maxCoverage = annualRent;

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
      providerQuoteId: `leap_renew_${randomUUID().substring(0, 8)}`,
      providerData: {
        renewal_discount: true,
        discount_percent: 15,
      },
    };
  }
}
