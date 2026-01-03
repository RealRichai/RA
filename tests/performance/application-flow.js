/**
 * k6 Performance Test: Application Submission & FCHA Transitions
 *
 * Tests the rental application submission flow and FCHA state transitions.
 * Measures latency for initial submission and subsequent state changes.
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const applicationSubmitDuration = new Trend('application_submit_duration', true);
const applicationSubmitErrors = new Rate('application_submit_errors');
const fchaTransitionDuration = new Trend('fcha_transition_duration', true);
const fchaTransitionErrors = new Rate('fcha_transition_errors');

// Test applicant data
const testApplicants = [
  {
    firstName: 'John',
    lastName: 'Smith',
    email: 'john.smith.perf@example.com',
    phone: '555-0101',
    income: 75000,
    employmentStatus: 'employed',
  },
  {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane.doe.perf@example.com',
    phone: '555-0102',
    income: 85000,
    employmentStatus: 'employed',
  },
  {
    firstName: 'Bob',
    lastName: 'Johnson',
    email: 'bob.johnson.perf@example.com',
    phone: '555-0103',
    income: 65000,
    employmentStatus: 'self_employed',
  },
];

// FCHA state transitions to test
const fchaTransitions = [
  { from: 'submitted', to: 'screening', action: 'start_screening' },
  { from: 'screening', to: 'review', action: 'complete_screening' },
  { from: 'review', to: 'approved', action: 'approve' },
];

/**
 * Generate unique application ID
 */
function generateApplicationId() {
  return `app_perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

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

  // Select random applicant data
  const applicant = testApplicants[Math.floor(Math.random() * testApplicants.length)];
  const applicationId = generateApplicationId();

  // Test 1: Application Submission
  group('application_submission', function () {
    const submitPayload = JSON.stringify({
      applicationId: applicationId,
      listingId: 'listing_perf_test',
      applicant: {
        ...applicant,
        email: `${applicationId}@perf.test`,
      },
      moveInDate: '2026-03-01',
      leaseTermMonths: 12,
    });

    const startTime = Date.now();
    const response = http.post(
      `${baseUrl}/api/v1/applications`,
      submitPayload,
      { ...params, tags: { name: 'application_submit' } }
    );
    const duration = Date.now() - startTime;

    applicationSubmitDuration.add(duration);

    const success = check(response, {
      'application created': (r) => r.status === 200 || r.status === 201,
      'has application id': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body && (body.id || body.applicationId);
        } catch {
          return false;
        }
      },
      'response time < 500ms': (r) => r.timings.duration < 500,
    });

    applicationSubmitErrors.add(!success);
  });

  sleep(0.1);

  // Test 2: FCHA State Transition
  group('fcha_transition', function () {
    const transition = fchaTransitions[Math.floor(Math.random() * fchaTransitions.length)];

    const transitionPayload = JSON.stringify({
      applicationId: applicationId,
      action: transition.action,
      metadata: {
        performedBy: 'perf_test',
        timestamp: new Date().toISOString(),
      },
    });

    const startTime = Date.now();
    const response = http.post(
      `${baseUrl}/api/v1/applications/${applicationId}/transition`,
      transitionPayload,
      { ...params, tags: { name: 'fcha_transition' } }
    );
    const duration = Date.now() - startTime;

    fchaTransitionDuration.add(duration);

    const success = check(response, {
      'transition successful': (r) => r.status === 200 || r.status === 201 || r.status === 404,
      'response time < 300ms': (r) => r.timings.duration < 300,
    });

    fchaTransitionErrors.add(!success && response.status !== 404);
  });

  sleep(0.1);
}

/**
 * Setup function
 */
export function setup() {
  const baseUrl = __ENV.API_BASE_URL || 'http://localhost:4000';
  console.log(`Testing application flow at: ${baseUrl}`);
  return { baseUrl };
}

/**
 * Teardown function
 */
export function teardown(data) {
  console.log('Application flow test completed');
}
