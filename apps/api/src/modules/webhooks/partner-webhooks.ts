/**
 * Partner Webhook Routes
 *
 * Handles incoming webhooks from partner providers (LeaseLock, Rhino, etc.).
 * These endpoints do NOT require authentication - they use signature verification instead.
 *
 * Partner Policy Lifecycle:
 * - policy.bound -> active
 * - policy.cancelled -> cancelled
 * - policy.renewed -> active (new term)
 * - policy.expired -> expired
 * - claim.created -> active (with claim)
 * - claim.resolved -> active
 */

import { createHmac, timingSafeEqual } from 'crypto';

import { prisma, type Prisma } from '@realriches/database';
import type { PartnerProvider } from '@realriches/revenue-engine';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// Import to get type augmentation for rawBody
import '../../plugins/raw-body';

// =============================================================================
// Type Helpers
// =============================================================================

/**
 * Convert Record<string, unknown> to Prisma.JsonValue
 */
function toJsonValue(data: Record<string, unknown>): Prisma.JsonValue {
  return data as Prisma.JsonValue;
}

// =============================================================================
// Webhook Event Types
// =============================================================================

interface PartnerWebhookEvent {
  id: string;
  type: PartnerEventType;
  provider: PartnerProvider;
  timestamp: string;
  data: Record<string, unknown>;
}

type PartnerEventType =
  | 'policy.bound'
  | 'policy.cancelled'
  | 'policy.renewed'
  | 'policy.expired'
  | 'policy.updated'
  | 'claim.created'
  | 'claim.updated'
  | 'claim.resolved'
  | 'payment.completed'
  | 'payment.failed'
  | 'document.generated';

type PolicyStatus = 'active' | 'pending_bind' | 'cancelled' | 'expired' | 'lapsed';

// =============================================================================
// Provider Webhook Secrets
// =============================================================================

function getProviderWebhookSecret(provider: PartnerProvider): string | undefined {
  const secretMap: Partial<Record<PartnerProvider, string | undefined>> = {
    leaselock: process.env.LEASELOCK_WEBHOOK_SECRET,
    rhino: process.env.RHINO_WEBHOOK_SECRET,
    jetty: process.env.JETTY_WEBHOOK_SECRET,
    lemonade: process.env.LEMONADE_WEBHOOK_SECRET,
    assurant: process.env.ASSURANT_WEBHOOK_SECRET,
    sure: process.env.SURE_WEBHOOK_SECRET,
    insurent: process.env.INSURENT_WEBHOOK_SECRET,
    leap: process.env.LEAP_WEBHOOK_SECRET,
    state_farm: process.env.STATE_FARM_WEBHOOK_SECRET,
    the_guarantors: process.env.THE_GUARANTORS_WEBHOOK_SECRET,
    rhino_guarantor: process.env.RHINO_GUARANTOR_WEBHOOK_SECRET,
    conedison: process.env.CONEDISON_WEBHOOK_SECRET,
    national_grid: process.env.NATIONAL_GRID_WEBHOOK_SECRET,
    spectrum: process.env.SPECTRUM_WEBHOOK_SECRET,
    verizon: process.env.VERIZON_WEBHOOK_SECRET,
    two_men_truck: process.env.TWO_MEN_TRUCK_WEBHOOK_SECRET,
    pods: process.env.PODS_WEBHOOK_SECRET,
    uhaul: process.env.UHAUL_WEBHOOK_SECRET,
    internal: undefined,
  };
  return secretMap[provider];
}

// =============================================================================
// Signature Verification
// =============================================================================

/**
 * Verify webhook signature using HMAC-SHA256.
 * Each provider may have slightly different signature schemes.
 */
