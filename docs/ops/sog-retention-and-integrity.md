# SOG Retention and Integrity Guide

## Overview

This document describes the retention policy and integrity verification system for 3D Gaussian Splatting (3DGS) tour assets. The system ensures:

1. **PLY source files are permanently retained** (canonical source of truth)
2. **SOG artifacts can be regenerated** from PLY source at any time
3. **Integrity is verified** via SHA256 checksums and perceptual hashing
4. **Provenance is tracked** for SOC2 compliance

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         Tour Asset Lifecycle                        │
├────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [Upload] ──► [PLY Storage (S3)] ──► [Conversion] ──► [SOG Storage] │
│                    │                      │               │          │
│                    ▼                      ▼               ▼          │
│            [Checksum + Provenance]   [QA Report]   [Signed URLs]    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Retention Guard                            │  │
│  │  • PLY delete blocked unless SUPERADMIN + override           │  │
│  │  • Evidence recorded for all delete attempts                  │  │
│  │  • SOG deletions allowed (regenerable)                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

## Retention Policy

### PLY Source Files

| Property | Value |
|----------|-------|
| Retention | **Permanent** |
| Storage | S3 (PLY_S3_BUCKET) |
| Delete Policy | Blocked unless SUPERADMIN + PLY_DELETE_OVERRIDE=true |
| Versioning | S3 versioning enabled |

PLY files are the canonical source of truth for 3DGS tours. They cannot be regenerated and must be retained permanently.

### SOG Output Files

| Property | Value |
|----------|-------|
| Retention | **Regenerable** |
| Storage | Cloudflare R2 (SOG_R2_BUCKET) |
| Delete Policy | Allowed (can be regenerated from PLY) |
| Delivery | Signed URLs only |

SOG files are optimized renderings that can be regenerated from PLY source using the conversion pipeline.

## Integrity Verification

### Checksum Computation

All assets have SHA256 checksums computed and stored:

```typescript
import { computeFileChecksum, verifyChecksum } from '@realriches/tour-conversion';

// Compute checksum
const checksum = await computeFileChecksum('/path/to/asset.ply');
// Returns: '3a7c8b9d...' (64-char hex)

// Verify checksum
const isValid = await verifyChecksum('/path/to/asset.ply', expectedChecksum);
```

### Database Fields

The `TourAsset` model stores:

| Field | Description |
|-------|-------------|
| `plyChecksum` | SHA256 hash of PLY source file |
| `plyVersionId` | S3 version ID for immutability |
| `plySizeBytes` | File size for quick validation |
| `sogChecksum` | SHA256 hash of SOG output |
| `sogSizeBytes` | SOG file size |

### Provenance Tracking

Provenance metadata is recorded for every asset:

| Field | Description |
|-------|-------------|
| `uploaderId` | UUID of user who uploaded the PLY |
| `uploaderEmail` | Email for audit trail |
| `uploadedAt` | Timestamp of initial upload |
| `converterVersion` | Version of splat-transform used |
| `conversionParams` | JSON parameters used for conversion |
| `qaScore` | Quality assurance score (0.0-1.0) |
| `qaPassedAt` | Timestamp when QA was verified |

## PLY Retention Guard

### Overview

The PLY retention guard (`PlyRetentionGuard`) enforces the permanent retention policy for PLY files.

### How It Works

```typescript
import { S3StorageProvider } from '@realriches/tour-delivery';

const provider = createPlyStorageProvider();

// This will throw PlyRetentionError
await provider.delete('tours/property-123/scan.ply', { role: 'ADMIN' });
// Error: PLY retention policy: PLY source files are retained permanently

// This will also throw (SUPERADMIN but no override)
await provider.delete('tours/property-123/scan.ply', { role: 'SUPERADMIN' });
// Error: PLY retention policy: delete blocked. Set PLY_DELETE_OVERRIDE=true to override.

// Only this will succeed
process.env.PLY_DELETE_OVERRIDE = 'true';
await provider.delete('tours/property-123/scan.ply', { role: 'SUPERADMIN' });
// OK: Delete allowed with explicit override
```

### Evidence Recording

All delete attempts are recorded as evidence events:

```json
{
  "controlId": "CC6.1",
  "category": "Security",
  "eventType": "ply_delete_attempt",
  "eventOutcome": "blocked",
  "summary": "PLY retention policy: PLY source files are retained permanently",
  "details": {
    "key": "tours/property-123/scan.ply",
    "role": "ADMIN",
    "overrideEnabled": false
  }
}
```

## Quality Assurance

### QA Pipeline

The QA system validates SOG conversions against PLY source:

