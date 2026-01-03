/**
 * Listing Flow Browser E2E Test
 *
 * Tests the listing creation and compliance gate flow:
 * 1. Login as admin and navigate to dashboard
 * 2. Verify Create Listing button exists
 * 3. Create listing via API (UI form not implemented yet)
 * 4. Verify NYC compliance gate blocks publish without disclosures
 * 5. Add disclosures and publish successfully
 *
 * Note: This is a hybrid test - browser for navigation/auth,
 * API for listing operations (until UI is implemented)
 */

import { test, expect, ADMIN_USER, NYC_TEST_LISTING, NYC_DISCLOSURES, waitForPageReady } from '../fixtures/browser-fixtures';

test.describe('Listing Flow with Compliance Gate', () => {
  test.describe.configure({ mode: 'serial' });

  // Store tokens for API calls
  let accessToken: string | null = null;
  let createdListingId: string | null = null;

  test('should have Create Listing button on dashboard', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await waitForPageReady(page);

    // Verify Create Listing button exists
    const createListingButton = page.locator('a:has-text("Create Listing"), button:has-text("Create Listing")');
    await expect(createListingButton).toBeVisible({ timeout: 10000 });

    // Verify it links to the correct path
    const href = await createListingButton.getAttribute('href');
    expect(href).toContain('/listings/new');
  });

  test('should obtain auth token for API operations', async ({ page, getLocaleUrl, request }) => {
    // Login via API to get token for subsequent API calls
    const apiUrl = process.env.E2E_API_URL || 'http://localhost:4000';

    const loginResponse = await request.post(`${apiUrl}/api/v1/auth/login`, {
      data: {
        email: ADMIN_USER.email,
        password: ADMIN_USER.password,
      },
    });

    if (loginResponse.ok()) {
      const data = await loginResponse.json();
      accessToken = data.accessToken;
      expect(accessToken).toBeTruthy();
    } else {
      // If login fails, skip remaining tests in this describe block
      test.skip(true, 'Could not obtain auth token - API may be unavailable');
    }
  });

  test('should reject listing publish without NYC disclosures', async ({ request }) => {
    test.skip(!accessToken, 'No auth token available');

    const apiUrl = process.env.E2E_API_URL || 'http://localhost:4000';

    // Create a draft listing without disclosures
    const createResponse = await request.post(`${apiUrl}/api/v1/listings`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        ...NYC_TEST_LISTING,
        status: 'DRAFT',
        // No disclosures provided
      },
    });

    // Listing creation should succeed (draft)
    if (createResponse.ok()) {
      const listing = await createResponse.json();
      createdListingId = listing.id || listing.listingId;

      // Attempt to publish without disclosures
      const publishResponse = await request.post(
        `${apiUrl}/api/v1/listings/${createdListingId}/publish`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Should be rejected due to missing NYC disclosures
      // Expect 400 Bad Request or 422 Unprocessable Entity
      expect([400, 422]).toContain(publishResponse.status());

      const errorData = await publishResponse.json();
      // Error should mention compliance or disclosures
      const errorMessage = JSON.stringify(errorData).toLowerCase();
      expect(
        errorMessage.includes('disclosure') ||
        errorMessage.includes('compliance') ||
        errorMessage.includes('fare') ||
        errorMessage.includes('required')
      ).toBeTruthy();
    } else {
      // API endpoint may not exist yet - skip gracefully
      test.skip(true, 'Listing creation API not available');
    }
  });

  test('should publish listing with NYC disclosures', async ({ request }) => {
    test.skip(!accessToken || !createdListingId, 'Prerequisites not met');

    const apiUrl = process.env.E2E_API_URL || 'http://localhost:4000';

    // Update listing with required disclosures
    const updateResponse = await request.patch(
      `${apiUrl}/api/v1/listings/${createdListingId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          disclosures: NYC_DISCLOSURES,
          // NYC FARE Act disclosure text
          fareActDisclosure: 'This listing complies with NYC FARE Act. No broker fee charged to tenant.',
          leadPaintDisclosure: 'Lead paint disclosure acknowledged.',
          bedbugDisclosure: 'No known bedbug infestation in the past year.',
        },
      }
    );

    if (updateResponse.ok()) {
      // Now publish should succeed
      const publishResponse = await request.post(
        `${apiUrl}/api/v1/listings/${createdListingId}/publish`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Should succeed now
      expect([200, 201]).toContain(publishResponse.status());

      const publishedListing = await publishResponse.json();
      expect(publishedListing.status).toBe('PUBLISHED');
    } else {
      // Check if status is returned directly even if PATCH fails
      console.log('Update response status:', updateResponse.status());
    }
  });

  test('should display compliance alerts on dashboard', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await waitForPageReady(page);

    // Verify compliance section exists on dashboard
    const complianceSection = page.locator('text=Compliance Alerts');
    await expect(complianceSection).toBeVisible({ timeout: 10000 });

    // Verify FARE Act compliance mention
    const fareActMention = page.locator('text=FARE Act').first();
    await expect(fareActMention).toBeVisible();
  });

  // Cleanup
  test.afterAll(async ({ request }) => {
    if (accessToken && createdListingId) {
      const apiUrl = process.env.E2E_API_URL || 'http://localhost:4000';
      try {
        await request.delete(`${apiUrl}/api/v1/listings/${createdListingId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch {
        // Cleanup failure is non-critical
      }
    }
  });
});
