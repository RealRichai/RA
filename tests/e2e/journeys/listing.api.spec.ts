/**
 * [Listing] Journey Tests
 *
 * Tests the listing lifecycle with NYC compliance:
 * 1. Create draft listing
 * 2. Add required NYC disclosures
 * 3. Publish with compliance gate enforcement
 * 4. Verify published listing is accessible
 *
 * Compliance: NYC FCHA compliance gate, Required disclosures, Pricing transparency
 */

import { test, expect } from '../fixtures/test-fixtures';

test.describe('[Listing] Listing Lifecycle with NYC Compliance', () => {
  const uniqueId = `listing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  let accessToken: string;
  let listingId: string;

  // Setup: Create authenticated user
  test.beforeAll(async ({ playwright }) => {
    const apiUrl = process.env.E2E_API_URL || 'http://localhost:4000';
    const context = await playwright.request.newContext({ baseURL: apiUrl });

    // Register/login test user
    const authResponse = await context.post('/api/v1/auth/register', {
      data: {
        email: `listing_user_${uniqueId}@e2e.realriches.test`,
        password: 'TestPassword123!',
        firstName: 'Listing',
        lastName: 'Test',
      },
    });

    if (authResponse.ok()) {
      const body = await authResponse.json();
      accessToken = body.accessToken;
    }

    await context.dispose();
  });

  test('[Listing] Step 1: Create draft listing', async ({ apiContext }) => {
    test.skip(!accessToken, 'No access token available');

    const response = await apiContext.post('/api/v1/listings', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        title: `NYC Apartment ${uniqueId}`,
        description: 'Beautiful 2BR apartment in Manhattan',
        propertyType: 'apartment',
        address: {
          street: '123 Broadway',
          city: 'New York',
          state: 'NY',
          zip: '10001',
        },
        monthlyRent: 3500,
        securityDeposit: 3500,
        bedrooms: 2,
        bathrooms: 1,
        squareFeet: 850,
        availableDate: '2026-02-01',
        status: 'draft',
      },
    });

    expect([200, 201]).toContain(response.status());

    const body = await response.json();
    listingId = body.id || body.listingId;
    expect(listingId).toBeTruthy();

    // Verify draft status
    expect(body.status).toBe('draft');
  });

  test('[Listing] Step 2: Publish without NYC disclosures fails', async ({ apiContext }) => {
    test.skip(!accessToken || !listingId, 'Prerequisites not met');

    // Attempt to publish without required NYC disclosures
    const response = await apiContext.post(`/api/v1/listings/${listingId}/publish`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        // Missing NYC required disclosures
      },
    });

    // Should fail compliance gate
    // Accept 400 (bad request) or 422 (validation) or 403 (compliance rejected)
    expect([400, 403, 422]).toContain(response.status());

    const body = await response.json();
    // Should indicate compliance issue
    expect(
      body.error?.includes('compliance') ||
      body.message?.includes('disclosure') ||
      body.errors?.some((e: any) => e.field?.includes('disclosure'))
    ).toBeTruthy();
  });

  test('[Listing] Step 3: Add NYC required disclosures', async ({ apiContext }) => {
    test.skip(!accessToken || !listingId, 'Prerequisites not met');

    const response = await apiContext.patch(`/api/v1/listings/${listingId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        nycDisclosures: {
          floodZone: false,
          floodZoneDescription: 'Not in a flood zone',
          bedbugHistory: false,
          bedbugHistoryDescription: 'No bedbug history',
          smokingPolicy: 'no_smoking',
          petsAllowed: true,
          petRestrictions: 'Dogs under 25 lbs only',
          brokerFee: 0,
          brokerFeeDescription: 'No broker fee',
        },
        amenities: ['dishwasher', 'laundry_in_building', 'elevator'],
      },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.nycDisclosures).toBeTruthy();
  });

  test('[Listing] Step 4: Publish with complete disclosures succeeds', async ({ apiContext }) => {
    test.skip(!accessToken || !listingId, 'Prerequisites not met');

    const response = await apiContext.post(`/api/v1/listings/${listingId}/publish`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        confirmCompliance: true,
        confirmAccuracy: true,
      },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe('published');

    // Verify compliance timestamp
    expect(body.publishedAt || body.complianceVerifiedAt).toBeTruthy();
  });

  test('[Listing] Step 5: Published listing is publicly accessible', async ({ apiContext }) => {
    test.skip(!listingId, 'No listing ID available');

    // Public endpoint - no auth required
    const response = await apiContext.get(`/api/v1/listings/${listingId}`);

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe('published');

    // Verify NYC disclosures are included
    expect(body.nycDisclosures).toBeTruthy();

    // Verify pricing transparency
    expect(body.monthlyRent).toBe(3500);
    expect(body.securityDeposit).toBeTruthy();
  });

  test('[Listing] Step 6: Listing search returns compliant listings', async ({ apiContext }) => {
    const response = await apiContext.get('/api/v1/listings/search', {
      params: {
        city: 'New York',
        state: 'NY',
        status: 'published',
        limit: 10,
      },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const listings = body.data || body.listings || body;
    expect(Array.isArray(listings)).toBeTruthy();

    // All returned listings should be published (compliant)
    for (const listing of listings) {
      expect(listing.status).toBe('published');
    }
  });

  test('[Listing] Step 7: Unpublish listing reverts to draft', async ({ apiContext }) => {
    test.skip(!accessToken || !listingId, 'Prerequisites not met');

    const response = await apiContext.post(`/api/v1/listings/${listingId}/unpublish`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(['draft', 'unpublished']).toContain(body.status);
  });
});
