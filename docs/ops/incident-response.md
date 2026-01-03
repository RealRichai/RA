# Incident Response Runbook

> **Last Updated:** 2026-01-02
> **Owner:** Platform Team
> **Severity:** P0 Runbook

## Overview

This runbook defines the incident response process for RealRiches production systems. Follow these procedures when responding to any production incident.

---

## Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| P0 | Critical outage | 15 minutes | Full site down, data loss, security breach |
| P1 | Major degradation | 30 minutes | Core feature broken, >10% users affected |
| P2 | Minor degradation | 2 hours | Non-critical feature broken, <10% users affected |
| P3 | Low impact | 24 hours | Cosmetic issues, minor bugs |

---

## Incident Response Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Detect    │───▶│   Triage    │───▶│   Respond   │───▶│   Resolve   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
      │                  │                  │                  │
      ▼                  ▼                  ▼                  ▼
 Monitoring         Severity           Mitigate           Root Cause
 Alerts             Assessment         Impact             Analysis
 User Reports       Assign IC          Communicate        Post-mortem
```

---

## Phase 1: Detection

### Automated Alerts

Alerts are routed via PagerDuty:

| Source | Channel | Threshold |
|--------|---------|-----------|
| API error rate | PagerDuty | > 5% for 5 min |
| API latency p95 | PagerDuty | > 2s for 5 min |
| Database connections | PagerDuty | > 80% pool |
| Queue depth | Slack | > 1000 jobs |
| Disk usage | Slack | > 80% |

### Manual Reports

User reports come via:
- Support tickets (Zendesk)
- #incidents Slack channel
- Direct escalation

---

## Phase 2: Triage

### Step 2.1: Acknowledge

```bash
# Acknowledge in PagerDuty (within 5 minutes)
# Or via Slack: /pd ack

# Join incident channel
/incident new "Brief description"
```

### Step 2.2: Assess Severity

Answer these questions:

1. **Scope:** How many users affected?
2. **Impact:** What functionality is broken?
3. **Duration:** How long has this been happening?
4. **Trend:** Is it getting worse?

### Step 2.3: Assign Incident Commander (IC)

For P0/P1:
- On-call engineer becomes IC
- IC coordinates response, does NOT debug
- IC responsibilities:
  - Communication updates every 15 minutes
  - Escalation decisions
  - Timeline documentation

---

## Phase 3: Response

### Step 3.1: Gather Information

```bash
# Check service health
curl -s https://api.realriches.com/health | jq

# Check recent deployments
kubectl rollout history deployment/api -n production

# Check error logs (last 15 minutes)
kubectl logs -l app=api -n production --since=15m | grep ERROR

# Check database status
psql -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"
```

### Step 3.2: Identify Root Cause

Common causes and diagnostic commands:

| Symptom | Likely Cause | Diagnostic |
|---------|--------------|------------|
| High latency | Database | `SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;` |
| 500 errors | Application bug | `kubectl logs -l app=api --tail=100` |
| Connection refused | Pod crash | `kubectl get pods -n production` |
| Out of memory | Memory leak | `kubectl top pods -n production` |

### Step 3.3: Mitigate

**Immediate mitigation options (in order of preference):**

1. **Rollback** (if recent deployment)
   ```bash
   kubectl rollout undo deployment/api -n production
   ```

2. **Scale up** (if capacity issue)
   ```bash
   kubectl scale deployment/api --replicas=10 -n production
   ```

3. **Feature flag** (if specific feature)
   ```bash
   # Disable feature via config
   kubectl set env deployment/api FEATURE_X_ENABLED=false -n production
   ```

4. **Circuit breaker** (if external dependency)
   ```bash
   # Enable circuit breaker
   kubectl set env deployment/api EXTERNAL_SERVICE_ENABLED=false -n production
   ```

---

## Phase 4: Communication

### Internal Updates

Post updates every 15 minutes for P0/P1:

```markdown
**Incident Update - HH:MM UTC**
- Status: Investigating / Identified / Mitigating / Resolved
- Impact: [description]
- Current action: [what we're doing]
- Next update: HH:MM UTC
```

### External Updates

For customer-facing outages:

1. Update status page (status.realriches.com)
2. Post to @realriches_status Twitter
3. Email affected customers (if targeted)

---

## Phase 5: Resolution

### Step 5.1: Confirm Resolution

```bash
# Verify error rate returned to normal
# Check dashboards show green

# Run smoke tests
./scripts/smoke-test.sh

# Verify in monitoring
curl -s https://api.realriches.com/health | jq
```

### Step 5.2: Close Incident

```bash
# In incident channel
/incident resolve "Root cause and resolution summary"
```

### Step 5.3: Document Timeline

Create timeline in incident tracker:

```markdown
| Time (UTC) | Event |
|------------|-------|
| 14:00 | Alert fired for high error rate |
| 14:05 | IC acknowledged, began investigation |
| 14:15 | Identified bad deployment as root cause |
| 14:20 | Rolled back to previous version |
| 14:25 | Error rate returned to normal |
| 14:30 | Incident resolved |
```

---

## Phase 6: Post-Incident

### Blameless Post-Mortem

Required for all P0/P1 incidents within 48 hours.

Template:
```markdown
# Post-Mortem: [Incident Title]

**Date:** YYYY-MM-DD
**Duration:** X hours Y minutes
**Severity:** P0/P1
**IC:** @name

## Summary
One paragraph summary of what happened.

## Impact
- Users affected: X
- Revenue impact: $X
- Data loss: None / Description

## Timeline
| Time | Event |
|------|-------|

## Root Cause
Technical explanation of what caused the incident.

## Resolution
What fixed the immediate problem.

## Action Items
| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| | | | |

## Lessons Learned
- What went well
- What could be improved
```

---

## Escalation Matrix

| Level | Contact | When |
|-------|---------|------|
| L1 | On-call engineer | First responder |
| L2 | Platform lead | 30 min without progress |
| L3 | VP Engineering | P0 > 1 hour, data loss |
| L4 | CEO | Security breach, major data loss |

---

## Quick Reference

### Useful Commands

```bash
# Service status
kubectl get pods -n production
kubectl top pods -n production

# Recent logs
kubectl logs -l app=api -n production --tail=100

# Database connections
psql -c "SELECT count(*) FROM pg_stat_activity;"

# Redis status
redis-cli ping

# Recent deployments
kubectl rollout history deployment/api -n production

# Rollback
kubectl rollout undo deployment/api -n production
```

### Key Dashboards

- Grafana: https://grafana.realriches.com
- PagerDuty: https://realriches.pagerduty.com
- Status Page: https://status.realriches.com

---

## References

- [rollback-plan.md](./rollback-plan.md)
- [restore-steps.md](./restore-steps.md)
- [backup-strategy.md](./backup-strategy.md)
