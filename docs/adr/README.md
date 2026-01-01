# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) for the RealRiches platform. ADRs document significant architectural decisions, their context, and consequences.

## What is an ADR?

An Architecture Decision Record captures an important architectural decision made along with its context and consequences. ADRs are immutable once accepted - if a decision changes, a new ADR supersedes the old one.

## Why ADRs?

- **Institutional Memory**: New team members understand why decisions were made
- **Decision Quality**: Forces explicit consideration of alternatives and consequences
- **Accountability**: Clear record of who decided what and when
- **Consistency**: Prevents relitigating settled decisions

## ADR Format

Each ADR follows this structure:

```markdown
# ADR-NNNN: Title

**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-XXXX
**Date:** YYYY-MM-DD
**Authors:** Names
**Reviewers:** Names

## Context

What is the issue that we're seeing that is motivating this decision or change?

## Decision

What is the change that we're proposing and/or doing?

## Alternatives Considered

What other options were evaluated? Why were they rejected?

## Consequences

What becomes easier or more difficult to do because of this change?

## Follow-ups

What actions or future work does this decision require?
```

## ADR Lifecycle

1. **Proposed**: Author drafts ADR and opens PR for review
2. **Accepted**: ADR is merged after review approval
3. **Deprecated**: Decision is no longer relevant (technology removed, etc.)
4. **Superseded**: A newer ADR replaces this decision

## Current ADRs

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-tenancy-strategy.md) | Multi-Tenancy Strategy | Accepted |
| [0002](0002-compliance-as-code.md) | Compliance-as-Code Enforcement | Accepted |
| [0003](0003-agent-governance.md) | AI Agent Governance | Accepted |
| [0004](0004-ledger-integrity.md) | Ledger Integrity Model | Accepted |
| [0005](0005-partner-adapter-contracts.md) | Partner Adapter Contracts | Accepted |

## Creating a New ADR

1. Copy the template below
2. Assign the next sequential number
3. Fill in all sections
4. Submit PR for review
5. Update this README index after merge

## Template

```markdown
# ADR-NNNN: [Title]

**Status:** Proposed
**Date:** YYYY-MM-DD
**Authors:** [Your Name]
**Reviewers:** [Pending]

## Context

[Describe the problem or situation requiring a decision]

## Decision

[State the decision clearly and concisely]

## Alternatives Considered

### Alternative 1: [Name]
[Description and why rejected]

### Alternative 2: [Name]
[Description and why rejected]

## Consequences

### Positive
- [Benefit 1]
- [Benefit 2]

### Negative
- [Tradeoff 1]
- [Tradeoff 2]

### Neutral
- [Observation]

## Follow-ups

- [ ] [Action item 1]
- [ ] [Action item 2]
```

## References

- [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) - Michael Nygard
- [ADR GitHub Organization](https://adr.github.io/)
