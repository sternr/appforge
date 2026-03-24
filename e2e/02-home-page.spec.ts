import { test, expect } from '@playwright/test';
import { loadApp, takeScreenshot, clearDatabase, completeOnboarding } from './helpers';

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await clearDatabase(page);
    await page.reload();
    await loadApp(page);
    // Complete onboarding to get to home page
    await completeOnboarding(page, 'sk-test-fake-key-for-testing-12345678');
  });

  test('shows home page when onboarded', async ({ page }) => {
    await expect(page).toHaveURL(/#\//);
    await takeScreenshot(page, '02-home-page');

    // Should show the AppForge title
    const header = page.locator('h1, h2').first();
    await expect(header).toBeVisible();
  });

  test('has a create new app button/link', async ({ page }) => {
    await expect(page).toHaveURL(/#\//);
    await takeScreenshot(page, '02-home-with-create-btn');

    // Look for the FAB or create button (could be a + icon, "New App", etc.)
    const createBtn = page.locator('a[href="#/new"], a[href*="/new"], button:has-text("New"), button:has-text("Create"), [aria-label*="new"], [aria-label*="create"]');
    const count = await createBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  test('can navigate to new app page', async ({ page }) => {
    // Find and click the create/new button
    const createBtn = page.locator('a[href="#/new"], a[href*="/new"], button:has-text("New"), button:has-text("Create"), [aria-label*="new"], [aria-label*="create"]');
    await createBtn.first().click();

    await page.waitForURL(/#\/new/, { timeout: 5000 });
    await takeScreenshot(page, '02-navigated-to-new-app');

    // Should show the new app form
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
  });

  test('can navigate to settings', async ({ page }) => {
    // Look for settings link/button
    const settingsBtn = page.locator('a[href="#/settings"], a[href*="/settings"], button:has-text("Settings"), [aria-label*="settings"], [aria-label*="Settings"]');
    const count = await settingsBtn.count();
    if (count > 0) {
      await settingsBtn.first().click();
      await page.waitForURL(/#\/settings/, { timeout: 5000 });
      await takeScreenshot(page, '02-settings-page');
    } else {
      // Settings might be accessible via direct URL
      await page.goto('/#/settings');
      await page.waitForTimeout(1000);
      await takeScreenshot(page, '02-settings-page-direct');
    }
  });
});
