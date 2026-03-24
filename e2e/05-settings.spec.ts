import { test, expect } from '@playwright/test';
import { loadApp, takeScreenshot, clearDatabase, completeOnboarding } from './helpers';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await clearDatabase(page);
    await page.reload();
    await loadApp(page);
    await completeOnboarding(page, 'sk-test-fake-key-for-testing-12345678');
  });

  test('can navigate to settings and see API key info', async ({ page }) => {
    await page.goto('/#/settings');
    await page.waitForTimeout(1000);
    await takeScreenshot(page, '05-settings-page');

    // Should show the API Key section
    await expect(page.locator('h2:has-text("API Key")')).toBeVisible();

    // Should show masked key
    await expect(page.locator('text=sk-test')).toBeVisible();
  });

  test('has change API key button', async ({ page }) => {
    await page.goto('/#/settings');
    await page.waitForTimeout(1000);

    const changeBtn = page.locator('button:has-text("Change API Key")');
    await expect(changeBtn).toBeVisible();
    await takeScreenshot(page, '05-settings-change-btn');
  });

  test('shows statistics section', async ({ page }) => {
    await page.goto('/#/settings');
    await page.waitForTimeout(1000);

    await expect(page.locator('h2:has-text("Statistics")')).toBeVisible();
    await expect(page.locator('text=Total Apps')).toBeVisible();
    await takeScreenshot(page, '05-settings-stats');
  });

  test('has clear all data button', async ({ page }) => {
    await page.goto('/#/settings');
    await page.waitForTimeout(1000);

    const clearBtn = page.locator('button:has-text("Clear All Data")');
    await expect(clearBtn).toBeVisible();
  });
});
