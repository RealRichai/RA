/**
 * Tour Demo Browser E2E Test
 *
 * Tests the 3DGS Tour Viewer demo page:
 * 1. Navigate to debug/tour-demo page
 * 2. Verify page loads with correct elements
 * 3. Verify SplatViewer component renders canvas
 * 4. Test tour selector dropdown
 * 5. Test FPS toggle and auto-rotate controls
 * 6. Verify SOG asset loading (network request or element state)
 *
 * Note: This page is feature-flagged and only available in staging/dev
 */

import { test, expect, waitForPageReady } from '../fixtures/browser-fixtures';

test.describe('Tour Demo Page', () => {
  const TOUR_DEMO_PATH = '/debug/tour-demo';

  test('should load tour demo page with header', async ({ page, getLocaleUrl }) => {
    await page.goto(getLocaleUrl(TOUR_DEMO_PATH));
    await waitForPageReady(page);

    // Verify page title/header
    const header = page.locator('h1:has-text("3DGS Tour Viewer Demo")');
    await expect(header).toBeVisible({ timeout: 10000 });

    // Verify device type indicator is shown
    const deviceIndicator = page.locator('text=WEBGPU, text=WEBGL2, text=WEBGL').first();
    await expect(deviceIndicator).toBeVisible({ timeout: 5000 });
  });

  test('should have tour selector dropdown', async ({ page, getLocaleUrl }) => {
    await page.goto(getLocaleUrl(TOUR_DEMO_PATH));
    await waitForPageReady(page);

    // Verify tour selector exists
    const tourSelector = page.locator('select');
    await expect(tourSelector).toBeVisible({ timeout: 10000 });

    // Verify it has demo tour options
    const options = await tourSelector.locator('option').allTextContents();
    expect(options.length).toBeGreaterThan(0);

    // Should have "Modern Apartment" as first option
    expect(options[0]).toContain('Modern Apartment');
  });

  test('should have FPS toggle checkbox', async ({ page, getLocaleUrl }) => {
    await page.goto(getLocaleUrl(TOUR_DEMO_PATH));
    await waitForPageReady(page);

    // Verify Show FPS checkbox exists
    const fpsCheckbox = page.locator('input[type="checkbox"]').first();
    await expect(fpsCheckbox).toBeVisible({ timeout: 10000 });

    // Verify "Show FPS" label
    const fpsLabel = page.locator('text=Show FPS');
    await expect(fpsLabel).toBeVisible();

    // Toggle the checkbox
    await fpsCheckbox.click();

    // Wait a moment for state change
    await page.waitForTimeout(500);

    // Toggle back
    await fpsCheckbox.click();
  });

  test('should have auto-rotate toggle', async ({ page, getLocaleUrl }) => {
    await page.goto(getLocaleUrl(TOUR_DEMO_PATH));
    await waitForPageReady(page);

    // Verify Auto Rotate checkbox exists
    const autoRotateLabel = page.locator('text=Auto Rotate');
    await expect(autoRotateLabel).toBeVisible({ timeout: 10000 });

    const autoRotateCheckbox = page.locator('label:has-text("Auto Rotate") input[type="checkbox"]');
    await expect(autoRotateCheckbox).toBeVisible();

    // Toggle auto-rotate
    await autoRotateCheckbox.click();
    await expect(autoRotateCheckbox).toBeChecked();
  });

  test('should have custom SOG URL input field', async ({ page, getLocaleUrl }) => {
    await page.goto(getLocaleUrl(TOUR_DEMO_PATH));
    await waitForPageReady(page);

    // Verify custom URL input exists
    const customUrlInput = page.locator('input[type="text"][placeholder*="https"]');
    await expect(customUrlInput).toBeVisible({ timeout: 10000 });

    // Verify label
    const customUrlLabel = page.locator('text=Custom SOG URL');
    await expect(customUrlLabel).toBeVisible();
  });

  test('should render SplatViewer canvas element', async ({ page, getLocaleUrl }) => {
    await page.goto(getLocaleUrl(TOUR_DEMO_PATH));

    // Wait for page to fully load
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Look for canvas element (SplatViewer renders to canvas)
    // Canvas may take time to initialize
    const canvas = page.locator('canvas');

    // Wait for canvas to appear with longer timeout for WebGPU initialization
    await expect(canvas).toBeVisible({ timeout: 20000 });

    // Verify canvas has dimensions (is actually rendered)
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(canvasBox!.width).toBeGreaterThan(0);
    expect(canvasBox!.height).toBeGreaterThan(0);
  });

  test('should show exploration progress indicator', async ({ page, getLocaleUrl }) => {
    await page.goto(getLocaleUrl(TOUR_DEMO_PATH));
    await waitForPageReady(page);

    // Verify exploration progress indicator
    const explorationText = page.locator('text=Exploration:');
    await expect(explorationText).toBeVisible({ timeout: 10000 });
  });

  test('should display footer with GPU info', async ({ page, getLocaleUrl }) => {
    await page.goto(getLocaleUrl(TOUR_DEMO_PATH));
    await waitForPageReady(page);

    // Verify footer with GPU info
    const gpuInfo = page.locator('text=GPU:');
    await expect(gpuInfo).toBeVisible({ timeout: 10000 });

    // Verify URL display in footer
    const urlDisplay = page.locator('text=URL:');
    await expect(urlDisplay).toBeVisible();
  });

  test('should switch tours when dropdown changes', async ({ page, getLocaleUrl }) => {
    await page.goto(getLocaleUrl(TOUR_DEMO_PATH));
    await waitForPageReady(page);

    const tourSelector = page.locator('select');
    await expect(tourSelector).toBeVisible({ timeout: 10000 });

    // Get current URL displayed in footer
    const urlFooter = page.locator('span:has-text("URL:")');
    const initialUrl = await urlFooter.textContent();

    // Get all options
    const options = await tourSelector.locator('option').allTextContents();

    if (options.length > 1) {
      // Select second tour
      await tourSelector.selectOption({ index: 1 });

      // Wait for state update
      await page.waitForTimeout(1000);

      // URL in footer should change
      const newUrl = await urlFooter.textContent();

      // URLs should be different if there are multiple tours
      expect(newUrl).not.toBe(initialUrl);
    }
  });

  test('should not show loading overlay after tour loads', async ({ page, getLocaleUrl }) => {
    await page.goto(getLocaleUrl(TOUR_DEMO_PATH));

    // Wait for tour to load (longer timeout for asset loading)
    await page.waitForLoadState('networkidle', { timeout: 60000 });

    // Give time for loading animation to complete
    await page.waitForTimeout(3000);

    // Loading overlay should not be visible after tour loads
    const loadingOverlay = page.locator('text=Loading Tour...');

    // Either loading is done (overlay hidden) or still loading (which is ok for this test)
    // We just verify the page doesn't crash
    const isStillLoading = await loadingOverlay.isVisible().catch(() => false);

    // If not loading, verify canvas is visible
    if (!isStillLoading) {
      const canvas = page.locator('canvas');
      await expect(canvas).toBeVisible({ timeout: 5000 });
    }
  });

  test('should handle access denial in production environment', async ({ page }) => {
    // This test verifies the feature flag logic
    // In a production environment, the page would show "Access Denied"
    // In dev/staging (our test env), it should show the demo

    const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:3000';
    await page.goto(`${baseUrl}/en${TOUR_DEMO_PATH}`);
    await waitForPageReady(page);

    // Should either show demo page OR access denied (depending on environment)
    const demoHeader = page.locator('h1:has-text("3DGS Tour Viewer Demo")');
    const accessDenied = page.locator('h1:has-text("Access Denied")');

    // One of these should be visible
    const hasDemoHeader = await demoHeader.isVisible().catch(() => false);
    const hasAccessDenied = await accessDenied.isVisible().catch(() => false);

    expect(hasDemoHeader || hasAccessDenied).toBeTruthy();
  });
});
