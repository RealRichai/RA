/**
 * Stripe Webhook Handler
 *
 * Webhook verification, idempotency, and ledger posting.
 */

import { createHmac, timingSafeEqual } from 'crypto';

import type { StripeEventType, WebhookEvent } from '../types';
import {
  createTransaction,
  buildPaymentReceivedEntries,
  buildRefundEntries,
  postTransaction,
} from '../ledger/transactions';
import {
  IdempotencyManager,
  generateWebhookIdempotencyKey,
  createMockIdempotencyManager,
} from '../ledger/idempotency';

// =============================================================================
// Webhook Verification
// =============================================================================

const WEBHOOK_TOLERANCE = 300; // 5 minutes in seconds

export interface WebhookVerificationResult {
  valid: boolean;
  event?: WebhookEvent;
  error?: string;
}

/**
 * Parse Stripe signature header.
 */
function parseSignatureHeader(header: string): { timestamp: string; signatures: string[] } {
  const parts = header.split(',');
  let timestamp = '';
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't' && value) {
      timestamp = value;
    } else if (key === 'v1' && value) {
      signatures.push(value);
    }
  }

  return { timestamp, signatures };
}

/**
 * Compute the expected signature for a webhook payload.
 */
function computeSignature(payload: string, timestamp: string, secret: string): string {
  const signedPayload = `${timestamp}.${payload}`;
  return createHmac('sha256', secret).update(signedPayload).digest('hex');
}

/**
 * Verify a Stripe webhook signature.
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signatureHeader: string,
  webhookSecret: string
): WebhookVerificationResult {
  try {
    const payloadString = typeof payload === 'string' ? payload : payload.toString('utf8');
    const { timestamp, signatures } = parseSignatureHeader(signatureHeader);

    if (!timestamp || signatures.length === 0) {
      return { valid: false, error: 'Invalid signature header format' };
    }

    // Check timestamp tolerance
    const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
    if (timestampAge > WEBHOOK_TOLERANCE) {
      return { valid: false, error: 'Webhook timestamp too old' };
    }

    // Compute expected signature
    const expectedSignature = computeSignature(payloadString, timestamp, webhookSecret);

    // Compare signatures (timing-safe)
    let signatureValid = false;
    for (const signature of signatures) {
      try {
        const sigBuffer = Buffer.from(signature, 'hex');
        const expectedBuffer = Buffer.from(expectedSignature, 'hex');
        if (sigBuffer.length === expectedBuffer.length && timingSafeEqual(sigBuffer, expectedBuffer)) {
          signatureValid = true;
          break;
        }
      } catch {
        // Ignore invalid hex
      }
    }

    if (!signatureValid) {
      return { valid: false, error: 'Signature verification failed' };
    }

    // Parse the event
    const eventData = JSON.parse(payloadString);

    const event: WebhookEvent = {
      id: eventData.id,
      type: eventData.type as StripeEventType,
      data: eventData.data,
      created: eventData.created,
      livemode: eventData.livemode,
      retryCount: 0,
    };

    return { valid: true, event };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
}

// =============================================================================
// Webhook Event Handlers
// =============================================================================

export interface WebhookHandlerResult {
  success: boolean;
  eventId: string;
  ledgerTransactionId?: string;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

export type WebhookEventHandler = (
  event: WebhookEvent,
  idempotencyManager: IdempotencyManager
) => Promise<WebhookHandlerResult>;

/**
 * Handle payment_intent.succeeded event.
 */
export async function handlePaymentIntentSucceeded(
  event: WebhookEvent,
  idempotencyManager: IdempotencyManager
): Promise<WebhookHandlerResult> {
  const idempotencyKey = generateWebhookIdempotencyKey(event.id);

  // Check idempotency
  const check = await idempotencyManager.checkAndLock(idempotencyKey);
  if (!check.isNew) {
    return {
      success: true,
      eventId: event.id,
      ledgerTransactionId: check.existingRecord?.transactionId,
      skipped: true,
      skipReason: 'Already processed',
    };
  }

  try {
    const paymentIntent = event.data.object as {
      id: string;
      amount: number;
      amount_received: number;
      currency: string;
      metadata?: Record<string, string>;
      application_fee_amount?: number;
    };

    const amount = paymentIntent.amount_received / 100; // Convert from cents
    const processingFee = (paymentIntent.application_fee_amount || 0) / 100;

    // Create ledger entries
    const entries = buildPaymentReceivedEntries(amount, processingFee);

    // Create transaction
    const transaction = createTransaction({
      type: 'payment_received',
      entries,
      description: `Payment received: ${paymentIntent.id}`,
      idempotencyKey,
      externalId: paymentIntent.id,
      referenceType: 'payment_intent',
      referenceId: paymentIntent.metadata?.payment_id,
      metadata: {
        stripePaymentIntentId: paymentIntent.id,
        currency: paymentIntent.currency,
      },
    });

    // Post the transaction
    const postedTransaction = postTransaction(transaction);

    // Record completion
    await idempotencyManager.recordCompleted(
      idempotencyKey,
      postedTransaction.id,
      { status: 'posted' }
    );

    return {
      success: true,
      eventId: event.id,
      ledgerTransactionId: postedTransaction.id,
    };
  } catch (error) {
    await idempotencyManager.recordFailed(
      idempotencyKey,
      '',
      (error as Error).message
    );

    return {
      success: false,
      eventId: event.id,
      error: (error as Error).message,
    };
  }
}

