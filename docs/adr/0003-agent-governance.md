# ADR-0003: AI Agent Governance

**Status:** Accepted
**Date:** 2025-12-31
**Authors:** RealRiches Architecture Team
**Reviewers:** Engineering Leadership, Security Team

## Context

RealRiches uses AI agents to automate property management tasks:
- Responding to tenant inquiries
- Scheduling maintenance
- Processing rental applications
- Generating lease documents
- Analyzing investment opportunities

AI agents introduce unique risks:
- **Unauthorized Actions**: Agent might approve an application that should require human review
- **Scope Creep**: Agent given "maintenance" authority might attempt financial operations
- **Audit Gaps**: Difficult to understand why an agent took a specific action
- **Liability Ambiguity**: Who is responsible when an agent makes a mistake?
- **Prompt Injection**: Malicious input could manipulate agent behavior

We need a governance framework that enables agent productivity while maintaining control, accountability, and safety.

## Decision

**Implement a three-layer agent governance model: Policy Gates, Authority Contracts, and Comprehensive Audit Trails.**

### Layer 1: Policy Gates

Every agent operation passes through a policy gate that evaluates whether the action is permitted:

```typescript
interface PolicyGate {
  evaluate(context: AgentActionContext): Promise<PolicyDecision>;
}

interface AgentActionContext {
  agentId: string;
  agentType: 'MAINTENANCE' | 'LEASING' | 'COMMUNICATIONS' | 'ANALYSIS';
  action: string;                    // 'SEND_MESSAGE', 'CREATE_WORK_ORDER', etc.
  resource: string;                  // Resource being acted upon
  parameters: Record<string, unknown>;
  userContext: {
    delegatingUserId: string;        // Human who authorized this agent
    tenantId: string;
    sessionId: string;
  };
  conversationHistory: Message[];    // For context-aware decisions
}

interface PolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;         // Human-in-the-loop required
  approverRoles: string[];           // Who can approve if required
  constraints: ActionConstraint[];   // Limits on the action
  reasoning: string;                 // Explainable decision
  expiresAt?: Date;                  // Time-limited approval
}
```

#### Policy Examples

```typescript
// Maintenance agent can create work orders up to $500
const maintenancePolicy: Policy = {
  agentType: 'MAINTENANCE',
  action: 'CREATE_WORK_ORDER',
  evaluate: async (ctx) => {
    const amount = ctx.parameters.estimatedCost as number;
    if (amount <= 500) {
      return { allowed: true, requiresApproval: false };
    }
    if (amount <= 5000) {
      return { allowed: true, requiresApproval: true, approverRoles: ['PROPERTY_MANAGER'] };
    }
    return { allowed: false, reasoning: 'Amount exceeds agent authority' };
  }
};

// Leasing agent cannot modify lease terms
const leasingPolicy: Policy = {
  agentType: 'LEASING',
  action: 'MODIFY_LEASE',
  evaluate: async () => ({
    allowed: false,
    reasoning: 'Lease modifications require human review'
  })
};
```

### Layer 2: Authority Contracts

Each agent operates under an explicit authority contract that defines its capabilities:

```typescript
interface AuthorityContract {
  id: string;
  agentType: string;
  version: string;
  effectiveDate: Date;

  // What the agent CAN do
  permissions: Permission[];

  // Absolute limits (cannot be overridden)
  hardLimits: {
    maxDollarAmount: number;
    maxActionsPerHour: number;
    maxActionsPerDay: number;
    prohibitedActions: string[];
    requiredHumanApproval: string[];
  };

  // Soft limits (can be elevated with approval)
  softLimits: {
    defaultDollarThreshold: number;
    escalationPath: string[];
  };

  // Data access scope
  dataAccess: {
    readableEntities: string[];
    writableEntities: string[];
    excludedFields: string[];        // PII fields agent cannot access
  };

  // Communication limits
  communicationRules: {
    canContactTenants: boolean;
    canContactVendors: boolean;
    canContactOwners: boolean;
    requiresDisclosure: boolean;     // Must identify as AI
    prohibitedTopics: string[];
  };
}
```

#### Example Authority Contract

