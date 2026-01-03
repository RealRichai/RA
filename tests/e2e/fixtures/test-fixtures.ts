/**
 * E2E Test Fixtures
 *
 * Provides isolated test data and API helpers for each test.
 * Ensures tests are hermetic and parallel-safe.
 */

import { test as base, expect, APIRequestContext } from '@playwright/test';

// Test user data
export interface TestUser {
  id: string;
  email: string;
  password: string;
  accessToken?: string;
  refreshToken?: string;
}

// Test listing data
export interface TestListing {
  id: string;
  title: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  monthlyRent: number;
  bedrooms: number;
  bathrooms: number;
}

// Test application data
export interface TestApplication {
  id: string;
  listingId: string;
  applicantId: string;
  status: string;
}

// Custom fixtures
export interface TestFixtures {
  apiContext: APIRequestContext;
  testUser: TestUser;
  testListing: TestListing;
  uniqueId: () => string;
}

// Generate unique ID for test isolation
function generateUniqueId(): string {
  return `e2e_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Extend base test with custom fixtures
export const test = base.extend<TestFixtures>({
  // API context with base URL
  apiContext: async ({ playwright }, use) => {
    const apiUrl = process.env.E2E_API_URL || 'http://localhost:4000';
    const context = await playwright.request.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    await use(context);
    await context.dispose();
  },

  // Unique test user for isolation
  testUser: async ({ apiContext }, use) => {
    const uniqueId = generateUniqueId();
    const user: TestUser = {
      id: uniqueId,
      email: `test_${uniqueId}@e2e.realriches.test`,
      password: 'TestPassword123!',
    };

    // Register user
    try {
      const response = await apiContext.post('/api/v1/auth/register', {
        data: {
          email: user.email,
          password: user.password,
          firstName: 'E2E',
          lastName: 'Test',
        },
      });

      if (response.ok()) {
        const data = await response.json();
        user.id = data.user?.id || data.id || uniqueId;
        user.accessToken = data.accessToken;
        user.refreshToken = data.refreshToken;
      }
    } catch {
      // User creation may fail in test environment - continue anyway
    }

    await use(user);

    // Cleanup (best effort)
    try {
      if (user.accessToken) {
        await apiContext.delete(`/api/v1/users/${user.id}`, {
          headers: { Authorization: `Bearer ${user.accessToken}` },
        });
      }
    } catch {
      // Cleanup failure is non-critical
    }
  },

  // Test listing for isolation
  testListing: async ({ apiContext, testUser }, use) => {
    const uniqueId = generateUniqueId();
    const listing: TestListing = {
      id: uniqueId,
      title: `E2E Test Listing ${uniqueId}`,
      address: {
        street: '123 Test Street',
        city: 'New York',
        state: 'NY',
        zip: '10001',
      },
      monthlyRent: 2500,
      bedrooms: 2,
      bathrooms: 1,
    };

    // Create listing if authenticated
    if (testUser.accessToken) {
      try {
        const response = await apiContext.post('/api/v1/listings', {
          data: listing,
          headers: { Authorization: `Bearer ${testUser.accessToken}` },
        });

        if (response.ok()) {
          const data = await response.json();
          listing.id = data.id || data.listingId || uniqueId;
        }
      } catch {
        // Listing creation may fail - continue with mock ID
      }
    }

    await use(listing);
  },

  // Unique ID generator for test isolation
  uniqueId: async ({}, use) => {
    await use(generateUniqueId);
  },
});

export { expect };

// API helper functions
export async function loginUser(
  apiContext: APIRequestContext,
  email: string,
  password: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await apiContext.post('/api/v1/auth/login', {
    data: { email, password },
  });

  expect(response.ok()).toBeTruthy();
  return response.json();
}

export async function refreshTokens(
  apiContext: APIRequestContext,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await apiContext.post('/api/v1/auth/refresh', {
    data: { refreshToken },
  });

  expect(response.ok()).toBeTruthy();
  return response.json();
}

export async function revokeToken(
  apiContext: APIRequestContext,
  accessToken: string
): Promise<void> {
  const response = await apiContext.post('/api/v1/auth/revoke', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  expect(response.ok()).toBeTruthy();
}