/**
 * Handle charge.refunded event.
 */
export async function handleChargeRefunded(
  event: WebhookEvent,
  idempotencyManager: IdempotencyManager
): Promise<WebhookHandlerResult> {
  const idempotencyKey = generateWebhookIdempotencyKey(event.id);

  const check = await idempotencyManager.checkAndLock(idempotencyKey);
  if (!check.isNew) {
    return {
      success: true,
      eventId: event.id,
      skipped: true,
      skipReason: 'Already processed',
    };
  }

  try {
    const charge = event.data.object as {
      id: string;
      amount_refunded: number;
      currency: string;
      payment_intent?: string;
    };

    const refundAmount = charge.amount_refunded / 100;

    const entries = buildRefundEntries(refundAmount);

    const transaction = createTransaction({
      type: 'payment_refund',
      entries,
      description: `Refund: ${charge.id}`,
      idempotencyKey,
      externalId: charge.id,
      referenceType: 'charge',
      metadata: {
        stripeChargeId: charge.id,
        stripePaymentIntentId: charge.payment_intent,
      },
    });

    const postedTransaction = postTransaction(transaction);

    await idempotencyManager.recordCompleted(
      idempotencyKey,
      postedTransaction.id
    );

    return {
      success: true,
      eventId: event.id,
      ledgerTransactionId: postedTransaction.id,
    };
  } catch (error) {
    await idempotencyManager.recordFailed(
      idempotencyKey,
      '',
      (error as Error).message
    );

    return {
      success: false,
      eventId: event.id,
      error: (error as Error).message,
    };
  }
}

/**
 * Handle charge.dispute.created event.
 */
export async function handleDisputeCreated(
  event: WebhookEvent,
  idempotencyManager: IdempotencyManager
): Promise<WebhookHandlerResult> {
  // Disputes don't create ledger entries immediately,
  // but we record the event for tracking
  const idempotencyKey = generateWebhookIdempotencyKey(event.id);

  const check = await idempotencyManager.checkAndLock(idempotencyKey);
  if (!check.isNew) {
    return {
      success: true,
      eventId: event.id,
      skipped: true,
      skipReason: 'Already processed',
    };
  }

  try {
    await idempotencyManager.recordCompleted(idempotencyKey, `dispute_${event.id}`);

    return {
      success: true,
      eventId: event.id,
      // No ledger transaction - dispute is tracked separately
    };
  } catch (error) {
    return {
      success: false,
      eventId: event.id,
      error: (error as Error).message,
    };
  }
}

// =============================================================================
// Webhook Router
// =============================================================================

const eventHandlers: Partial<Record<StripeEventType, WebhookEventHandler>> = {
  'payment_intent.succeeded': handlePaymentIntentSucceeded,
  'charge.refunded': handleChargeRefunded,
  'charge.dispute.created': handleDisputeCreated,
};

export interface WebhookProcessorConfig {
  webhookSecret: string;
  idempotencyManager?: IdempotencyManager;
}

export class WebhookProcessor {
  private webhookSecret: string;
  private idempotencyManager: IdempotencyManager;

  constructor(config: WebhookProcessorConfig) {
    this.webhookSecret = config.webhookSecret;
    this.idempotencyManager = config.idempotencyManager || createMockIdempotencyManager();
  }

  /**
   * Process a webhook request.
   */
  async process(
    payload: string | Buffer,
    signatureHeader: string
  ): Promise<WebhookHandlerResult> {
    // Verify signature
    const verification = verifyWebhookSignature(
      payload,
      signatureHeader,
      this.webhookSecret
    );

    if (!verification.valid || !verification.event) {
      return {
        success: false,
        eventId: 'unknown',
        error: verification.error || 'Verification failed',
      };
    }

    const event = verification.event;

    // Find handler
    const handler = eventHandlers[event.type];
    if (!handler) {
      // Unknown event type - acknowledge but don't process
      return {
        success: true,
        eventId: event.id,
        skipped: true,
        skipReason: `No handler for event type: ${event.type}`,
      };
    }

    // Process event
    return handler(event, this.idempotencyManager);
  }

  /**
   * Register a custom event handler.
   */
  registerHandler(eventType: StripeEventType, handler: WebhookEventHandler): void {
    eventHandlers[eventType] = handler;
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createWebhookProcessor(
  webhookSecret: string,
  idempotencyManager?: IdempotencyManager
): WebhookProcessor {
  return new WebhookProcessor({
    webhookSecret,
    idempotencyManager,
  });
}
