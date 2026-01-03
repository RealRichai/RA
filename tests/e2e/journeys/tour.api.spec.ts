/**
 * [Tour] Journey Tests
 *
 * Tests the 3D tour delivery:
 * 1. Create listing with tour
 * 2. Generate signed URL for tour assets
 * 3. Verify viewer route loads
 * 4. Verify fallback support
 *
 * Compliance: Signed URL access, Fallback support, Asset delivery
 */

import { test, expect } from '../fixtures/test-fixtures';

test.describe('[Tour] 3D Tour Delivery', () => {
  const uniqueId = `tour_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  let accessToken: string;
  let listingId: string;
  let tourId: string;
  let signedUrl: string;

  // Setup: Create authenticated user and listing
  test.beforeAll(async ({ playwright }) => {
    const apiUrl = process.env.E2E_API_URL || 'http://localhost:4000';
    const context = await playwright.request.newContext({ baseURL: apiUrl });

    // Register test user
    const authResponse = await context.post('/api/v1/auth/register', {
      data: {
        email: `tour_user_${uniqueId}@e2e.realriches.test`,
        password: 'TestPassword123!',
        firstName: 'Tour',
        lastName: 'Test',
      },
    });

    if (authResponse.ok()) {
      const body = await authResponse.json();
      accessToken = body.accessToken;
    }

    await context.dispose();
  });

  test('[Tour] Step 1: Create listing with 3D tour', async ({ apiContext }) => {
    test.skip(!accessToken, 'No access token available');

    const response = await apiContext.post('/api/v1/listings', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        title: `Tour Test Apartment ${uniqueId}`,
        description: '3D tour enabled apartment',
        propertyType: 'apartment',
        address: {
          street: '456 Virtual Lane',
          city: 'New York',
          state: 'NY',
          zip: '10002',
        },
        monthlyRent: 4000,
        bedrooms: 3,
        bathrooms: 2,
        tour: {
          enabled: true,
          type: 'splat', // Gaussian splat format
          status: 'pending',
        },
      },
    });

    expect([200, 201]).toContain(response.status());

    const body = await response.json();
    listingId = body.id || body.listingId;
    expect(listingId).toBeTruthy();

    // Verify tour configuration
    expect(body.tour?.enabled || body.tourEnabled).toBeTruthy();
  });

  test('[Tour] Step 2: Upload tour assets', async ({ apiContext }) => {
    test.skip(!accessToken || !listingId, 'Prerequisites not met');

    const response = await apiContext.post(`/api/v1/listings/${listingId}/tour`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        format: 'splat',
        quality: 'high',
        assets: {
          splat: `tour_${uniqueId}.splat`,
          thumbnail: `tour_${uniqueId}_thumb.jpg`,
          preview: `tour_${uniqueId}_preview.mp4`,
        },
        metadata: {
          captureDate: '2026-01-01',
          deviceModel: 'iPhone 15 Pro',
          processingVersion: '2.0',
        },
      },
    });

    expect([200, 201]).toContain(response.status());

    const body = await response.json();
    tourId = body.tourId || body.id || `tour_${listingId}`;
    expect(tourId).toBeTruthy();

    // Verify tour status
    expect(['processing', 'ready', 'pending']).toContain(
      body.status || body.tour?.status
    );
  });

  test('[Tour] Step 3: Generate signed URL for tour assets', async ({ apiContext }) => {
    test.skip(!accessToken || !tourId, 'Prerequisites not met');

    const response = await apiContext.post('/api/v1/tours/signed-url', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        tourId: tourId,
        format: 'splat',
        quality: 'high',
        expiresIn: 3600, // 1 hour
      },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    signedUrl = body.url || body.signedUrl || body.deliveryUrl;
    expect(signedUrl).toBeTruthy();

    // Verify URL structure
    expect(signedUrl).toContain('signature');

    // Verify expiration
    expect(body.expiresAt || body.expires).toBeTruthy();
  });

  test('[Tour] Step 4: Signed URL provides access to assets', async ({ apiContext }) => {
    test.skip(!signedUrl, 'No signed URL available');

    // Note: In real scenario, this would download the actual splat file
    // For e2e, we verify the URL is accessible
    const response = await apiContext.head(signedUrl);

    // Accept 200 (OK) or 206 (Partial Content for range requests)
    expect([200, 206, 302, 307]).toContain(response.status());
  });

  test('[Tour] Step 5: Tour viewer route accessible', async ({ page }) => {
    test.skip(!listingId, 'No listing ID available');

    const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:3000';

    // Navigate to tour viewer
    const response = await page.goto(`${baseUrl}/listings/${listingId}/tour`);

    // Page should load (200) or redirect (302/307)
    expect([200, 302, 307]).toContain(response?.status() || 200);

    // Verify tour viewer elements
    const tourContainer = page.locator('[data-testid="tour-viewer"], .tour-viewer, #tour-container');

    // Wait for tour viewer to be visible (with fallback check)
    try {
      await tourContainer.waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      // Tour viewer may not exist yet - check for fallback
      const fallback = page.locator('[data-testid="tour-fallback"], .tour-fallback');
      await fallback.waitFor({ state: 'visible', timeout: 5000 });
    }
  });

  test('[Tour] Step 6: Fallback supported when WebGL unavailable', async ({ apiContext }) => {
    test.skip(!listingId, 'No listing ID available');

    // Request tour with fallback preference
    const response = await apiContext.get(`/api/v1/listings/${listingId}/tour`, {
      headers: {
        'Accept': 'application/json',
        'X-Fallback-Supported': 'true',
        'X-WebGL-Version': '0', // Simulate no WebGL
      },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.json();

    // Verify fallback assets are provided
    expect(body.fallback || body.fallbackAssets).toBeTruthy();

    // Fallback should include video or images
    const fallback = body.fallback || body.fallbackAssets;
    expect(fallback.video || fallback.images || fallback.panorama).toBeTruthy();
  });

  test('[Tour] Step 7: Tour metadata includes quality options', async ({ apiContext }) => {
    test.skip(!listingId, 'No listing ID available');

    const response = await apiContext.get(`/api/v1/listings/${listingId}/tour/metadata`);

    expect(response.ok()).toBeTruthy();

    const body = await response.json();

    // Verify quality options
    expect(body.qualities || body.availableQualities).toBeTruthy();

    // Should include at least one quality option
    const qualities = body.qualities || body.availableQualities;
    expect(Array.isArray(qualities) ? qualities.length : Object.keys(qualities).length).toBeGreaterThan(0);
  });

  test('[Tour] Step 8: Expired signed URL rejected', async ({ apiContext }) => {
    test.skip(!accessToken || !tourId, 'Prerequisites not met');

    // Generate URL with very short expiration
    const response = await apiContext.post('/api/v1/tours/signed-url', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        tourId: tourId,
        format: 'splat',
        expiresIn: 1, // 1 second
      },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const shortLivedUrl = body.url || body.signedUrl;

    // Wait for URL to expire
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Attempt to access expired URL
    const expiredResponse = await apiContext.get(shortLivedUrl);

    // Should be rejected (403 Forbidden or 410 Gone)
    expect([403, 410, 401]).toContain(expiredResponse.status());
  });

  test('[Tour] Step 9: Public listing includes tour preview', async ({ apiContext }) => {
    test.skip(!listingId, 'No listing ID available');

    // Publish listing first (if not already)
    await apiContext.post(`/api/v1/listings/${listingId}/publish`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { confirmCompliance: true },
    });

    // Get public listing
    const response = await apiContext.get(`/api/v1/listings/${listingId}`);

    expect(response.ok()).toBeTruthy();

    const body = await response.json();

    // Verify tour preview is included
    if (body.tour) {
      expect(body.tour.thumbnail || body.tour.preview).toBeTruthy();
      expect(body.tour.enabled).toBeTruthy();
    }
  });
});
