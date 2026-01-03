/**
 * k6 Performance Test: Signed URL Generation
 *
 * Tests signed URL generation for:
 * - Document vault (secure document access)
 * - Tour delivery (3D tour assets)
 *
 * These endpoints should be fast as they're frequently called.
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const vaultUrlDuration = new Trend('signed_url_vault_duration', true);
const vaultUrlErrors = new Rate('signed_url_vault_errors');
const tourUrlDuration = new Trend('signed_url_tour_duration', true);
const tourUrlErrors = new Rate('signed_url_tour_errors');

// Test document IDs
const testDocuments = [
  { id: 'doc_lease_001', type: 'lease_agreement' },
  { id: 'doc_app_001', type: 'application_form' },
  { id: 'doc_id_001', type: 'identity_document' },
  { id: 'doc_income_001', type: 'income_verification' },
  { id: 'doc_insurance_001', type: 'renters_insurance' },
];

// Test tour IDs
const testTours = [
  { id: 'tour_001', format: 'splat' },
  { id: 'tour_002', format: 'video' },
  { id: 'tour_003', format: 'splat' },
  { id: 'tour_004', format: 'panorama' },
];

/**
 * Main test function
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

  // Test 1: Vault Signed URL Generation
  group('vault_signed_url', function () {
    const doc = testDocuments[Math.floor(Math.random() * testDocuments.length)];

    const payload = JSON.stringify({
      documentId: doc.id,
      documentType: doc.type,
      action: 'read',
      expiresIn: 3600, // 1 hour
    });

    const startTime = Date.now();
    const response = http.post(
      `${baseUrl}/api/v1/vault/signed-url`,
      payload,
      { ...params, tags: { name: 'signed_url_vault' } }
    );
    const duration = Date.now() - startTime;

    vaultUrlDuration.add(duration);

    const success = check(response, {
      'vault URL generated': (r) => r.status === 200 || r.status === 201,
      'has signed URL': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body && (body.url || body.signedUrl);
        } catch {
          return false;
        }
      },
      'response time < 200ms': (r) => r.timings.duration < 200,
    });

    vaultUrlErrors.add(!success);
  });

  sleep(0.05);

  // Test 2: Tour Delivery Signed URL Generation
  group('tour_signed_url', function () {
    const tour = testTours[Math.floor(Math.random() * testTours.length)];

    const payload = JSON.stringify({
      tourId: tour.id,
      format: tour.format,
      quality: 'high',
      expiresIn: 7200, // 2 hours
    });

    const startTime = Date.now();
    const response = http.post(
      `${baseUrl}/api/v1/tours/signed-url`,
      payload,
      { ...params, tags: { name: 'signed_url_tour' } }
    );
    const duration = Date.now() - startTime;

    tourUrlDuration.add(duration);

    const success = check(response, {
      'tour URL generated': (r) => r.status === 200 || r.status === 201,
      'has signed URL': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body && (body.url || body.signedUrl || body.deliveryUrl);
        } catch {
          return false;
        }
      },
      'response time < 200ms': (r) => r.timings.duration < 200,
    });

    tourUrlErrors.add(!success);
  });

  sleep(0.05);
}

/**
 * Setup function
 */
export function setup() {
  const baseUrl = __ENV.API_BASE_URL || 'http://localhost:4000';
  console.log(`Testing signed URL generation at: ${baseUrl}`);
  return { baseUrl };
}

/**
 * Teardown function
 */
export function teardown(data) {
  console.log('Signed URL generation test completed');
}
