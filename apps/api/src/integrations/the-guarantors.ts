/**
 * TheGuarantors Integration
 * Lease guarantee and rent protection services
 */

import { logger, createModuleLogger } from '../lib/logger.js';
import { Result, ok, err } from '../lib/result.js';
import { AppError, ErrorCode } from '../lib/errors.js';
import { env } from '../config/env.js';

const log = createModuleLogger('the-guarantors');

// =============================================================================
// TYPES
// =============================================================================

export interface ApplicantInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string; // YYYY-MM-DD
  ssn?: string;
  annualIncome: number;
  employmentStatus: 'employed' | 'self_employed' | 'student' | 'retired' | 'unemployed';
  creditScore?: number;
}

export interface PropertyInfo {
  address: string;
  unit?: string;
  city: string;
  state: string;
  zipCode: string;
  monthlyRent: number;
  leaseTermMonths: number;
  moveInDate: string; // YYYY-MM-DD
}

export interface LandlordInfo {
  name: string;
  email: string;
  phone?: string;
  companyName?: string;
}

export interface GuaranteeQuote {
  quoteId: string;
  applicantId: string;
  monthlyRent: number;
  coverageAmount: number;
  premiumMonthly: number;
  premiumTotal: number;
  leaseTermMonths: number;
  status: 'pending' | 'approved' | 'declined' | 'expired';
  expiresAt: Date;
  declineReason?: string;
}

export interface GuaranteeCertificate {
  certificateId: string;
  quoteId: string;
  applicantName: string;
  propertyAddress: string;
  coverageAmount: number;
  effectiveDate: Date;
  expirationDate: Date;
  policyNumber: string;
  status: 'active' | 'expired' | 'cancelled' | 'claimed';
  certificateUrl: string;
}

export interface ClaimInfo {
  claimId: string;
  certificateId: string;
  claimAmount: number;
  reason: 'non_payment' | 'early_termination' | 'property_damage';
  status: 'submitted' | 'under_review' | 'approved' | 'denied' | 'paid';
  submittedAt: Date;
  resolvedAt?: Date;
  paidAmount?: number;
  denialReason?: string;
}

export interface CreateQuoteRequest {
  applicant: ApplicantInfo;
  property: PropertyInfo;
  landlord: LandlordInfo;
  products?: ('rent_guarantee' | 'deposit_replacement' | 'lease_guarantee')[];
}

// =============================================================================
// THE GUARANTORS CLIENT
// =============================================================================

class TheGuarantorsClient {
  private apiKey: string;
  private baseUrl: string;
  private partnerId: string;

  constructor() {
    this.apiKey = env.THE_GUARANTORS_API_KEY || '';
    this.partnerId = env.THE_GUARANTORS_PARTNER_ID || '';
    this.baseUrl = env.THE_GUARANTORS_API_URL || 'https://api.theguarantors.com/v1';
  }

  private isConfigured(): boolean {
    return Boolean(this.apiKey && this.partnerId);
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<Result<T, AppError>> {
    if (!this.isConfigured()) {
      log.warn({ endpoint }, 'TheGuarantors not configured');
      return err(new AppError({
        code: ErrorCode.EXTERNAL_SERVICE_ERROR,
        message: 'TheGuarantors integration not configured',
      }));
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Partner-ID': this.partnerId,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        log.error({ status: response.status, data }, 'TheGuarantors API error');
        return err(new AppError({
          code: ErrorCode.EXTERNAL_SERVICE_ERROR,
          message: `TheGuarantors API error: ${(data as { message?: string }).message || response.status}`,
        }));
      }

      return ok(data as T);
    } catch (error) {
      log.error({ error, endpoint }, 'TheGuarantors request failed');
      return err(new AppError({
        code: ErrorCode.EXTERNAL_SERVICE_ERROR,
        message: 'TheGuarantors request failed',
      }));
    }
  }

  // ===========================================================================
  // QUOTES
  // ===========================================================================

