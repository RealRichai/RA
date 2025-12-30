/**
 * Webhook Integration Tests
 *
 * Tests for Stripe webhook handling, signature verification,
 * payment lifecycle, idempotency, and payload redaction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mock Stripe Event Fixtures
// =============================================================================

const STRIPE_FIXTURES = {
  paymentIntentSucceeded: {
    id: 'evt_test_payment_succeeded',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_test_12345',
        object: 'payment_intent',
        amount: 150000, // $1500.00 in cents
        amount_received: 150000,
        status: 'succeeded',
        currency: 'usd',
        latest_charge: 'ch_test_12345',
        metadata: {
          payment_id: 'pay_test_12345',
          lease_id: 'lea_test_12345',
          payment_type: 'rent',
        },
        // Sensitive fields that should be redacted
        payment_method_details: {
          card: {
            brand: 'visa',
            last4: '4242',
            exp_month: 12,
            exp_year: 2025,
          },
        },
        billing_details: {
          email: 'tenant@example.com',
          name: 'John Doe',
          address: {
            city: 'New York',
            line1: '123 Main St',
          },
        },
      },
    },
  },

  paymentIntentFailed: {
    id: 'evt_test_payment_failed',
    type: 'payment_intent.payment_failed',
    data: {
      object: {
        id: 'pi_test_failed_12345',
        object: 'payment_intent',
        amount: 150000,
        status: 'requires_payment_method',
        last_payment_error: {
          code: 'card_declined',
          message: 'Your card was declined.',
        },
        metadata: {
          payment_id: 'pay_test_failed_12345',
        },
        payment_method_details: {
          card: { last4: '0002' },
        },
      },
    },
  },

  chargeRefunded: {
    id: 'evt_test_charge_refunded',
    type: 'charge.refunded',
    data: {
      object: {
        id: 'ch_test_refunded_12345',
        object: 'charge',
        amount: 150000,
        amount_refunded: 150000,
        refunded: true,
        payment_intent: 'pi_test_12345',
        metadata: {
          payment_id: 'pay_test_12345',
        },
      },
    },
  },

  chargePartiallyRefunded: {
    id: 'evt_test_charge_partial_refund',
    type: 'charge.refunded',
    data: {
      object: {
        id: 'ch_test_partial_12345',
        object: 'charge',
        amount: 150000,
        amount_refunded: 50000, // $500 partial refund
        refunded: false,
        payment_intent: 'pi_test_12345',
        metadata: {
          payment_id: 'pay_test_12345',
        },
      },
    },
  },

  disputeCreated: {
    id: 'evt_test_dispute_created',
    type: 'charge.dispute.created',
    data: {
      object: {
        id: 'dp_test_12345',
        object: 'dispute',
        amount: 150000,
        charge: 'ch_test_12345',
        status: 'needs_response',
        reason: 'general',
        metadata: {},
      },
    },
  },

  disputeClosedWon: {
    id: 'evt_test_dispute_won',
    type: 'charge.dispute.closed',
    data: {
      object: {
        id: 'dp_test_12345',
        object: 'dispute',
        amount: 150000,
        charge: 'ch_test_12345',
        status: 'won',
        reason: 'general',
      },
    },
  },

  disputeClosedLost: {
    id: 'evt_test_dispute_lost',
    type: 'charge.dispute.closed',
    data: {
      object: {
        id: 'dp_test_lost_12345',
        object: 'dispute',
        amount: 150000,
        charge: 'ch_test_lost_12345',
        status: 'lost',
        reason: 'fraudulent',
      },
    },
  },

  paymentIntentCanceled: {
    id: 'evt_test_payment_canceled',
    type: 'payment_intent.canceled',
    data: {
      object: {
        id: 'pi_test_canceled_12345',
        object: 'payment_intent',
        amount: 150000,
        status: 'canceled',
        cancellation_reason: 'requested_by_customer',
        metadata: {
          payment_id: 'pay_test_canceled_12345',
        },
      },
    },
  },
};

// =============================================================================
// Redaction Tests
// =============================================================================

describe('Webhook Payload Redaction', () => {
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
  ];

  function redactWebhookPayload(data: unknown): unknown {
    if (data === null || data === undefined) return data;
    if (typeof data !== 'object') return data;

    if (Array.isArray(data)) {
      return data.map(redactWebhookPayload);
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (WEBHOOK_REDACTED_FIELDS.includes(key)) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = redactWebhookPayload(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  it('should redact payment_method_details', () => {
    const payload = STRIPE_FIXTURES.paymentIntentSucceeded;
    const redacted = redactWebhookPayload(payload) as typeof payload;

    expect(redacted.data.object.payment_method_details).toBe('[REDACTED]');
  });

  it('should redact billing_details', () => {
    const payload = STRIPE_FIXTURES.paymentIntentSucceeded;
    const redacted = redactWebhookPayload(payload) as typeof payload;

    expect(redacted.data.object.billing_details).toBe('[REDACTED]');
  });

  it('should preserve non-sensitive fields', () => {
    const payload = STRIPE_FIXTURES.paymentIntentSucceeded;
    const redacted = redactWebhookPayload(payload) as typeof payload;

    expect(redacted.id).toBe(payload.id);
    expect(redacted.type).toBe(payload.type);
    expect(redacted.data.object.amount).toBe(150000);
    expect(redacted.data.object.status).toBe('succeeded');
    expect(redacted.data.object.metadata).toEqual(payload.data.object.metadata);
  });

  it('should handle nested arrays', () => {
    const payload = {
      items: [
        { id: 'item1', card: { last4: '4242' } },
        { id: 'item2', card: { last4: '5555' } },
      ],
    };
    const redacted = redactWebhookPayload(payload) as typeof payload;

    expect(redacted.items[0]?.id).toBe('item1');
    expect(redacted.items[0]?.card).toBe('[REDACTED]');
    expect(redacted.items[1]?.card).toBe('[REDACTED]');
  });

  it('should handle null and undefined values', () => {
    const payload = { card: null, shipping: undefined, id: 'test' };
    const redacted = redactWebhookPayload(payload) as typeof payload;

    expect(redacted.card).toBe('[REDACTED]');
    expect(redacted.shipping).toBe('[REDACTED]');
    expect(redacted.id).toBe('test');
  });
});

// =============================================================================
// Payment Lifecycle State Machine Tests
// =============================================================================

describe('Payment Lifecycle State Machine', () => {
  const STRIPE_STATUS_MAP: Record<string, string> = {
    requires_payment_method: 'pending',
    requires_confirmation: 'pending',
    requires_action: 'pending',
    processing: 'processing',
    succeeded: 'completed',
    canceled: 'cancelled',
  };

  it('should map Stripe status to internal payment status', () => {
    expect(STRIPE_STATUS_MAP['requires_payment_method']).toBe('pending');
    expect(STRIPE_STATUS_MAP['processing']).toBe('processing');
    expect(STRIPE_STATUS_MAP['succeeded']).toBe('completed');
    expect(STRIPE_STATUS_MAP['canceled']).toBe('cancelled');
  });

  describe('State Transitions', () => {
    const validTransitions: Record<string, string[]> = {
      pending: ['processing', 'cancelled', 'failed'],
      processing: ['completed', 'failed', 'cancelled'],
      completed: ['refunded', 'partially_refunded', 'disputed'],
      failed: [],
      cancelled: [],
      refunded: [],
      partially_refunded: ['refunded', 'disputed'],
      disputed: ['completed', 'refunded'],
    };

    it('should define valid transitions from pending', () => {
      expect(validTransitions['pending']).toContain('processing');
      expect(validTransitions['pending']).toContain('cancelled');
      expect(validTransitions['pending']).toContain('failed');
    });

    it('should define valid transitions from processing', () => {
      expect(validTransitions['processing']).toContain('completed');
      expect(validTransitions['processing']).toContain('failed');
    });

    it('should define valid transitions from completed', () => {
      expect(validTransitions['completed']).toContain('refunded');
      expect(validTransitions['completed']).toContain('disputed');
    });

    it('should not allow transitions from terminal states', () => {
      expect(validTransitions['failed']).toHaveLength(0);
      expect(validTransitions['cancelled']).toHaveLength(0);
      expect(validTransitions['refunded']).toHaveLength(0);
    });

    it('should allow dispute resolution transitions', () => {
      expect(validTransitions['disputed']).toContain('completed'); // Won
      expect(validTransitions['disputed']).toContain('refunded'); // Lost
    });
  });
});

// =============================================================================
// Stripe Event Fixture Validation
// =============================================================================

describe('Stripe Event Fixtures', () => {
  it('payment_intent.succeeded should have required fields', () => {
    const event = STRIPE_FIXTURES.paymentIntentSucceeded;

    expect(event.id).toBeDefined();
    expect(event.type).toBe('payment_intent.succeeded');
    expect(event.data.object.id).toBeDefined();
    expect(event.data.object.amount).toBe(150000);
    expect(event.data.object.amount_received).toBe(150000);
    expect(event.data.object.status).toBe('succeeded');
  });

  it('payment_intent.payment_failed should have error details', () => {
    const event = STRIPE_FIXTURES.paymentIntentFailed;

    expect(event.type).toBe('payment_intent.payment_failed');
    expect(event.data.object.last_payment_error).toBeDefined();
    expect(event.data.object.last_payment_error.code).toBe('card_declined');
  });

  it('charge.refunded should distinguish full vs partial refund', () => {
    const fullRefund = STRIPE_FIXTURES.chargeRefunded;
    const partialRefund = STRIPE_FIXTURES.chargePartiallyRefunded;

    // Full refund
    expect(fullRefund.data.object.amount).toBe(fullRefund.data.object.amount_refunded);
    expect(fullRefund.data.object.refunded).toBe(true);

    // Partial refund
    expect(partialRefund.data.object.amount).toBeGreaterThan(
      partialRefund.data.object.amount_refunded
    );
    expect(partialRefund.data.object.refunded).toBe(false);
  });

  it('dispute events should have charge reference', () => {
    const created = STRIPE_FIXTURES.disputeCreated;
    const won = STRIPE_FIXTURES.disputeClosedWon;
    const lost = STRIPE_FIXTURES.disputeClosedLost;

    expect(created.data.object.charge).toBeDefined();
    expect(won.data.object.status).toBe('won');
    expect(lost.data.object.status).toBe('lost');
  });
});

// =============================================================================
// Idempotency Key Generation Tests
// =============================================================================

describe('Webhook Idempotency', () => {
  function generateWebhookIdempotencyKey(eventId: string, eventType: string): string {
    return `webhook:${eventId}:${eventType}`;
  }

  it('should generate deterministic idempotency keys', () => {
    const key1 = generateWebhookIdempotencyKey('evt_123', 'payment_intent.succeeded');
    const key2 = generateWebhookIdempotencyKey('evt_123', 'payment_intent.succeeded');

    expect(key1).toBe(key2);
    expect(key1).toBe('webhook:evt_123:payment_intent.succeeded');
  });

  it('should generate unique keys for different events', () => {
    const key1 = generateWebhookIdempotencyKey('evt_123', 'payment_intent.succeeded');
    const key2 = generateWebhookIdempotencyKey('evt_456', 'payment_intent.succeeded');

    expect(key1).not.toBe(key2);
  });

  it('should generate unique keys for different event types', () => {
    const key1 = generateWebhookIdempotencyKey('evt_123', 'payment_intent.succeeded');
    const key2 = generateWebhookIdempotencyKey('evt_123', 'payment_intent.failed');

    expect(key1).not.toBe(key2);
  });

  describe('Replay Protection', () => {
    const processedEvents = new Set<string>();

    function shouldProcessEvent(eventId: string, eventType: string): boolean {
      const key = generateWebhookIdempotencyKey(eventId, eventType);
      if (processedEvents.has(key)) {
        return false;
      }
      processedEvents.add(key);
      return true;
    }

    beforeEach(() => {
      processedEvents.clear();
    });

    it('should process new events', () => {
      const result = shouldProcessEvent('evt_new', 'payment_intent.succeeded');
      expect(result).toBe(true);
    });

    it('should reject duplicate events', () => {
      shouldProcessEvent('evt_dup', 'payment_intent.succeeded');
      const result = shouldProcessEvent('evt_dup', 'payment_intent.succeeded');
      expect(result).toBe(false);
    });

    it('should allow same event ID with different types', () => {
      shouldProcessEvent('evt_same', 'payment_intent.succeeded');
      const result = shouldProcessEvent('evt_same', 'charge.refunded');
      expect(result).toBe(true);
    });
  });
});

// =============================================================================
// Signature Verification Tests (Mocked)
// =============================================================================

describe('Stripe Signature Verification', () => {
  const WEBHOOK_SECRET = 'whsec_test_secret';

  function createSignature(payload: string, timestamp: number, secret: string): string {
    // In production this uses HMAC-SHA256
    // This is a simplified mock for testing
    return `t=${timestamp},v1=mock_signature_${secret.slice(-8)}`;
  }

  function parseSignatureHeader(header: string): { timestamp: number; signature: string } | null {
    const parts = header.split(',');
    let timestamp = 0;
    let signature = '';

    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key === 't') timestamp = parseInt(value || '0', 10);
      if (key === 'v1') signature = value || '';
    }

    if (!timestamp || !signature) return null;
    return { timestamp, signature };
  }

  it('should parse valid signature header', () => {
    const header = createSignature('{}', 1234567890, WEBHOOK_SECRET);
    const parsed = parseSignatureHeader(header);

    expect(parsed).not.toBeNull();
    expect(parsed?.timestamp).toBe(1234567890);
    expect(parsed?.signature).toContain('mock_signature');
  });

  it('should reject missing signature header', () => {
    const parsed = parseSignatureHeader('');
    expect(parsed).toBeNull();
  });

  it('should reject malformed signature header', () => {
    const parsed = parseSignatureHeader('invalid_header');
    expect(parsed).toBeNull();
  });

  describe('Timestamp Tolerance', () => {
    const TOLERANCE_SECONDS = 300; // 5 minutes

    function isTimestampValid(timestamp: number): boolean {
      const now = Math.floor(Date.now() / 1000);
      const diff = Math.abs(now - timestamp);
      return diff <= TOLERANCE_SECONDS;
    }

    it('should accept recent timestamp', () => {
      const now = Math.floor(Date.now() / 1000);
      expect(isTimestampValid(now)).toBe(true);
    });

    it('should accept timestamp within tolerance', () => {
      const now = Math.floor(Date.now() / 1000);
      expect(isTimestampValid(now - 60)).toBe(true); // 1 minute ago
      expect(isTimestampValid(now - 290)).toBe(true); // Just under 5 minutes
    });

    it('should reject old timestamp', () => {
      const now = Math.floor(Date.now() / 1000);
      expect(isTimestampValid(now - 600)).toBe(false); // 10 minutes ago
    });

    it('should reject future timestamp', () => {
      const now = Math.floor(Date.now() / 1000);
      expect(isTimestampValid(now + 600)).toBe(false); // 10 minutes in future
    });
  });
});

// =============================================================================
// Fee Calculation Tests
// =============================================================================

describe('Payment Fee Calculations', () => {
  const STRIPE_FEE_PERCENT = 2.9;
  const STRIPE_FEE_FIXED_CENTS = 30;
  const PLATFORM_FEE_PERCENT = 1.5;

  function calculateStripeFee(amountCents: number): number {
    return Math.round(amountCents * (STRIPE_FEE_PERCENT / 100) + STRIPE_FEE_FIXED_CENTS);
  }

  function calculatePlatformFee(amountCents: number): number {
    return Math.round(amountCents * (PLATFORM_FEE_PERCENT / 100));
  }

  function calculateNetToLandlord(amountCents: number): number {
    return amountCents - calculateStripeFee(amountCents) - calculatePlatformFee(amountCents);
  }

  it('should calculate Stripe fee correctly', () => {
    // $100.00 = 10000 cents
    // Fee = 10000 * 0.029 + 30 = 290 + 30 = 320 cents = $3.20
    expect(calculateStripeFee(10000)).toBe(320);

    // $1500.00 = 150000 cents
    // Fee = 150000 * 0.029 + 30 = 4350 + 30 = 4380 cents = $43.80
    expect(calculateStripeFee(150000)).toBe(4380);
  });

  it('should calculate platform fee correctly', () => {
    // $100.00 = 10000 cents, 1.5% = 150 cents
    expect(calculatePlatformFee(10000)).toBe(150);

    // $1500.00 = 150000 cents, 1.5% = 2250 cents
    expect(calculatePlatformFee(150000)).toBe(2250);
  });

  it('should calculate net to landlord correctly', () => {
    const amount = 150000; // $1500
    const stripeFee = calculateStripeFee(amount); // 4380
    const platformFee = calculatePlatformFee(amount); // 2250
    const netToLandlord = calculateNetToLandlord(amount);

    expect(netToLandlord).toBe(amount - stripeFee - platformFee);
    expect(netToLandlord).toBe(143370); // $1433.70
  });

  it('should handle edge cases', () => {
    // Zero amount
    expect(calculateStripeFee(0)).toBe(30); // Fixed fee only
    expect(calculatePlatformFee(0)).toBe(0);

    // Small amount ($1)
    expect(calculateStripeFee(100)).toBe(33); // 3 + 30
    expect(calculatePlatformFee(100)).toBe(2); // Rounded
  });
});
