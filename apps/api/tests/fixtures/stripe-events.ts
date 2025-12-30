/**
 * Stripe Event Fixtures
 *
 * Mock Stripe webhook events for testing.
 */

import { createHmac } from 'crypto';

export const TEST_WEBHOOK_SECRET = 'whsec_test_secret_key_123';

/**
 * Create a signed webhook payload with correct signature.
 */
export function createSignedPayload(
  payload: object,
  secret: string = TEST_WEBHOOK_SECRET
): { payloadString: string; signature: string; rawBody: Buffer } {
  const payloadString = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payloadString}`;
  const sig = createHmac('sha256', secret).update(signedPayload).digest('hex');
  const signature = `t=${timestamp},v1=${sig}`;

  return {
    payloadString,
    signature,
    rawBody: Buffer.from(payloadString, 'utf8'),
  };
}

/**
 * Create a signed payload with an expired timestamp.
 */
export function createExpiredSignedPayload(
  payload: object,
  secret: string = TEST_WEBHOOK_SECRET,
  ageSeconds: number = 360 // 6 minutes old
): { payloadString: string; signature: string; rawBody: Buffer } {
  const payloadString = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000) - ageSeconds;
  const signedPayload = `${timestamp}.${payloadString}`;
  const sig = createHmac('sha256', secret).update(signedPayload).digest('hex');
  const signature = `t=${timestamp},v1=${sig}`;

  return {
    payloadString,
    signature,
    rawBody: Buffer.from(payloadString, 'utf8'),
  };
}

/**
 * Create a payment_intent.succeeded event.
 */
export function createPaymentIntentSucceededEvent(options: {
  eventId?: string;
  paymentIntentId?: string;
  amount?: number;
  paymentId?: string;
} = {}): object {
  const {
    eventId = 'evt_test_payment_succeeded',
    paymentIntentId = 'pi_test_123',
    amount = 10000, // $100.00
    paymentId = 'pay_internal_123',
  } = options;

  return {
    id: eventId,
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: paymentIntentId,
        amount,
        amount_received: amount,
        currency: 'usd',
        status: 'succeeded',
        metadata: {
          payment_id: paymentId,
          platform: 'realriches',
        },
        latest_charge: 'ch_test_123',
        application_fee_amount: Math.round(amount * 0.029), // 2.9% fee
      },
    },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
  };
}

/**
 * Create a payment_intent.payment_failed event.
 */
export function createPaymentIntentFailedEvent(options: {
  eventId?: string;
  paymentIntentId?: string;
  amount?: number;
  paymentId?: string;
  errorCode?: string;
  errorMessage?: string;
} = {}): object {
  const {
    eventId = 'evt_test_payment_failed',
    paymentIntentId = 'pi_test_456',
    amount = 10000,
    paymentId = 'pay_internal_456',
    errorCode = 'card_declined',
    errorMessage = 'Your card was declined.',
  } = options;

  return {
    id: eventId,
    type: 'payment_intent.payment_failed',
    data: {
      object: {
        id: paymentIntentId,
        amount,
        currency: 'usd',
        status: 'requires_payment_method',
        last_payment_error: {
          code: errorCode,
          message: errorMessage,
          type: 'card_error',
        },
        metadata: {
          payment_id: paymentId,
          platform: 'realriches',
        },
      },
    },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
  };
}

/**
 * Create a charge.refunded event.
 */
export function createChargeRefundedEvent(options: {
  eventId?: string;
  chargeId?: string;
  paymentIntentId?: string;
  amountRefunded?: number;
} = {}): object {
  const {
    eventId = 'evt_test_refund',
    chargeId = 'ch_test_789',
    paymentIntentId = 'pi_test_123',
    amountRefunded = 5000, // $50.00
  } = options;

  return {
    id: eventId,
    type: 'charge.refunded',
    data: {
      object: {
        id: chargeId,
        amount_refunded: amountRefunded,
        currency: 'usd',
        payment_intent: paymentIntentId,
        refunded: true,
      },
    },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
  };
}

/**
 * Create a charge.dispute.created event.
 */
export function createDisputeCreatedEvent(options: {
  eventId?: string;
  disputeId?: string;
  chargeId?: string;
  amount?: number;
  reason?: string;
} = {}): object {
  const {
    eventId = 'evt_test_dispute',
    disputeId = 'dp_test_123',
    chargeId = 'ch_test_123',
    amount = 10000,
    reason = 'fraudulent',
  } = options;

  return {
    id: eventId,
    type: 'charge.dispute.created',
    data: {
      object: {
        id: disputeId,
        charge: chargeId,
        amount,
        currency: 'usd',
        reason,
        status: 'needs_response',
      },
    },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
  };
}

/**
 * Create an event with unknown type.
 */
export function createUnknownEvent(options: {
  eventId?: string;
  type?: string;
} = {}): object {
  const {
    eventId = 'evt_test_unknown',
    type = 'unknown.event.type',
  } = options;

  return {
    id: eventId,
    type,
    data: {
      object: {
        id: 'obj_test_123',
      },
    },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
  };
}
