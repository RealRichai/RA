# ADR-0001: Multi-Tenancy Strategy

**Status:** Accepted
**Date:** 2025-12-31
**Authors:** RealRiches Architecture Team
**Reviewers:** Engineering Leadership

## Context

RealRiches serves multiple property management companies, landlords, and investors on a single platform. Each customer (tenant) must have complete data isolation - a landlord should never see another landlord's properties, tenants, or financial data.

We need to choose a multi-tenancy architecture that:
- Guarantees data isolation at the database level
- Scales cost-effectively as we add customers
- Minimizes operational complexity
- Supports compliance requirements (SOC 2, data residency)
- Enables efficient cross-tenant analytics for platform insights

The platform currently uses PostgreSQL with Prisma ORM and has 222+ data models.

## Decision

**Adopt a single-schema, shared-database architecture with tenant_id discrimination and PostgreSQL Row-Level Security (RLS) enforcement.**

### Implementation Details

1. **Tenant Identifier**: Every tenant-scoped table includes a non-nullable `tenant_id` UUID column as part of a composite primary key or with a unique constraint.

2. **Row-Level Security (RLS)**: PostgreSQL RLS policies enforce tenant isolation at the database level:
   ```sql
   -- Enable RLS on table
   ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

   -- Policy: users can only access their tenant's data
   CREATE POLICY tenant_isolation ON properties
     USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
   ```

3. **Session Context**: Application sets tenant context on each connection:
   ```sql
   SET app.current_tenant_id = 'uuid-here';
   ```

4. **Prisma Integration**: Middleware automatically injects tenant_id into all queries:
   ```typescript
   prisma.$use(async (params, next) => {
     if (params.model && tenantScopedModels.includes(params.model)) {
       params.args.where = { ...params.args.where, tenantId: ctx.tenantId };
     }
     return next(params);
   });
   ```

5. **Superuser Bypass**: Platform admin operations use a separate connection pool without RLS for cross-tenant analytics and support.

## Alternatives Considered

### Alternative 1: Database-per-Tenant

**Description**: Each tenant gets a dedicated PostgreSQL database.

**Pros**:
- Strongest isolation guarantee
- Easy per-tenant backup/restore
- Simple data export for offboarding

**Why Rejected**:
- Connection pool explosion (100 tenants = 100 pools)
- Schema migrations require 100 separate runs
- Cost scales linearly with tenant count
- Cross-tenant analytics requires federated queries
- Operational burden grows with each tenant

### Alternative 2: Schema-per-Tenant

**Description**: Single database with separate PostgreSQL schemas per tenant.

**Pros**:
- Good isolation within single database
- Per-tenant backup via schema dump
- Shared connection pool

**Why Rejected**:
- Schema migrations still require per-tenant execution
- Prisma doesn't natively support dynamic schema switching
- search_path manipulation adds complexity
- 1000 tenants = 1000 schemas with 222 tables each = 222,000 tables

### Alternative 3: Application-Level Filtering Only

**Description**: Single schema with tenant_id but no RLS; filtering done purely in application code.

**Pros**:
- Simplest to implement initially
- No database-level complexity

**Why Rejected**:
- Single bug in query = data leak
- Every query must remember to filter
- No defense in depth
- Compliance auditors prefer database-enforced isolation

## Consequences

### Positive

- **Defense in Depth**: Even if application code has a bug, RLS prevents cross-tenant data access
- **Operational Simplicity**: Single database to manage, backup, and monitor
- **Cost Efficiency**: Shared infrastructure scales sub-linearly
- **Migration Simplicity**: One schema migration affects all tenants atomically
- **Query Performance**: Can use standard PostgreSQL indexes and query planning
- **Compliance**: Database-enforced isolation satisfies SOC 2 auditors

### Negative

- **Noisy Neighbor Risk**: Large tenant's queries can affect others (mitigate with connection pooling and query timeouts)
- **Data Residency Complexity**: If tenants require data in specific regions, need regional database clusters
- **Backup Granularity**: Cannot backup/restore individual tenant without custom tooling
- **RLS Overhead**: ~5-10% query overhead for RLS policy checks (acceptable for isolation guarantee)

### Neutral

- Tenant offboarding requires DELETE with tenant_id filter rather than DROP DATABASE
- Cross-tenant analytics requires superuser connection, which is appropriate for that use case

## Follow-ups

- [ ] Add `tenant_id` column to all tenant-scoped models in Prisma schema
- [ ] Create RLS policies for all tenant-scoped tables
- [ ] Implement Prisma middleware for automatic tenant scoping
- [ ] Create superuser connection pool for admin/analytics operations
- [ ] Add tenant_id to all existing indexes as leading column where appropriate
- [ ] Document which models are tenant-scoped vs. global (users, audit logs)
- [ ] Create runbook for tenant data export/offboarding
- [ ] Add monitoring for cross-tenant query attempts (should be zero)
