# Payments System

This document describes the payment processing system, including Stripe integration, webhook handling, ledger posting, and failure modes.

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `STRIPE_SECRET_KEY` | Stripe API secret key | `sk_live_...` or `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret | `whsec_...` |
| `REDIS_URL` | Redis connection for idempotency | `redis://localhost:6379` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://...` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `STRIPE_API_VERSION` | Stripe API version | `2024-04-10` |
| `PLATFORM_FEE_PERCENT` | Platform fee percentage | `1.5` |

## Payment Lifecycle

### State Machine

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    ▼                                         │
┌─────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐ │
│ pending │───▶│processing│───▶│ completed │───▶│ disputed │─┘
└─────────┘    └──────────┘    └───────────┘    └──────────┘
     │              │               │                │
     │              │               │                │
     ▼              ▼               ▼                ▼
┌─────────┐    ┌─────────┐    ┌──────────┐    ┌──────────┐
│cancelled│    │ failed  │    │ refunded │    │ refunded │
└─────────┘    └─────────┘    └──────────┘    └──────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │partially_refunded│
                          └─────────────────┘
```

### Stripe Event Mapping

| Stripe Event | Internal Status | Notes |
|--------------|-----------------|-------|
| `payment_intent.created` | `pending` | Payment initialized |
| `payment_intent.processing` | `processing` | Bank processing |
| `payment_intent.succeeded` | `completed` | Ledger posted |
| `payment_intent.payment_failed` | `failed` | Terminal state |
| `payment_intent.canceled` | `cancelled` | Terminal state |
| `charge.refunded` (full) | `refunded` | Terminal state |
| `charge.refunded` (partial) | `partially_refunded` | Can be refunded again |
| `charge.dispute.created` | `disputed` | Funds held |
| `charge.dispute.closed` (won) | `completed` | Funds released |
| `charge.dispute.closed` (lost) | `refunded` | Funds lost |

## Webhook Handling

### Signature Verification

All Stripe webhooks are verified using HMAC-SHA256:

1. Extract `stripe-signature` header
2. Parse timestamp and signature from header
3. Compute expected signature using webhook secret
4. Compare signatures (timing-safe)
5. Verify timestamp within 5-minute tolerance

### Idempotency

Webhooks are deduplicated using Redis-backed idempotency:

```
Key format: webhook:{event_id}:{event_type}
TTL: 24 hours
```

Duplicate events are skipped with a 200 response (Stripe expects success).

### Replay Protection

- Events older than 5 minutes are rejected
- Events from the future are rejected
- Event IDs are stored in Redis to prevent replay

## Ledger Posting

### Rent Payment Waterfall

When a rent payment succeeds, the following waterfall is applied:

1. **Stripe Processing Fee** (2.9% + $0.30)
   - Deducted by Stripe before funds reach platform
   - Recorded as `PAYMENT_PROCESSING_FEE` expense

2. **Platform Fee** (1.5% of gross)
   - Platform revenue for facilitating payment
   - Credited to `PLATFORM_FEE_REVENUE`

3. **Landlord Payout** (remainder)
   - Net amount owed to property owner
   - Credited to `ACCOUNTS_PAYABLE`

### Example: $1,500 Rent Payment

```
Gross Amount:      $1,500.00
Stripe Fee:        -   43.80  (2.9% + $0.30)
Platform Fee:      -   22.50  (1.5%)
Net to Landlord:   $1,433.70
```

### Double-Entry Ledger

All transactions create balanced ledger entries:

```
Rent Payment Received:
  DR  STRIPE_CLEARING         $1,500.00
  CR  ACCOUNTS_RECEIVABLE     $1,500.00

Processing Fee:
  DR  PAYMENT_PROCESSING_FEE  $   43.80
  CR  STRIPE_CLEARING         $   43.80

Platform Revenue:
  DR  CASH                    $   22.50
  CR  PLATFORM_FEE_REVENUE    $   22.50

Landlord Liability:
  DR  CASH                    $1,433.70
  CR  ACCOUNTS_PAYABLE        $1,433.70
```

### Dispute Handling

When a dispute is created:
```
  DR  SECURITY_DEPOSITS_HELD  $1,500.00
  CR  CASH                    $1,500.00
