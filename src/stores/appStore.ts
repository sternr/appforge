import { create } from 'zustand';
import {
  getAllApps,
  saveApp as dbSaveApp,
  deleteApp as dbDeleteApp,
  getApp as dbGetApp,
} from '../db/database.js';
import type { AppMetadata } from '../types/index.js';

interface AppState {
  apps: AppMetadata[];
  loading: boolean;
  loadApps: () => Promise<void>;
  addApp: (app: AppMetadata) => Promise<void>;
  updateApp: (app: AppMetadata) => Promise<void>;
  removeApp: (id: string) => Promise<void>;
  getApp: (id: string) => Promise<AppMetadata | undefined>;
}

export const useAppStore = create<AppState>((set, get) => ({
  apps: [],
  loading: true,

  loadApps: async () => {
    const apps = await getAllApps();
    set({ apps, loading: false });
  },

  addApp: async (app: AppMetadata) => {
    await dbSaveApp(app);
    set({ apps: [app, ...get().apps] });
  },

  updateApp: async (app: AppMetadata) => {
    await dbSaveApp(app);
    set({
      apps: get().apps.map((a) => (a.id === app.id ? app : a)),
    });
  },

  removeApp: async (id: string) => {
    await dbDeleteApp(id);
    set({ apps: get().apps.filter((a) => a.id !== id) });
  },

  getApp: async (id: string) => {
    return dbGetApp(id);
  },
}));
