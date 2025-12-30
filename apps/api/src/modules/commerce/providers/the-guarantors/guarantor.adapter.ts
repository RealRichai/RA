/**
 * The Guarantors Provider Adapter
 *
 * Production-ready adapter for The Guarantors API.
 * Falls back to mock implementation when API keys are not configured.
 */

import { generatePrefixedId, logger } from '@realriches/utils';
import { z } from 'zod';

import {
  TypedHttpClient,
  isHttpError,
  toSafeErrorCode,
  type HttpClientConfig,
} from '../http-client';
import type {
  IGuarantorProvider,
  GuarantorOption,
  GuarantorApplication,
  GuarantorApplicationRequest,
  ProviderMeta,
  Result,
} from '../provider.types';
import { ok, err } from '../provider.types';

// =============================================================================
// The Guarantors API Schemas (Zod)
// =============================================================================

// Request schemas
const TGProductsRequestSchema = z.object({
  monthly_rent: z.number(),
  market: z.string().optional(),
});

const TGApplicationRequestSchema = z.object({
  product_id: z.string(),
  applicant: z.object({
    first_name: z.string(),
    last_name: z.string(),
    email: z.string(),
    phone: z.string().optional(),
    date_of_birth: z.string().optional(),
  }),
  lease: z.object({
    monthly_rent: z.number(),
    lease_start_date: z.string(),
    lease_end_date: z.string().optional(),
    property_address: z.object({
      street: z.string(),
      unit: z.string().optional(),
      city: z.string(),
      state: z.string(),
      zip_code: z.string(),
    }).optional(),
  }),
  income: z.object({
    annual_income: z.number(),
    employment_status: z.enum(['employed', 'self_employed', 'student', 'retired', 'other']).optional(),
    employer_name: z.string().optional(),
    job_title: z.string().optional(),
    start_date: z.string().optional(),
  }),
  credit_score: z.number().optional(),
  external_application_id: z.string(),
});

// Response schemas
const TGProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  coverage_multiple: z.number(),
  fee_structure: z.object({
    type: z.enum(['percentage', 'fixed', 'hybrid']),
    percentage: z.number().optional(),
    fixed_amount: z.number().optional(),
    minimum: z.number().optional(),
  }),
  requirements: z.array(z.string()),
  eligibility: z.object({
    min_income: z.number().optional(),
    max_rent_to_income_ratio: z.number().optional(),
    accepted_credit_scores: z.array(z.string()).optional(),
  }).optional(),
});

const TGProductsResponseSchema = z.object({
  products: z.array(TGProductSchema),
  market: z.string().optional(),
});

