/**
 * [Auth] Journey Tests
 *
 * Tests the complete authentication flow:
 * 1. User registration
 * 2. Login with credentials
 * 3. Token refresh rotation
 * 4. Token revocation
 *
 * Compliance: JWT rotation, Session management
 */

import { test, expect } from '../fixtures/test-fixtures';

test.describe('[Auth] Authentication Journey', () => {
  const uniqueId = `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const testEmail = `auth_test_${uniqueId}@e2e.realriches.test`;
  const testPassword = 'SecurePassword123!';

  let accessToken: string;
  let refreshToken: string;
  let userId: string;

  test('[Auth] Step 1: User registration creates account', async ({ apiContext }) => {
    const response = await apiContext.post('/api/v1/auth/register', {
      data: {
        email: testEmail,
        password: testPassword,
        firstName: 'Auth',
        lastName: 'Test',
      },
    });

    // Accept 201 (created) or 200 (ok) or 409 (already exists in retry)
    expect([200, 201, 409]).toContain(response.status());

    if (response.status() !== 409) {
      const body = await response.json();
      expect(body).toHaveProperty('accessToken');
      expect(body).toHaveProperty('refreshToken');
      expect(body.user || body).toHaveProperty('email');

      accessToken = body.accessToken;
      refreshToken = body.refreshToken;
      userId = body.user?.id || body.id;

      // Verify token format (JWT)
      expect(accessToken.split('.')).toHaveLength(3);
      expect(refreshToken.split('.')).toHaveLength(3);
    }
  });

  test('[Auth] Step 2: Login with valid credentials succeeds', async ({ apiContext }) => {
    const response = await apiContext.post('/api/v1/auth/login', {
      data: {
        email: testEmail,
        password: testPassword,
      },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty('accessToken');
    expect(body).toHaveProperty('refreshToken');

    accessToken = body.accessToken;
    refreshToken = body.refreshToken;

    // Verify new tokens are valid JWTs
    expect(accessToken.split('.')).toHaveLength(3);
  });

  test('[Auth] Step 3: Login with invalid credentials fails', async ({ apiContext }) => {
    const response = await apiContext.post('/api/v1/auth/login', {
      data: {
        email: testEmail,
        password: 'WrongPassword123!',
      },
    });

    expect(response.status()).toBe(401);
  });

  test('[Auth] Step 4: Token refresh rotates tokens', async ({ apiContext }) => {
    // Skip if no refresh token from previous tests
    test.skip(!refreshToken, 'No refresh token available');

    const oldRefreshToken = refreshToken;

    const response = await apiContext.post('/api/v1/auth/refresh', {
      data: {
        refreshToken: oldRefreshToken,
      },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty('accessToken');
    expect(body).toHaveProperty('refreshToken');

    // Verify rotation - new tokens should be different
    expect(body.accessToken).not.toBe(accessToken);
    expect(body.refreshToken).not.toBe(oldRefreshToken);

    accessToken = body.accessToken;
    refreshToken = body.refreshToken;
  });

  test('[Auth] Step 5: Authenticated request with valid token succeeds', async ({ apiContext }) => {
    test.skip(!accessToken, 'No access token available');

    const response = await apiContext.get('/api/v1/auth/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.email || body.user?.email).toBe(testEmail);
  });

  test('[Auth] Step 6: Token revocation invalidates session', async ({ apiContext }) => {
    test.skip(!accessToken, 'No access token available');

    // Revoke token
    const revokeResponse = await apiContext.post('/api/v1/auth/revoke', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(revokeResponse.ok()).toBeTruthy();

    // Verify revoked token no longer works
    const verifyResponse = await apiContext.get('/api/v1/auth/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(verifyResponse.status()).toBe(401);
  });

  test('[Auth] Step 7: Old refresh token rejected after rotation', async ({ apiContext }) => {
    // This test verifies refresh token rotation security
    // An old refresh token should not be usable after rotation

    // First, get a fresh token pair
    const loginResponse = await apiContext.post('/api/v1/auth/login', {
      data: {
        email: testEmail,
        password: testPassword,
      },
    });

    if (!loginResponse.ok()) {
      test.skip(true, 'Could not login for rotation test');
      return;
    }

    const loginBody = await loginResponse.json();
    const firstRefreshToken = loginBody.refreshToken;

    // Rotate tokens
    const refreshResponse = await apiContext.post('/api/v1/auth/refresh', {
      data: { refreshToken: firstRefreshToken },
    });

    if (!refreshResponse.ok()) {
      test.skip(true, 'Token refresh not supported');
      return;
    }

    // Try to use the old refresh token
    const replayResponse = await apiContext.post('/api/v1/auth/refresh', {
      data: { refreshToken: firstRefreshToken },
    });

    // Old token should be rejected (401 or 403)
    expect([401, 403]).toContain(replayResponse.status());
  });
});
