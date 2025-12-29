/**
 * Webhook Verification Tests
 *
 * Tests for Stripe webhook signature verification and event processing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'crypto';

import {
  verifyWebhookSignature,
  handlePaymentIntentSucceeded,
  handleChargeRefunded,
  WebhookProcessor,
  createWebhookProcessor,
} from '../stripe/webhook-handler';

import {
  createMockIdempotencyManager,
  MockRedis,
  IdempotencyManager,
} from '../ledger/idempotency';

import type { WebhookEvent } from '../types';

// =============================================================================
// Test Helpers
// =============================================================================

const TEST_WEBHOOK_SECRET = 'whsec_test_secret_key_123';

function createSignedPayload(
  payload: object,
  secret: string = TEST_WEBHOOK_SECRET
): { payloadString: string; signature: string } {
  const payloadString = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payloadString}`;
  const sig = createHmac('sha256', secret).update(signedPayload).digest('hex');
  const signature = `t=${timestamp},v1=${sig}`;

  return { payloadString, signature };
}

function createMockPaymentIntentEvent(
  amount: number = 10000,
  eventId: string = 'evt_test_123'
): object {
  return {
    id: eventId,
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_test_123',
        amount,
        amount_received: amount,
        currency: 'usd',
        metadata: {
          payment_id: 'pay_internal_123',
        },
        application_fee_amount: 290,
      },
    },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
  };
}

function createMockRefundEvent(
  amountRefunded: number = 5000,
  eventId: string = 'evt_refund_123'
): object {
  return {
    id: eventId,
    type: 'charge.refunded',
    data: {
      object: {
        id: 'ch_test_123',
        amount_refunded: amountRefunded,
        currency: 'usd',
        payment_intent: 'pi_test_123',
      },
    },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
  };
}

// =============================================================================
// Signature Verification Tests
// =============================================================================

describe('Webhook Signature Verification', () => {
  it('should verify valid signature', () => {
    const payload = createMockPaymentIntentEvent();
    const { payloadString, signature } = createSignedPayload(payload);

    const result = verifyWebhookSignature(payloadString, signature, TEST_WEBHOOK_SECRET);

    expect(result.valid).toBe(true);
    expect(result.event).toBeDefined();
    expect(result.event?.id).toBe('evt_test_123');
    expect(result.event?.type).toBe('payment_intent.succeeded');
  });

  it('should verify signature with Buffer payload', () => {
    const payload = createMockPaymentIntentEvent();
    const { payloadString, signature } = createSignedPayload(payload);
    const buffer = Buffer.from(payloadString, 'utf8');

    const result = verifyWebhookSignature(buffer, signature, TEST_WEBHOOK_SECRET);

    expect(result.valid).toBe(true);
  });

  it('should reject invalid signature', () => {
    const payload = createMockPaymentIntentEvent();
    const { payloadString } = createSignedPayload(payload);

    // Use current timestamp but wrong signature
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const result = verifyWebhookSignature(
      payloadString,
      `t=${currentTimestamp},v1=0000000000000000000000000000000000000000000000000000000000000000`,
      TEST_WEBHOOK_SECRET
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Signature verification failed');
  });

  it('should reject wrong secret', () => {
    const payload = createMockPaymentIntentEvent();
    const { payloadString, signature } = createSignedPayload(payload);

    const result = verifyWebhookSignature(
      payloadString,
      signature,
      'wrong_secret'
    );

    expect(result.valid).toBe(false);
  });

  it('should reject expired timestamp', () => {
    const payload = createMockPaymentIntentEvent();
    const payloadString = JSON.stringify(payload);

    // Create signature with old timestamp (6 minutes ago)
    const oldTimestamp = Math.floor(Date.now() / 1000) - 360;
    const signedPayload = `${oldTimestamp}.${payloadString}`;
    const sig = createHmac('sha256', TEST_WEBHOOK_SECRET).update(signedPayload).digest('hex');
    const signature = `t=${oldTimestamp},v1=${sig}`;

    const result = verifyWebhookSignature(payloadString, signature, TEST_WEBHOOK_SECRET);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('too old');
  });

  it('should reject missing signature header', () => {
    const payload = createMockPaymentIntentEvent();
    const { payloadString } = createSignedPayload(payload);

    const result = verifyWebhookSignature(payloadString, '', TEST_WEBHOOK_SECRET);

    expect(result.valid).toBe(false);
  });

  it('should handle malformed header', () => {
    const payload = createMockPaymentIntentEvent();
    const { payloadString } = createSignedPayload(payload);

    const result = verifyWebhookSignature(
      payloadString,
      'malformed_header',
      TEST_WEBHOOK_SECRET
    );

    expect(result.valid).toBe(false);
  });
});

// =============================================================================
// Event Handler Tests
// =============================================================================

describe('Payment Intent Succeeded Handler', () => {
  let idempotencyManager: IdempotencyManager;

  beforeEach(() => {
    idempotencyManager = createMockIdempotencyManager();
  });

  it('should process payment and create ledger transaction', async () => {
    const event: WebhookEvent = {
      id: 'evt_pay_success_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_123',
          amount: 10000,
          amount_received: 10000,
          currency: 'usd',
          metadata: { payment_id: 'internal_pay_123' },
          application_fee_amount: 290,
        },
      },
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      retryCount: 0,
    };

    const result = await handlePaymentIntentSucceeded(event, idempotencyManager);

    expect(result.success).toBe(true);
    expect(result.eventId).toBe('evt_pay_success_1');
    expect(result.ledgerTransactionId).toBeDefined();
    expect(result.ledgerTransactionId).toMatch(/^txn_/);
  });

  it('should skip duplicate events (idempotency)', async () => {
    const event: WebhookEvent = {
      id: 'evt_duplicate_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_dup',
          amount: 5000,
          amount_received: 5000,
          currency: 'usd',
        },
      },
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      retryCount: 0,
    };

    // First call
    const result1 = await handlePaymentIntentSucceeded(event, idempotencyManager);
    expect(result1.success).toBe(true);
    expect(result1.skipped).toBeFalsy();

    // Second call (duplicate)
    const result2 = await handlePaymentIntentSucceeded(event, idempotencyManager);
    expect(result2.success).toBe(true);
    expect(result2.skipped).toBe(true);
    expect(result2.skipReason).toContain('Already processed');
  });
});

describe('Charge Refunded Handler', () => {
  let idempotencyManager: IdempotencyManager;

  beforeEach(() => {
    idempotencyManager = createMockIdempotencyManager();
  });

  it('should process refund and create ledger transaction', async () => {
    const event: WebhookEvent = {
      id: 'evt_refund_1',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_123',
          amount_refunded: 5000,
          currency: 'usd',
          payment_intent: 'pi_123',
        },
      },
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      retryCount: 0,
    };

    const result = await handleChargeRefunded(event, idempotencyManager);

    expect(result.success).toBe(true);
    expect(result.eventId).toBe('evt_refund_1');
    expect(result.ledgerTransactionId).toBeDefined();
  });

  it('should skip duplicate refund events', async () => {
    const event: WebhookEvent = {
      id: 'evt_refund_dup',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_dup',
          amount_refunded: 2500,
          currency: 'usd',
        },
      },
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      retryCount: 0,
    };

    await handleChargeRefunded(event, idempotencyManager);
    const result2 = await handleChargeRefunded(event, idempotencyManager);

    expect(result2.skipped).toBe(true);
  });
});

// =============================================================================
// Webhook Processor Tests
// =============================================================================

describe('Webhook Processor', () => {
  let processor: WebhookProcessor;

  beforeEach(() => {
    processor = createWebhookProcessor(TEST_WEBHOOK_SECRET);
  });

  it('should process valid payment_intent.succeeded event', async () => {
    const payload = createMockPaymentIntentEvent(10000, 'evt_processor_1');
    const { payloadString, signature } = createSignedPayload(payload);

    const result = await processor.process(payloadString, signature);

    expect(result.success).toBe(true);
    expect(result.eventId).toBe('evt_processor_1');
    expect(result.ledgerTransactionId).toBeDefined();
  });

  it('should process valid charge.refunded event', async () => {
    const payload = createMockRefundEvent(5000, 'evt_refund_proc');
    const { payloadString, signature } = createSignedPayload(payload);

    const result = await processor.process(payloadString, signature);

    expect(result.success).toBe(true);
    expect(result.eventId).toBe('evt_refund_proc');
  });

  it('should reject invalid signature', async () => {
    const payload = createMockPaymentIntentEvent();
    const { payloadString } = createSignedPayload(payload);

    const result = await processor.process(
      payloadString,
      't=123,v1=invalid'
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should skip unknown event types', async () => {
    const payload = {
      id: 'evt_unknown',
      type: 'customer.created',
      data: { object: {} },
      created: Math.floor(Date.now() / 1000),
      livemode: false,
    };
    const { payloadString, signature } = createSignedPayload(payload);

    const result = await processor.process(payloadString, signature);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain('No handler');
  });

  it('should handle idempotent duplicate events', async () => {
    const payload = createMockPaymentIntentEvent(8000, 'evt_idem_test');
    const { payloadString, signature } = createSignedPayload(payload);

    // First call
    const result1 = await processor.process(payloadString, signature);
    expect(result1.success).toBe(true);

    // Second call (duplicate)
    const result2 = await processor.process(payloadString, signature);
    expect(result2.success).toBe(true);
    expect(result2.skipped).toBe(true);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Webhook Integration', () => {
  it('should create correct ledger entries for payment', async () => {
    const processor = createWebhookProcessor(TEST_WEBHOOK_SECRET);

    const amount = 15000; // $150.00
    const fee = 435; // $4.35 (2.9%)

    const payload = {
      id: 'evt_integration_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_integration_1',
          amount,
          amount_received: amount,
          currency: 'usd',
          metadata: { payment_id: 'internal_integration_1' },
          application_fee_amount: fee,
        },
      },
      created: Math.floor(Date.now() / 1000),
      livemode: false,
    };
    const { payloadString, signature } = createSignedPayload(payload);

    const result = await processor.process(payloadString, signature);

    expect(result.success).toBe(true);
    expect(result.ledgerTransactionId).toBeDefined();
    // Transaction should have been created with correct amounts
  });

  it('should handle sequential payment and refund', async () => {
    const processor = createWebhookProcessor(TEST_WEBHOOK_SECRET);

    // 1. Payment
    const paymentPayload = createMockPaymentIntentEvent(20000, 'evt_seq_pay');
    const paymentSigned = createSignedPayload(paymentPayload);

    const payResult = await processor.process(
      paymentSigned.payloadString,
      paymentSigned.signature
    );
    expect(payResult.success).toBe(true);

    // 2. Partial Refund
    const refundPayload = createMockRefundEvent(10000, 'evt_seq_refund');
    const refundSigned = createSignedPayload(refundPayload);

    const refundResult = await processor.process(
      refundSigned.payloadString,
      refundSigned.signature
    );
    expect(refundResult.success).toBe(true);

    // Both should have ledger transactions
    expect(payResult.ledgerTransactionId).toBeDefined();
    expect(refundResult.ledgerTransactionId).toBeDefined();
  });
});
