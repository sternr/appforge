import { test, expect } from '@playwright/test';
import { loadApp, takeScreenshot, clearDatabase } from './helpers';

test.describe('Onboarding Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearDatabase(page);
    await page.reload();
    await loadApp(page);
  });

  test('shows onboarding page when no API key is set', async ({ page }) => {
    await takeScreenshot(page, '01-onboarding-initial');

    // Should redirect to onboarding
    await expect(page).toHaveURL(/#\/onboarding/);

    // Should show AppForge heading
    await expect(page.locator('h1:has-text("AppForge")')).toBeVisible();

    // Should have an input for API key (type=password)
    const input = page.locator('input[type="password"]');
    await expect(input).toBeVisible();

    await takeScreenshot(page, '01-onboarding-page');
  });

  test('Get Started button is disabled without API key', async ({ page }) => {
    await expect(page).toHaveURL(/#\/onboarding/);

    const btn = page.getByRole('button', { name: 'Get Started' });
    await expect(btn).toBeDisabled();
  });

  test('can enter API key and complete onboarding', async ({ page }) => {
    await expect(page).toHaveURL(/#\/onboarding/);

    // Mock the Anthropic API validation call
    await page.route('**/api.anthropic.com/v1/messages', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'msg_mock',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi' }],
          model: 'claude-haiku-4-5-20251001',
          stop_reason: 'end_turn',
        }),
      });
    });

    // Enter a fake API key
    const input = page.locator('input[type="password"]');
    await input.fill('sk-ant-test-fake-key-for-testing-12345678');

    await takeScreenshot(page, '01-onboarding-key-entered');

    // Get Started button should now be enabled
    const btn = page.getByRole('button', { name: 'Get Started' });
    await expect(btn).toBeEnabled();

    // Click it
    await btn.click();

    // Should navigate to home page
    await page.waitForURL(/#\/$/, { timeout: 10000 });
    await takeScreenshot(page, '01-onboarding-complete-home');
  });
});
