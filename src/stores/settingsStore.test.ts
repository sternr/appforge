import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from './settingsStore.js';
import { db } from '../db/database.js';

describe('SettingsStore', () => {
  beforeEach(async () => {
    await db.settings.clear();
    // Reset store to initial state
    useSettingsStore.setState({
      apiKey: null,
      isOnboarded: false,
      loading: true,
    });
  });

  it('should start with loading true and not onboarded', () => {
    const state = useSettingsStore.getState();
    expect(state.loading).toBe(true);
    expect(state.isOnboarded).toBe(false);
    expect(state.apiKey).toBeNull();
  });

  it('should init and detect no API key', async () => {
    await useSettingsStore.getState().init();
    const state = useSettingsStore.getState();
    expect(state.loading).toBe(false);
    expect(state.isOnboarded).toBe(false);
  });

  it('should set API key and become onboarded', async () => {
    await useSettingsStore.getState().setApiKey('sk-test-abc');
    const state = useSettingsStore.getState();
    expect(state.apiKey).toBe('sk-test-abc');
    expect(state.isOnboarded).toBe(true);
  });

  it('should init and detect existing API key', async () => {
    await useSettingsStore.getState().setApiKey('sk-existing');
    // Reset store state but keep DB
    useSettingsStore.setState({ apiKey: null, isOnboarded: false, loading: true });

    await useSettingsStore.getState().init();
    const state = useSettingsStore.getState();
    expect(state.loading).toBe(false);
    expect(state.isOnboarded).toBe(true);
    expect(state.apiKey).toBe('sk-existing');
  });

  it('should clear API key', async () => {
    await useSettingsStore.getState().setApiKey('sk-to-clear');
    await useSettingsStore.getState().clearApiKey();
    const state = useSettingsStore.getState();
    expect(state.apiKey).toBeNull();
    expect(state.isOnboarded).toBe(false);
  });
});