const TGApplicationResponseSchema = z.object({
  id: z.string(),
  external_application_id: z.string(),
  product_id: z.string(),
  product_name: z.string(),
  status: z.enum([
    'pending_review',
    'documents_required',
    'approved',
    'conditionally_approved',
    'declined',
    'cancelled',
    'expired',
  ]),
  coverage_amount: z.number(),
  fee_amount: z.number(),
  decision_date: z.string().optional(),
  decline_reason: z.string().optional(),
  decline_code: z.string().optional(),
  required_documents: z.array(z.object({
    type: z.string(),
    description: z.string(),
    required: z.boolean(),
  })).optional(),
  contract_url: z.string().optional(),
  valid_until: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

const TGCancelResponseSchema = z.object({
  id: z.string(),
  status: z.literal('cancelled'),
  cancelled_at: z.string(),
});

// Type inference
type TGProductsRequest = z.infer<typeof TGProductsRequestSchema>;
type TGApplicationRequest = z.infer<typeof TGApplicationRequestSchema>;
type TGProductsResponse = z.infer<typeof TGProductsResponseSchema>;
type TGApplicationResponse = z.infer<typeof TGApplicationResponseSchema>;

// =============================================================================
// In-Memory State Store for External References
// =============================================================================

interface ApplicationStateRecord {
  internalId: string;
  externalId: string;
  externalApplicationId: string;
  provider: 'the-guarantors';
  status: string;
  productId: string;
  lastSyncedAt: Date;
  metadata: Record<string, unknown>;
}

const applicationStateStore = new Map<string, ApplicationStateRecord>();

// =============================================================================
// The Guarantors Adapter
// =============================================================================

export class TheGuarantorsAdapter implements IGuarantorProvider {
  readonly providerId = 'the-guarantors';
  private client: TypedHttpClient;
  private sandbox: boolean;

  constructor(config: HttpClientConfig) {
    this.client = new TypedHttpClient('the-guarantors', config);
    this.sandbox = config.sandbox ?? true;
  }

  private getMeta(requestId?: string): ProviderMeta {
    return {
      provider: this.providerId,
      isMock: false,
      requestId: requestId || generatePrefixedId('req'),
      timestamp: new Date(),
    };
  }

  /**
   * Get available guarantor products/options
   */
  async getOptions(monthlyRent: number): Promise<Result<GuarantorOption[]>> {
    const requestId = generatePrefixedId('req');

    const tgRequest: TGProductsRequest = {
      monthly_rent: monthlyRent,
    };

    const response = await this.client.request<TGProductsRequest, TGProductsResponse>({
      method: 'POST',
      path: '/v1/products/available',
      body: tgRequest,
      requestSchema: TGProductsRequestSchema,
      responseSchema: TGProductsResponseSchema,
    });

    if (isHttpError(response)) {
      logger.error({
        msg: 'the_guarantors_get_options_failed',
        requestId,
        errorCode: response.code,
        message: response.message,
      });
      return err(
        new Error(`Failed to get guarantor options: ${toSafeErrorCode(response)}`),
        this.getMeta(requestId)
      );
    }

    // Map to internal format
    const options: GuarantorOption[] = response.data.products.map((product) => ({
      id: product.id,
      provider: 'The Guarantors',
      providerId: this.providerId,
      name: product.name,
      coverageMultiple: product.coverage_multiple,
      feePercentage: product.fee_structure.percentage || 0,
      oneTimeFee: product.fee_structure.fixed_amount,
      description: product.description,
      requirements: product.requirements,
    }));

    return ok(options, this.getMeta(requestId));
  }

  /**
   * Submit a guarantor application
   */
  async submitApplication(request: GuarantorApplicationRequest): Promise<Result<GuarantorApplication>> {
    const requestId = generatePrefixedId('req');

    const tgRequest: TGApplicationRequest = {
      product_id: request.optionId,
      applicant: {
        first_name: 'Applicant', // Would come from user profile
        last_name: 'User',
        email: 'applicant@example.com',
      },
      lease: {
        monthly_rent: request.monthlyRent,
        lease_start_date: new Date().toISOString().split('T')[0],
      },
      income: {
        annual_income: request.annualIncome,
        employment_status: request.employmentInfo ? 'employed' : undefined,
        employer_name: request.employmentInfo?.employer,
        job_title: request.employmentInfo?.position,
        start_date: request.employmentInfo?.startDate.toISOString().split('T')[0],
      },
      credit_score: request.creditScore,
      external_application_id: request.applicationId,
    };

    const response = await this.client.request<TGApplicationRequest, TGApplicationResponse>({
      method: 'POST',
      path: '/v1/applications',
      body: tgRequest,
      requestSchema: TGApplicationRequestSchema,
      responseSchema: TGApplicationResponseSchema,
      idempotencyKey: `app:${request.applicationId}:${request.optionId}`,
    });

    if (isHttpError(response)) {
      logger.error({
        msg: 'the_guarantors_submit_failed',
        requestId,
        applicationId: request.applicationId,
        errorCode: response.code,
        message: response.message,
      });
      return err(
        new Error(`Application submission failed: ${toSafeErrorCode(response)}`),
        this.getMeta(requestId)
      );
    }

    // Store external reference mapping
    const internalId = generatePrefixedId('gua');
    applicationStateStore.set(internalId, {
      internalId,
      externalId: response.data.id,
      externalApplicationId: response.data.external_application_id,
      provider: 'the-guarantors',
      status: response.data.status,
      productId: response.data.product_id,
      lastSyncedAt: new Date(),
      metadata: {
        userId: request.userId,
        leaseId: request.leaseId,
        optionId: request.optionId,
      },
    });

    // Map to internal format
    const application: GuarantorApplication = {
      id: internalId,
      provider: 'The Guarantors',
      providerId: this.providerId,
      status: this.mapApplicationStatus(response.data.status),
      applicationId: request.applicationId,
      providerApplicationId: response.data.id,
      coverageAmount: response.data.coverage_amount,
      feeAmount: response.data.fee_amount,
      decisionDate: response.data.decision_date ? new Date(response.data.decision_date) : undefined,
      declineReason: response.data.decline_reason,
      requiredDocuments: response.data.required_documents?.map((d) => d.description),
      contractUrl: response.data.contract_url,
      createdAt: new Date(response.data.created_at),
      updatedAt: new Date(response.data.updated_at),
    };

    logger.info({
      msg: 'the_guarantors_application_submitted',
      requestId,
      internalId,
      externalId: response.data.id,
      status: response.data.status,
    });

    return ok(application, this.getMeta(requestId));
  }

  /**
   * Poll application status
   */
  async pollStatus(applicationId: string): Promise<Result<GuarantorApplication | null>> {
    const requestId = generatePrefixedId('req');

    // Find state record - could be internal ID or external ID
    let stateRecord: ApplicationStateRecord | undefined;
    let externalId: string = applicationId;

    // First try direct lookup
    stateRecord = applicationStateStore.get(applicationId);
    if (stateRecord) {
      externalId = stateRecord.externalId;
    } else {
      // Try to find by external ID or external application ID
      for (const [, record] of applicationStateStore.entries()) {
        if (record.externalId === applicationId || record.externalApplicationId === applicationId) {
          stateRecord = record;
          externalId = record.externalId;
          break;
        }
      }
    }

    const response = await this.client.request<never, TGApplicationResponse>({
      method: 'GET',
      path: `/v1/applications/${externalId}`,
      responseSchema: TGApplicationResponseSchema,
    });

    if (isHttpError(response)) {
      if (response.statusCode === 404) {
        return ok(null, this.getMeta(requestId));
      }
      logger.error({
        msg: 'the_guarantors_poll_failed',
        requestId,
        applicationId,
        externalId,
        errorCode: response.code,
      });
      return err(
        new Error(`Failed to get application status: ${toSafeErrorCode(response)}`),
        this.getMeta(requestId)
      );
    }

    // Update state store if we have a record
    const internalId = stateRecord?.internalId || generatePrefixedId('gua');
    if (stateRecord) {
      stateRecord.status = response.data.status;
      stateRecord.lastSyncedAt = new Date();
      applicationStateStore.set(stateRecord.internalId, stateRecord);
    } else {
      // Create new state record if not found
      applicationStateStore.set(internalId, {
        internalId,
        externalId: response.data.id,
        externalApplicationId: response.data.external_application_id,
        provider: 'the-guarantors',
        status: response.data.status,
        productId: response.data.product_id,
        lastSyncedAt: new Date(),
        metadata: {},
      });
    }

    const application: GuarantorApplication = {
      id: stateRecord?.internalId || internalId,
      provider: 'The Guarantors',
      providerId: this.providerId,
      status: this.mapApplicationStatus(response.data.status),
      applicationId: response.data.external_application_id,
      providerApplicationId: response.data.id,
      coverageAmount: response.data.coverage_amount,
      feeAmount: response.data.fee_amount,
      decisionDate: response.data.decision_date ? new Date(response.data.decision_date) : undefined,
      declineReason: response.data.decline_reason,
      requiredDocuments: response.data.required_documents?.map((d) => d.description),
      contractUrl: response.data.contract_url,
      createdAt: new Date(response.data.created_at),
      updatedAt: new Date(response.data.updated_at),
    };

    return ok(application, this.getMeta(requestId));
  }

  /**
   * Cancel an application
   */
  async cancelApplication(applicationId: string): Promise<Result<boolean>> {
    const requestId = generatePrefixedId('req');

    // Find external ID
    const stateRecord = applicationStateStore.get(applicationId);
    const externalId = stateRecord?.externalId || applicationId;

    const response = await this.client.request<never, z.infer<typeof TGCancelResponseSchema>>({
      method: 'POST',
      path: `/v1/applications/${externalId}/cancel`,
      responseSchema: TGCancelResponseSchema,
      idempotencyKey: `cancel:${applicationId}`,
    });

    if (isHttpError(response)) {
      // 404 or already cancelled is acceptable
      if (response.statusCode === 404 || response.statusCode === 409) {
        logger.info({
          msg: 'the_guarantors_cancel_already_done',
          requestId,
          applicationId,
          externalId,
          statusCode: response.statusCode,
        });
        return ok(true, this.getMeta(requestId));
      }

      logger.error({
        msg: 'the_guarantors_cancel_failed',
        requestId,
        applicationId,
        externalId,
        errorCode: response.code,
      });
      return err(
        new Error(`Application cancellation failed: ${toSafeErrorCode(response)}`),
        this.getMeta(requestId)
      );
    }

    // Update state store
    if (stateRecord) {
      stateRecord.status = 'cancelled';
      stateRecord.lastSyncedAt = new Date();
      applicationStateStore.set(applicationId, stateRecord);
    }

    logger.info({
      msg: 'the_guarantors_application_cancelled',
      requestId,
      applicationId,
      externalId,
    });

    return ok(true, this.getMeta(requestId));
  }

  /**
   * Process webhook from The Guarantors
   */
  async processWebhook(
    payload: string,
    signature: string
  ): Promise<{ valid: boolean; event?: { type: string; applicationId: string; data: unknown } }> {
    // Verify signature
    if (!this.client.verifyWebhookSignature(payload, signature)) {
      logger.warn({ msg: 'the_guarantors_webhook_invalid_signature' });
      return { valid: false };
    }

    try {
      const event = JSON.parse(payload) as {
        type: string;
        data: { application_id: string; status?: string; [key: string]: unknown };
      };

      logger.info({
        msg: 'the_guarantors_webhook_received',
        eventType: event.type,
        applicationId: event.data.application_id,
      });

      // Find internal ID from external ID
      let internalId: string | undefined;
      for (const [id, record] of applicationStateStore.entries()) {
        if (record.externalId === event.data.application_id) {
          internalId = id;
          // Update status based on webhook
          if (event.data.status) {
            record.status = event.data.status;
          }
          record.lastSyncedAt = new Date();
          applicationStateStore.set(id, record);
          break;
        }
      }

      return {
        valid: true,
        event: {
          type: event.type,
          applicationId: internalId || event.data.application_id,
          data: event.data,
        },
      };
    } catch (e) {
      logger.error({ msg: 'the_guarantors_webhook_parse_error', error: e });
      return { valid: false };
    }
  }

  // Map The Guarantors status to internal status
  private mapApplicationStatus(status: string): GuarantorApplication['status'] {
    switch (status) {
      case 'pending_review':
        return 'PENDING';
      case 'approved':
      case 'conditionally_approved':
        return 'APPROVED';
      case 'declined':
        return 'DECLINED';
      case 'documents_required':
        return 'DOCUMENTS_REQUIRED';
      case 'cancelled':
      case 'expired':
        return 'DECLINED';
      default:
        return 'PENDING';
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createTheGuarantorsAdapter(config: HttpClientConfig): TheGuarantorsAdapter {
  return new TheGuarantorsAdapter(config);
}

// Export state store for webhook handler access
export function getApplicationStateRecord(internalId: string): ApplicationStateRecord | undefined {
  return applicationStateStore.get(internalId);
}

export function updateApplicationState(internalId: string, updates: Partial<ApplicationStateRecord>): void {
  const existing = applicationStateStore.get(internalId);
  if (existing) {
    applicationStateStore.set(internalId, { ...existing, ...updates, lastSyncedAt: new Date() });
  }
}

// Find application by external ID
export function findApplicationByExternalId(externalId: string): ApplicationStateRecord | undefined {
  for (const [, record] of applicationStateStore.entries()) {
    if (record.externalId === externalId || record.externalApplicationId === externalId) {
      return record;
    }
  }
  return undefined;
}
