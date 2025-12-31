/**
 * Webhook Routes
 *
 * Handles incoming webhooks from external services like Stripe and partner providers.
 * These endpoints do NOT require authentication - they use signature verification instead.
 *
 * Payment Lifecycle State Machine:
 * - payment_intent.created -> pending
 * - payment_intent.processing -> processing
 * - payment_intent.succeeded -> completed (ledger posted)
 * - payment_intent.payment_failed -> failed
 * - payment_intent.canceled -> cancelled
 * - charge.refunded -> refunded/partially_refunded
 * - charge.dispute.created -> disputed
 * - charge.dispute.closed (won) -> completed
 * - charge.dispute.closed (lost) -> refunded
 *
 * Partner Policy Lifecycle:
 * - policy.bound -> active
 * - policy.cancelled -> cancelled
 * - policy.renewed -> active (new term)
 * - policy.expired -> expired
 */

import { prisma } from '@realriches/database';
import {
  createWebhookProcessor,
  RENT_PLATFORM_FEE_PERCENT,
  STRIPE_FEE_PERCENT,
  STRIPE_FEE_FIXED_CENTS,
  type WebhookHandlerResult,
} from '@realriches/revenue-engine';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// Import to get type augmentation for rawBody
import '../../plugins/raw-body';

import { partnerWebhookRoutes } from './partner-webhooks';

import { getWebhookSecret, isStripeConfigured, redactStripeData } from '../../lib/stripe';

// =============================================================================
// Sensitive Fields for Redaction
// =============================================================================

const WEBHOOK_REDACTED_FIELDS = [
  'card',
  'bank_account',
  'source',
  'payment_method_details',
  'billing_details',
  'shipping',
  'client_secret',
  'receipt_email',
  'customer_email',
] as const;

/**
 * Deep redact sensitive fields from webhook payload for logging.
 */
function redactWebhookPayload(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(redactWebhookPayload);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (WEBHOOK_REDACTED_FIELDS.includes(key as typeof WEBHOOK_REDACTED_FIELDS[number])) {
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
// Payment Status Mapping
// =============================================================================

type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded'
  | 'disputed';

const STRIPE_STATUS_MAP: Record<string, PaymentStatus> = {
  'requires_payment_method': 'pending',
  'requires_confirmation': 'pending',
  'requires_action': 'pending',
  'processing': 'processing',
  'succeeded': 'completed',
  'canceled': 'cancelled',
};

// =============================================================================
// Webhook Routes
// =============================================================================

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // Register partner webhook routes (LeaseLock, Rhino, etc.)
  await app.register(partnerWebhookRoutes, { prefix: '/partners' });

  /**
   * Stripe Webhook Endpoint
   *
   * Receives webhook events from Stripe and processes them.
   * Uses signature verification instead of bearer token authentication.
   */
  app.post(
    '/stripe',
    {
      schema: {
        description: 'Stripe webhook endpoint',
        tags: ['Webhooks'],
      },
      config: {
        rawBody: true,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Check if Stripe is configured
      if (!isStripeConfigured()) {
        request.log.warn('Stripe webhook received but Stripe is not configured');
        return reply.status(503).send({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Stripe is not configured' },
        });
      }

      // Get the signature header
      const signatureHeader = request.headers['stripe-signature'];
      if (!signatureHeader || typeof signatureHeader !== 'string') {
        request.log.warn('Missing stripe-signature header');
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Missing stripe-signature header' },
        });
      }

      // Get the raw body for signature verification
      const rawBody = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
      if (!rawBody) {
        request.log.error('Raw body not available for webhook verification');
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_PAYLOAD', message: 'Request body not available' },
        });
      }

      try {
        // Get the webhook secret and create processor
        const webhookSecret = getWebhookSecret();
        const processor = createWebhookProcessor(webhookSecret);

        // Process the webhook event
        const result: WebhookHandlerResult = await processor.process(rawBody, signatureHeader);

        if (!result.success) {
          request.log.error(
            { result: redactWebhookPayload(result) },
            'Webhook processing failed'
          );
          return reply.status(400).send({
            success: false,
            error: { code: 'WEBHOOK_FAILED', message: result.error || 'Webhook processing failed' },
          });
        }

        // Log successful processing with redacted data
        request.log.info(
          {
            eventId: result.eventId,
            ledgerTransactionId: result.ledgerTransactionId,
            skipped: result.skipped,
            skipReason: result.skipReason,
          },
          'Webhook processed successfully'
        );

        // Parse the event to update Payment record
        const eventData = JSON.parse(rawBody.toString('utf8')) as {
          id: string;
          type: string;
          data: { object: Record<string, unknown> };
        };

        // Update Payment record based on event type
        await syncPaymentFromWebhook(request, eventData, result);

        // Return success - Stripe expects a 2xx response
        return reply.status(200).send({
          success: true,
          received: true,
          eventId: result.eventId,
        });
      } catch (error) {
        // Log the error with redacted sensitive data
        request.log.error({ error: redactStripeData(error) }, 'Webhook error');

        // Don't expose internal errors - just return 500
        // Stripe will retry on 5xx errors
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Webhook processing error' },
        });
      }
    }
  );
}