  async createQuote(request: CreateQuoteRequest): Promise<Result<GuaranteeQuote, AppError>> {
    log.info({
      applicant: `${request.applicant.firstName} ${request.applicant.lastName}`,
      property: request.property.address,
      rent: request.property.monthlyRent,
    }, 'Creating guarantee quote');

    const result = await this.request<{ quote: Record<string, unknown> }>('POST', '/quotes', {
      applicant: {
        first_name: request.applicant.firstName,
        last_name: request.applicant.lastName,
        email: request.applicant.email,
        phone: request.applicant.phone,
        date_of_birth: request.applicant.dateOfBirth,
        ssn: request.applicant.ssn,
        annual_income: request.applicant.annualIncome,
        employment_status: request.applicant.employmentStatus,
        credit_score: request.applicant.creditScore,
      },
      property: {
        address: request.property.address,
        unit: request.property.unit,
        city: request.property.city,
        state: request.property.state,
        zip_code: request.property.zipCode,
        monthly_rent: request.property.monthlyRent,
        lease_term_months: request.property.leaseTermMonths,
        move_in_date: request.property.moveInDate,
      },
      landlord: {
        name: request.landlord.name,
        email: request.landlord.email,
        phone: request.landlord.phone,
        company_name: request.landlord.companyName,
      },
      products: request.products || ['rent_guarantee'],
    });

    if (result.isErr()) return err(result.error);

    const quote = result.value.quote;
    return ok({
      quoteId: quote.id as string,
      applicantId: quote.applicant_id as string,
      monthlyRent: quote.monthly_rent as number,
      coverageAmount: quote.coverage_amount as number,
      premiumMonthly: quote.premium_monthly as number,
      premiumTotal: quote.premium_total as number,
      leaseTermMonths: quote.lease_term_months as number,
      status: quote.status as GuaranteeQuote['status'],
      expiresAt: new Date(quote.expires_at as string),
      declineReason: quote.decline_reason as string | undefined,
    });
  }

  async getQuote(quoteId: string): Promise<Result<GuaranteeQuote, AppError>> {
    const result = await this.request<{ quote: Record<string, unknown> }>('GET', `/quotes/${quoteId}`);
    if (result.isErr()) return err(result.error);

    const quote = result.value.quote;
    return ok({
      quoteId: quote.id as string,
      applicantId: quote.applicant_id as string,
      monthlyRent: quote.monthly_rent as number,
      coverageAmount: quote.coverage_amount as number,
      premiumMonthly: quote.premium_monthly as number,
      premiumTotal: quote.premium_total as number,
      leaseTermMonths: quote.lease_term_months as number,
      status: quote.status as GuaranteeQuote['status'],
      expiresAt: new Date(quote.expires_at as string),
      declineReason: quote.decline_reason as string | undefined,
    });
  }

  // ===========================================================================
  // CERTIFICATES
  // ===========================================================================

  async purchaseCertificate(quoteId: string): Promise<Result<GuaranteeCertificate, AppError>> {
    log.info({ quoteId }, 'Purchasing guarantee certificate');

    const result = await this.request<{ certificate: Record<string, unknown> }>('POST', `/quotes/${quoteId}/purchase`);
    if (result.isErr()) return err(result.error);

    const cert = result.value.certificate;
    return ok({
      certificateId: cert.id as string,
      quoteId: cert.quote_id as string,
      applicantName: cert.applicant_name as string,
      propertyAddress: cert.property_address as string,
      coverageAmount: cert.coverage_amount as number,
      effectiveDate: new Date(cert.effective_date as string),
      expirationDate: new Date(cert.expiration_date as string),
      policyNumber: cert.policy_number as string,
      status: cert.status as GuaranteeCertificate['status'],
      certificateUrl: cert.certificate_url as string,
    });
  }

  async getCertificate(certificateId: string): Promise<Result<GuaranteeCertificate, AppError>> {
    const result = await this.request<{ certificate: Record<string, unknown> }>('GET', `/certificates/${certificateId}`);
    if (result.isErr()) return err(result.error);

    const cert = result.value.certificate;
    return ok({
      certificateId: cert.id as string,
      quoteId: cert.quote_id as string,
      applicantName: cert.applicant_name as string,
      propertyAddress: cert.property_address as string,
      coverageAmount: cert.coverage_amount as number,
      effectiveDate: new Date(cert.effective_date as string),
      expirationDate: new Date(cert.expiration_date as string),
      policyNumber: cert.policy_number as string,
      status: cert.status as GuaranteeCertificate['status'],
      certificateUrl: cert.certificate_url as string,
    });
  }

