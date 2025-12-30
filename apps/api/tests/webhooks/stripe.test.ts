/**
 * Stripe Webhook Integration Tests
 *
 * Tests webhook signature verification, event processing, and idempotency.
 */

import { createHmac } from 'crypto';

import { describe, it, expect } from 'vitest';

import {
  TEST_WEBHOOK_SECRET,
  createSignedPayload,
  createExpiredSignedPayload,
  createPaymentIntentSucceededEvent,
  createPaymentIntentFailedEvent,
  createChargeRefundedEvent,
  createDisputeCreatedEvent,
  createUnknownEvent,
} from '../fixtures/stripe-events';

// Import directly from the source for testing
import {
  verifyWebhookSignature,
  createWebhookProcessor,
} from '../../../../packages/revenue-engine/src/stripe/webhook-handler';
import { redactStripeData } from '../../src/lib/stripe';

describe('Stripe Webhook Endpoint', () => {
  describe('Signature Verification', () => {
    it('should accept valid signature', async () => {
      const event = createPaymentIntentSucceededEvent();
      const { payloadString, signature } = createSignedPayload(event);

      const result = verifyWebhookSignature(payloadString, signature, TEST_WEBHOOK_SECRET);

      expect(result.valid).toBe(true);
      expect(result.event).toBeDefined();
      expect(result.event?.id).toBe('evt_test_payment_succeeded');
    });

    it('should reject invalid signature', async () => {
      const event = createPaymentIntentSucceededEvent();
      const { payloadString } = createSignedPayload(event);

      const timestamp = Math.floor(Date.now() / 1000);
      const result = verifyWebhookSignature(
        payloadString,
        `t=${timestamp},v1=0000000000000000000000000000000000000000000000000000000000000000`,
        TEST_WEBHOOK_SECRET
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Signature verification failed');
    });

    it('should reject expired timestamp (>5 minutes old)', async () => {
      const event = createPaymentIntentSucceededEvent();
      const { payloadString, signature } = createExpiredSignedPayload(event, TEST_WEBHOOK_SECRET, 360);

      const result = verifyWebhookSignature(payloadString, signature, TEST_WEBHOOK_SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('timestamp too old');
    });

    it('should reject missing signature header', async () => {
      const result = verifyWebhookSignature('{}', '', TEST_WEBHOOK_SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid signature header');
    });
  });

  describe('Event Processing', () => {
    it('should process payment_intent.succeeded event', async () => {
      const event = createPaymentIntentSucceededEvent({
        eventId: 'evt_success_1',
        amount: 15000,
      });
      const { payloadString, signature } = createSignedPayload(event);

      const processor = createWebhookProcessor(TEST_WEBHOOK_SECRET);
      const result = await processor.process(payloadString, signature);

      expect(result.success).toBe(true);
      expect(result.eventId).toBe('evt_success_1');
      expect(result.ledgerTransactionId).toBeDefined();
    });

    it('should process payment_intent.payment_failed event', async () => {
      const event = createPaymentIntentFailedEvent({
        eventId: 'evt_failed_1',
        errorCode: 'insufficient_funds',
        errorMessage: 'Insufficient funds',
      });
      const { payloadString, signature } = createSignedPayload(event);

      const processor = createWebhookProcessor(TEST_WEBHOOK_SECRET);
      const result = await processor.process(payloadString, signature);

      expect(result.success).toBe(true);
      expect(result.eventId).toBe('evt_failed_1');
    });

    it('should process charge.refunded event', async () => {
      const event = createChargeRefundedEvent({
        eventId: 'evt_refund_1',
        amountRefunded: 5000,
      });
      const { payloadString, signature } = createSignedPayload(event);

      const processor = createWebhookProcessor(TEST_WEBHOOK_SECRET);
      const result = await processor.process(payloadString, signature);

      expect(result.success).toBe(true);
      expect(result.eventId).toBe('evt_refund_1');
      expect(result.ledgerTransactionId).toBeDefined();
    });

    it('should process charge.dispute.created event', async () => {
      const event = createDisputeCreatedEvent({
        eventId: 'evt_dispute_1',
      });
      const { payloadString, signature } = createSignedPayload(event);

      const processor = createWebhookProcessor(TEST_WEBHOOK_SECRET);
      const result = await processor.process(payloadString, signature);

      expect(result.success).toBe(true);
      expect(result.eventId).toBe('evt_dispute_1');
    });

    it('should skip unknown event types gracefully', async () => {
      const event = createUnknownEvent({
        eventId: 'evt_unknown_1',
        type: 'some.unknown.event',
      });
      const { payloadString, signature } = createSignedPayload(event);

      const processor = createWebhookProcessor(TEST_WEBHOOK_SECRET);
      const result = await processor.process(payloadString, signature);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toContain('No handler for event type');
    });
  });

  describe('Idempotency', () => {
    it('should return same result for duplicate events', async () => {
      const event = createPaymentIntentSucceededEvent({
        eventId: 'evt_idempotent_1',
      });
      const { payloadString, signature } = createSignedPayload(event);

      const processor = createWebhookProcessor(TEST_WEBHOOK_SECRET);

      // Process first time
      const result1 = await processor.process(payloadString, signature);
      expect(result1.success).toBe(true);
      expect(result1.skipped).toBeFalsy();

      // Process second time - should be skipped as duplicate
      const result2 = await processor.process(payloadString, signature);
      expect(result2.success).toBe(true);
      expect(result2.skipped).toBe(true);
      expect(result2.skipReason).toContain('Already processed');
    });
  });

  describe('Error Handling', () => {
    it('should reject malformed JSON payload', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const malformedPayload = 'not valid json';
      const signedPayload = `${timestamp}.${malformedPayload}`;
      const sig = createHmac('sha256', TEST_WEBHOOK_SECRET).update(signedPayload).digest('hex');
      const signature = `t=${timestamp},v1=${sig}`;

      const result = verifyWebhookSignature(malformedPayload, signature, TEST_WEBHOOK_SECRET);

      expect(result.valid).toBe(false);
    });

    it('should handle empty payload', async () => {
      const result = verifyWebhookSignature('', 't=123,v1=abc', TEST_WEBHOOK_SECRET);

      expect(result.valid).toBe(false);
    });
  });
});

describe('PII Redaction', () => {
  it('should redact Stripe-related sensitive fields', () => {
    const sensitiveData = {
      id: 'pi_123',
      client_secret: 'pi_123_secret_abc',
      customer: 'cus_123',
      payment_method: 'pm_123',
      card: {
        number: '4242424242424242',
        cvc: '123',
        exp_month: 12,
        exp_year: 2025,
      },
      amount: 10000,
    };

    const redacted = redactStripeData(sensitiveData) as Record<string, unknown>;

    expect(redacted.id).toBe('pi_123');
    expect(redacted.client_secret).toBe('[REDACTED]');
    expect(redacted.customer).toBe('[REDACTED]');
    expect(redacted.payment_method).toBe('[REDACTED]');
    expect(redacted.card).toBe('[REDACTED]');
    expect(redacted.amount).toBe(10000);
  });

  it('should handle nested objects', () => {
    const nestedData = {
      data: {
        object: {
          id: 'ch_123',
          source: 'src_123',
          details: {
            bank_account: 'ba_123',
          },
        },
      },
    };

    const redacted = redactStripeData(nestedData) as Record<string, unknown>;
    const dataObj = redacted.data as Record<string, unknown>;
    const objectObj = dataObj.object as Record<string, unknown>;

    expect(objectObj.id).toBe('ch_123');
    expect(objectObj.source).toBe('[REDACTED]');
  });

  it('should handle null and undefined', () => {
    expect(redactStripeData(null)).toBeNull();
    expect(redactStripeData(undefined)).toBeUndefined();
  });
});
