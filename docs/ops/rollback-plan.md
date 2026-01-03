# Rollback Plan

> **Last Updated:** 2026-01-02
> **Owner:** Platform Team
> **Severity:** P0 Runbook

## Overview

This document provides procedures for rolling back deployments and database changes when issues are detected in production.

---

## Rollback Decision Matrix

| Condition | Action | Time Limit |
|-----------|--------|------------|
| Error rate > 5% after deploy | Immediate rollback | 5 minutes |
| P95 latency > 2x baseline | Immediate rollback | 5 minutes |
| Critical feature broken | Immediate rollback | 10 minutes |
| Minor regression | Assess impact, rollback if needed | 30 minutes |
| Security vulnerability | Immediate rollback + incident | Immediate |

---

## Application Rollback

### Kubernetes Deployment Rollback

#### Quick Rollback (Most Common)

```bash
# Rollback to previous version
kubectl rollout undo deployment/api -n production

# Verify rollback
kubectl rollout status deployment/api -n production

# Check pods are healthy
kubectl get pods -n production -l app=api
```

#### Rollback to Specific Version

```bash
# View rollout history
kubectl rollout history deployment/api -n production

# Rollback to specific revision
kubectl rollout undo deployment/api -n production --to-revision=42

# Verify
kubectl rollout status deployment/api -n production
```

#### Verify Rollback Success

```bash
# Check current image
kubectl get deployment api -n production -o jsonpath='{.spec.template.spec.containers[0].image}'

# Check health endpoint
curl -f https://api.realriches.com/health

# Check error rate in monitoring
# (Open Grafana dashboard)
```

---

## Database Rollback

### Schema Migration Rollback

**Warning:** Database rollbacks may cause data loss. Assess impact before proceeding.

#### Step 1: Identify Migration to Rollback

```bash
# Check migration status
pnpm db:migrate:status

# List recent migrations
ls -la packages/database/prisma/migrations/
```

#### Step 2: Create Rollback Migration

For Prisma migrations, create a new migration that reverses the changes:

```bash
# Generate rollback migration
pnpm db:migrate:dev --name rollback_<original_migration_name>
```

#### Step 3: Apply Rollback

```bash
# In production, apply with caution
pnpm db:migrate:deploy
```

### Data Rollback

For data-level rollbacks, use PITR:

```bash
# See restore-steps.md for full procedure
pgbackrest restore --stanza=realriches \
  --type=time \
  --target="<pre-change-timestamp>" \
  --target-action=promote
```

---

## Feature Flag Rollback

For features behind flags, disable without deployment:

```bash
# Disable feature flag
kubectl set env deployment/api FEATURE_NEW_CHECKOUT=false -n production

# Restart pods to pick up change
kubectl rollout restart deployment/api -n production

# Verify
kubectl get pods -n production -l app=api
```

### Feature Flags Reference

| Flag | Description | Safe to Disable |
|------|-------------|-----------------|
| `FEATURE_3D_TOURS` | 3D tour generation | Yes |
| `FEATURE_AI_AGENTS` | AI agent responses | Yes |
| `FEATURE_NEW_CHECKOUT` | New checkout flow | Yes |
| `STRIPE_ENABLED` | Payment processing | No - coordinate |

---

## Configuration Rollback

### Environment Variables

```bash
# View current config
kubectl get configmap api-config -n production -o yaml

# Rollback to previous configmap version
kubectl rollout undo deployment/api -n production

# Or manually update specific value
kubectl set env deployment/api DATABASE_POOL_SIZE=10 -n production
```

### Secrets

```bash
# Secrets are versioned in Vault
# Rollback via Vault UI or CLI

vault kv rollback -version=<previous_version> secret/production/api
```

---

## Third-Party Integration Rollback

### Stripe Webhook Rollback

```bash
# Disable webhook processing
kubectl set env deployment/api STRIPE_WEBHOOKS_ENABLED=false -n production

# Reprocess failed webhooks after fix
./scripts/ops/reprocess-stripe-webhooks.sh --since="2026-01-02T14:00:00Z"
```

### External API Rollback

```bash
# Enable circuit breaker for external service
kubectl set env deployment/api LEMONADE_API_ENABLED=false -n production

# Fallback to mock provider
kubectl set env deployment/api INSURANCE_PROVIDER=mock -n production
```

---

## Rollback Verification

After any rollback, verify:

### Health Checks

```bash
# API health
curl -f https://api.realriches.com/health | jq

# Database connectivity
curl -f https://api.realriches.com/health/db | jq

# Redis connectivity
curl -f https://api.realriches.com/health/cache | jq
```

### Smoke Tests

```bash
# Run smoke test suite
./scripts/smoke-test.sh

# Or run specific tests
./scripts/smoke-test.sh --suite=auth
./scripts/smoke-test.sh --suite=payments
```

### Metrics Verification

Check in Grafana:
- Error rate < 1%
- P95 latency < 500ms
- No unusual patterns

---

## Rollback Runbook Checklist

Use this checklist during rollback:

- [ ] Identify the issue requiring rollback
- [ ] Notify team in #incidents
- [ ] Determine rollback type (app/db/config/feature)
- [ ] Execute rollback procedure
- [ ] Verify health checks pass
- [ ] Run smoke tests
- [ ] Check metrics in monitoring
- [ ] Notify team of rollback completion
- [ ] Create incident ticket for root cause analysis

---

## Post-Rollback Actions

After successful rollback:

1. **Document** the incident in the incident tracker
2. **Investigate** root cause
3. **Fix** the issue in a new PR
4. **Test** thoroughly in staging
5. **Deploy** fix with extra monitoring
6. **Verify** fix resolves the issue

---

## Rollback Limitations

### Cannot Rollback

| Scenario | Reason | Mitigation |
|----------|--------|------------|
| Data migration with deletes | Data lost | Restore from backup |
| Third-party API state | External system | Manual coordination |
| Email/SMS already sent | Already delivered | Customer communication |
| Stripe charges processed | Financial transaction | Refund process |

### Partial Rollback

Some rollbacks may leave partial state:

- **Queue items:** May need manual reprocessing
- **Cache:** May need manual invalidation
- **Search index:** May need rebuild

---

## Emergency Contacts

| Role | Contact | When |
|------|---------|------|
| On-Call | PagerDuty | First |
| Platform Lead | @platform-lead | If unsure |
| Database Admin | @dba | DB rollback |
| Security | @security | Security issues |

---

## References

- [incident-response.md](./incident-response.md)
- [restore-steps.md](./restore-steps.md)
- [backup-strategy.md](./backup-strategy.md)
