# Chaos Engineering: Shadow Write Testing

## Overview

This document describes the fault injection system for testing shadow write (dual-write) behavior in staging environments. The system validates that:

1. **Primary writes always succeed** - Canonical data is never lost
2. **Shadow failures are gracefully handled** - System remains stable under failure
3. **Discrepancies are detected and reported** - Observability for consistency issues
4. **Evidence trail exists** - SOC2 audit compliance for all failures

## Safety Guarantees

### SAFE-BY-DEFAULT

- `CHAOS_ENABLED=false` by default
- `CHAOS_FAIL_RATE=0` by default
- `CHAOS_SCOPE=shadow_write_only` by default (only affects shadow writes)

### PRODUCTION-BLOCKED

```
FATAL: CHAOS_ENABLED=true is forbidden in production.
Chaos engineering must NEVER run in NODE_ENV=production.
This is a safety violation. Aborting boot.
```

If `NODE_ENV=production` and `CHAOS_ENABLED=true`, the application **will not start**.

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CHAOS_ENABLED` | `false` | Enable/disable fault injection |
| `CHAOS_FAIL_RATE` | `0` | Probability of failure (0.0 to 1.0) |
| `CHAOS_SEED` | (random) | Seed for deterministic failures (for reproducible tests) |
| `CHAOS_SCOPE` | `shadow_write_only` | Scope of fault injection |

### Scopes

| Scope | Affects |
|-------|---------|
| `shadow_write_only` | Only shadow store writes (default, safest) |
| `all_writes` | Both shadow and non-critical writes |
| `reads` | All operations including reads (testing only) |

---

## Running in Staging

### 1. Enable Chaos Engineering

```bash
# In staging environment
export CHAOS_ENABLED=true
export CHAOS_FAIL_RATE=0.1  # 10% failure rate
export CHAOS_SCOPE=shadow_write_only

# Optional: deterministic failures for debugging
export CHAOS_SEED=my-test-run-123
```

### 2. Deploy to Staging

```bash
# Using Kubernetes
kubectl set env deployment/api CHAOS_ENABLED=true CHAOS_FAIL_RATE=0.1

# Using Docker Compose
docker-compose -f docker-compose.staging.yml up -d
```

### 3. Monitor

```bash
# Check metrics
curl -s http://staging-api:4000/metrics | grep shadow

# Expected output:
# shadow_write_failures_total{entity_type="Listing",operation="create",failure_type="injected"} 12
# shadow_write_successes_total{entity_type="Listing",operation="create"} 88
# shadow_discrepancies_total{entity_type="Listing",discrepancy_type="missing_in_shadow"} 12
# chaos_injected_faults_total{entity_type="Listing",operation="create"} 12
```

### 4. Review Evidence

```sql
-- Query evidence records for shadow write failures
SELECT *
FROM evidence_records
WHERE event_type = 'SHADOW_WRITE_FAILURE'
ORDER BY occurred_at DESC
LIMIT 50;

-- Query discrepancies found by verifier
SELECT *
FROM evidence_records
WHERE event_type = 'SHADOW_WRITE_DISCREPANCY'
ORDER BY occurred_at DESC
LIMIT 50;
```

---

## Kill Switch - Emergency Stop

### Immediate Disable

```bash
# Option 1: Environment variable
kubectl set env deployment/api CHAOS_ENABLED=false

# Option 2: Rolling restart (clears all env overrides)
kubectl rollout restart deployment/api