// =============================================================================
// Payment Sync Logic
// =============================================================================

interface StripeEventData {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/**
 * Sync Payment record based on Stripe webhook event.
 * Handles full payment lifecycle state transitions.
 */
async function syncPaymentFromWebhook(
  request: FastifyRequest,
  eventData: StripeEventData,
  result: WebhookHandlerResult
): Promise<void> {
  const eventType = eventData.type;
  const object = eventData.data.object;

  try {
    switch (eventType) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(request, object, result);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(request, object);
        break;

      case 'payment_intent.canceled':
        await handlePaymentCanceled(request, object);
        break;

      case 'charge.refunded':
        await handleChargeRefunded(request, object, result);
        break;

      case 'charge.dispute.created':
        await handleDisputeCreated(request, object);
        break;

      case 'charge.dispute.closed':
        await handleDisputeClosed(request, object, result);
        break;

      default:
        request.log.debug({ eventType }, 'Unhandled webhook event type for payment sync');
    }
  } catch (error) {
    // Log but don't fail - the webhook was processed successfully
    request.log.error(
      { error, eventType, paymentIntentId: object.id },
      'Failed to sync payment from webhook'
    );
  }
}

/**
 * Handle payment_intent.succeeded event.
 * Transition: processing -> completed
 * Creates ledger entries for rent payment waterfall.
 */
async function handlePaymentSucceeded(
  request: FastifyRequest,
  object: Record<string, unknown>,
  result: WebhookHandlerResult
): Promise<void> {
  const paymentIntentId = object.id as string;
  const amountReceived = object.amount_received as number;
  const metadata = object.metadata as Record<string, string> | undefined;
  const paymentId = metadata?.payment_id;
  const chargeId = object.latest_charge as string | undefined;

  // Find the payment by Stripe payment intent ID or internal payment ID
  const payment = await findPaymentByStripeId(paymentIntentId, paymentId);

  if (!payment) {
    request.log.warn({ paymentIntentId, paymentId }, 'Payment not found for succeeded event');
    return;
  }

  // Calculate fees for the waterfall
  const amountCents = amountReceived;
  const processingFeeCents = Math.round(amountCents * (STRIPE_FEE_PERCENT / 100) + STRIPE_FEE_FIXED_CENTS);
  const platformFeeCents = Math.round(amountCents * (RENT_PLATFORM_FEE_PERCENT / 100));
  const netAmountCents = amountCents - processingFeeCents - platformFeeCents;

  // Update payment record
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'completed',
      paidAt: new Date(),
      processedAt: new Date(),
      stripeChargeId: chargeId,
      feeAmount: processingFeeCents + platformFeeCents,
      netAmount: netAmountCents,
      metadata: {
        ...(payment.metadata as Record<string, unknown> || {}),
        ledgerTransactionId: result.ledgerTransactionId,
        processingFee: processingFeeCents,
        platformFee: platformFeeCents,
      },
    },
  });

  request.log.info(
    {
      paymentId: payment.id,
      status: 'completed',
      ledgerTransactionId: result.ledgerTransactionId,
      grossAmount: amountCents,
      netAmount: netAmountCents,
    },
    'Payment succeeded - status updated'
  );
}

/**
 * Handle payment_intent.payment_failed event.
 * Transition: processing -> failed
 */
async function handlePaymentFailed(
  request: FastifyRequest,
  object: Record<string, unknown>
): Promise<void> {
  const paymentIntentId = object.id as string;
  const metadata = object.metadata as Record<string, string> | undefined;
  const paymentId = metadata?.payment_id;
  const lastPaymentError = object.last_payment_error as {
    code?: string;
    message?: string;
  } | undefined;

  const payment = await findPaymentByStripeId(paymentIntentId, paymentId);

  if (!payment) {
    request.log.warn({ paymentIntentId, paymentId }, 'Payment not found for failed event');
    return;
  }

  const errorMessage = lastPaymentError?.message || 'Payment failed';
  const errorCode = lastPaymentError?.code || 'unknown';

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'failed',
      lastError: `${errorCode}: ${errorMessage}`,
      retryCount: { increment: 1 },
      nextRetryAt: calculateNextRetryTime(payment.retryCount + 1),
    },
  });

  request.log.info(
    { paymentId: payment.id, status: 'failed', errorCode },
    'Payment failed - status updated'
  );
}

/**
 * Handle payment_intent.canceled event.
 * Transition: pending/processing -> cancelled
 */
async function handlePaymentCanceled(
  request: FastifyRequest,
  object: Record<string, unknown>
): Promise<void> {
  const paymentIntentId = object.id as string;
  const metadata = object.metadata as Record<string, string> | undefined;
  const paymentId = metadata?.payment_id;

  const payment = await findPaymentByStripeId(paymentIntentId, paymentId);

  if (!payment) {
    request.log.warn({ paymentIntentId, paymentId }, 'Payment not found for canceled event');
    return;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'cancelled',
      metadata: {
        ...(payment.metadata as Record<string, unknown> || {}),
        cancelledAt: new Date().toISOString(),
        cancellationReason: object.cancellation_reason as string | undefined,
      },
    },
  });

  request.log.info({ paymentId: payment.id, status: 'cancelled' }, 'Payment cancelled - status updated');
}

