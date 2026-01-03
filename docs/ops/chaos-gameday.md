# Chaos GameDay Operations Guide

## Overview

This document describes the Chaos GameDay process for validating system resilience through controlled fault injection. GameDay exercises simulate partial failures to verify:

1. Shadow write infrastructure handles faults gracefully
2. Discrepancies are detected and logged as evidence
3. Service availability is maintained during failures
4. Rollback procedures work correctly

## Scope

### What is Tested

| Component | Test Type | Description |
|-----------|-----------|-------------|
| Shadow Write Service | Fault Injection | Inject failures into shadow writes, verify canonical writes succeed |
| Discrepancy Verifier | Detection | Verify discrepancies between primary and shadow are detected |
| Evidence Recording | Audit Trail | Verify failures are logged as EvidenceRecords for SOC2 |
| Metrics | Observability | Verify Prometheus metrics capture failure rates |
| Production Guard | Safety | Verify chaos cannot be enabled in production |

### What is NOT Tested

- Full system outages (use disaster recovery drills for this)
- Network partitions (requires infrastructure-level testing)
- Database failures (covered by backup/restore drills)
- Production environment (chaos is blocked in production)

## Pre-Checks

### Environment Requirements

Before running a GameDay, ensure:

```bash
# 1. Environment is NOT production
echo $NODE_ENV  # Should be 'development', 'staging', or 'test'

# 2. No .production marker file exists
test ! -f .production && echo "OK: No production marker"

# 3. API is running and healthy
curl http://localhost:4000/health

# 4. Required tools are available
which curl jq node bc
```

### Safety Guards

The system has multiple safety layers:

1. **FaultInjector Production Guard**: `FaultInjector.create()` throws `ChaosProductionError` if `NODE_ENV=production`
2. **Script Environment Check**: `chaos_gameday.sh` exits if `NODE_ENV=production`
3. **Fail Rate Limit**: Maximum fail rate is capped at 0.3 (30%) to prevent cascading failures
4. **Scope Isolation**: Default scope is `shadow_write_only`, affecting only shadow stores

## Running a GameDay

### Basic Execution

```bash
# Run with defaults (10% fail rate, auto-generated seed)
./scripts/ops/chaos_gameday.sh

# Run with specific parameters
./scripts/ops/chaos_gameday.sh \
  --fail-rate 0.1 \
  --seed "gameday-2026-01-03" \
  --duration 60 \
  --verbose
```

### Command Line Options

| Option | Default | Description |
|--------|---------|-------------|
| `--fail-rate RATE` | 0.1 | Fault injection rate (0.0-0.3) |
| `--seed SEED` | Auto-generated | Deterministic seed for reproducibility |
| `--duration SEC` | 60 | Test duration in seconds |
| `--api-url URL` | http://localhost:4000 | API base URL |
| `--skip-smoke` | false | Skip smoke action tests |
| `--skip-verifier` | false | Skip discrepancy verifier |
| `--verbose` | false | Enable verbose output |

### Reproducibility

To reproduce a specific GameDay run:

```bash
# Use the same seed from a previous run
./scripts/ops/chaos_gameday.sh \
  --fail-rate 0.1 \
  --seed "gameday_20260103_120000"
```

The seeded RNG ensures identical fault injection patterns across runs with the same seed.

## Expected Output

### Artifacts

Each GameDay run creates artifacts in `artifacts/chaos_gameday/<run_id>/`:

```
artifacts/chaos_gameday/gameday_20260103_120000/
├── config.json           # Run configuration
├── smoke_results.json    # Smoke test results
├── verifier_result.json  # Discrepancy verifier output
├── metrics_snapshot.txt  # Prometheus metrics snapshot
├── chaos_metrics.txt     # Chaos-related metrics
├── evidence_audit.json   # Evidence audit snapshot
├── api_logs_tail.log     # Last 500 lines of API logs
└── summary.json          # Overall pass/fail summary
```

### Metrics to Monitor

During and after GameDay, monitor these metrics:

```promql
# Shadow write failure rate
rate(shadow_write_failures_total[5m])

# Discrepancies detected
increase(shadow_discrepancies_total[1h])

# Injected faults vs real errors
sum(shadow_write_failures_total{failure_type="injected"})
sum(shadow_write_failures_total{failure_type="real"})
```

### Console Output

```
=== Pre-flight Safety Checks ===

[SUCCESS] Environment check passed: NODE_ENV=development
[SUCCESS] No production markers found
[SUCCESS] Fail rate check passed: 0.1 (within 0.0-0.3 range)
[SUCCESS] Dependencies check passed: curl, jq, node, bc
[SUCCESS] API health check passed: http://localhost:4000/health

=== Enabling Chaos Mode ===

[INFO] CHAOS_ENABLED=true
[INFO] CHAOS_FAIL_RATE=0.1
[INFO] CHAOS_SEED=gameday-1704300000
[INFO] CHAOS_SCOPE=shadow_write_only
[SUCCESS] Production guard verified: FaultInjector blocks chaos in production

=== Running Smoke Actions ===

[INFO] Running: Health Check (GET /health)
[SUCCESS]   Status: 200 (45ms)
...

=== GameDay Summary ===

Run ID:        gameday_20260103_120000
Status:        PASSED
Fail Rate:     0.1
Seed:          gameday-1704300000
Artifacts:     artifacts/chaos_gameday/gameday_20260103_120000

Pass/Fail Criteria:
  [x] Production guard verified
  [x] Service availability maintained
  [x] Error rates within thresholds
  [x] Discrepancies logged as evidence
```

