import { describe, it, expect, beforeEach } from 'vitest';
import { db, setApiKey, getApiKey, hasApiKey, saveApp, getApp, getAllApps, deleteApp, saveAppCode, getAppCode } from './database.js';
import type { AppMetadata, AppCode } from '../types/index.js';

function makeApp(overrides: Partial<AppMetadata> = {}): AppMetadata {
  return {
    id: 'test-app-1',
    name: 'Test App',
    icon: '📱',
    prompt: 'A test app',
    clarifications: [],
    status: 'ready',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    installedOnHomescreen: false,
    ...overrides,
  };
}

describe('Database', () => {
  beforeEach(async () => {
    await db.apps.clear();
    await db.appCode.clear();
    await db.settings.clear();
  });

  describe('API Key', () => {
    it('should store and retrieve an API key', async () => {
      await setApiKey('sk-test-key-12345');
      const key = await getApiKey();
      expect(key).toBe('sk-test-key-12345');
    });

    it('should report hasApiKey correctly', async () => {
      expect(await hasApiKey()).toBe(false);
      await setApiKey('sk-test-key-12345');
      expect(await hasApiKey()).toBe(true);
    });

    it('should return undefined when no key is set', async () => {
      const key = await getApiKey();
      expect(key).toBeUndefined();
    });
  });

  describe('App CRUD', () => {
    it('should save and retrieve an app', async () => {
      const app = makeApp();
      await saveApp(app);
      const retrieved = await getApp('test-app-1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('Test App');
    });

    it('should list all apps sorted by updatedAt descending', async () => {
      await saveApp(makeApp({ id: 'a', updatedAt: 100 }));
      await saveApp(makeApp({ id: 'b', updatedAt: 300 }));
      await saveApp(makeApp({ id: 'c', updatedAt: 200 }));

      const all = await getAllApps();
      expect(all.map((a) => a.id)).toEqual(['b', 'c', 'a']);
    });

    it('should delete an app and its code', async () => {
      await saveApp(makeApp({ id: 'del-me' }));
      await saveAppCode({ appId: 'del-me', html: '<p>hi</p>', version: 1, sizeBytes: 10 });

      await deleteApp('del-me');

      expect(await getApp('del-me')).toBeUndefined();
      expect(await getAppCode('del-me')).toBeUndefined();
    });

    it('should update an existing app', async () => {
      await saveApp(makeApp({ id: 'upd', name: 'Old Name' }));
      await saveApp(makeApp({ id: 'upd', name: 'New Name' }));

      const app = await getApp('upd');
      expect(app!.name).toBe('New Name');
    });
  });

  describe('App Code', () => {
    it('should save and retrieve app code', async () => {
      const code: AppCode = { appId: 'test-1', html: '<h1>Hello</h1>', version: 1, sizeBytes: 15 };
      await saveAppCode(code);

      const retrieved = await getAppCode('test-1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.html).toBe('<h1>Hello</h1>');
    });

    it('should overwrite code on re-save', async () => {
      await saveAppCode({ appId: 'test-1', html: '<p>old</p>', version: 1, sizeBytes: 10 });
      await saveAppCode({ appId: 'test-1', html: '<p>new</p>', version: 2, sizeBytes: 10 });

      const code = await getAppCode('test-1');
      expect(code!.html).toBe('<p>new</p>');
      expect(code!.version).toBe(2);
    });
  });
});
