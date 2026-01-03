/**
 * k6 Smoke Test Suite
 *
 * Main entry point for CI performance testing.
 * Runs all endpoint tests with conservative settings to catch regressions.
 *
 * Usage:
 *   k6 run tests/performance/smoke.js
 *   k6 run tests/performance/smoke.js --env API_BASE_URL=http://localhost:4000
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

// Load baselines from JSON (injected via --env or read at runtime)
const BASELINES = JSON.parse(__ENV.BASELINES || JSON.stringify({
  thresholds: {
    listing_search: { p95: 200, p99: 350, maxFailRate: 0.01 },
    listing_publish: { p95: 500, p99: 800, maxFailRate: 0.01 },
    application_submit: { p95: 300, p99: 500, maxFailRate: 0.01 },
    fcha_transition: { p95: 150, p99: 250, maxFailRate: 0.01 },
    signed_url_vault: { p95: 100, p99: 200, maxFailRate: 0.01 },
    signed_url_tour: { p95: 100, p99: 200, maxFailRate: 0.01 },
  },
  regressionThreshold: 0.20,
}));

// Regression multiplier (1 + threshold)
const REGRESSION_FACTOR = 1 + BASELINES.regressionThreshold;

// Custom metrics for each endpoint
const metrics = {
  listing_search: {
    duration: new Trend('listing_search_duration', true),
    errors: new Rate('listing_search_errors'),
    requests: new Counter('listing_search_requests'),
  },
  listing_publish: {
    duration: new Trend('listing_publish_duration', true),
    errors: new Rate('listing_publish_errors'),
    requests: new Counter('listing_publish_requests'),
  },
  application_submit: {
    duration: new Trend('application_submit_duration', true),
    errors: new Rate('application_submit_errors'),
    requests: new Counter('application_submit_requests'),
  },
  fcha_transition: {
    duration: new Trend('fcha_transition_duration', true),
    errors: new Rate('fcha_transition_errors'),
    requests: new Counter('fcha_transition_requests'),
  },
  signed_url_vault: {
    duration: new Trend('signed_url_vault_duration', true),
    errors: new Rate('signed_url_vault_errors'),
    requests: new Counter('signed_url_vault_requests'),
  },
  signed_url_tour: {
    duration: new Trend('signed_url_tour_duration', true),
    errors: new Rate('signed_url_tour_errors'),
    requests: new Counter('signed_url_tour_requests'),
  },
};

// Test configuration - smoke test settings
export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
    },
  },
  thresholds: {
    // Dynamic thresholds based on baselines with regression tolerance
    'listing_search_duration': [
      `p(95)<${BASELINES.thresholds.listing_search.p95 * REGRESSION_FACTOR}`,
      `p(99)<${BASELINES.thresholds.listing_search.p99 * REGRESSION_FACTOR}`,
    ],
    'listing_search_errors': [`rate<${BASELINES.thresholds.listing_search.maxFailRate}`],

    'listing_publish_duration': [
      `p(95)<${BASELINES.thresholds.listing_publish.p95 * REGRESSION_FACTOR}`,
      `p(99)<${BASELINES.thresholds.listing_publish.p99 * REGRESSION_FACTOR}`,
    ],
    'listing_publish_errors': [`rate<${BASELINES.thresholds.listing_publish.maxFailRate}`],

    'application_submit_duration': [
      `p(95)<${BASELINES.thresholds.application_submit.p95 * REGRESSION_FACTOR}`,
      `p(99)<${BASELINES.thresholds.application_submit.p99 * REGRESSION_FACTOR}`,
    ],
    'application_submit_errors': [`rate<${BASELINES.thresholds.application_submit.maxFailRate}`],

    'fcha_transition_duration': [
      `p(95)<${BASELINES.thresholds.fcha_transition.p95 * REGRESSION_FACTOR}`,
      `p(99)<${BASELINES.thresholds.fcha_transition.p99 * REGRESSION_FACTOR}`,
    ],
    'fcha_transition_errors': [`rate<${BASELINES.thresholds.fcha_transition.maxFailRate}`],

    'signed_url_vault_duration': [
      `p(95)<${BASELINES.thresholds.signed_url_vault.p95 * REGRESSION_FACTOR}`,
      `p(99)<${BASELINES.thresholds.signed_url_vault.p99 * REGRESSION_FACTOR}`,
    ],
    'signed_url_vault_errors': [`rate<${BASELINES.thresholds.signed_url_vault.maxFailRate}`],

    'signed_url_tour_duration': [
      `p(95)<${BASELINES.thresholds.signed_url_tour.p95 * REGRESSION_FACTOR}`,
      `p(99)<${BASELINES.thresholds.signed_url_tour.p99 * REGRESSION_FACTOR}`,
    ],
    'signed_url_tour_errors': [`rate<${BASELINES.thresholds.signed_url_tour.maxFailRate}`],

    // Global thresholds
    'http_req_failed': ['rate<0.05'], // Less than 5% failures overall
    'http_req_duration': ['p(95)<1000'], // Overall p95 under 1s
  },
};

/**
 * Test listing search endpoint
 */