  async listCertificates(filters?: {
    status?: GuaranteeCertificate['status'];
    propertyId?: string;
  }): Promise<Result<GuaranteeCertificate[], AppError>> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.propertyId) params.append('property_id', filters.propertyId);

    const endpoint = `/certificates${params.toString() ? `?${params}` : ''}`;
    const result = await this.request<{ certificates: Array<Record<string, unknown>> }>('GET', endpoint);
    if (result.isErr()) return err(result.error);

    return ok(result.value.certificates.map(cert => ({
      certificateId: cert.id as string,
      quoteId: cert.quote_id as string,
      applicantName: cert.applicant_name as string,
      propertyAddress: cert.property_address as string,
      coverageAmount: cert.coverage_amount as number,
      effectiveDate: new Date(cert.effective_date as string),
      expirationDate: new Date(cert.expiration_date as string),
      policyNumber: cert.policy_number as string,
      status: cert.status as GuaranteeCertificate['status'],
      certificateUrl: cert.certificate_url as string,
    })));
  }

  // ===========================================================================
  // CLAIMS
  // ===========================================================================

  async submitClaim(
    certificateId: string,
    amount: number,
    reason: ClaimInfo['reason'],
    documentation: string[] // URLs to supporting documents
  ): Promise<Result<ClaimInfo, AppError>> {
    log.info({ certificateId, amount, reason }, 'Submitting guarantee claim');

    const result = await this.request<{ claim: Record<string, unknown> }>('POST', '/claims', {
      certificate_id: certificateId,
      claim_amount: amount,
      reason,
      documentation_urls: documentation,
    });

    if (result.isErr()) return err(result.error);

    const claim = result.value.claim;
    return ok({
      claimId: claim.id as string,
      certificateId: claim.certificate_id as string,
      claimAmount: claim.claim_amount as number,
      reason: claim.reason as ClaimInfo['reason'],
      status: claim.status as ClaimInfo['status'],
      submittedAt: new Date(claim.submitted_at as string),
      resolvedAt: claim.resolved_at ? new Date(claim.resolved_at as string) : undefined,
      paidAmount: claim.paid_amount as number | undefined,
      denialReason: claim.denial_reason as string | undefined,
    });
  }

  async getClaim(claimId: string): Promise<Result<ClaimInfo, AppError>> {
    const result = await this.request<{ claim: Record<string, unknown> }>('GET', `/claims/${claimId}`);
    if (result.isErr()) return err(result.error);

    const claim = result.value.claim;
    return ok({
      claimId: claim.id as string,
      certificateId: claim.certificate_id as string,
      claimAmount: claim.claim_amount as number,
      reason: claim.reason as ClaimInfo['reason'],
      status: claim.status as ClaimInfo['status'],
      submittedAt: new Date(claim.submitted_at as string),
      resolvedAt: claim.resolved_at ? new Date(claim.resolved_at as string) : undefined,
      paidAmount: claim.paid_amount as number | undefined,
      denialReason: claim.denial_reason as string | undefined,
    });
  }

  async listClaims(certificateId?: string): Promise<Result<ClaimInfo[], AppError>> {
    const endpoint = certificateId ? `/claims?certificate_id=${certificateId}` : '/claims';
    const result = await this.request<{ claims: Array<Record<string, unknown>> }>('GET', endpoint);
    if (result.isErr()) return err(result.error);

    return ok(result.value.claims.map(claim => ({
      claimId: claim.id as string,
      certificateId: claim.certificate_id as string,
      claimAmount: claim.claim_amount as number,
      reason: claim.reason as ClaimInfo['reason'],
      status: claim.status as ClaimInfo['status'],
      submittedAt: new Date(claim.submitted_at as string),
      resolvedAt: claim.resolved_at ? new Date(claim.resolved_at as string) : undefined,
      paidAmount: claim.paid_amount as number | undefined,
      denialReason: claim.denial_reason as string | undefined,
    })));
  }
}

// =============================================================================
// EXPORTED INSTANCE & HELPERS
// =============================================================================

export const theGuarantors = new TheGuarantorsClient();

// Helper functions for common operations
export async function checkGuaranteeEligibility(
  applicant: ApplicantInfo,
  property: PropertyInfo,
  landlord: LandlordInfo
): Promise<Result<{ eligible: boolean; quote?: GuaranteeQuote; reason?: string }, AppError>> {
  const quoteResult = await theGuarantors.createQuote({
    applicant,
    property,
    landlord,
  });

  if (quoteResult.isErr()) {
    return ok({
      eligible: false,
      reason: quoteResult.error.message,
    });
  }

  const quote = quoteResult.value;
  return ok({
    eligible: quote.status === 'approved',
    quote,
    reason: quote.declineReason,
  });
}

export async function processGuaranteePurchase(
  quoteId: string
): Promise<Result<GuaranteeCertificate, AppError>> {
  return theGuarantors.purchaseCertificate(quoteId);
}

export async function fileNonPaymentClaim(
  certificateId: string,
  missedMonths: number,
  monthlyRent: number,
  ledgerUrl: string,
  noticeUrl: string
): Promise<Result<ClaimInfo, AppError>> {
  return theGuarantors.submitClaim(
    certificateId,
    missedMonths * monthlyRent,
    'non_payment',
    [ledgerUrl, noticeUrl]
  );
}
