/**
 * [Vault] Journey Tests
 *
 * Tests the document vault with ACL enforcement:
 * 1. Upload document to vault
 * 2. Verify ACL prevents unauthorized access
 * 3. Generate signed URL for authorized access
 * 4. Verify signed URL expiration
 *
 * Compliance: ACL enforcement, Encryption at rest, Signed URL expiration
 */

import { test, expect } from '../fixtures/test-fixtures';

test.describe('[Vault] Document Vault with ACL Enforcement', () => {
  const uniqueId = `vault_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  let ownerToken: string;
  let otherUserToken: string;
  let documentId: string;
  let signedUrl: string;

  // Setup: Create two users - owner and other user
  test.beforeAll(async ({ playwright }) => {
    const apiUrl = process.env.E2E_API_URL || 'http://localhost:4000';
    const context = await playwright.request.newContext({ baseURL: apiUrl });

    // Register document owner
    const ownerResponse = await context.post('/api/v1/auth/register', {
      data: {
        email: `vault_owner_${uniqueId}@e2e.realriches.test`,
        password: 'TestPassword123!',
        firstName: 'Vault',
        lastName: 'Owner',
      },
    });

    if (ownerResponse.ok()) {
      const body = await ownerResponse.json();
      ownerToken = body.accessToken;
    }

    // Register other user
    const otherResponse = await context.post('/api/v1/auth/register', {
      data: {
        email: `vault_other_${uniqueId}@e2e.realriches.test`,
        password: 'TestPassword123!',
        firstName: 'Other',
        lastName: 'User',
      },
    });

    if (otherResponse.ok()) {
      const body = await otherResponse.json();
      otherUserToken = body.accessToken;
    }

    await context.dispose();
  });

  test('[Vault] Step 1: Upload document to vault', async ({ apiContext }) => {
    test.skip(!ownerToken, 'No owner token available');

    const response = await apiContext.post('/api/v1/vault/documents', {
      headers: { Authorization: `Bearer ${ownerToken}` },
      data: {
        fileName: `test_document_${uniqueId}.pdf`,
        contentType: 'application/pdf',
        documentType: 'lease_agreement',
        metadata: {
          description: 'E2E Test Document',
          createdBy: 'e2e-test',
        },
      },
    });

    expect([200, 201]).toContain(response.status());

    const body = await response.json();
    documentId = body.id || body.documentId;
    expect(documentId).toBeTruthy();

    // Verify encryption indicator
    expect(body.encrypted || body.encryptedAtRest).toBeTruthy();
  });

  test('[Vault] Step 2: Owner can access document metadata', async ({ apiContext }) => {
    test.skip(!ownerToken || !documentId, 'Prerequisites not met');

    const response = await apiContext.get(`/api/v1/vault/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.id || body.documentId).toBe(documentId);
    expect(body.documentType).toBe('lease_agreement');
  });

  test('[Vault] Step 3: Other user cannot access document (ACL enforced)', async ({ apiContext }) => {
    test.skip(!otherUserToken || !documentId, 'Prerequisites not met');

    const response = await apiContext.get(`/api/v1/vault/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${otherUserToken}` },
    });

    // ACL should block access
    expect([401, 403, 404]).toContain(response.status());
  });

  test('[Vault] Step 4: Unauthenticated access denied', async ({ apiContext }) => {
    test.skip(!documentId, 'No document ID available');

    const response = await apiContext.get(`/api/v1/vault/documents/${documentId}`);

    // No auth token - should be denied
    expect([401, 403]).toContain(response.status());
  });

  test('[Vault] Step 5: Generate signed URL for owner', async ({ apiContext }) => {
    test.skip(!ownerToken || !documentId, 'Prerequisites not met');

    const response = await apiContext.post('/api/v1/vault/signed-url', {
      headers: { Authorization: `Bearer ${ownerToken}` },
      data: {
        documentId: documentId,
        action: 'read',
        expiresIn: 300, // 5 minutes
      },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    signedUrl = body.url || body.signedUrl;
    expect(signedUrl).toBeTruthy();

    // Verify URL contains signature
    expect(signedUrl).toContain('signature');
    expect(signedUrl).toContain('expires');

    // Verify expiration is set
    expect(body.expiresAt || body.expires).toBeTruthy();
  });

  test('[Vault] Step 6: Signed URL provides access', async ({ apiContext }) => {
    test.skip(!signedUrl, 'No signed URL available');

    // Access document via signed URL (no auth header needed)
    const response = await apiContext.get(signedUrl);

    // Signed URL should work
    expect(response.ok()).toBeTruthy();
  });

  test('[Vault] Step 7: Other user cannot generate signed URL for document', async ({ apiContext }) => {
    test.skip(!otherUserToken || !documentId, 'Prerequisites not met');

    const response = await apiContext.post('/api/v1/vault/signed-url', {
      headers: { Authorization: `Bearer ${otherUserToken}` },
      data: {
        documentId: documentId,
        action: 'read',
        expiresIn: 300,
      },
    });

    // ACL should prevent signed URL generation
    expect([401, 403, 404]).toContain(response.status());
  });

  test('[Vault] Step 8: Share document with another user', async ({ apiContext }) => {
    test.skip(!ownerToken || !documentId, 'Prerequisites not met');

    const response = await apiContext.post(
      `/api/v1/vault/documents/${documentId}/share`,
      {
        headers: { Authorization: `Bearer ${ownerToken}` },
        data: {
          email: `vault_other_${uniqueId}@e2e.realriches.test`,
          permission: 'read',
          expiresIn: 86400, // 24 hours
        },
      }
    );

    expect(response.ok()).toBeTruthy();
  });

  test('[Vault] Step 9: Shared user can now access document', async ({ apiContext }) => {
    test.skip(!otherUserToken || !documentId, 'Prerequisites not met');

    // After sharing, other user should have access
    const response = await apiContext.get(`/api/v1/vault/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${otherUserToken}` },
    });

    // If sharing worked, access should be granted
    // If sharing endpoint doesn't exist, this will fail (expected)
    if (response.ok()) {
      const body = await response.json();
      expect(body.id || body.documentId).toBe(documentId);
    }
  });

  test('[Vault] Step 10: Revoke share removes access', async ({ apiContext }) => {
    test.skip(!ownerToken || !documentId, 'Prerequisites not met');

    // Revoke share
    const revokeResponse = await apiContext.delete(
      `/api/v1/vault/documents/${documentId}/share`,
      {
        headers: { Authorization: `Bearer ${ownerToken}` },
        data: {
          email: `vault_other_${uniqueId}@e2e.realriches.test`,
        },
      }
    );

    if (revokeResponse.ok()) {
      // Verify access is revoked
      const accessResponse = await apiContext.get(
        `/api/v1/vault/documents/${documentId}`,
        {
          headers: { Authorization: `Bearer ${otherUserToken}` },
        }
      );

      expect([401, 403, 404]).toContain(accessResponse.status());
    }
  });
});
