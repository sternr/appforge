import { test, expect } from '@playwright/test';
import { loadApp, takeScreenshot, clearDatabase } from './helpers';
import { mockAnthropicApi, resetMockState } from './mock-anthropic';

/**
 * Full generation pipeline tests using mocked Anthropic API.
 * These run on every test invocation and catch UI/routing/pipeline regressions
 * without needing an API key or internet access.
 */
test.describe('Full App Generation Pipeline (mocked)', () => {

  test.beforeEach(async ({ page }) => {
    resetMockState('counter');
    await clearDatabase(page);
    await mockAnthropicApi(page);
    await page.reload();
    await loadApp(page);

    // Complete onboarding (API validation is mocked)
    const input = page.locator('input[type="password"]');
    await input.fill('sk-ant-test-mocked-key-12345678901234');
    const btn = page.getByRole('button', { name: 'Get Started' });
    await btn.click();
    await page.waitForURL(/#\/$/, { timeout: 15000 });
  });

  test('complete flow: create app → clarify → generate → preview works', async ({ page }) => {
    test.setTimeout(120_000);

    // ── Step 1: Navigate to new app page ──
    const createBtn = page.locator('a[href="#/new"], a[href*="/new"], button:has-text("New"), button:has-text("Create"), [aria-label*="new"], [aria-label*="create"]');
    await createBtn.first().click();
    await page.waitForURL(/#\/new/, { timeout: 5000 });
    await takeScreenshot(page, '04-step1-new-app-page');

    // ── Step 2: Enter a prompt ──
    const textarea = page.locator('textarea');
    await textarea.fill('A simple counter app: shows a number starting at 0, with + and - buttons to increment and decrement. Large centered number, colorful design.');
    await takeScreenshot(page, '04-step2-prompt-entered');

    // ── Step 3: Click generate ──
    const genBtn = page.locator('button:has-text("Generate")');
    await expect(genBtn).toBeEnabled();
    await genBtn.click();

    // ── Step 4: Wait for navigation (clarify or generate page) ──
    await page.waitForURL(/#\/(clarify|generate)\//, { timeout: 30000 });
    await takeScreenshot(page, '04-step3-navigated');

    // ── Step 5: If on clarify page, answer and continue ──
    if (page.url().includes('#/clarify/')) {
      await takeScreenshot(page, '04-step4-clarify-page');
      await page.waitForTimeout(2000);

      const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Generate"), button:has-text("Skip"), button:has-text("Build")');
      await continueBtn.first().click({ timeout: 10000 });
      await page.waitForURL(/#\/generate\//, { timeout: 30000 });
    }

    await takeScreenshot(page, '04-step5-generation-started');

    // ── Step 6: Wait for generation to complete ──
    let done = false;
    const startTime = Date.now();
    while (!done && Date.now() - startTime < 90_000) {
      const bodyText = await page.evaluate(() => document.body.textContent || '');
      if (bodyText.includes('Your app is ready') || bodyText.includes('ready to use')) {
        done = true;
      } else {
        await page.waitForTimeout(3000);
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        await takeScreenshot(page, `04-step6-progress-${elapsed}s`);
      }
    }

    expect(done).toBe(true);
    await takeScreenshot(page, '04-step6-generation-done');

    // ── Step 7: Verify the preview iframe exists and has content ──
    const iframe = page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: 5000 });
    await takeScreenshot(page, '04-step7-preview-visible');

    const iframeSrc = await iframe.getAttribute('src');
    expect(iframeSrc).toBeTruthy();

    // ── Step 8: Verify the generated app renders content ──
    const iframeHandle = await iframe.elementHandle();
    if (iframeHandle) {
      const frame = await iframeHandle.contentFrame();
      if (frame) {
        await frame.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        const bodyText = await frame.evaluate(() => document.body?.textContent || '').catch(() => '');
        expect(bodyText.length).toBeGreaterThan(0);
        expect(bodyText).toContain('Counter');
        expect(bodyText).toContain('0');
      }
    }

    await takeScreenshot(page, '04-step8-final');
  });

  test('generation handles simple prompt', async ({ page }) => {
    test.setTimeout(120_000);
    resetMockState('hello');

    const createBtn = page.locator('a[href="#/new"], a[href*="/new"], button:has-text("New"), button:has-text("Create"), [aria-label*="new"], [aria-label*="create"]');
    await createBtn.first().click();
    await page.waitForURL(/#\/new/, { timeout: 5000 });

    const textarea = page.locator('textarea');
    await textarea.fill('Hello World app - display "Hello World" in big colorful centered text');

    const genBtn = page.locator('button:has-text("Generate")');
    await genBtn.click();

    await page.waitForURL(/#\/(clarify|generate)\//, { timeout: 30000 });
    if (page.url().includes('#/clarify/')) {
      const skipBtn = page.locator('button:has-text("Continue"), button:has-text("Skip"), button:has-text("Generate"), button:has-text("Build")');
      await skipBtn.first().click();
      await page.waitForURL(/#\/generate\//, { timeout: 30000 });
    }

    let done = false;
    const startTime = Date.now();
    while (!done && Date.now() - startTime < 90_000) {
      const bodyText = await page.evaluate(() => document.body.textContent || '');
      if (bodyText.includes('Your app is ready') || bodyText.includes('ready to use')) {
        done = true;
      } else {
        await page.waitForTimeout(3000);
      }
    }

    expect(done).toBe(true);
    await takeScreenshot(page, '04-simple-generation-done');

    const iframe = page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: 5000 });

    const iframeHandle = await iframe.elementHandle();
    if (iframeHandle) {
      const frame = await iframeHandle.contentFrame();
      if (frame) {
        await frame.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        const bodyText = await frame.evaluate(() => document.body?.textContent || '').catch(() => '');
        expect(bodyText).toContain('Hello World');
      }
    }

    await takeScreenshot(page, '04-simple-final');
  });
});
