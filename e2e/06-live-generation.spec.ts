import { test, expect } from '@playwright/test';
import { loadApp, takeScreenshot, clearDatabase } from './helpers';

const API_KEY = process.env.OPENAI_API_KEY || '';

/**
 * Live generation tests that hit the REAL OpenAI API.
 * These only run when OPENAI_API_KEY is set AND internet is available.
 * Run with: OPENAI_API_KEY=sk-... npm run test:e2e
 *
 * These test the actual end-to-end experience including LLM response quality,
 * runtime testing, visual review, and iteration.
 */
test.describe('Live App Generation (real OpenAI API)', () => {
  test.skip(!API_KEY, 'Skipping: OPENAI_API_KEY not set');

  test.beforeEach(async ({ page }) => {
    await clearDatabase(page);
    await page.reload();
    await loadApp(page);

    // Complete onboarding with real API key
    const input = page.locator('input[type="password"]');
    await input.fill(API_KEY);
    const btn = page.getByRole('button', { name: 'Get Started' });
    await btn.click();
    await page.waitForURL(/#\/$/, { timeout: 30000 });
  });

  test('live: generate a counter app end-to-end', async ({ page }) => {
    test.setTimeout(300_000); // 5 minutes

    const createBtn = page.locator('a[href="#/new"], a[href*="/new"], button:has-text("New"), button:has-text("Create"), [aria-label*="new"], [aria-label*="create"]');
    await createBtn.first().click();
    await page.waitForURL(/#\/new/, { timeout: 5000 });
    await takeScreenshot(page, '06-live-new-app');

    const textarea = page.locator('textarea');
    await textarea.fill('A simple counter app: shows a number starting at 0, with + and - buttons to increment and decrement. Large centered number, colorful design.');

    const genBtn = page.locator('button:has-text("Generate")');
    await genBtn.click();

    await page.waitForURL(/#\/(clarify|generate)\//, { timeout: 60000 });
    await takeScreenshot(page, '06-live-after-generate');

    // Handle clarification
    if (page.url().includes('#/clarify/')) {
      await page.waitForTimeout(2000);
      await takeScreenshot(page, '06-live-clarify');
      const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Generate"), button:has-text("Skip"), button:has-text("Build")');
      await continueBtn.first().click({ timeout: 10000 });
      await page.waitForURL(/#\/generate\//, { timeout: 30000 });
    }

    await takeScreenshot(page, '06-live-generating');

    // Wait for generation to complete
    let done = false;
    const startTime = Date.now();
    while (!done && Date.now() - startTime < 240_000) {
      const bodyText = await page.evaluate(() => document.body.textContent || '');
      if (bodyText.includes('Your app is ready') || bodyText.includes('ready to use')) {
        done = true;
      } else {
        await page.waitForTimeout(5000);
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        await takeScreenshot(page, `06-live-progress-${elapsed}s`);
      }
    }

    expect(done).toBe(true);
    await takeScreenshot(page, '06-live-done');

    // Verify iframe
    const iframe = page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: 5000 });
    const iframeSrc = await iframe.getAttribute('src');
    expect(iframeSrc).toBeTruthy();

    // Verify rendered content
    const iframeHandle = await iframe.elementHandle();
    if (iframeHandle) {
      const frame = await iframeHandle.contentFrame();
      if (frame) {
        await frame.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        const bodyText = await frame.evaluate(() => document.body?.textContent || '').catch(() => '');
        expect(bodyText.length).toBeGreaterThan(0);
      }
    }

    await takeScreenshot(page, '06-live-final');
  });
});