## Pass/Fail Criteria

### PASS Criteria

A GameDay PASSES if all of the following are true:

1. **Production Guard Verified**: FaultInjector rejects chaos in production mode
2. **Service Availability Maintained**: Health endpoint remains responsive throughout
3. **Error Rates Within Thresholds**:
   - HTTP 5xx rate stays below 5% of total requests
   - No complete service outages
4. **Discrepancies Detected and Logged**:
   - Shadow write failures are recorded in metrics
   - EvidenceRecords are created for failures
   - Discrepancy verifier detects mismatches

### FAIL Criteria

A GameDay FAILS if any of the following occur:

1. **Production Guard Bypass**: Chaos can be enabled in production
2. **Service Unavailable**: Health endpoint returns 5xx or times out
3. **Cascading Failures**: Error rate exceeds 5% or increases over time
4. **Silent Failures**: Discrepancies not logged as evidence
5. **Data Corruption**: Canonical writes affected by shadow failures

## Rollback Plan

### During GameDay

If issues are detected during a GameDay:

```bash
# 1. Stop the GameDay script (Ctrl+C)

# 2. Disable chaos manually
unset CHAOS_ENABLED
unset CHAOS_FAIL_RATE
unset CHAOS_SEED
unset CHAOS_SCOPE

# 3. Restart API without chaos
cd apps/api && pnpm dev

# 4. Verify service health
curl http://localhost:4000/health
```

### Post-GameDay Recovery

If discrepancies persist after disabling chaos:

```bash
# 1. Clear shadow store (in-memory, lost on restart)
# Simply restart the API server

# 2. Verify no orphaned records
# Run discrepancy verifier with fail-rate 0
CHAOS_ENABLED=false ./scripts/ops/chaos_gameday.sh --skip-smoke

# 3. Review evidence records
curl http://localhost:4000/v1/admin/evidence-audit/gaps
```

### Emergency Procedures

| Scenario | Action |
|----------|--------|
| API unresponsive | Kill process, restart without CHAOS_ENABLED |
| Database issues | Check canonical writes, shadow is ephemeral |
| High error rate | Reduce fail-rate or disable chaos |
| Production mistakenly enabled | FaultInjector will throw, but kill process immediately |

## Scheduling GameDays

### Recommended Frequency

| Environment | Frequency | Notes |
|-------------|-----------|-------|
| Development | Ad-hoc | Run during feature development |
| Staging | Weekly | Scheduled Friday AM before deploy freeze |
| Production | Never | Chaos is blocked in production |

### CI Integration

GameDay validation runs in CI as a smoke test (without actual fault injection):

```yaml
# In .github/workflows/ci.yml
chaos-harness-smoke:
  runs-on: ubuntu-latest
  steps:
    - name: Validate chaos scripts
      run: |
        # Verify script exists and is executable
        test -x scripts/ops/chaos_gameday.sh

        # Verify production guard
        # (See CI job for details)
```

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "SAFETY VIOLATION: Cannot run chaos in production" | NODE_ENV=production | Set NODE_ENV to development/staging |
| "Fail rate exceeds safe limit" | --fail-rate > 0.3 | Use fail-rate between 0.0 and 0.3 |
| "Could not verify production guard" | packages/testing not built | Run `pnpm build` first |
| "API health check failed" | API not running | Start API: `cd apps/api && pnpm dev` |
| "Discrepancy verifier skipped" | dist/ not found | Run `pnpm build` in apps/api |

### Debugging

Enable verbose mode for detailed output:

```bash
./scripts/ops/chaos_gameday.sh --verbose 2>&1 | tee gameday.log
```

Review artifacts for detailed diagnostics:

```bash
# Check smoke test results
cat artifacts/chaos_gameday/*/smoke_results.json | jq

# Check verifier results
cat artifacts/chaos_gameday/*/verifier_result.json | jq

# Check chaos metrics
cat artifacts/chaos_gameday/*/chaos_metrics.txt
```

## References

- [Chaos Shadow Write Infrastructure](./chaos-shadow-write.md) - FaultInjector and shadow write details
- [Incident Response](./incident-response.md) - Escalation procedures
- [Rollback Plan](./rollback-plan.md) - General rollback procedures
- [Evidence Control Catalog](./EVIDENCE_CONTROL_CATALOG.md) - SOC2 control definitions
