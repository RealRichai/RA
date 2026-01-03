# Performance Testing

This document describes the RealRiches performance testing infrastructure using k6.

## Overview

Performance tests ensure that API endpoint latency stays within acceptable bounds. The system uses:

- **k6** - Load testing tool for HTTP endpoints
- **Baseline thresholds** - Versioned p95/p99 latency targets
- **CI integration** - Automated regression detection
- **Smoke tests** - Fast, repeatable tests for every push to main

## Quick Start

### Prerequisites

Install k6:

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo apt install k6

# Docker
docker pull grafana/k6
```

### Run Smoke Tests Locally

```bash
# Start your API server first
pnpm --filter @realriches/api dev

# Run smoke tests (in another terminal)
./scripts/perf/run-smoke.sh

# Or with custom API URL
./scripts/perf/run-smoke.sh --api-url http://localhost:4000
```

### Run Individual Tests

```bash
# Listing search
k6 run tests/performance/listing-search.js

# Listing publish (compliance gate)
k6 run tests/performance/listing-publish.js

# Application flow (submission + FCHA)
k6 run tests/performance/application-flow.js

# Signed URL generation
k6 run tests/performance/signed-urls.js
```

## Test Structure

```
tests/performance/
├── baselines.json           # Threshold configuration (versioned)
├── baselines.schema.json    # JSON schema for validation
├── smoke.js                 # Main CI test runner
├── listing-search.js        # Listing search endpoint tests
├── listing-publish.js       # Listing publish with compliance
├── application-flow.js      # Application + FCHA transitions
├── signed-urls.js           # Vault + tour signed URLs
└── results/                 # Test output (gitignored)
    └── summary.json
```

## Endpoints Tested

| Endpoint | Baseline p95 | Baseline p99 | Description |
|----------|-------------|--------------|-------------|
| `/api/v1/listings/search` | 200ms | 350ms | Listing search with filters |
| `/api/v1/listings/publish` | 500ms | 800ms | Publish with compliance gate |
| `/api/v1/applications` | 300ms | 500ms | Application submission |
| `/api/v1/applications/:id/transition` | 150ms | 250ms | FCHA state transitions |
| `/api/v1/vault/signed-url` | 100ms | 200ms | Document vault URLs |
| `/api/v1/tours/signed-url` | 100ms | 200ms | Tour delivery URLs |

## Baseline Configuration

Baselines are stored in `tests/performance/baselines.json`:

```json
{
  "version": "1.0.0",
  "thresholds": {
    "listing_search": {
      "p95": 200,
      "p99": 350,
      "maxFailRate": 0.01
    }
  },
  "regressionThreshold": 0.20
}
```

- **p95/p99**: Latency thresholds in milliseconds
- **maxFailRate**: Maximum acceptable error rate (0.01 = 1%)
- **regressionThreshold**: Percentage increase that triggers failure (0.20 = 20%)

## CI Integration

The `performance` job in `.github/workflows/ci.yml`:

1. Installs k6
2. Validates baselines.json syntax
3. Validates k6 test script syntax
4. Runs a dry-run smoke test
5. Validates the run-smoke.sh script

The job runs on:
- Every push to `main`
- Manual workflow dispatch

## Updating Baselines

**Baseline updates require platform team approval.**

### Process

1. **Investigate the regression**
   - Is this expected (new feature, heavier validation)?
   - Can the code be optimized instead?

2. **Run a full load test**
   ```bash
   k6 run --duration 5m --vus 20 tests/performance/smoke.js
   ```

3. **Update baselines.json**
   - Increment the version
   - Update the `updated` date
   - Add your name to `approvedBy`
   - Document the reason in commit message

4. **Get approval**
   - Create PR with changes
   - Get review from platform team lead

5. **Commit with proper message**
   ```
   perf: update baselines v1.0.0 -> v1.1.0

   Reason: Added compliance validation to listing publish
   New p95: 500ms -> 600ms
   Approved-by: @platform-lead
   ```

## Writing New Tests

### Adding a New Endpoint Test

1. Create a new test file in `tests/performance/`:

```javascript
import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const myEndpointDuration = new Trend('my_endpoint_duration', true);
const myEndpointErrors = new Rate('my_endpoint_errors');

export default function () {
  const baseUrl = __ENV.API_BASE_URL || 'http://localhost:4000';

  const response = http.get(`${baseUrl}/api/v1/my-endpoint`);

  myEndpointDuration.add(response.timings.duration);

  const success = check(response, {
    'status is 200': (r) => r.status === 200,
  });

  myEndpointErrors.add(!success);
}
```

2. Add baseline thresholds to `baselines.json`:

```json
{
  "thresholds": {
    "my_endpoint": {
      "p95": 150,
      "p99": 250,
      "maxFailRate": 0.01,
      "description": "My new endpoint"
    }
  }
}
```

3. Add to `smoke.js` main runner
4. Update this documentation

## Troubleshooting

### Tests fail with connection errors

```
ERRO[0001] Request Failed
```

Ensure the API is running and accessible at the specified URL.

### Threshold exceeded

```
✗ listing_search_duration
  ✗ p(95)<240 (actual: 312)
```

The endpoint is 30% slower than baseline. Either:
- Optimize the code
- Update the baseline (with approval)

### k6 not found

```bash
# Install k6
brew install k6  # macOS
sudo apt install k6  # Linux
```

## Resources

- [k6 Documentation](https://k6.io/docs/)
- [k6 Thresholds](https://k6.io/docs/using-k6/thresholds/)
- [k6 Metrics](https://k6.io/docs/using-k6/metrics/)
