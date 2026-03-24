import { create } from 'zustand';
import { getApiKey, setApiKey as dbSetApiKey, hasApiKey } from '../db/database.js';

interface SettingsState {
  apiKey: string | null;
  isOnboarded: boolean;
  loading: boolean;
  init: () => Promise<void>;
  setApiKey: (key: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  apiKey: null,
  isOnboarded: false,
  loading: true,

  init: async () => {
    const has = await hasApiKey();
    if (has) {
      const key = await getApiKey();
      set({ apiKey: key ?? null, isOnboarded: true, loading: false });
    } else {
      set({ loading: false });
    }
  },

  setApiKey: async (key: string) => {
    await dbSetApiKey(key);
    set({ apiKey: key, isOnboarded: true });
  },

  clearApiKey: async () => {
    await dbSetApiKey('');
    set({ apiKey: null, isOnboarded: false });
  },
}));