function testListingSearch(baseUrl, params) {
  const scenarios = [
    'city=NewYork&minPrice=1000&maxPrice=3000',
    'city=LosAngeles&bedrooms=2',
    'city=Chicago&propertyType=apartment',
    'page=1&limit=20',
  ];
  const query = scenarios[Math.floor(Math.random() * scenarios.length)];

  const response = http.get(`${baseUrl}/api/v1/listings/search?${query}`, {
    ...params,
    tags: { name: 'listing_search' },
  });

  metrics.listing_search.duration.add(response.timings.duration);
  metrics.listing_search.requests.add(1);

  const success = check(response, {
    'listing_search: status ok': (r) => r.status === 200,
  });
  metrics.listing_search.errors.add(!success);
}

/**
 * Test listing publish endpoint
 */
function testListingPublish(baseUrl, params) {
  const payload = JSON.stringify({
    listingId: `perf_${Date.now()}`,
    action: 'publish',
    listing: {
      title: 'Performance Test Listing',
      propertyType: 'apartment',
      bedrooms: 2,
      monthlyRent: 2500,
    },
  });

  const response = http.post(`${baseUrl}/api/v1/listings/publish`, payload, {
    ...params,
    tags: { name: 'listing_publish' },
  });

  metrics.listing_publish.duration.add(response.timings.duration);
  metrics.listing_publish.requests.add(1);

  const success = check(response, {
    'listing_publish: status ok': (r) => r.status === 200 || r.status === 201,
  });
  metrics.listing_publish.errors.add(!success);
}

/**
 * Test application submission endpoint
 */
function testApplicationSubmit(baseUrl, params) {
  const payload = JSON.stringify({
    applicationId: `app_perf_${Date.now()}`,
    listingId: 'listing_perf_test',
    applicant: {
      firstName: 'Perf',
      lastName: 'Test',
      email: `perf_${Date.now()}@test.com`,
      income: 75000,
    },
  });

  const response = http.post(`${baseUrl}/api/v1/applications`, payload, {
    ...params,
    tags: { name: 'application_submit' },
  });

  metrics.application_submit.duration.add(response.timings.duration);
  metrics.application_submit.requests.add(1);

  const success = check(response, {
    'application_submit: status ok': (r) => r.status === 200 || r.status === 201,
  });
  metrics.application_submit.errors.add(!success);
}

/**
 * Test FCHA transition endpoint
 */
function testFCHATransition(baseUrl, params) {
  const actions = ['start_screening', 'complete_screening', 'approve'];
  const action = actions[Math.floor(Math.random() * actions.length)];

  const payload = JSON.stringify({
    applicationId: `app_perf_${Date.now()}`,
    action: action,
  });

  const response = http.post(`${baseUrl}/api/v1/applications/test/transition`, payload, {
    ...params,
    tags: { name: 'fcha_transition' },
  });

  metrics.fcha_transition.duration.add(response.timings.duration);
  metrics.fcha_transition.requests.add(1);

  const success = check(response, {
    'fcha_transition: status ok': (r) => r.status === 200 || r.status === 404,
  });
  metrics.fcha_transition.errors.add(!success && response.status !== 404);
}

/**
 * Test vault signed URL generation
 */
