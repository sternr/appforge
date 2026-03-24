import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './appStore.js';
import { db } from '../db/database.js';
import type { AppMetadata } from '../types/index.js';

function makeApp(overrides: Partial<AppMetadata> = {}): AppMetadata {
  return {
    id: 'test-' + Math.random().toString(36).slice(2, 6),
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

describe('AppStore', () => {
  beforeEach(async () => {
    await db.apps.clear();
    await db.appCode.clear();
    useAppStore.setState({ apps: [], loading: true });
  });

  it('should load apps from database', async () => {
    await db.apps.put(makeApp({ id: 'loaded-1', name: 'Loaded App' }));
    await useAppStore.getState().loadApps();

    const state = useAppStore.getState();
    expect(state.loading).toBe(false);
    expect(state.apps).toHaveLength(1);
    expect(state.apps[0].name).toBe('Loaded App');
  });

  it('should add an app', async () => {
    const app = makeApp({ id: 'added-1' });
    await useAppStore.getState().addApp(app);

    expect(useAppStore.getState().apps).toHaveLength(1);

    // Verify persisted in DB
    const dbApp = await db.apps.get('added-1');
    expect(dbApp).toBeDefined();
  });

  it('should update an app', async () => {
    const app = makeApp({ id: 'upd-1', name: 'Old Name' });
    await useAppStore.getState().addApp(app);
    await useAppStore.getState().updateApp({ ...app, name: 'New Name' });

    const updated = useAppStore.getState().apps.find((a) => a.id === 'upd-1');
    expect(updated?.name).toBe('New Name');
  });

  it('should remove an app', async () => {
    const app = makeApp({ id: 'del-1' });
    await useAppStore.getState().addApp(app);
    expect(useAppStore.getState().apps).toHaveLength(1);

    await useAppStore.getState().removeApp('del-1');
    expect(useAppStore.getState().apps).toHaveLength(0);

    const dbApp = await db.apps.get('del-1');
    expect(dbApp).toBeUndefined();
  });

  it('should get a specific app', async () => {
    const app = makeApp({ id: 'get-1', name: 'Get Me' });
    await useAppStore.getState().addApp(app);

    const found = await useAppStore.getState().getApp('get-1');
    expect(found?.name).toBe('Get Me');
  });
});
