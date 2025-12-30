# Stripe Integration Guide

## Overview

This document covers the operational aspects of the Stripe payment integration, including configuration, webhook setup, key rotation, and failure handling.

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `STRIPE_SECRET_KEY` | Stripe API secret key | `sk_live_xxx` or `sk_test_xxx` |
| `STRIPE_PUBLISHABLE_KEY` | Frontend publishable key | `pk_live_xxx` or `pk_test_xxx` |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret | `whsec_xxx` |

### Configuration

Add to your `.env` file:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_test_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

## Webhook Configuration

### Stripe Dashboard Setup

1. Go to [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Enter your webhook URL: `https://your-domain.com/webhooks/stripe`
4. Select the following events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `charge.dispute.created`
5. Copy the signing secret (`whsec_xxx`) to your `STRIPE_WEBHOOK_SECRET`

### Webhook Endpoint

- **URL**: `POST /webhooks/stripe`
- **Authentication**: None (uses signature verification)
- **Content-Type**: `application/json`

### Supported Events

| Event | Action |
|-------|--------|
| `payment_intent.succeeded` | Updates Payment to 'completed', creates ledger entry |
| `payment_intent.payment_failed` | Updates Payment to 'failed', records error |
| `charge.refunded` | Updates Payment to 'refunded', creates refund ledger entry |
| `charge.dispute.created` | Updates Payment to 'disputed', alerts team |

## Key Rotation

### Rotating API Keys

1. Generate new API key in Stripe Dashboard
2. Update `STRIPE_SECRET_KEY` in your environment
3. Deploy the updated configuration
4. Verify functionality with a test payment
5. Revoke the old key in Stripe Dashboard

### Rotating Webhook Secret

1. Add a new webhook endpoint in Stripe Dashboard
2. Copy the new signing secret
3. Update `STRIPE_WEBHOOK_SECRET` in your environment
4. Deploy the updated configuration
5. Delete the old webhook endpoint in Stripe Dashboard

**Important**: During rotation, briefly both old and new secrets may receive events. The system handles this gracefully via idempotency.

## Failure Modes and Recovery

### Webhook Delivery Failures

**Behavior**: Stripe retries failed webhooks with exponential backoff for up to 3 days.

**Recovery**:
- Webhooks returning 4xx are not retried (signature/validation issues)
- Webhooks returning 5xx are retried automatically
- Check Stripe Dashboard > Webhooks for failed events

### Payment Processing Failures

**Common Errors**:

| Error Code | Meaning | Action |
|------------|---------|--------|
| `card_declined` | Card was declined | Notify customer to use different card |
| `insufficient_funds` | Insufficient funds | Notify customer |
| `expired_card` | Card has expired | Notify customer to update card |
| `processing_error` | Temporary Stripe issue | Retry after delay |

**Recovery**:
- Failed payments are marked with `status: 'failed'` and `lastError`
- Retry via the `/payments/:id/process` endpoint
- Check `retryCount` to avoid infinite retries

### Ledger Posting Failures

**Behavior**: Webhook processing and ledger posting are idempotent.

**Recovery**:
- If ledger posting fails, the webhook will be retried by Stripe
- Same idempotency key ensures no duplicate entries
- Check `ProcessedWebhook` table for event status

### Database Unavailable

**Behavior**: Webhook returns 500, Stripe retries.

**Recovery**:
- Restore database connectivity
- Stripe will automatically retry pending webhooks
- No data loss due to idempotency

## Idempotency

All payment operations use idempotency keys:

- **Webhooks**: Event ID (`evt_xxx`) is the idempotency key
- **PaymentIntents**: Internal payment ID is included in metadata
- **Ledger Entries**: Generated from webhook event ID

This ensures:
- No duplicate charges
- No duplicate ledger entries
- Safe retry behavior

## Security

### PII Protection

The following fields are automatically redacted in logs:
- `stripeCustomerId`
- `stripePaymentMethodId`
- `stripePaymentIntentId`
- `clientSecret`
- `card`, `cvc`, `expiry`
- `bankAccount`, `routingNumber`, `accountNumber`

### Webhook Verification

- HMAC-SHA256 signature verification
- 5-minute timestamp tolerance (replay protection)
- Timing-safe comparison to prevent timing attacks

## Monitoring

### Key Metrics to Monitor

1. **Webhook Success Rate**: `webhooks.processed / webhooks.received`
2. **Payment Success Rate**: `payments.succeeded / payments.attempted`
3. **Ledger Entry Count**: Should match webhook count
4. **Processing Latency**: Time from webhook receipt to completion

### Alerts

Set up alerts for:
- Webhook failure rate > 5%
- Payment failure rate > 10%
- Any dispute events
- Ledger balance discrepancies

## Testing

### Sandbox Testing

Use Stripe test keys (`sk_test_xxx`, `pk_test_xxx`) for development.

**Test Cards**:
- `4242424242424242` - Success
- `4000000000000002` - Decline
- `4000000000009995` - Insufficient funds

### Webhook Testing

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Forward webhooks to local server
stripe listen --forward-to localhost:4000/webhooks/stripe

# Trigger test events
stripe trigger payment_intent.succeeded
stripe trigger payment_intent.payment_failed
stripe trigger charge.refunded
```

### Integration Tests

Run the test suite:

```bash
pnpm --filter @realriches/api test -- --grep "Stripe"
```

## Database Tables

### LedgerTransaction

Stores double-entry bookkeeping transactions.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `idempotencyKey` | String | Unique key for deduplication |
| `type` | String | Transaction type (payment_received, refund, etc.) |
| `status` | String | pending, posted, voided |
| `externalId` | String | Stripe PaymentIntent ID |
| `referenceId` | UUID | Link to Payment table |

### LedgerEntry

Individual debit/credit entries.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `transactionId` | UUID | Parent transaction |
| `accountCode` | String | CASH, STRIPE_CLEARING, etc. |
| `amount` | Decimal | Entry amount |
| `isDebit` | Boolean | True for debit, false for credit |

### ProcessedWebhook

Tracks processed webhook events.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `eventId` | String | Stripe event ID (unique) |
| `eventType` | String | Event type |
| `processedAt` | DateTime | When processed |
| `result` | JSON | Processing result |

## Support

For Stripe-related issues:
1. Check Stripe Dashboard logs
2. Review `ProcessedWebhook` table
3. Check application logs for errors
4. Contact Stripe support for API issues