```typescript
const maintenanceAgentContract: AuthorityContract = {
  id: 'MAINTENANCE_AGENT_V1',
  agentType: 'MAINTENANCE',
  version: '1.0.0',
  effectiveDate: new Date('2025-01-01'),

  permissions: [
    { action: 'READ_WORK_ORDERS', scope: 'ASSIGNED_PROPERTIES' },
    { action: 'CREATE_WORK_ORDER', scope: 'ASSIGNED_PROPERTIES' },
    { action: 'UPDATE_WORK_ORDER', scope: 'OWN_CREATED' },
    { action: 'SEND_MESSAGE', scope: 'MAINTENANCE_RELATED' },
    { action: 'SCHEDULE_VENDOR', scope: 'APPROVED_VENDORS' },
  ],

  hardLimits: {
    maxDollarAmount: 5000,
    maxActionsPerHour: 50,
    maxActionsPerDay: 200,
    prohibitedActions: ['DELETE_PROPERTY', 'MODIFY_LEASE', 'PROCESS_PAYMENT'],
    requiredHumanApproval: ['EMERGENCY_REPAIR', 'VENDOR_OVER_1000'],
  },

  softLimits: {
    defaultDollarThreshold: 500,
    escalationPath: ['PROPERTY_MANAGER', 'REGIONAL_MANAGER'],
  },

  dataAccess: {
    readableEntities: ['WorkOrder', 'Property', 'Unit', 'Vendor', 'MaintenanceHistory'],
    writableEntities: ['WorkOrder', 'VendorSchedule'],
    excludedFields: ['ssn', 'bankAccount', 'creditScore'],
  },

  communicationRules: {
    canContactTenants: true,
    canContactVendors: true,
    canContactOwners: false,
    requiresDisclosure: true,
    prohibitedTopics: ['RENT_INCREASES', 'EVICTION', 'LEGAL_MATTERS'],
  },
};
```

### Layer 3: Comprehensive Audit Trail

Every agent action generates an immutable audit record:

```typescript
interface AgentAuditRecord {
  id: string;
  timestamp: Date;

  // Agent context
  agentId: string;
  agentType: string;
  agentVersion: string;
  authorityContractId: string;
  delegatingUserId: string;

  // Action details
  action: string;
  resourceType: string;
  resourceId: string;
  parameters: Record<string, unknown>;

  // Decision chain
  policyEvaluations: {
    policyId: string;
    decision: 'ALLOWED' | 'DENIED' | 'REQUIRES_APPROVAL';
    reasoning: string;
  }[];

  // AI reasoning (for explainability)
  aiContext: {
    modelId: string;
    promptHash: string;            // Hash of system prompt (not full prompt for size)
    inputTokens: number;
    outputTokens: number;
    reasoning: string;             // Agent's stated reasoning
    confidence: number;
    alternativesConsidered: string[];
  };

  // Outcome
  outcome: 'EXECUTED' | 'BLOCKED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  resultId?: string;               // ID of created/modified resource
  error?: string;

  // Human oversight
  humanReview?: {
    reviewerId: string;
    decision: 'APPROVED' | 'REJECTED' | 'MODIFIED';
    modifications?: Record<string, unknown>;
    timestamp: Date;
  };
}
```

## Alternatives Considered

### Alternative 1: Unrestricted Agent Access

**Description**: Give agents full API access and rely on prompt engineering for safety.

**Why Rejected**:
- Prompt injection can bypass instructions
- No enforcement mechanism for limits
- Cannot audit or explain decisions
- Unacceptable liability exposure

### Alternative 2: Human-in-the-Loop for Everything

**Description**: Require human approval for all agent actions.

**Why Rejected**:
- Defeats the purpose of automation
- Creates bottlenecks and delays
- Humans will rubber-stamp to reduce workload
- Not scalable

### Alternative 3: Role-Based Access Only

**Description**: Use existing RBAC system; agents get same permissions as their delegating user.

**Why Rejected**:
- Agents should have narrower permissions than humans
- No rate limiting or dollar thresholds
- Missing agent-specific constraints (e.g., AI disclosure)
- Cannot distinguish human vs. agent actions in audit log

## Consequences

### Positive

- **Controlled Automation**: Agents can work autonomously within defined bounds
- **Accountability**: Every action is traceable to delegating user and policy decisions
- **Explainability**: Audit records include agent reasoning for review
- **Graduated Trust**: Start with tight limits, expand based on performance
- **Compliance**: AI disclosure requirements are enforced by system
- **Defense in Depth**: Multiple layers prevent unauthorized actions

### Negative

- **Development Complexity**: Every new agent capability needs policy definition
- **Performance Overhead**: Policy evaluation adds latency (~20-50ms per action)
- **False Denials**: Legitimate actions may be blocked by overly conservative policies
- **Maintenance Burden**: Authority contracts need regular review and updates

### Neutral

- Requires dedicated UI for human-in-the-loop approvals
- Audit storage grows with agent activity (plan for retention)
- Need monitoring for agents hitting rate limits frequently

## Follow-ups

- [ ] Define base authority contracts for each agent type
- [ ] Implement policy gate middleware in API layer
- [ ] Create agent audit log with immutability guarantees (see ADR-0004)
- [ ] Build approval queue UI for human-in-the-loop decisions
- [ ] Implement AI disclosure injection for tenant/vendor communications
- [ ] Create agent performance dashboard (actions/day, approval rate, errors)
- [ ] Define escalation paths for blocked actions
- [ ] Implement rate limiting per agent instance
- [ ] Create authority contract versioning and migration system
- [ ] Build policy testing framework (simulate agent actions, verify decisions)
- [ ] Add anomaly detection for unusual agent behavior patterns