/**
 * Handle charge.refunded event.
 * Transition: completed -> refunded/partially_refunded
 */
async function handleChargeRefunded(
  request: FastifyRequest,
  object: Record<string, unknown>,
  result: WebhookHandlerResult
): Promise<void> {
  const chargeId = object.id as string;
  const paymentIntentId = object.payment_intent as string | undefined;
  const amountRefunded = object.amount_refunded as number;
  const amount = object.amount as number;

  // Find by charge ID or payment intent
  let payment = await prisma.payment.findFirst({
    where: { stripeChargeId: chargeId },
  });

  if (!payment && paymentIntentId) {
    payment = await prisma.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
    });
  }

  if (!payment) {
    request.log.warn({ chargeId, paymentIntentId }, 'Payment not found for refund event');
    return;
  }

  const isFullRefund = amountRefunded >= amount;
  const newStatus: PaymentStatus = isFullRefund ? 'refunded' : 'partially_refunded';

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: newStatus,
      refundedAmount: amountRefunded,
      refundedAt: new Date(),
      metadata: {
        ...(payment.metadata as Record<string, unknown> || {}),
        refundLedgerTransactionId: result.ledgerTransactionId,
      },
    },
  });

  request.log.info(
    {
      paymentId: payment.id,
      status: newStatus,
      amountRefunded,
      ledgerTransactionId: result.ledgerTransactionId,
    },
    'Payment refunded - status updated'
  );
}

/**
 * Handle charge.dispute.created event.
 * Transition: completed -> disputed
 */
async function handleDisputeCreated(
  request: FastifyRequest,
  object: Record<string, unknown>
): Promise<void> {
  const chargeId = object.charge as string;
  const disputeId = object.id as string;
  const amount = object.amount as number;
  const reason = object.reason as string;

  const payment = await prisma.payment.findFirst({
    where: { stripeChargeId: chargeId },
  });

  if (!payment) {
    request.log.warn({ chargeId, disputeId }, 'Payment not found for dispute event');
    return;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'disputed',
      metadata: {
        ...(payment.metadata as Record<string, unknown> || {}),
        disputeId,
        disputeAmount: amount,
        disputeReason: reason,
        disputeCreatedAt: new Date().toISOString(),
      },
    },
  });

  request.log.info(
    { paymentId: payment.id, status: 'disputed', disputeId, reason },
    'Payment disputed - status updated'
  );
}

/**
 * Handle charge.dispute.closed event.
 * Won: disputed -> completed
 * Lost: disputed -> refunded
 */
async function handleDisputeClosed(
  request: FastifyRequest,
  object: Record<string, unknown>,
  result: WebhookHandlerResult
): Promise<void> {
  const chargeId = object.charge as string;
  const disputeId = object.id as string;
  const status = object.status as string; // won, lost, warning_closed
  const amount = object.amount as number;

  const payment = await prisma.payment.findFirst({
    where: { stripeChargeId: chargeId },
  });

  if (!payment) {
    request.log.warn({ chargeId, disputeId }, 'Payment not found for dispute closed event');
    return;
  }

  const disputeWon = status === 'won' || status === 'warning_closed';
  const newStatus: PaymentStatus = disputeWon ? 'completed' : 'refunded';

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: newStatus,
      refundedAmount: disputeWon ? undefined : amount,
      refundedAt: disputeWon ? undefined : new Date(),
      metadata: {
        ...(payment.metadata as Record<string, unknown> || {}),
        disputeClosedAt: new Date().toISOString(),
        disputeOutcome: status,
        disputeResolutionLedgerTransactionId: result.ledgerTransactionId,
      },
    },
  });

  request.log.info(
    { paymentId: payment.id, status: newStatus, disputeOutcome: status },
    'Dispute closed - payment status updated'
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Find payment by Stripe payment intent ID or internal payment ID.
 */
async function findPaymentByStripeId(
  paymentIntentId: string,
  paymentId?: string
): Promise<{
  id: string;
  status: string;
  retryCount: number;
  metadata: unknown;
} | null> {
  // Try by internal payment ID first (from metadata)
  if (paymentId) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, status: true, retryCount: true, metadata: true },
    });
    if (payment) return payment;
  }

  // Fall back to Stripe payment intent ID
  const payment = await prisma.payment.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { id: true, status: true, retryCount: true, metadata: true },
  });

  return payment;
}

/**
 * Calculate next retry time with exponential backoff.
 * Retry schedule: 1h, 4h, 24h, 72h
 */
function calculateNextRetryTime(retryCount: number): Date | null {
  const maxRetries = 4;
  if (retryCount >= maxRetries) return null;

  const delayHours = [1, 4, 24, 72];
  const delay = delayHours[retryCount - 1] || 72;

  const nextRetry = new Date();
  nextRetry.setHours(nextRetry.getHours() + delay);
  return nextRetry;
}

export default webhookRoutes;
