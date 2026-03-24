import { test, expect } from '@playwright/test';
import { loadApp, takeScreenshot, clearDatabase, completeOnboarding, mockAnthropicValidation } from './helpers';

test.describe('New App Page', () => {
  test.beforeEach(async ({ page }) => {
    await clearDatabase(page);
    await page.reload();
    await loadApp(page);
    await completeOnboarding(page, 'sk-ant-test-fake-key-for-testing-12345678');

    // Navigate to new app page
    const createBtn = page.locator('a[href="#/new"], a[href*="/new"], button:has-text("New"), button:has-text("Create"), [aria-label*="new"], [aria-label*="create"]');
    await createBtn.first().click();
    await page.waitForURL(/#\/new/, { timeout: 5000 });
  });

  test('shows the new app form with textarea', async ({ page }) => {
    await takeScreenshot(page, '03-new-app-form');

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
  });

  test('shows example prompts', async ({ page }) => {
    // Should show example buttons with app ideas
    const exampleArea = page.locator('text=Try an example');
    await expect(exampleArea).toBeVisible();

    await takeScreenshot(page, '03-new-app-examples');
  });

  test('can click an example to fill the textarea', async ({ page }) => {
    // Find an example button by its exact text
    const exampleBtn = page.getByRole('button', { name: 'A workout tracker with exercises and sets' });
    await expect(exampleBtn).toBeVisible();

    await exampleBtn.click();

    const textarea = page.locator('textarea');
    const value = await textarea.inputValue();
    expect(value.length).toBeGreaterThan(10);

    await takeScreenshot(page, '03-new-app-example-filled');
  });

  test('generate button is disabled with short text', async ({ page }) => {
    const textarea = page.locator('textarea');
    await textarea.fill('Hi');

    // The generate button should be disabled (< 10 chars)
    const genBtn = page.locator('button:has-text("Generate")');
    await expect(genBtn).toBeDisabled();

    // Should show the "at least 10 characters" hint
    await expect(page.locator('text=at least 10 characters')).toBeVisible();

    await takeScreenshot(page, '03-new-app-short-text');
  });

  test('generate button is enabled with valid text', async ({ page }) => {
    const textarea = page.locator('textarea');
    await textarea.fill('A simple calculator app with basic math operations');

    const genBtn = page.locator('button:has-text("Generate")');
    await expect(genBtn).toBeEnabled();

    await takeScreenshot(page, '03-new-app-valid-text');
  });

  test('clicking generate with valid text triggers loading or navigation', async ({ page }) => {
    // Mock the Anthropic clarification API call
    await page.route('**/api.anthropic.com/v1/messages', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'msg_mock',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: JSON.stringify({ questions: [] }) }],
          model: 'claude-haiku-4-5-20251001',
          stop_reason: 'end_turn',
        }),
      });
    });

    const textarea = page.locator('textarea');
    await textarea.fill('A simple calculator app with basic math operations');

    const genBtn = page.locator('button:has-text("Generate")');
    await expect(genBtn).toBeEnabled();
    await genBtn.click();

    // Wait for something to happen
    await page.waitForTimeout(3000);
    await takeScreenshot(page, '03-new-app-after-generate-click');

    const currentUrl = page.url();
    // Either navigated to clarify or generate page, or button shows loading
    const navigated = currentUrl.includes('#/clarify/') || currentUrl.includes('#/generate/');
    const isLoading = await page.locator('button:has-text("Analyzing")').count() > 0;

    expect(navigated || isLoading).toBe(true);
  });

  test('back button navigates back', async ({ page }) => {
    // Click the back arrow button (in the header)
    const backBtn = page.locator('button').filter({ has: page.locator('svg') }).first();
    await backBtn.click();
    await page.waitForTimeout(500);
    // Should have navigated back to home
    expect(page.url()).not.toContain('#/new');
    await takeScreenshot(page, '03-back-to-home');
  });
});
