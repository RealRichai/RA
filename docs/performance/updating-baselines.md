# Updating Performance Baselines

This document describes the process for updating performance baselines when legitimate changes affect endpoint latency.

## When to Update Baselines

Update baselines when:

1. **New features add expected overhead**
   - Example: Adding compliance validation to listing publish
   - Example: Adding audit logging to sensitive operations

2. **Architecture changes affect latency**
   - Example: Adding caching (should decrease latency)
   - Example: Moving to distributed database (may increase latency)

3. **Business requirements change**
   - Example: More thorough validation required
   - Example: New regulatory requirements

## When NOT to Update Baselines

Do NOT update baselines for:

1. **Accidental regressions** - Fix the code instead
2. **Temporary issues** - Wait for the issue to be resolved
3. **Unreviewed changes** - Get proper approval first
4. **Quick fixes** - Investigate root cause

## Approval Process

### Required Approvers

- Platform Team Lead
- At least one other senior engineer

### Approval Criteria

1. **Justification documented**
   - Why is the regression acceptable?
   - What alternatives were considered?

2. **Impact assessed**
   - User experience impact
   - SLA/SLO impact

3. **Monitoring in place**
   - How will we detect further regressions?
   - What alerts are configured?

## Step-by-Step Guide

### 1. Identify the Regression

```bash
# Run smoke tests to see current vs baseline
./scripts/perf/run-smoke.sh

# Output will show which thresholds failed
# ✗ listing_publish_duration
#   ✗ p(95)<600 (actual: 720)
```

### 2. Investigate Root Cause

```bash
# Run profiling
# Check database queries
# Review recent changes
git log --oneline -20 -- apps/api/src/modules/listings/
```

### 3. Determine if Update is Needed

Ask yourself:
- Can the code be optimized?
- Is this a bug or intentional behavior?
- Does this affect user experience significantly?

### 4. Run Full Load Test

```bash
# Run extended test for accurate metrics
k6 run \
  --duration 5m \
  --vus 20 \
  --env API_BASE_URL=http://localhost:4000 \
  tests/performance/smoke.js

# Review the p95/p99 values in output
```

### 5. Update baselines.json

```json
{
  "version": "1.1.0",        // Increment version
  "updated": "2026-01-15",   // Today's date
  "approvedBy": "platform-team",
  "thresholds": {
    "listing_publish": {
      "p95": 600,            // New value
      "p99": 900,            // New value
      "maxFailRate": 0.01,
      "description": "Listing publish with enhanced compliance validation"
    }
  }
}
```

### 6. Create Pull Request

```bash
git checkout -b perf/update-baselines-v1.1.0
git add tests/performance/baselines.json
git commit -m "perf: update baselines v1.0.0 -> v1.1.0

Reason: Added enhanced compliance validation to listing publish

Changes:
- listing_publish p95: 500ms -> 600ms (+20%)
- listing_publish p99: 800ms -> 900ms (+12.5%)

Justification:
- FCHA compliance checks now include additional validation
- User impact minimal (still under 1s for all requests)
- Alternative of skipping validation not acceptable

Approved-by: @platform-lead
"
git push origin perf/update-baselines-v1.1.0
```

### 7. Get Review and Merge

- Request review from platform team
- Ensure CI passes with new baselines
- Merge after approval

## Baseline Version History

Track significant changes in this table:

| Version | Date | Change | Approver |
|---------|------|--------|----------|
| 1.0.0 | 2026-01-03 | Initial baselines | platform-team |

## Emergency Baseline Updates

In rare cases (production incident, critical release blocked):

1. Create the baseline update
2. Get synchronous approval from platform lead (Slack/call)
3. Merge with `[EMERGENCY]` prefix in commit
4. Document in post-incident review
5. Review within 24 hours if changes should be permanent

```bash
git commit -m "[EMERGENCY] perf: update baselines for critical release

Emergency approved by: @platform-lead via Slack
Will review in post-incident meeting
"
```
