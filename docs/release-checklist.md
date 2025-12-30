# Release Checklist

This document covers the requirements and procedures for deploying RealRiches to staging and production environments.

## Required Secrets

Configure these secrets in GitHub repository settings (Settings > Secrets and variables > Actions):

### AWS Credentials

| Secret | Description | Required For |
|--------|-------------|--------------|
| `AWS_ACCESS_KEY_ID` | AWS IAM access key | All deployments |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret key | All deployments |
| `SUBNET_IDS` | Comma-separated VPC subnet IDs | ECS task networking |
| `SECURITY_GROUP_ID` | Security group for ECS tasks | ECS task networking |

### Application Secrets

| Secret | Description | Environment |
|--------|-------------|-------------|
| `DATABASE_URL` | PostgreSQL connection string | staging, production |
| `REDIS_URL` | Redis connection string | staging, production |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | staging, production |
| `ENCRYPTION_KEY` | Encryption key (exactly 32 chars) | staging, production |

### External Services

| Secret | Description | Required |
|--------|-------------|----------|
| `STRIPE_SECRET_KEY` | Stripe API secret key | Yes |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Optional |
| `BLS_API_KEY` | Bureau of Labor Statistics API key | Optional |
| `SLACK_WEBHOOK_URL` | Slack notifications webhook | Optional |
| `SNYK_TOKEN` | Snyk security scanning | Optional |

### Environment Variables (Repository Variables)

Configure these as repository variables (not secrets):

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Public API URL | `https://api.realriches.com` |
| `NEXT_PUBLIC_APP_URL` | Public app URL | `https://app.realriches.com` |
| `STAGING_API_URL` | Staging API URL | `https://api.staging.realriches.com` |
| `PRODUCTION_API_URL` | Production API URL | `https://api.realriches.com` |
| `PRODUCTION_WEB_URL` | Production web URL | `https://app.realriches.com` |

## Infrastructure Prerequisites

Before enabling automatic deployments, ensure the following AWS resources are provisioned:

### ECR Repositories

```bash
aws ecr create-repository --repository-name realriches-api
aws ecr create-repository --repository-name realriches-web
```

### ECS Clusters

- `realriches-staging` - Staging cluster
- `realriches-production` - Production cluster

### ECS Services

| Service | Cluster | Task Definition |
|---------|---------|-----------------|
| `realriches-api` | staging | `realriches-api-staging` |
| `realriches-web` | staging | `realriches-web-staging` |
| `realriches-api` | production | `realriches-api-production` |
| `realriches-web` | production | `realriches-web-production` |

### Migration Task Definitions

Create ECS task definitions for running database migrations:

- `realriches-migrations-staging`
- `realriches-migrations-production`

These should run `npx prisma migrate deploy` with the appropriate `DATABASE_URL`.

### CodeDeploy (Production Only)

For blue/green deployments in production:

- Application: `realriches-production`
- Deployment groups: `realriches-api-dg`, `realriches-web-dg`
- ALB target groups configured for blue/green switching

## Pre-Release Checklist

Before triggering a release:

- [ ] All CI checks pass (lint, test, build, security)
- [ ] Feature flags configured for gradual rollout if needed
- [ ] Database migrations are backward-compatible
- [ ] No breaking API changes without versioning
- [ ] Changelog updated (if applicable)
- [ ] Load testing completed for significant changes

## Migration Plan

### Staging Migrations

1. Migrations run automatically before service deployment
2. Uses ECS Fargate task with `DATABASE_URL` from secrets
3. Runs `npx prisma migrate deploy`
4. Deployment blocked if migration fails

### Production Migrations

1. **Backward-compatible migrations only** - never drop columns/tables in use
2. Migration runs before new code deploys
3. If migration fails, deployment is halted
4. For breaking changes, use multi-step migrations:
   - Step 1: Add new columns/tables
   - Step 2: Deploy code that writes to both old and new
   - Step 3: Migrate data
   - Step 4: Deploy code that reads from new
   - Step 5: Remove old columns/tables

### Migration Best Practices

```sql
-- GOOD: Add nullable column
ALTER TABLE users ADD COLUMN phone VARCHAR(20);

-- GOOD: Add column with default
ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active';

-- BAD: Drop column that code still uses
ALTER TABLE users DROP COLUMN legacy_field;

-- BAD: Rename column (breaks running code)
ALTER TABLE users RENAME COLUMN email TO email_address;
```

## Rollback Plan

### Staging Rollback

```bash
# Revert to previous task definition
aws ecs update-service \
  --cluster realriches-staging \
  --service realriches-api \
  --task-definition realriches-api-staging:PREVIOUS_REVISION \
  --force-new-deployment

aws ecs update-service \
  --cluster realriches-staging \
  --service realriches-web \
  --task-definition realriches-web-staging:PREVIOUS_REVISION \
  --force-new-deployment
```

### Production Rollback

Production uses CodeDeploy blue/green, which provides automatic rollback:

1. **Automatic rollback** - If health checks fail during deployment, CodeDeploy automatically rolls back
2. **Manual rollback** - Stop the deployment in AWS Console or CLI:

```bash
# Stop in-progress deployment
aws deploy stop-deployment --deployment-id DEPLOYMENT_ID

# Or manually switch back to previous target group
aws deploy create-deployment \
  --application-name realriches-production \
  --deployment-group-name realriches-api-dg \
  --revision "{\"revisionType\":\"ECS\",\"ecsRevision\":{\"taskDefinition\":\"realriches-api-production:PREVIOUS\"}}"
```

### Database Rollback

If a migration needs to be rolled back:

1. **Create a new migration** that undoes the changes
2. **Never** use `prisma migrate reset` in production
3. For data migrations, ensure you have a reverse script

```bash
# Generate rollback migration
npx prisma migrate dev --name rollback_feature_x

# Apply in production
npx prisma migrate deploy
```

## Post-Deployment Verification

### Health Checks

The deployment pipeline automatically verifies:

- API `/health` endpoint returns 200
- Web app returns 200

### Manual Verification

After production deployments, verify:

- [ ] Login/logout works
- [ ] Key user flows functional
- [ ] No error spikes in monitoring
- [ ] No latency increase
- [ ] Payment processing works (if changed)

### Monitoring

Check these dashboards after deployment:

- CloudWatch metrics for ECS services
- Application error rates
- Database connection pool usage
- Redis memory usage
- Stripe webhook delivery status

## Emergency Procedures

### Complete Service Outage

1. Check AWS ECS service status
2. Check ALB target group health
3. Check RDS/ElastiCache status
4. Roll back to last known good deployment
5. Notify team via Slack

### Database Issues

1. Check RDS metrics (connections, CPU, storage)
2. Check for long-running queries
3. Consider read replica failover if available
4. Contact AWS support for RDS issues

### Security Incident

1. Rotate all secrets immediately
2. Review audit logs
3. Disable affected user accounts
4. Notify security team
5. Document incident timeline

## Enabling Automatic Deployments

Once infrastructure is configured and tested:

1. Verify all secrets are configured in GitHub
2. Test manual deployment to staging
3. Test manual deployment to production
4. Uncomment the `push` trigger in `.github/workflows/deploy.yml`:

```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - '**.md'
      - 'docs/**'
```

5. Consider adding branch protection rules requiring CI to pass
