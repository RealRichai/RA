# Email Delivery System

This document covers the operational setup and configuration of the RealRiches email delivery system.

## Overview

The email service provides:
- **Provider Adapters**: AWS SES (production), Console (development)
- **Template System**: Pre-built templates for auth, lease, document, and alert emails
- **Queue-Based Delivery**: BullMQ for reliable, async email processing
- **Dead Letter Queue (DLQ)**: Captures permanently failed emails for investigation
- **Notification Logging**: Audit trail for all email activity

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `EMAIL_FROM` | Sender email address | `noreply@realriches.com` |
| `EMAIL_PROVIDER` | Email provider (`ses`, `console`) | `ses` |

### AWS SES Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `AWS_SES_REGION` | AWS region for SES | `us-east-1` |
| `AWS_SES_ACCESS_KEY_ID` | AWS access key (optional if using IAM roles) | `AKIA...` |
| `AWS_SES_SECRET_ACCESS_KEY` | AWS secret key (optional if using IAM roles) | `abc123...` |
| `AWS_SES_CONFIGURATION_SET` | SES configuration set for tracking | `realriches-production` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `EMAIL_FROM_NAME` | Sender display name | `RealRiches` |
| `EMAIL_REPLY_TO` | Reply-to address | (same as FROM) |
| `EMAIL_SANDBOX` | Enable sandbox mode | `false` |

## Development Setup

For local development, the console provider logs emails to stdout instead of sending:

```bash
EMAIL_PROVIDER=console
EMAIL_FROM=dev@realriches.local
```

## Production Setup with AWS SES

### 1. Verify Domain in SES

1. Go to AWS SES Console > Verified identities
2. Click "Create identity" > Domain
3. Enter your domain (e.g., `realriches.com`)
4. Copy the DNS records for verification

### 2. Configure DNS Records

Add these records to your DNS provider:

#### DKIM Records (Required)
SES provides 3 CNAME records for DKIM. Add all three:

```
Name: xxxxxxx._domainkey.realriches.com
Type: CNAME
Value: xxxxxxx.dkim.amazonses.com
```

#### SPF Record (Required)
Add or update your SPF record:

```
Name: realriches.com
Type: TXT
Value: "v=spf1 include:amazonses.com ~all"
```

If you already have an SPF record, append `include:amazonses.com` before the `~all` or `-all`.

#### DMARC Record (Recommended)
Add a DMARC policy for enhanced deliverability:

```
Name: _dmarc.realriches.com
Type: TXT
Value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@realriches.com; pct=100; sp=quarantine"
```

DMARC Policy Options:
- `p=none` - Monitor only, no action on failures
- `p=quarantine` - Send failures to spam
- `p=reject` - Reject failures entirely

### 3. Request Production Access

New SES accounts start in **sandbox mode**:
- Can only send to verified email addresses
- Limited to 200 emails/day

To request production access:
1. Go to SES Console > Account dashboard
2. Click "Request production access"
3. Complete the form with use case details

### 4. Create Configuration Set (Optional)

Configuration sets enable email tracking:

```bash
aws ses create-configuration-set --configuration-set-name realriches-production
```

Add event destinations for tracking opens, clicks, bounces, and complaints.

## Email Templates

### Available Templates

| Template ID | Description |
|-------------|-------------|
| `auth.password-reset` | Password reset request |
| `auth.email-verification` | Email address verification |
| `auth.welcome` | New user welcome |
| `lease.created` | New lease notification to tenant |
| `lease.expiring` | Lease expiring soon reminder |
| `documents.signature-request` | Document signature request |
| `alerts.compliance-warning` | Compliance alert notification |

### Template Data Requirements

Each template requires specific data fields. See template source files for required fields:
- `packages/email-service/src/templates/definitions/`

Example - Password Reset:
```typescript
await emailService.send({
  templateId: 'auth.password-reset',
  to: 'user@example.com',
  data: {
    firstName: 'John',
    resetUrl: 'https://app.realriches.com/reset-password?token=abc123',
    expiresIn: '1 hour',
  },
  priority: 'high',
});
```

## Queue Configuration

The email queue uses BullMQ with Redis:

| Setting | Default | Description |
|---------|---------|-------------|
| Queue Name | `email:send` | BullMQ queue name |
| Max Retries | 3 | Attempts before DLQ |
| Retry Delay | Exponential | 1s, 2s, 4s backoff |
| Concurrency | 5 | Parallel workers |
| Completed Retention | 100 | Jobs to keep |
| Failed Retention | 500 | Failed jobs to keep |

### Priority Levels

| Priority | Value | Use Case |
|----------|-------|----------|
| `critical` | 1 | Security alerts, password resets |
| `high` | 2 | Lease notifications, verifications |
| `normal` | 3 | General notifications |
| `low` | 4 | Marketing, digests |

## Monitoring

### Queue Health

```typescript
const health = await emailService.getQueueHealth();
// { waiting: 10, active: 2, completed: 150, failed: 3, delayed: 0, paused: false }
```

### DLQ Inspection

```typescript
const dlqRecords = emailService.getDLQRecords();
const dlqCount = emailService.getDLQCount();
```

### Metrics to Monitor

1. **Queue Depth** (`waiting` + `active`) - Should stay low
2. **Failure Rate** (`failed` / total) - Should be < 1%
3. **DLQ Count** - Should be near zero
4. **Processing Time** - Avg time from queue to sent

## Troubleshooting

### Email Not Sending

1. **Check provider availability**
   ```typescript
   const available = await provider.isAvailable();
   const valid = await provider.validateCredentials();
   ```

2. **Check queue status**
   ```typescript
   const health = await emailService.getQueueHealth();
   ```

3. **Check DLQ for permanent failures**
   ```typescript
   const records = emailService.getDLQRecords();
   ```

### SES Sandbox Restrictions

Error: `Email address is not verified`

- You're in sandbox mode - verify recipient addresses in SES console
- Or request production access

### Rate Limiting

Error: `Throttling`

- SES has sending limits - check your quota in SES console
- Implement backoff or request higher limits

### Bounce Handling

High bounce rates damage sender reputation:
1. Monitor bounce notifications via SNS
2. Remove invalid addresses from your lists
3. Implement email verification for new signups

## Sandbox Mode

For testing without sending real emails:

```bash
EMAIL_SANDBOX=true
```

In sandbox mode:
- Emails are logged but not sent
- Useful for staging environments
- Validates template rendering and queue processing

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   API       │────▶│  BullMQ     │────▶│  Worker     │
│  (enqueue)  │     │  (Redis)    │     │ (process)   │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                           ┌───────────────────┼───────────────────┐
                           │                   │                   │
                           ▼                   ▼                   ▼
                    ┌──────────┐        ┌──────────┐        ┌──────────┐
                    │ Template │        │ Provider │        │ Notif.   │
                    │ Render   │        │  (SES)   │        │ Logger   │
                    └──────────┘        └──────────┘        └──────────┘
                                               │
                                               ▼
                                        ┌──────────┐
                                        │   DLQ    │
                                        │ (failed) │
                                        └──────────┘
```

## Security Considerations

1. **Token Storage**: Password reset and verification tokens are stored in Redis with TTL
2. **Token Hashing**: Tokens are hashed (SHA-256) before storage
3. **Email Enumeration**: Password reset always returns success to prevent enumeration
4. **Session Invalidation**: Password reset invalidates all existing sessions
