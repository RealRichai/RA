/**
 * k6 Performance Test: Listing Search
 *
 * Tests the listing search endpoint with various filter combinations.
 * Measures p95/p99 latency and error rates.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const listingSearchDuration = new Trend('listing_search_duration', true);
const listingSearchErrors = new Rate('listing_search_errors');

// Test data - various search scenarios
const searchScenarios = [
  { city: 'New York', minPrice: 1000, maxPrice: 3000 },
  { city: 'Los Angeles', bedrooms: 2 },
  { city: 'Chicago', propertyType: 'apartment' },
  { city: 'Miami', minPrice: 2000, maxPrice: 5000, bedrooms: 3 },
  { city: 'Seattle', propertyType: 'condo', minPrice: 1500 },
  { page: 1, limit: 20 },
  { page: 2, limit: 50, sortBy: 'price' },
  { status: 'active', limit: 10 },
];

/**
 * Build query string from search params
 */
function buildQueryString(params) {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

/**
 * Main test function - executed for each VU iteration
 */
export default function () {
  const baseUrl = __ENV.API_BASE_URL || 'http://localhost:4000';
  const scenario = searchScenarios[Math.floor(Math.random() * searchScenarios.length)];
  const queryString = buildQueryString(scenario);
  const url = `${baseUrl}/api/v1/listings/search?${queryString}`;

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    tags: { name: 'listing_search' },
  };

  const startTime = Date.now();
  const response = http.get(url, params);
  const duration = Date.now() - startTime;

  // Record metrics
  listingSearchDuration.add(duration);

  // Validate response
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response has data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body && (Array.isArray(body.data) || Array.isArray(body.listings) || Array.isArray(body));
      } catch {
        return false;
      }
    },
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  listingSearchErrors.add(!success);

  // Small pause between requests
  sleep(0.1);
}

/**
 * Setup function - runs once before test
 */
export function setup() {
  const baseUrl = __ENV.API_BASE_URL || 'http://localhost:4000';
  console.log(`Testing listing search at: ${baseUrl}`);

  // Verify API is reachable
  const healthCheck = http.get(`${baseUrl}/health`);
  if (healthCheck.status !== 200) {
    console.warn('API health check failed, tests may not be accurate');
  }

  return { baseUrl };
}

/**
 * Teardown function - runs once after test
 */
export function teardown(data) {
  console.log('Listing search test completed');
}