# Option 3: Scale down and up
kubectl scale deployment/api --replicas=0
kubectl scale deployment/api --replicas=3
```

### Verify Disabled

```bash
# Check metrics - should stop incrementing
watch -n 1 'curl -s http://staging-api:4000/metrics | grep chaos_injected_faults_total'
```

---

## What This Tests

### 1. Resilience of Primary Writes

The system ensures that even when shadow writes fail:
- Canonical data is written to PostgreSQL successfully
- No transaction rollback occurs
- Users experience no errors

### 2. Shadow Write Failure Handling

When a shadow write fails (injected or real):
- Failure is logged with structured data
- Prometheus metric is incremented
- EvidenceRecord is created for audit trail
- Primary write is NOT affected

### 3. Discrepancy Detection

The scheduled verifier job:
- Runs every 15 minutes in staging (when enabled)
- Compares primary and shadow stores
- Detects: missing in shadow, missing in primary, data mismatches
- Records all discrepancies as EvidenceRecords
- Updates `shadow_discrepancy_last_check_timestamp` metric

### 4. Observability

All chaos-related events are observable via:
- **Prometheus metrics**: Real-time counters and histograms
- **Structured logs**: JSON logs with requestId correlation
- **EvidenceRecords**: Immutable audit trail in database

---

## Evidence Produced

### EvidenceRecord Fields

| Field | Description |
|-------|-------------|
| `controlId` | `CC-7.2` (SOC2 System Monitoring) |
| `category` | `ProcessingIntegrity` |
| `eventType` | `SHADOW_WRITE_FAILURE` or `SHADOW_WRITE_DISCREPANCY` |
| `eventOutcome` | `FAILURE` or `DISCREPANCY` |
| `entityType` | `Listing` (or other entity) |
| `entityId` | UUID of affected entity |
| `requestId` | Correlation ID from request |
| `details` | Structured JSON with error info (no PII) |
| `contentHash` | SHA-256 hash for integrity |

### Metrics

| Metric | Labels | Description |
|--------|--------|-------------|
| `shadow_write_failures_total` | entity_type, operation, failure_type | Counter of failures |
| `shadow_write_successes_total` | entity_type, operation | Counter of successes |
| `shadow_write_duration_seconds` | entity_type, operation, success | Histogram of durations |
| `shadow_discrepancies_total` | entity_type, discrepancy_type | Counter of discrepancies |
| `chaos_injected_faults_total` | entity_type, operation | Counter of injected faults |
| `shadow_discrepancy_last_check_timestamp` | entity_type | Gauge of last check time |

---

## Testing Locally

### Run Unit Tests

```bash
# FaultInjector tests
pnpm --filter @realriches/testing test

# Shadow write integration tests
pnpm --filter @realriches/api test shadow-write
```

### Manual Testing

```bash
# Start API with chaos enabled
CHAOS_ENABLED=true CHAOS_FAIL_RATE=0.3 pnpm dev:api

# Create listings and observe some shadow failures
curl -X POST http://localhost:4000/api/listings \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "price": 1500}'

# Check metrics
curl http://localhost:4000/metrics | grep shadow
```

### Reproducible Failures

```bash
# Use seed for deterministic behavior
CHAOS_ENABLED=true CHAOS_FAIL_RATE=0.5 CHAOS_SEED=test-run-1 pnpm dev:api

# Same seed = same failure pattern
# Useful for debugging specific scenarios
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Shadow Write Flow                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐    ┌───────────────┐    ┌──────────────┐  │
│  │   Request   │───▶│ ShadowWrite   │───▶│   Primary    │  │
│  │             │    │   Service     │    │  (Postgres)  │  │
│  └─────────────┘    └───────┬───────┘    └──────────────┘  │
│                             │                               │
│                     ┌───────▼───────┐                       │
│                     │ FaultInjector │                       │
│                     │  (if enabled) │                       │
│                     └───────┬───────┘                       │
│                             │                               │
│              ┌──────────────┴──────────────┐                │
│              │                             │                │
│       ┌──────▼──────┐             ┌────────▼────────┐      │
│       │   Success   │             │    Failure      │      │
│       │             │             │  (injected)     │      │
│       └──────┬──────┘             └────────┬────────┘      │
│              │                             │                │
│       ┌──────▼──────┐             ┌────────▼────────┐      │
│       │   Shadow    │             │   Metrics +     │      │
│       │   Store     │             │   Evidence      │      │
│       └─────────────┘             └─────────────────┘      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Chaos Not Working

```bash
# Check if enabled
curl http://localhost:4000/health | jq '.chaos'

# Check environment
kubectl exec -it deployment/api -- env | grep CHAOS
```

### Too Many Failures

```bash
# Reduce fail rate
kubectl set env deployment/api CHAOS_FAIL_RATE=0.05

# Or disable immediately
kubectl set env deployment/api CHAOS_ENABLED=false
```

### Discrepancy Verifier Not Running

```bash
# Check job status
curl http://localhost:4000/api/admin/jobs | jq '.[] | select(.name == "shadow-discrepancy-verifier")'

# Trigger manually
curl -X POST http://localhost:4000/api/admin/jobs/shadow-discrepancy-verifier/trigger
```

---

## Best Practices

1. **Start with low fail rates** - Begin at 5-10% and increase gradually
2. **Use seeds for debugging** - Reproducible failures make debugging easier
3. **Monitor continuously** - Watch metrics during chaos experiments
4. **Time-box experiments** - Don't run indefinitely; have clear start/end
5. **Document findings** - Record observations and improvements made
6. **Never enable in production** - The safety guard exists for a reason

---

## Related Documentation

- [Observability Guide](./observability.md) - Metrics and tracing setup
- [Evidence Service](../architecture/evidence.md) - SOC2 audit trail
- [Background Jobs](../architecture/jobs.md) - Job scheduler configuration