function verifySignature(
  provider: PartnerProvider,
  payload: Buffer,
  signature: string,
  secret: string
): boolean {
  try {
    // Most providers use timestamp + payload for signing
    // Format: t=timestamp,v1=signature
    const parts = signature.split(',');
    const timestampPart = parts.find((p) => p.startsWith('t='));
    const signaturePart = parts.find((p) => p.startsWith('v1='));

    if (!signaturePart) {
      // Simple signature format (just the hash)
      const expectedSignature = createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      return timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    }

    // Stripe-style signature with timestamp
    const timestamp = timestampPart?.split('=')[1];
    const providedSignature = signaturePart.split('=')[1];

    if (!timestamp || !providedSignature) return false;

    // Check timestamp is within tolerance (5 minutes)
    const tolerance = 300; // seconds
    const now = Math.floor(Date.now() / 1000);
    const eventTime = parseInt(timestamp, 10);

    if (Math.abs(now - eventTime) > tolerance) {
      return false;
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload.toString('utf8')}`;
    const expectedSignature = createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    return timingSafeEqual(
      Buffer.from(providedSignature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

// =============================================================================
// Sensitive Field Redaction
// =============================================================================

const WEBHOOK_REDACTED_FIELDS = [
  'ssn',
  'social_security',
  'bank_account',
  'routing_number',
  'credit_card',
  'payment_method',
  'date_of_birth',
  'dob',
] as const;

function redactWebhookPayload(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(redactWebhookPayload);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (WEBHOOK_REDACTED_FIELDS.some((f) => lowerKey.includes(f))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactWebhookPayload(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// =============================================================================
// Webhook Routes
// =============================================================================

export async function partnerWebhookRoutes(app: FastifyInstance): Promise<void> {
  const providers: PartnerProvider[] = [
    'leaselock',
    'rhino',
    'jetty',
    'lemonade',
    'assurant',
    'sure',
    'insurent',
    'leap',
  ];

  // Register a webhook endpoint for each provider
  for (const provider of providers) {
    app.post(
      `/${provider}`,
      {
        schema: {
          description: `${provider} webhook endpoint`,
          tags: ['Webhooks'],
        },
        config: {
          rawBody: true,
        },
      },
      createWebhookHandler(provider)
    );
  }

  // Health check endpoint for webhook status
  app.get(
    '/status',
    {
      schema: {
        description: 'Partner webhook status',
        tags: ['Webhooks'],
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const status: Record<string, boolean> = {};
      for (const provider of providers) {
        status[provider] = !!getProviderWebhookSecret(provider);
      }
      return reply.status(200).send({ configured: status });
    }
  );
}

/**
 * Create a webhook handler for a specific provider.
 */
function createWebhookHandler(provider: PartnerProvider) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const webhookSecret = getProviderWebhookSecret(provider);

    // Check if provider webhook is configured
    if (!webhookSecret) {
      request.log.warn({ provider }, 'Partner webhook received but not configured');
      // In development, process without verification
      if (process.env.NODE_ENV === 'production') {
        return reply.status(503).send({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: `${provider} webhook not configured` },
        });
      }
    }

    // Get signature header (providers use different header names)
    const signatureHeader = getSignatureHeader(request, provider);
    if (!signatureHeader && webhookSecret && process.env.NODE_ENV === 'production') {
      request.log.warn({ provider }, 'Missing webhook signature header');
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_SIGNATURE', message: 'Missing signature header' },
      });
    }

    // Get raw body for signature verification
    const rawBody = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      request.log.error({ provider }, 'Raw body not available for webhook verification');
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'Request body not available' },
      });
    }

    // Verify signature if configured
    if (webhookSecret && signatureHeader) {
      const isValid = verifySignature(provider, rawBody, signatureHeader, webhookSecret);
      if (!isValid) {
        request.log.warn({ provider }, 'Invalid webhook signature');
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Signature verification failed' },
        });
      }
    }

    try {
      // Parse the event
      const eventData = JSON.parse(rawBody.toString('utf8')) as PartnerWebhookEvent;

      // Log received event (redacted)
      request.log.info(
        {
          provider,
          eventId: eventData.id,
          eventType: eventData.type,
          data: redactWebhookPayload(eventData.data),
        },
        'Partner webhook received'
      );

      // Process the event
      const result = await processPartnerWebhookEvent(provider, eventData, request);

      if (!result.success) {
        request.log.error(
          { provider, eventId: eventData.id, error: result.error },
          'Partner webhook processing failed'
        );
        return reply.status(400).send({
          success: false,
          error: { code: 'PROCESSING_FAILED', message: result.error },
        });
      }

      request.log.info(
        { provider, eventId: eventData.id, policyId: result.policyId },
        'Partner webhook processed successfully'
      );

      return reply.status(200).send({
        success: true,
        received: true,
        eventId: eventData.id,
        policyId: result.policyId,
      });
    } catch (error) {
      request.log.error({ provider, error }, 'Partner webhook error');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Webhook processing error' },
      });
    }
  };
}

/**
 * Get the signature header for a provider (different providers use different headers).
 */
function getSignatureHeader(request: FastifyRequest, provider: PartnerProvider): string | undefined {
  const headerMap: Partial<Record<PartnerProvider, string>> = {
    leaselock: 'x-leaselock-signature',
    rhino: 'x-rhino-signature',
    jetty: 'x-jetty-signature',
    lemonade: 'x-lemonade-signature',
    assurant: 'x-assurant-signature',
    sure: 'x-sure-signature',
    insurent: 'x-insurent-signature',
    leap: 'x-leap-signature',
    state_farm: 'x-statefarm-signature',
    the_guarantors: 'x-guarantors-signature',
    rhino_guarantor: 'x-rhino-signature',
    conedison: 'x-conedison-signature',
    national_grid: 'x-nationalgrid-signature',
    spectrum: 'x-spectrum-signature',
    verizon: 'x-verizon-signature',
    two_men_truck: 'x-twomen-signature',
    pods: 'x-pods-signature',
    uhaul: 'x-uhaul-signature',
  };

  const headerName = headerMap[provider];
  if (!headerName) return undefined;

  const header = request.headers[headerName];
  return typeof header === 'string' ? header : undefined;
}

// =============================================================================
// Event Processing
// =============================================================================

interface WebhookProcessResult {
  success: boolean;
  policyId?: string;
  error?: string;
}

/**
 * Process a partner webhook event.
 */
async function processPartnerWebhookEvent(
  provider: PartnerProvider,
  event: PartnerWebhookEvent,
  request: FastifyRequest
): Promise<WebhookProcessResult> {
  const { type, data } = event;

  switch (type) {
    case 'policy.bound':
      return handlePolicyBound(provider, data, request);

    case 'policy.cancelled':
      return handlePolicyCancelled(provider, data, request);

    case 'policy.renewed':
      return handlePolicyRenewed(provider, data, request);

    case 'policy.expired':
      return handlePolicyExpired(provider, data, request);

    case 'policy.updated':
      return handlePolicyUpdated(provider, data, request);

    case 'claim.created':
      return handleClaimCreated(provider, data, request);

    case 'claim.resolved':
      return handleClaimResolved(provider, data, request);

    case 'document.generated':
      return handleDocumentGenerated(provider, data, request);

    default:
      request.log.debug({ provider, eventType: type }, 'Unhandled partner webhook event');
      return { success: true }; // Acknowledge unknown events
  }
}

/**
 * Handle policy.bound event - policy is now active.
 * Routes to appropriate model based on product type.
 */
async function handlePolicyBound(
  provider: PartnerProvider,
  data: Record<string, unknown>,
  request: FastifyRequest
): Promise<WebhookProcessResult> {
  const providerPolicyId = data.policy_id as string || data.contract_id as string;
  const policyNumber = data.policy_number as string || data.contract_number as string;
  const effectiveDate = data.effective_date as string;
  const expirationDate = data.expiration_date as string;
  const productType = data.product_type as string || 'deposit_alternative';

  if (!providerPolicyId) {
    return { success: false, error: 'Missing policy ID in webhook data' };
  }

  // Route to appropriate model based on product type
  if (productType === 'renters_insurance') {
    return handleInsuranceBound(provider, providerPolicyId, policyNumber, effectiveDate, expirationDate, data, request);
  } else if (productType === 'guarantor') {
    return handleGuarantorBound(provider, providerPolicyId, effectiveDate, expirationDate, data, request);
  } else {
    return handleDepositBound(provider, providerPolicyId, effectiveDate, expirationDate, data, request);
  }
}

async function handleDepositBound(
  provider: PartnerProvider,
  providerPolicyId: string,
  effectiveDate: string | undefined,
  expirationDate: string | undefined,
  data: Record<string, unknown>,
  request: FastifyRequest
): Promise<WebhookProcessResult> {
  const policy = await prisma.depositAlternative.findFirst({
    where: { providerPolicyId },
  });

  if (!policy) {
    request.log.warn({ provider, providerPolicyId }, 'Deposit alternative not found for bound event');
    return { success: true }; // Acknowledge but skip
  }

  await prisma.depositAlternative.update({
    where: { id: policy.id },
    data: {
      status: 'active',
      policyNumber: (data.policy_number as string) || policy.policyNumber,
      approvalDate: new Date(),
      effectiveDate: effectiveDate ? new Date(effectiveDate) : policy.effectiveDate,
      expirationDate: expirationDate ? new Date(expirationDate) : policy.expirationDate,
      providerData: toJsonValue({ ...((policy.providerData as Record<string, unknown>) || {}), ...data }),
      updatedAt: new Date(),
    },
  });

  request.log.info({ policyId: policy.id, provider }, 'Deposit alternative bound');
  return { success: true, policyId: policy.id };
}

async function handleInsuranceBound(
  provider: PartnerProvider,
  providerPolicyId: string,
  policyNumber: string | undefined,
  effectiveDate: string | undefined,
  expirationDate: string | undefined,
  data: Record<string, unknown>,
  request: FastifyRequest
): Promise<WebhookProcessResult> {
  // Find by policy number since renters insurance uses that
  const policy = await prisma.rentersInsurance.findFirst({
    where: {
      OR: [
        { policyNumber: providerPolicyId },
        { policyNumber: policyNumber || '' },
      ],
    },
  });

  if (!policy) {
    request.log.warn({ provider, providerPolicyId }, 'Renters insurance not found for bound event');
    return { success: true };
  }

  await prisma.rentersInsurance.update({
    where: { id: policy.id },
    data: {
      status: 'active',
      policyNumber: policyNumber || policy.policyNumber,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : policy.effectiveDate,
      expirationDate: expirationDate ? new Date(expirationDate) : policy.expirationDate,
      certificateUrl: (data.certificate_url as string) || policy.certificateUrl,
      metadata: toJsonValue({ ...((policy.metadata as Record<string, unknown>) || {}), ...data }),
      updatedAt: new Date(),
    },
  });

  request.log.info({ policyId: policy.id, provider }, 'Renters insurance bound');
  return { success: true, policyId: policy.id };
}

async function handleGuarantorBound(
  provider: PartnerProvider,
  providerContractId: string,
  effectiveDate: string | undefined,
  expirationDate: string | undefined,
  data: Record<string, unknown>,
  request: FastifyRequest
): Promise<WebhookProcessResult> {
  const policy = await prisma.guarantorProduct.findFirst({
    where: { providerContractId },
  });

  if (!policy) {
    request.log.warn({ provider, providerContractId }, 'Guarantor product not found for bound event');
    return { success: true };
  }

  await prisma.guarantorProduct.update({
    where: { id: policy.id },
    data: {
      status: 'active',
      approvalDate: new Date(),
      effectiveDate: effectiveDate ? new Date(effectiveDate) : policy.effectiveDate,
      expirationDate: expirationDate ? new Date(expirationDate) : policy.expirationDate,
      metadata: toJsonValue({ ...((policy.metadata as Record<string, unknown>) || {}), ...data }),
      updatedAt: new Date(),
    },
  });

  request.log.info({ policyId: policy.id, provider }, 'Guarantor product bound');
  return { success: true, policyId: policy.id };
}

/**
 * Handle policy.cancelled event.
 * Searches across all product types for the policy.
 */
async function handlePolicyCancelled(
  provider: PartnerProvider,
  data: Record<string, unknown>,
  request: FastifyRequest
): Promise<WebhookProcessResult> {
  const providerPolicyId = data.policy_id as string || data.contract_id as string;
  const cancellationDate = data.cancellation_date as string || data.cancelled_at as string;
  const reason = data.reason as string || data.cancellation_reason as string;
  const productType = data.product_type as string;

  if (!providerPolicyId) {
    return { success: false, error: 'Missing policy ID in webhook data' };
  }

  // Try each product type
  const depositAlt = await prisma.depositAlternative.findFirst({
    where: { providerPolicyId },
  });

  if (depositAlt) {
    await prisma.depositAlternative.update({
      where: { id: depositAlt.id },
      data: {
        status: 'cancelled',
        providerData: toJsonValue({
          ...((depositAlt.providerData as Record<string, unknown>) || {}),
          cancelledAt: cancellationDate || new Date().toISOString(),
          cancellationReason: reason,
        }),
        updatedAt: new Date(),
      },
    });
    request.log.info({ policyId: depositAlt.id, provider, reason }, 'Deposit alternative cancelled');
    return { success: true, policyId: depositAlt.id };
  }

  const insurance = await prisma.rentersInsurance.findFirst({
    where: { policyNumber: providerPolicyId },
  });

  if (insurance) {
    await prisma.rentersInsurance.update({
      where: { id: insurance.id },
      data: {
        status: 'cancelled',
        metadata: toJsonValue({
          ...((insurance.metadata as Record<string, unknown>) || {}),
          cancelledAt: cancellationDate || new Date().toISOString(),
          cancellationReason: reason,
        }),
        updatedAt: new Date(),
      },
    });
    request.log.info({ policyId: insurance.id, provider, reason }, 'Renters insurance cancelled');
    return { success: true, policyId: insurance.id };
  }

  const guarantor = await prisma.guarantorProduct.findFirst({
    where: { providerContractId: providerPolicyId },
  });

  if (guarantor) {
    await prisma.guarantorProduct.update({
      where: { id: guarantor.id },
      data: {
        status: 'cancelled',
        metadata: toJsonValue({
          ...((guarantor.metadata as Record<string, unknown>) || {}),
          cancelledAt: cancellationDate || new Date().toISOString(),
          cancellationReason: reason,
        }),
        updatedAt: new Date(),
      },
    });
    request.log.info({ policyId: guarantor.id, provider, reason }, 'Guarantor product cancelled');
    return { success: true, policyId: guarantor.id };
  }

  request.log.warn({ provider, providerPolicyId, productType }, 'Policy not found for cancellation event');
  return { success: true };
}

/**
 * Handle policy.renewed event.
 */
async function handlePolicyRenewed(
  provider: PartnerProvider,
  data: Record<string, unknown>,
  request: FastifyRequest
): Promise<WebhookProcessResult> {
  const providerPolicyId = data.policy_id as string || data.contract_id as string;
  const newExpirationDate = data.new_expiration_date as string;

  if (!providerPolicyId) {
    return { success: false, error: 'Missing policy ID in webhook data' };
  }

  // Try deposit alternatives first
  const depositAlt = await prisma.depositAlternative.findFirst({
    where: { providerPolicyId },
  });

  if (depositAlt) {
    await prisma.depositAlternative.update({
      where: { id: depositAlt.id },
      data: {
        status: 'active',
        expirationDate: newExpirationDate ? new Date(newExpirationDate) : depositAlt.expirationDate,
        providerData: toJsonValue({
          ...((depositAlt.providerData as Record<string, unknown>) || {}),
          renewedAt: new Date().toISOString(),
        }),
        updatedAt: new Date(),
      },
    });
    request.log.info({ policyId: depositAlt.id, provider }, 'Deposit alternative renewed');
    return { success: true, policyId: depositAlt.id };
  }

  // Try renters insurance
  const insurance = await prisma.rentersInsurance.findFirst({
    where: { policyNumber: providerPolicyId },
  });

  if (insurance) {
    await prisma.rentersInsurance.update({
      where: { id: insurance.id },
      data: {
        status: 'active',
        expirationDate: newExpirationDate ? new Date(newExpirationDate) : insurance.expirationDate,
        metadata: toJsonValue({
          ...((insurance.metadata as Record<string, unknown>) || {}),
          renewedAt: new Date().toISOString(),
        }),
        updatedAt: new Date(),
      },
    });
    request.log.info({ policyId: insurance.id, provider }, 'Renters insurance renewed');
    return { success: true, policyId: insurance.id };
  }

  // Try guarantor
  const guarantor = await prisma.guarantorProduct.findFirst({
    where: { providerContractId: providerPolicyId },
  });

  if (guarantor) {
    await prisma.guarantorProduct.update({
      where: { id: guarantor.id },
      data: {
        status: 'active',
        expirationDate: newExpirationDate ? new Date(newExpirationDate) : guarantor.expirationDate,
        metadata: toJsonValue({
          ...((guarantor.metadata as Record<string, unknown>) || {}),
          renewedAt: new Date().toISOString(),
        }),
        updatedAt: new Date(),
      },
    });
    request.log.info({ policyId: guarantor.id, provider }, 'Guarantor product renewed');
    return { success: true, policyId: guarantor.id };
  }

  request.log.warn({ provider, providerPolicyId }, 'Policy not found for renewal event');
  return { success: true };
}

/**
 * Handle policy.expired event.
 */
async function handlePolicyExpired(
  provider: PartnerProvider,
  data: Record<string, unknown>,
  request: FastifyRequest
): Promise<WebhookProcessResult> {
  const providerPolicyId = data.policy_id as string || data.contract_id as string;

  if (!providerPolicyId) {
    return { success: false, error: 'Missing policy ID in webhook data' };
  }

  // Try deposit alternatives
  const depositAlt = await prisma.depositAlternative.findFirst({
    where: { providerPolicyId },
  });

  if (depositAlt) {
    await prisma.depositAlternative.update({
      where: { id: depositAlt.id },
      data: {
        status: 'expired',
        providerData: toJsonValue({
          ...((depositAlt.providerData as Record<string, unknown>) || {}),
          expiredAt: new Date().toISOString(),
        }),
        updatedAt: new Date(),
      },
    });
    request.log.info({ policyId: depositAlt.id, provider }, 'Deposit alternative expired');
    return { success: true, policyId: depositAlt.id };
  }

  // Try renters insurance
  const insurance = await prisma.rentersInsurance.findFirst({
    where: { policyNumber: providerPolicyId },
  });

  if (insurance) {
    await prisma.rentersInsurance.update({
      where: { id: insurance.id },
      data: {
        status: 'expired',
        metadata: toJsonValue({
          ...((insurance.metadata as Record<string, unknown>) || {}),
          expiredAt: new Date().toISOString(),
        }),
        updatedAt: new Date(),
      },
    });
    request.log.info({ policyId: insurance.id, provider }, 'Renters insurance expired');
    return { success: true, policyId: insurance.id };
  }

  // Try guarantor
  const guarantor = await prisma.guarantorProduct.findFirst({
    where: { providerContractId: providerPolicyId },
  });

  if (guarantor) {
    await prisma.guarantorProduct.update({
      where: { id: guarantor.id },
      data: {
        status: 'expired',
        metadata: toJsonValue({
          ...((guarantor.metadata as Record<string, unknown>) || {}),
          expiredAt: new Date().toISOString(),
        }),
        updatedAt: new Date(),
      },
    });
    request.log.info({ policyId: guarantor.id, provider }, 'Guarantor product expired');
    return { success: true, policyId: guarantor.id };
  }

  return { success: true };
}

/**
 * Handle policy.updated event - general policy updates.
 */
async function handlePolicyUpdated(
  provider: PartnerProvider,
  data: Record<string, unknown>,
  request: FastifyRequest
): Promise<WebhookProcessResult> {
  const providerPolicyId = data.policy_id as string || data.contract_id as string;

  if (!providerPolicyId) {
    return { success: false, error: 'Missing policy ID in webhook data' };
  }

  // Try deposit alternatives
  const depositAlt = await prisma.depositAlternative.findFirst({
    where: { providerPolicyId },
  });

  if (depositAlt) {
    await prisma.depositAlternative.update({
      where: { id: depositAlt.id },
      data: {
        status: data.status ? mapProviderStatus(data.status as string) : depositAlt.status,
        coverageAmount: (data.coverage_amount as number) || depositAlt.coverageAmount,
        providerData: toJsonValue({ ...((depositAlt.providerData as Record<string, unknown>) || {}), ...data }),
        updatedAt: new Date(),
      },
    });
    request.log.info({ policyId: depositAlt.id, provider }, 'Deposit alternative updated');
    return { success: true, policyId: depositAlt.id };
  }

  // Try renters insurance
  const insurance = await prisma.rentersInsurance.findFirst({
    where: { policyNumber: providerPolicyId },
  });

  if (insurance) {
    await prisma.rentersInsurance.update({
      where: { id: insurance.id },
      data: {
        status: data.status ? mapProviderStatus(data.status as string) : insurance.status,
        coverageAmount: (data.coverage_amount as number) || insurance.coverageAmount,
        certificateUrl: (data.certificate_url as string) || insurance.certificateUrl,
        metadata: toJsonValue({ ...((insurance.metadata as Record<string, unknown>) || {}), ...data }),
        updatedAt: new Date(),
      },
    });
    request.log.info({ policyId: insurance.id, provider }, 'Renters insurance updated');
    return { success: true, policyId: insurance.id };
  }

  // Try guarantor
  const guarantor = await prisma.guarantorProduct.findFirst({
    where: { providerContractId: providerPolicyId },
  });

  if (guarantor) {
    await prisma.guarantorProduct.update({
      where: { id: guarantor.id },
      data: {
        status: data.status ? mapProviderStatus(data.status as string) : guarantor.status,
        guaranteeAmount: (data.coverage_amount as number) || guarantor.guaranteeAmount,
        metadata: toJsonValue({ ...((guarantor.metadata as Record<string, unknown>) || {}), ...data }),
        updatedAt: new Date(),
      },
    });
    request.log.info({ policyId: guarantor.id, provider }, 'Guarantor product updated');
    return { success: true, policyId: guarantor.id };
  }

  return { success: true };
}

/**
 * Handle claim.created event.
 * Claims are primarily for deposit alternatives.
 */
async function handleClaimCreated(
  provider: PartnerProvider,
  data: Record<string, unknown>,
  request: FastifyRequest
): Promise<WebhookProcessResult> {
  const providerPolicyId = data.policy_id as string || data.contract_id as string;
  const claimId = data.claim_id as string;
  const claimAmount = data.claim_amount as number;
  const claimType = data.claim_type as string;

  if (!providerPolicyId || !claimId) {
    return { success: false, error: 'Missing policy ID or claim ID' };
  }

  const depositAlt = await prisma.depositAlternative.findFirst({
    where: { providerPolicyId },
  });

  if (!depositAlt) {
    request.log.warn({ provider, providerPolicyId }, 'Deposit alternative not found for claim');
    return { success: true };
  }

  // Store claim in metadata and increment claim count
  const existingClaims = (((depositAlt.providerData as Record<string, unknown>)?.claims || []) as unknown[]);

  await prisma.depositAlternative.update({
    where: { id: depositAlt.id },
    data: {
      claimCount: { increment: 1 },
      providerData: toJsonValue({
        ...((depositAlt.providerData as Record<string, unknown>) || {}),
        claims: [
          ...existingClaims,
          {
            claimId,
            claimAmount,
            claimType,
            createdAt: new Date().toISOString(),
            status: 'pending',
          },
        ],
      }),
      updatedAt: new Date(),
    },
  });

  request.log.info({ policyId: depositAlt.id, provider, claimId }, 'Claim created');
  return { success: true, policyId: depositAlt.id };
}

/**
 * Handle claim.resolved event.
 */
async function handleClaimResolved(
  provider: PartnerProvider,
  data: Record<string, unknown>,
  request: FastifyRequest
): Promise<WebhookProcessResult> {
  const providerPolicyId = data.policy_id as string || data.contract_id as string;
  const claimId = data.claim_id as string;
  const resolution = data.resolution as string;
  const paidAmount = data.paid_amount as number;

  if (!providerPolicyId || !claimId) {
    return { success: false, error: 'Missing policy ID or claim ID' };
  }

  const depositAlt = await prisma.depositAlternative.findFirst({
    where: { providerPolicyId },
  });

  if (!depositAlt) {
    return { success: true };
  }

  // Update claim in metadata
  const existingClaims = (((depositAlt.providerData as Record<string, unknown>)?.claims || []) as Array<Record<string, unknown>>);
  const updatedClaims = existingClaims.map((claim) => {
    if (claim.claimId === claimId) {
      return {
        ...claim,
        status: 'resolved',
        resolution,
        paidAmount,
        resolvedAt: new Date().toISOString(),
      };
    }
    return claim;
  });

  await prisma.depositAlternative.update({
    where: { id: depositAlt.id },
    data: {
      providerData: toJsonValue({
        ...((depositAlt.providerData as Record<string, unknown>) || {}),
        claims: updatedClaims,
      }),
      updatedAt: new Date(),
    },
  });

  request.log.info({ policyId: depositAlt.id, provider, claimId, resolution }, 'Claim resolved');
  return { success: true, policyId: depositAlt.id };
}

/**
 * Handle document.generated event.
 */
async function handleDocumentGenerated(
  provider: PartnerProvider,
  data: Record<string, unknown>,
  request: FastifyRequest
): Promise<WebhookProcessResult> {
  const providerPolicyId = data.policy_id as string || data.contract_id as string;
  const documentType = data.document_type as string;
  const documentUrl = data.document_url as string;

  if (!providerPolicyId || !documentUrl) {
    return { success: false, error: 'Missing policy ID or document URL' };
  }

  // Try renters insurance (most common for certificate generation)
  const insurance = await prisma.rentersInsurance.findFirst({
    where: { policyNumber: providerPolicyId },
  });

  if (insurance) {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (documentType === 'certificate' || documentType === 'certificate_of_insurance') {
      updateData.certificateUrl = documentUrl;
    }

    const existingDocs = (((insurance.metadata as Record<string, unknown>)?.documents || []) as unknown[]);
    updateData.metadata = toJsonValue({
      ...((insurance.metadata as Record<string, unknown>) || {}),
      documents: [
        ...existingDocs,
        { type: documentType, url: documentUrl, generatedAt: new Date().toISOString() },
      ],
    });

    await prisma.rentersInsurance.update({
      where: { id: insurance.id },
      data: updateData as Prisma.RentersInsuranceUpdateInput,
    });

    request.log.info({ policyId: insurance.id, provider, documentType }, 'Insurance document generated');
    return { success: true, policyId: insurance.id };
  }

  // Try deposit alternatives
  const depositAlt = await prisma.depositAlternative.findFirst({
    where: { providerPolicyId },
  });

  if (depositAlt) {
    const existingDocs = (((depositAlt.providerData as Record<string, unknown>)?.documents || []) as unknown[]);

    await prisma.depositAlternative.update({
      where: { id: depositAlt.id },
      data: {
        providerData: toJsonValue({
          ...((depositAlt.providerData as Record<string, unknown>) || {}),
          documents: [
            ...existingDocs,
            { type: documentType, url: documentUrl, generatedAt: new Date().toISOString() },
          ],
        }),
        updatedAt: new Date(),
      },
    });

    request.log.info({ policyId: depositAlt.id, provider, documentType }, 'Deposit document generated');
    return { success: true, policyId: depositAlt.id };
  }

  return { success: true };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Map provider-specific status to our status enum.
 */
function mapProviderStatus(providerStatus: string): PolicyStatus {
  const statusMap: Record<string, PolicyStatus> = {
    active: 'active',
    bound: 'active',
    issued: 'active',
    pending: 'pending_bind',
    pending_bind: 'pending_bind',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    terminated: 'cancelled',
    expired: 'expired',
    lapsed: 'lapsed',
    non_renewed: 'expired',
  };

  return statusMap[providerStatus.toLowerCase()] || 'active';
}

export default partnerWebhookRoutes;
