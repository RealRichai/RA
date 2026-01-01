# @realriches/feature-flags

Feature flag system with market-based geographic gating for phased rollouts.

## Installation

```bash
pnpm add @realriches/feature-flags
```

## Usage

### Basic Flag Check

```typescript
import { isFeatureEnabled, isFeatureEnabledForMarket } from '@realriches/feature-flags';

// Check if a flag is enabled (uses default state)
if (isFeatureEnabled('AI_VALUATION')) {
  // AI valuation is enabled
}

// Check with market context
if (isFeatureEnabled('TOUR_3DGS_CAPTURE', { market: 'NYC' })) {
  // 3DGS capture is enabled for NYC
}

// Direct market check
if (isFeatureEnabledForMarket('TOUR_WEBGPU_VIEWER', 'NYC')) {
  // WebGPU viewer is available in NYC
}
```

### Service Instance

```typescript
import { FeatureFlagService } from '@realriches/feature-flags';

const service = new FeatureFlagService();

// Evaluate with full context
const result = service.evaluate('TOUR_3DGS_CAPTURE', {
  userId: 'user_123',
  tenantId: 'tenant_456',
  market: 'NYC',
});

console.log(result.enabled);  // true
console.log(result.reason);   // 'MARKET_ENABLED'
```

### Overrides

Override precedence: User > Tenant > Global > Market Config > Default

```typescript
const service = new FeatureFlagService();

// Global override (affects all users)
service.setGlobalOverride('TOUR_3DGS_CAPTURE', true);

// Tenant-level override
service.setTenantOverride('tenant_123', 'TOUR_3DGS_CAPTURE', true);

// User-level override (highest priority)
service.setUserOverride('user_456', 'TOUR_3DGS_CAPTURE', false);
```

## Feature Flags

### 3D Tour Features (RR-ENG-UPDATE-2026-001)

| Flag | Description | Phase |
|------|-------------|-------|
| `TOUR_3DGS_CAPTURE` | 3D Gaussian Splatting capture workflow | BETA |
| `TOUR_SOG_CONVERSION` | Scene Optimized Gaussian conversion | BETA |
| `TOUR_WEBGPU_VIEWER` | WebGPU-accelerated 3D tour viewer | BETA |
| `TOUR_LOD_STREAMING` | Level-of-Detail streaming | BETA |

### AI Features

| Flag | Description | Phase |
|------|-------------|-------|
| `AI_VALUATION` | AI-powered property valuation | GA |
| `AI_LEASE_ANALYSIS` | AI lease document analysis | GA |
| `AI_MAINTENANCE_TRIAGE` | AI maintenance request triage | GA |
| `AI_TENANT_ASSISTANT` | AI tenant communication assistant | BETA |

### Compliance Features

| Flag | Description | Phase |
|------|-------------|-------|
| `COMPLIANCE_ENHANCED_REPORTING` | Enhanced compliance reporting | GA |
| `COMPLIANCE_REALTIME_MONITORING` | Real-time compliance monitoring | BETA |

### Payment Features

| Flag | Description | Phase |
|------|-------------|-------|
| `PAYMENTS_CRYPTO` | Cryptocurrency rent payments | ALPHA |
| `PAYMENTS_INSTANT_PAYOUT` | Instant payout to landlords | GA |

### Partner Integrations

| Flag | Description | Phase |
|------|-------------|-------|
| `PARTNER_LEMONADE` | Lemonade insurance integration | GA |
| `PARTNER_RHINO` | Rhino deposit alternative | GA |
| `PARTNER_UTILITY_CONCIERGE` | Utility concierge service | BETA |

## Market Rollout Phases

Geographic rollout is controlled by rollout phases. Features can be market-gated to limit availability.

### Phase 1 (Q1 2026) - NYC Pilot
- **Markets:** NYC
- **Features:** All 3DGS tour features

### Phase 2 (Q2 2026) - Major Markets
- **Markets:** NYC, LA, SF
- **Features:** 3DGS tour, Utility Concierge

### Phase 3 (Q3 2026) - Extended Markets
- **Markets:** NYC, LA, SF, CHI, MIA, ATL
- **Features:** All market-gated features

### General Availability (Q4 2026)
- **Markets:** All 13 markets
- **Features:** Full platform

## Supported Markets

| Code | City | Status |
|------|------|--------|
| NYC | New York City | Enabled |
| LA | Los Angeles | Enabled |
| SF | San Francisco | Enabled |
| CHI | Chicago | Enabled |
| MIA | Miami | Enabled |
| ATL | Atlanta | Enabled |
| BOS | Boston | Coming Soon |
| SEA | Seattle | Coming Soon |
| DEN | Denver | Coming Soon |
| AUS | Austin | Coming Soon |
| DAL | Dallas | Coming Soon |
| PHX | Phoenix | Coming Soon |
| DC | Washington DC | Coming Soon |

## API Reference

### Functions

```typescript
// Check if flag is enabled
isFeatureEnabled(flag: FeatureFlag, context?: FeatureFlagContext): boolean

// Check if flag is enabled for specific market
isFeatureEnabledForMarket(flag: FeatureFlag, market: string): boolean

// Get singleton service instance
getFeatureFlagService(): FeatureFlagService

// Get all 3DGS tour flags
getTour3DGSFlags(): FeatureFlagMetadata[]

// Get flags by category
getFlagsByCategory(category: FeatureCategory): FeatureFlagMetadata[]

// Get all market-gated flags
getMarketGatedFlags(): FeatureFlagMetadata[]

// Get enabled markets for a flag
getEnabledMarketsForFlag(flag: FeatureFlag): Market[] | null
```

### Types

```typescript
interface FeatureFlagContext {
  userId?: string;
  tenantId?: string;
  market?: string;
  propertyId?: string;
  environment?: 'development' | 'staging' | 'production';
  attributes?: Record<string, unknown>;
}

interface FeatureFlagResult {
  flag: FeatureFlag;
  enabled: boolean;
  reason: FeatureFlagReason;
  metadata: FeatureFlagMetadata;
}

type FeatureFlagReason =
  | 'DEFAULT_ENABLED'
  | 'DEFAULT_DISABLED'
  | 'MARKET_ENABLED'
  | 'MARKET_DISABLED'
  | 'OVERRIDE_ENABLED'
  | 'OVERRIDE_DISABLED';
```

## Testing

```bash
pnpm test
```
