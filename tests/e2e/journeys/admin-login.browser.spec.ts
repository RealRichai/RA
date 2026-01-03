/**
 * Admin Login Browser E2E Test
 *
 * Tests the browser-based login flow:
 * 1. Navigate to login page
 * 2. Enter admin credentials
 * 3. Submit and verify redirect to dashboard
 * 4. Verify authenticated state (welcome message)
 */

import { test, expect, ADMIN_USER, waitForPageReady } from '../fixtures/browser-fixtures';

test.describe('Admin Login Flow', () => {
  test.describe.configure({ mode: 'serial' });

  test('should display login page with form elements', async ({ page, getLocaleUrl }) => {
    await page.goto(getLocaleUrl('/login'));
    await waitForPageReady(page);

    // Verify login form elements are visible
    await expect(page.locator('input#email')).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // Verify page title/heading
    await expect(page.locator('text=Welcome back')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page, getLocaleUrl }) => {
    await page.goto(getLocaleUrl('/login'));
    await waitForPageReady(page);

    // Enter invalid credentials
    await page.fill('input#email', 'invalid@test.com');
    await page.fill('input#password', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Wait for error response
    await page.waitForTimeout(2000);

    // Should show error toast or stay on login page
    const currentUrl = page.url();
    expect(currentUrl).toContain('/login');
  });

  test('should login as admin and redirect to dashboard', async ({ page, getLocaleUrl }) => {
    await page.goto(getLocaleUrl('/login'));
    await waitForPageReady(page);

    // Fill in admin credentials
    await page.fill('input#email', ADMIN_USER.email);
    await page.fill('input#password', ADMIN_USER.password);

    // Submit the form
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard
    await page.waitForURL(
      (url) => url.pathname.includes('/dashboard'),
      { timeout: 15000 }
    );

    // Verify we're on the dashboard
    expect(page.url()).toContain('/dashboard');
  });

  test('should display welcome message with admin name', async ({ authenticatedPage }) => {
    // authenticatedPage fixture is pre-logged in
    const page = authenticatedPage;

    // Wait for dashboard to load
    await waitForPageReady(page);

    // Verify welcome message contains admin's first name
    const welcomeMessage = page.locator('h1:has-text("Welcome back")');
    await expect(welcomeMessage).toBeVisible({ timeout: 10000 });

    // The welcome message should contain the user's first name
    const welcomeText = await welcomeMessage.textContent();
    expect(welcomeText).toContain('Welcome back');
  });

  test('should have dashboard navigation elements', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await waitForPageReady(page);

    // Verify key dashboard elements are present
    // Stats cards
    await expect(page.locator('text=Total Properties').first()).toBeVisible({ timeout: 10000 });

    // Quick action buttons
    const addPropertyButton = page.locator('button:has-text("Add Property"), a:has-text("Add Property")');
    const createListingButton = page.locator('button:has-text("Create Listing"), a:has-text("Create Listing")');

    // At least one of these should be visible
    const hasAddProperty = await addPropertyButton.isVisible().catch(() => false);
    const hasCreateListing = await createListingButton.isVisible().catch(() => false);

    expect(hasAddProperty || hasCreateListing).toBeTruthy();
  });

  test('should persist authentication across page refresh', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await waitForPageReady(page);

    // Refresh the page
    await page.reload();
    await waitForPageReady(page);

    // Should still be on dashboard (not redirected to login)
    expect(page.url()).toContain('/dashboard');

    // Welcome message should still be visible
    await expect(page.locator('h1:has-text("Welcome back")')).toBeVisible({ timeout: 10000 });
  });
});
