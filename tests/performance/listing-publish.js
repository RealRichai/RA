/**
 * k6 Performance Test: Listing Publish (Compliance Gate)
 *
 * Tests the listing publish endpoint which includes compliance validation.
 * This endpoint has more overhead due to FCHA compliance checks.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const listingPublishDuration = new Trend('listing_publish_duration', true);
const listingPublishErrors = new Rate('listing_publish_errors');
const complianceCheckDuration = new Trend('compliance_check_duration', true);

// Test listing data - compliant listings for various property types
const testListings = [
  {
    title: 'Modern 2BR Apartment in Downtown',
    propertyType: 'apartment',
    bedrooms: 2,
    bathrooms: 1,
    monthlyRent: 2500,
    securityDeposit: 2500,
    address: { city: 'New York', state: 'NY', zip: '10001' },
    features: ['dishwasher', 'laundry'],
    availableDate: '2026-02-01',
  },
  {
    title: 'Spacious 3BR House with Yard',
    propertyType: 'house',
    bedrooms: 3,
    bathrooms: 2,
    monthlyRent: 3500,
    securityDeposit: 3500,
    address: { city: 'Los Angeles', state: 'CA', zip: '90001' },
    features: ['garage', 'yard', 'central_ac'],
    availableDate: '2026-02-15',
  },
  {
    title: 'Cozy Studio Near Transit',
    propertyType: 'studio',
    bedrooms: 0,
    bathrooms: 1,
    monthlyRent: 1800,
    securityDeposit: 1800,
    address: { city: 'Chicago', state: 'IL', zip: '60601' },
    features: ['utilities_included'],
    availableDate: '2026-01-15',
  },
];

/**
 * Generate a unique listing ID for testing
 */
function generateListingId() {
  return `perf_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Main test function - simulates listing publish flow
 */
export default function () {
  const baseUrl = __ENV.API_BASE_URL || 'http://localhost:4000';
  const authToken = __ENV.AUTH_TOKEN || 'test-token';
  const listing = testListings[Math.floor(Math.random() * testListings.length)];
  const listingId = generateListingId();

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    tags: { name: 'listing_publish' },
  };

  // Step 1: Create draft listing (if testing full flow)
  // In smoke mode, we simulate with a publish request directly

  // Step 2: Publish listing (triggers compliance gate)
  const publishPayload = JSON.stringify({
    listingId: listingId,
    action: 'publish',
    listing: {
      ...listing,
      id: listingId,
    },
    complianceAcknowledged: true,
  });

  const startTime = Date.now();
  const response = http.post(`${baseUrl}/api/v1/listings/publish`, publishPayload, params);
  const duration = Date.now() - startTime;

  // Record metrics
  listingPublishDuration.add(duration);

  // Extract compliance check timing if available
  try {
    const body = JSON.parse(response.body);
    if (body.metrics && body.metrics.complianceCheckMs) {
      complianceCheckDuration.add(body.metrics.complianceCheckMs);
    }
  } catch {
    // Ignore parsing errors
  }

  // Validate response
  const success = check(response, {
    'status is 200 or 201': (r) => r.status === 200 || r.status === 201,
    'response has listing data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body && (body.id || body.listingId || body.data);
      } catch {
        return false;
      }
    },
    'response time < 1000ms': (r) => r.timings.duration < 1000,
  });

  listingPublishErrors.add(!success);

  // Pause between requests
  sleep(0.2);
}

/**
 * Setup function
 */
export function setup() {
  const baseUrl = __ENV.API_BASE_URL || 'http://localhost:4000';
  console.log(`Testing listing publish at: ${baseUrl}`);
  return { baseUrl };
}

/**
 * Teardown function
 */
export function teardown(data) {
  console.log('Listing publish test completed');
}
