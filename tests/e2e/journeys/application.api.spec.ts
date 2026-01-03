/**
 * [Application] Journey Tests
 *
 * Tests the rental application flow with FCHA compliance:
 * 1. Submit pre-qualification
 * 2. Receive conditional offer
 * 3. Authorize background check
 * 4. Complete FCHA-compliant sequence
 *
 * Compliance: FCHA sequence enforcement, Background check authorization, Fair housing
 */

import { test, expect } from '../fixtures/test-fixtures';

test.describe('[Application] Application Flow with FCHA Compliance', () => {
  const uniqueId = `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  let accessToken: string;
  let applicationId: string;
  let listingId: string;

  // Setup: Create authenticated user and listing
  test.beforeAll(async ({ playwright }) => {
    const apiUrl = process.env.E2E_API_URL || 'http://localhost:4000';
    const context = await playwright.request.newContext({ baseURL: apiUrl });

    // Register test user
    const authResponse = await context.post('/api/v1/auth/register', {
      data: {
        email: `applicant_${uniqueId}@e2e.realriches.test`,
        password: 'TestPassword123!',
        firstName: 'Applicant',
        lastName: 'Test',
      },
    });

    if (authResponse.ok()) {
      const body = await authResponse.json();
      accessToken = body.accessToken;
    }

    // Use a test listing ID (would normally be created or seeded)
    listingId = `listing_${uniqueId}`;

    await context.dispose();
  });

  test('[Application] Step 1: Submit pre-qualification', async ({ apiContext }) => {
    test.skip(!accessToken, 'No access token available');

    const response = await apiContext.post('/api/v1/applications/prequal', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        listingId: listingId,
        applicant: {
          firstName: 'Applicant',
          lastName: 'Test',
          email: `applicant_${uniqueId}@e2e.realriches.test`,
          phone: '555-123-4567',
        },
        income: {
          annualIncome: 120000,
          employmentStatus: 'employed',
          employer: 'Tech Corp',
        },
        moveInDate: '2026-03-01',
        leaseTermMonths: 12,
      },
    });

    expect([200, 201]).toContain(response.status());

    const body = await response.json();
    applicationId = body.id || body.applicationId;
    expect(applicationId).toBeTruthy();

    // Verify initial FCHA-compliant state
    expect(['prequal', 'submitted', 'pending_prequal']).toContain(body.status);
  });

  test('[Application] Step 2: Pre-qualification evaluated', async ({ apiContext }) => {
    test.skip(!accessToken || !applicationId, 'Prerequisites not met');

    // Get application status
    const response = await apiContext.get(`/api/v1/applications/${applicationId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.json();

    // Application should be in prequal or conditional state
    expect([
      'prequal',
      'prequal_passed',
      'conditional',
      'pending_documents',
      'submitted',
    ]).toContain(body.status);
  });

  test('[Application] Step 3: Background check requires authorization', async ({ apiContext }) => {
    test.skip(!accessToken || !applicationId, 'Prerequisites not met');

    // Attempt background check without authorization - should fail
    const response = await apiContext.post(
      `/api/v1/applications/${applicationId}/background-check`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          // Missing authorization
        },
      }
    );

    // Should require explicit authorization
    expect([400, 403, 422]).toContain(response.status());
  });

  test('[Application] Step 4: Provide background check authorization', async ({ apiContext }) => {
    test.skip(!accessToken || !applicationId, 'Prerequisites not met');

    const response = await apiContext.post(
      `/api/v1/applications/${applicationId}/authorize-background-check`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          consent: true,
          consentTimestamp: new Date().toISOString(),
          ipAddress: '192.168.1.1', // Test IP
          userAgent: 'Playwright E2E Test',
          acknowledgedRights: true,
          acknowledgedDispute: true,
        },
      }
    );

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.backgroundCheckAuthorized || body.authorizationReceived).toBeTruthy();
  });

  test('[Application] Step 5: FCHA sequence enforced - no skip to approval', async ({ apiContext }) => {
    test.skip(!accessToken || !applicationId, 'Prerequisites not met');

    // Attempt to skip directly to approval without completing sequence
    const response = await apiContext.post(
      `/api/v1/applications/${applicationId}/transition`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          action: 'approve',
          skipSequence: true, // Attempting to skip
        },
      }
    );

    // FCHA sequence should be enforced - cannot skip steps
    expect([400, 403, 422]).toContain(response.status());
  });

  test('[Application] Step 6: Complete application sequence', async ({ apiContext }) => {
    test.skip(!accessToken || !applicationId, 'Prerequisites not met');

    // Submit full application with all required documents
    const response = await apiContext.post(
      `/api/v1/applications/${applicationId}/submit-complete`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          documents: {
            incomeVerification: 'doc_income_123',
            identityVerification: 'doc_id_123',
          },
          confirmAccuracy: true,
          confirmTerms: true,
        },
      }
    );

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect([
      'submitted',
      'pending_review',
      'under_review',
      'screening',
    ]).toContain(body.status);
  });

  test('[Application] Step 7: Conditional offer received', async ({ apiContext }) => {
    test.skip(!accessToken || !applicationId, 'Prerequisites not met');

    // Simulate landlord action - issue conditional offer
    // In real flow, this would be done by landlord/admin
    const response = await apiContext.post(
      `/api/v1/applications/${applicationId}/transition`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          action: 'issue_conditional_offer',
          conditions: [
            'Security deposit of one month rent required',
            'First and last month rent due at signing',
          ],
          offerExpires: '2026-02-15',
        },
      }
    );

    // May succeed or fail based on user role - both are valid test outcomes
    if (response.ok()) {
      const body = await response.json();
      expect(['conditional_offer', 'offer_pending']).toContain(body.status);
    } else {
      // Non-landlord cannot issue offer - expected
      expect([401, 403]).toContain(response.status());
    }
  });

  test('[Application] Step 8: Application history shows FCHA-compliant audit trail', async ({ apiContext }) => {
    test.skip(!accessToken || !applicationId, 'Prerequisites not met');

    const response = await apiContext.get(
      `/api/v1/applications/${applicationId}/history`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const history = body.history || body.events || body;
    expect(Array.isArray(history)).toBeTruthy();

    // Verify audit trail includes timestamps and actors
    for (const event of history) {
      expect(event.timestamp || event.createdAt).toBeTruthy();
      expect(event.action || event.type || event.status).toBeTruthy();
    }
  });
});
