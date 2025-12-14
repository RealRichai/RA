# RealRiches Decision Log

## Architecture Decisions

### [2025-12-14] Monorepo with Turborepo
**Decision**: Use pnpm workspaces with Turborepo for monorepo management.
**Rationale**: Enables code sharing between API and mobile app while maintaining separate deployment pipelines.

### [2025-12-14] Fastify over Express
**Decision**: Use Fastify v5 as the HTTP framework.
**Rationale**: Better TypeScript support, built-in validation, superior performance, and native async/await.

### [2025-12-14] RS256 JWT Tokens
**Decision**: Use RS256 (asymmetric) instead of HS256 (symmetric) for JWT signing.
**Rationale**: Enables token verification without sharing the private key, better for distributed systems.

### [2025-12-14] Argon2id for Password Hashing
**Decision**: Use Argon2id with memory cost 64MB, time cost 3, parallelism 4.
**Rationale**: OWASP recommended algorithm, resistant to GPU attacks and side-channel attacks.

### [2025-12-14] Soft Delete Pattern
**Decision**: Implement soft delete via Prisma middleware for core entities.
**Rationale**: Enables data recovery, audit compliance, and maintains referential integrity.

### [2025-12-14] Result Type Pattern
**Decision**: Use neverthrow for type-safe error handling.
**Rationale**: Forces explicit error handling, improves code reliability, better TypeScript integration.

## Business Logic Decisions

### [2025-12-14] Agent Lead Retention
**Decision**: Leads stay with assigned agent unless tenant/landlord explicitly decides not to renew.
**Rationale**: Protects agent investment in client relationships while respecting client autonomy.

### [2025-12-14] Fair Chance Housing Act Compliance
**Decision**: Defer criminal history inquiry until after conditional offer.
**Rationale**: NYC Local Law 4 requirement, must complete individual assessment if history disclosed.

### [2025-12-14] FARE Act Compliance
**Decision**: Cap application fees at $20, validate security deposits against monthly rent.
**Rationale**: NYC regulatory requirement for rental transparency.

### [2025-12-14] Agent Feedback System
**Decision**: Create private feedback channel accessible only to agents.
**Rationale**: Enables constructive improvement without public exposure, builds community trust.