function testVaultSignedUrl(baseUrl, params) {
  const payload = JSON.stringify({
    documentId: `doc_perf_${Date.now()}`,
    documentType: 'lease_agreement',
    action: 'read',
    expiresIn: 3600,
  });

  const response = http.post(`${baseUrl}/api/v1/vault/signed-url`, payload, {
    ...params,
    tags: { name: 'signed_url_vault' },
  });

  metrics.signed_url_vault.duration.add(response.timings.duration);
  metrics.signed_url_vault.requests.add(1);

  const success = check(response, {
    'signed_url_vault: status ok': (r) => r.status === 200 || r.status === 201,
  });
  metrics.signed_url_vault.errors.add(!success);
}

/**
 * Test tour signed URL generation
 */
function testTourSignedUrl(baseUrl, params) {
  const payload = JSON.stringify({
    tourId: `tour_perf_${Date.now()}`,
    format: 'splat',
    quality: 'high',
    expiresIn: 7200,
  });

  const response = http.post(`${baseUrl}/api/v1/tours/signed-url`, payload, {
    ...params,
    tags: { name: 'signed_url_tour' },
  });

  metrics.signed_url_tour.duration.add(response.timings.duration);
  metrics.signed_url_tour.requests.add(1);

  const success = check(response, {
    'signed_url_tour: status ok': (r) => r.status === 200 || r.status === 201,
  });
  metrics.signed_url_tour.errors.add(!success);
}

/**
 * Main test function - runs each iteration
 */
export default function () {
  const baseUrl = __ENV.API_BASE_URL || 'http://localhost:4000';
  const authToken = __ENV.AUTH_TOKEN || 'test-token';

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
  };

  // Run each test in sequence with small delays
  group('listing_search', () => testListingSearch(baseUrl, params));
  sleep(0.1);

  group('listing_publish', () => testListingPublish(baseUrl, params));
  sleep(0.1);

  group('application_submit', () => testApplicationSubmit(baseUrl, params));
  sleep(0.1);

  group('fcha_transition', () => testFCHATransition(baseUrl, params));
  sleep(0.1);

  group('signed_url_vault', () => testVaultSignedUrl(baseUrl, params));
  sleep(0.05);

  group('signed_url_tour', () => testTourSignedUrl(baseUrl, params));
  sleep(0.05);
}

/**
 * Setup function
 */
export function setup() {
  const baseUrl = __ENV.API_BASE_URL || 'http://localhost:4000';
  console.log('='.repeat(60));
  console.log('  RealRiches Performance Smoke Test');
  console.log('='.repeat(60));
  console.log(`  Target: ${baseUrl}`);
  console.log(`  Regression Threshold: ${BASELINES.regressionThreshold * 100}%`);
  console.log('='.repeat(60));

  // Health check
  try {
    const health = http.get(`${baseUrl}/health`, { timeout: '5s' });
    if (health.status !== 200) {
      console.warn('  WARNING: Health check failed');
    } else {
      console.log('  Health check: OK');
    }
  } catch (e) {
    console.warn(`  WARNING: Could not reach API: ${e.message}`);
  }

  console.log('='.repeat(60));
  return { baseUrl };
}

/**
 * Teardown function
 */
export function teardown(data) {
  console.log('='.repeat(60));
  console.log('  Smoke test completed');
  console.log('='.repeat(60));
}

/**
 * Custom summary handler
 */
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    passed: !data.root_group.checks.some((c) => c.fails > 0),
    metrics: {},
  };

  // Extract key metrics
  for (const [name, metric] of Object.entries(data.metrics)) {
    if (metric.type === 'trend') {
      summary.metrics[name] = {
        p50: metric.values['p(50)'],
        p95: metric.values['p(95)'],
        p99: metric.values['p(99)'],
        avg: metric.values.avg,
        min: metric.values.min,
        max: metric.values.max,
      };
    } else if (metric.type === 'rate') {
      summary.metrics[name] = { rate: metric.values.rate };
    } else if (metric.type === 'counter') {
      summary.metrics[name] = { count: metric.values.count };
    }
  }

  return {
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
    'tests/performance/results/summary.json': JSON.stringify(summary, null, 2),
  };
}