```

When dispute is resolved (won):
```
  DR  CASH                    $1,500.00
  CR  SECURITY_DEPOSITS_HELD  $1,500.00
```

When dispute is resolved (lost):
```
  DR  REFUND_EXPENSE          $1,500.00
  CR  SECURITY_DEPOSITS_HELD  $1,500.00
```

## API Idempotency

Payment processing endpoints support idempotency keys:

```
Key format: payment:{payment_id}:{user_id}:{timestamp_bucket}
TTL: 24 hours
Timestamp bucket: 5-minute windows
```

### Usage

```http
POST /api/v1/payments/:id/process
Content-Type: application/json
X-Idempotency-Key: custom-key-12345

{
  "paymentMethodId": "pm_xxx"
}
```

If a request with the same idempotency key is received:
- Within TTL: Returns cached response
- After TTL: Processes as new request

## Failure Modes

### Webhook Failures

| Scenario | Response | Retry |
|----------|----------|-------|
| Missing signature header | 400 | No |
| Invalid signature | 400 | No |
| Expired timestamp | 400 | No |
| Database error | 500 | Yes |
| Unknown event type | 200 | No |

Stripe retries 5xx responses for up to 3 days with exponential backoff.

### Payment Failures

| Error Code | Description | Recovery |
|------------|-------------|----------|
| `card_declined` | Card was declined | Try different card |
| `insufficient_funds` | Insufficient balance | Wait and retry |
| `expired_card` | Card has expired | Update payment method |
| `processing_error` | Temporary Stripe error | Automatic retry |

### Ledger Failures

All ledger operations are wrapped in database transactions:

1. If ledger posting fails, payment status is not updated
2. Webhook returns 500, triggering Stripe retry
3. On retry, idempotency check prevents duplicate processing
4. Ledger posting is reattempted

## Security

### PII Redaction

The following fields are redacted from logs:

- `card` - Card details
- `bank_account` - Bank account details
- `payment_method_details` - Payment method specifics
- `billing_details` - Name, email, address
- `shipping` - Shipping address
- `client_secret` - Stripe secrets
- `receipt_email` - Customer email
- `customer_email` - Customer email

### Example Log Output

```json
{
  "eventId": "evt_xxx",
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_xxx",
      "amount": 150000,
      "payment_method_details": "[REDACTED]",
      "billing_details": "[REDACTED]"
    }
  }
}
```

## Testing

### Running Tests

```bash
# Webhook integration tests
cd apps/api && pnpm test

# Ledger allocation tests
cd packages/revenue-engine && pnpm test
```

### Stripe Test Mode

Use test mode keys for development:

```bash
export STRIPE_SECRET_KEY=sk_test_xxx
export STRIPE_WEBHOOK_SECRET=whsec_xxx
```

### Stripe CLI for Local Webhooks

```bash
# Forward webhooks to local server
stripe listen --forward-to localhost:4000/api/v1/webhooks/stripe

# Trigger test events
stripe trigger payment_intent.succeeded
stripe trigger charge.refunded
stripe trigger charge.dispute.created
```

## Partner Integrations

### Deposit Alternatives

Support for third-party deposit alternative providers:

| Provider | Products | Commission |
|----------|----------|------------|
| LeaseLock | Deposit alternative | 15% |
| Rhino | Deposit alternative, Guarantor | 12% |
| Jetty | Deposit alternative, Renters insurance | 10% |

### Quote Flow

1. Tenant requests deposit alternative quote
2. System calls partner API with property/tenant details
3. Partner returns quote with premium
4. If approved, application is created in `pending` state
5. Partner webhook confirms binding
6. Ledger entries created for commission

## Monitoring

### Key Metrics

- `payments_processed_total` - Total payment count
- `payments_failed_total` - Failed payment count
- `webhooks_received_total` - Webhook count by type
- `webhooks_duplicate_total` - Duplicate webhook count
- `ledger_transactions_total` - Ledger posting count

### Alerts

Configure alerts for:

- Webhook failure rate > 5%
- Payment failure rate > 10%
- Ledger posting failures
- Stripe API errors