1. **Render frames** from both PLY and SOG at canonical camera positions
2. **Compute SSIM** (Structural Similarity Index) for each frame
3. **Compute pHash** (perceptual hash) for visual similarity
4. **Aggregate scores** and compare against thresholds

### Thresholds

| Metric | Threshold | Description |
|--------|-----------|-------------|
| `MIN_SSIM` | 0.85 | Minimum structural similarity |
| `MAX_PHASH_DISTANCE` | 10 | Maximum perceptual hash distance |
| `MIN_FRAMES_PASSED_RATIO` | 0.8 | 80% of frames must pass |

### Quality Regression Detection

The regression harness detects quality drops:

```typescript
import { QualityRegressionHarness } from '@realriches/tour-conversion';

const harness = new QualityRegressionHarness();

// Register baseline from previous successful conversion
harness.registerBaseline({
  assetId: 'asset-123',
  plyChecksum: 'abc...',
  sogChecksum: 'def...',
  converterVersion: '1.0.0',
  qaScore: 0.92,
  pHashBaseline: '...',
  ssimBaseline: 0.92,
  recordedAt: new Date(),
});

// Check new conversion against baseline
const result = harness.checkRegression('asset-123', newQAReport, '1.1.0');

if (result.regressionDetected) {
  console.error(`Regression detected: ${result.regressionSeverity}`);
  console.error(`Score dropped: ${result.scoreDelta}`);
  console.error(`Recommendation: ${result.recommendation}`);
}
```

### Regression Severity Levels

| Severity | Condition |
|----------|-----------|
| **Severe** | Score drops below minSSIMThreshold OR drops > 15% |
| **Moderate** | Score drops 10-15% OR pHash distance > 8 |
| **Minor** | Score drops 5-10% |

## Signed URL Delivery

All SOG assets are delivered via time-limited signed URLs:

```typescript
const result = await tourDeliveryService.requestAccess({
  tourAssetId: 'asset-123',
  userId: 'user-456',
  market: 'nyc',
  plan: 'pro',
});

if (result.granted) {
  // result.sogUrl is a signed URL valid until result.expiresAt
  console.log(`Access granted: ${result.sogUrl}`);
  console.log(`Expires: ${result.expiresAt}`);
}
```

### URL TTL by Plan

| Plan | TTL |
|------|-----|
| Free | 15 minutes |
| Pro | 1 hour |
| Enterprise | 2 hours |

## CI Integration

The tour conversion validation job runs in CI:

1. **Unit tests** for tour-conversion and tour-delivery packages
2. **PLY retention guard validation** - verifies delete blocking works
3. **Checksum and provenance tests** - verifies integrity tracking
4. **Quality regression harness tests** - verifies regression detection

### Running Locally

```bash
# Run all tour-related tests
pnpm --filter @realriches/tour-conversion test
pnpm --filter @realriches/tour-delivery test

# Run specific test suites
cd packages/tour-conversion
pnpm test -- --grep "provenance"
pnpm test -- --grep "quality-regression"

cd packages/tour-delivery
pnpm test -- --grep "retention-guard"
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PLY_S3_BUCKET` | S3 bucket for PLY retention | `realriches-ply-source` |
| `SOG_R2_BUCKET` | R2 bucket for SOG distribution | `realriches-sog-dist` |
| `PLY_DELETE_OVERRIDE` | Allow PLY deletion (SUPERADMIN only) | `false` |
| `AWS_REGION` | AWS region for S3 | `us-east-1` |
| `R2_ACCOUNT_ID` | Cloudflare account ID for R2 | - |

## Emergency Procedures

### Accidental PLY Deletion

If a PLY file is accidentally deleted (should be impossible without override):

1. **Check S3 versioning** - Previous versions should be available
2. **Restore from version** - Use AWS Console or CLI to restore
3. **Report incident** - File evidence of the deletion attempt

### SOG Corruption

If a SOG file is corrupted:

1. **Delete corrupted SOG** - SOG deletions are allowed
2. **Re-run conversion** - Generate new SOG from PLY source
3. **Verify QA** - Ensure new SOG passes quality checks

### Quality Regression

If conversion quality regresses:

1. **Check converter version** - Did splat-transform update?
2. **Review conversion params** - Were settings changed?
3. **Compare baselines** - Use regression harness to identify delta
4. **Roll back if needed** - Use previous converter version

## References

- [Tour Delivery Package](../../packages/tour-delivery/)
- [Tour Conversion Package](../../packages/tour-conversion/)
- [Evidence Control Catalog](./EVIDENCE_CONTROL_CATALOG.md)
- [Chaos GameDay Guide](./chaos-gameday.md)
