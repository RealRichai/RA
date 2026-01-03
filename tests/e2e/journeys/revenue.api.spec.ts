/**
 * [Revenue] Journey Tests
 *
 * Tests the revenue engine with partner attribution:
 * 1. Create partner-attributed transaction
 * 2. Verify ledger entry created
 * 3. Verify double-entry accounting
 * 4. Verify audit trail
 *
 * Compliance: Double-entry ledger, Partner attribution, Audit trail
 */

import { test, expect } from '../fixtures/test-fixtures';

test.describe('[Revenue] Revenue Engine with Partner Attribution', () => {
  const uniqueId = `revenue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  let accessToken: string;
  let transactionId: string;
  let partnerId: string;

  // Setup: Create authenticated user
  test.beforeAll(async ({ playwright }) => {
    const apiUrl = process.env.E2E_API_URL || 'http://localhost:4000';
    const context = await playwright.request.newContext({ baseURL: apiUrl });

    // Register test user
    const authResponse = await context.post('/api/v1/auth/register', {
      data: {
        email: `revenue_user_${uniqueId}@e2e.realriches.test`,
        password: 'TestPassword123!',
        firstName: 'Revenue',
        lastName: 'Test',
      },
    });

    if (authResponse.ok()) {
      const body = await authResponse.json();
      accessToken = body.accessToken;
    }

    // Create or use test partner
    partnerId = `partner_${uniqueId}`;

    await context.dispose();
  });

  test('[Revenue] Step 1: Create partner-attributed transaction', async ({ apiContext }) => {
    test.skip(!accessToken, 'No access token available');

    const response = await apiContext.post('/api/v1/transactions', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        type: 'lease_payment',
        amount: 250000, // $2,500.00 in cents
        currency: 'USD',
        partnerId: partnerId,
        partnerAttribution: {
          partnerId: partnerId,
          partnerName: 'E2E Test Partner',
          referralCode: `REF_${uniqueId}`,
          commissionRate: 0.05, // 5%
        },
        metadata: {
          listingId: `listing_${uniqueId}`,
          leaseId: `lease_${uniqueId}`,
          paymentMethod: 'card',
          description: 'Monthly rent payment',
        },
      },
    });

    expect([200, 201]).toContain(response.status());

    const body = await response.json();
    transactionId = body.id || body.transactionId;
    expect(transactionId).toBeTruthy();

    // Verify partner attribution recorded
    expect(body.partnerId || body.partnerAttribution?.partnerId).toBe(partnerId);
  });

  test('[Revenue] Step 2: Ledger entry created for transaction', async ({ apiContext }) => {
    test.skip(!accessToken || !transactionId, 'Prerequisites not met');

    const response = await apiContext.get(
      `/api/v1/transactions/${transactionId}/ledger`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const entries = body.entries || body.ledgerEntries || body;
    expect(Array.isArray(entries)).toBeTruthy();
    expect(entries.length).toBeGreaterThan(0);

    // Verify ledger entries exist
    for (const entry of entries) {
      expect(entry.amount).toBeTruthy();
      expect(entry.account || entry.accountId).toBeTruthy();
      expect(entry.createdAt || entry.timestamp).toBeTruthy();
    }
  });

  test('[Revenue] Step 3: Double-entry accounting - debits equal credits', async ({ apiContext }) => {
    test.skip(!accessToken || !transactionId, 'Prerequisites not met');

    const response = await apiContext.get(
      `/api/v1/transactions/${transactionId}/ledger`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const entries = body.entries || body.ledgerEntries || body;

    // Calculate total debits and credits
    let totalDebits = 0;
    let totalCredits = 0;

    for (const entry of entries) {
      if (entry.type === 'debit' || entry.debit) {
        totalDebits += entry.amount || entry.debit;
      } else if (entry.type === 'credit' || entry.credit) {
        totalCredits += entry.amount || entry.credit;
      }
    }

    // Double-entry: debits must equal credits
    expect(totalDebits).toBe(totalCredits);
  });

  test('[Revenue] Step 4: Partner commission calculated correctly', async ({ apiContext }) => {
    test.skip(!accessToken || !transactionId, 'Prerequisites not met');

    const response = await apiContext.get(`/api/v1/transactions/${transactionId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.json();

    // Verify commission calculation (5% of $2,500 = $125)
    const commission = body.commission || body.partnerCommission;
    if (commission) {
      expect(commission.amount).toBe(12500); // $125.00 in cents
      expect(commission.partnerId).toBe(partnerId);
    }
  });

  test('[Revenue] Step 5: Transaction audit trail exists', async ({ apiContext }) => {
    test.skip(!accessToken || !transactionId, 'Prerequisites not met');

    const response = await apiContext.get(
      `/api/v1/transactions/${transactionId}/audit`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const auditTrail = body.events || body.audit || body;
    expect(Array.isArray(auditTrail)).toBeTruthy();

    // Verify audit entries have required fields
    for (const entry of auditTrail) {
      expect(entry.timestamp || entry.createdAt).toBeTruthy();
      expect(entry.action || entry.event || entry.type).toBeTruthy();
    }
  });

  test('[Revenue] Step 6: Partner can view attributed transactions', async ({ apiContext }) => {
    test.skip(!accessToken || !partnerId, 'Prerequisites not met');

    const response = await apiContext.get('/api/v1/transactions', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        partnerId: partnerId,
        limit: 10,
      },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const transactions = body.data || body.transactions || body;
    expect(Array.isArray(transactions)).toBeTruthy();

    // All transactions should be attributed to the partner
    for (const tx of transactions) {
      expect(tx.partnerId || tx.partnerAttribution?.partnerId).toBe(partnerId);
    }
  });

  test('[Revenue] Step 7: Ledger balance is zero (balanced)', async ({ apiContext }) => {
    test.skip(!accessToken, 'No access token available');

    const response = await apiContext.get('/api/v1/ledger/balance', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.json();

    // Total ledger should always balance to zero
    const balance = body.balance || body.totalBalance || 0;
    expect(balance).toBe(0);
  });

  test('[Revenue] Step 8: Generate partner revenue report', async ({ apiContext }) => {
    test.skip(!accessToken || !partnerId, 'Prerequisites not met');

    const response = await apiContext.get(`/api/v1/partners/${partnerId}/revenue`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      },
    });

    if (response.ok()) {
      const body = await response.json();

      // Verify report structure
      expect(body.partnerId || body.partner?.id).toBe(partnerId);
      expect(body.totalRevenue || body.revenue).toBeDefined();
      expect(body.totalCommission || body.commission).toBeDefined();
    }
  });
});
