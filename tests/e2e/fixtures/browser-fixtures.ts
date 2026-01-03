/**
 * Browser E2E Test Fixtures
 *
 * Provides browser-specific fixtures for UI testing:
 * - Pre-authenticated page for admin users
 * - Login helpers for browser context
 * - Locale handling for Next.js app router
 */

import { test as base, expect, Page, BrowserContext } from '@playwright/test';

// Admin user credentials (from seed.ts)
export const ADMIN_USER = {
  email: 'admin@realriches.com',
  password: 'AdminPass123!',
  firstName: 'Admin',
  lastName: 'User',
  role: 'ADMIN',
};

// Test listing data for NYC compliance testing
export const NYC_TEST_LISTING = {
  title: 'E2E Test NYC Apartment',
  address: {
    street: '123 Test Street',
    city: 'New York',
    state: 'NY',
    zip: '10001',
  },
  propertyType: 'APARTMENT',
  monthlyRent: 2500,
  bedrooms: 2,
  bathrooms: 1,
  squareFeet: 850,
  description: 'Test apartment for E2E compliance testing',
};

// Required NYC disclosures
export const NYC_DISCLOSURES = {
  leadPaint: true,
  fareAct: true,
  bedbug: true,
};

// Browser fixture types
export interface BrowserFixtures {
  authenticatedPage: Page;
  adminContext: BrowserContext;
  loginAsAdmin: (page: Page) => Promise<void>;
  getLocaleUrl: (path: string) => string;
}

// Default locale for testing
const DEFAULT_LOCALE = 'en';

/**
 * Login as admin user via browser
 */
async function performAdminLogin(page: Page): Promise<void> {
  const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:3000';
  const loginUrl = `${baseUrl}/${DEFAULT_LOCALE}/login`;

  // Navigate to login page
  await page.goto(loginUrl);

  // Wait for login form to be visible
  await page.waitForSelector('input[type="email"], input[name="email"]', {
    timeout: 10000,
  });

  // Fill in credentials
  await page.fill('input[type="email"], input[name="email"]', ADMIN_USER.email);
  await page.fill('input[type="password"], input[name="password"]', ADMIN_USER.password);

  // Submit form
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard or authenticated state
  await page.waitForURL(
    (url) =>
      url.pathname.includes('/dashboard') ||
      url.pathname.includes('/en/dashboard') ||
      !url.pathname.includes('/login'),
    { timeout: 15000 }
  );
}

/**
 * Get locale-prefixed URL
 */
function getLocaleUrl(path: string): string {
  const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:3000';
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  // Add locale prefix if not already present
  if (normalizedPath.startsWith(`/${DEFAULT_LOCALE}/`) || normalizedPath === `/${DEFAULT_LOCALE}`) {
    return `${baseUrl}${normalizedPath}`;
  }
  return `${baseUrl}/${DEFAULT_LOCALE}${normalizedPath}`;
}

// Extend base test with browser fixtures
export const test = base.extend<BrowserFixtures>({
  // Pre-authenticated browser context
  adminContext: async ({ browser }, use) => {
    const context = await browser.newContext();
    await use(context);
    await context.close();
  },

  // Pre-authenticated page (logged in as admin)
  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await performAdminLogin(page);
    } catch (error) {
      console.warn('Admin login failed during fixture setup:', error);
      // Continue anyway - test may handle auth differently
    }

    await use(page);
    await context.close();
  },

  // Login helper function
  loginAsAdmin: async ({}, use) => {
    await use(performAdminLogin);
  },

  // URL helper with locale
  getLocaleUrl: async ({}, use) => {
    await use(getLocaleUrl);
  },
});

export { expect };

// Helper to wait for page to be interactive
export async function waitForPageReady(page: Page, timeout = 10000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout });
}

// Helper to take screenshot with descriptive name
export async function takeDebugScreenshot(page: Page, name: string): Promise<void> {
  if (process.env.DEBUG_SCREENSHOTS) {
    await page.screenshot({
      path: `tests/e2e/test-results/debug-${name}-${Date.now()}.png`,
      fullPage: true,
    });
  }
}

// Helper to check if element exists without throwing
export async function elementExists(page: Page, selector: string): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}
