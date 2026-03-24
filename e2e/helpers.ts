import { type Page, expect } from '@playwright/test';

/** Navigate to the app and wait for it to load */
export async function loadApp(page: Page) {
  // Wait for the app to initialize (loading spinner to disappear)
  await page.waitForFunction(() => {
    const spinners = document.querySelectorAll('.animate-spin');
    return spinners.length === 0;
  }, { timeout: 10000 });
}

/** Mock the Anthropic API validation endpoint */
export async function mockAnthropicValidation(page: Page) {
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
}

/** Complete onboarding by entering the API key (mocks API) */
export async function completeOnboarding(page: Page, apiKey: string) {
  await mockAnthropicValidation(page);

  // Should be on the onboarding page
  await expect(page.locator('h1:has-text("AppForge")')).toBeVisible({ timeout: 5000 });

  // Find the API key input and enter the key
  const input = page.locator('input[type="password"]');
  await input.fill(apiKey);

  // Click Get Started
  const btn = page.getByRole('button', { name: 'Get Started' });
  await btn.click();

  // Wait for navigation to home page
  await page.waitForURL(/#\/$/, { timeout: 10000 });
}

/** Navigate to new app page */
export async function goToNewApp(page: Page) {
  const newBtn = page.locator('a[href="#/new"], button:has-text("New"), button:has-text("Create"), a:has-text("New App")');
  await newBtn.first().click();
  await page.waitForURL(/#\/new/, { timeout: 5000 });
}

/** Take a named screenshot and save it */
export async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/screenshots/${name}.png`,
    fullPage: true,
  });
}

/** Clear IndexedDB to start fresh */
export async function clearDatabase(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    indexedDB.deleteDatabase('appforge');
  });
  await page.waitForTimeout(500);
}

/** Set API key directly via IndexedDB */
export async function setApiKeyDirectly(page: Page, apiKey: string) {
  await page.evaluate(async (key) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('appforge', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('apps')) {
          db.createObjectStore('apps', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('appCode')) {
          db.createObjectStore('appCode', { keyPath: 'appId' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('settings', 'readwrite');
        tx.objectStore('settings').put({ key: 'anthropic-api-key', value: key });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, apiKey);
}
