import Dexie, { type Table } from 'dexie';
import type { AppMetadata, AppCode, SettingsEntry } from '../types/index.js';

class AppForgeDB extends Dexie {
  apps!: Table<AppMetadata>;
  appCode!: Table<AppCode>;
  settings!: Table<SettingsEntry>;

  constructor() {
    super('appforge');
    this.version(1).stores({
      apps: 'id, name, status, createdAt, updatedAt',
      appCode: 'appId, version',
      settings: 'key',
    });
  }
}

export const db = new AppForgeDB();

// ─── Settings helpers ───
export async function getSetting(key: string): Promise<string | undefined> {
  const entry = await db.settings.get(key);
  return entry?.value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}

// ─── API Key helpers ───
export async function getApiKey(): Promise<string | undefined> {
  return getSetting('anthropic-api-key');
}

export async function setApiKey(key: string): Promise<void> {
  return setSetting('anthropic-api-key', key);
}

export async function hasApiKey(): Promise<boolean> {
  const key = await getApiKey();
  return !!key && key.length > 0;
}

// ─── App helpers ───
export async function getAllApps(): Promise<AppMetadata[]> {
  return db.apps.orderBy('updatedAt').reverse().toArray();
}

export async function getApp(id: string): Promise<AppMetadata | undefined> {
  return db.apps.get(id);
}

export async function saveApp(app: AppMetadata): Promise<void> {
  await db.apps.put(app);
}

export async function deleteApp(id: string): Promise<void> {
  await db.apps.delete(id);
  await db.appCode.delete(id);
}

export async function getAppCode(appId: string): Promise<AppCode | undefined> {
  return db.appCode.get(appId);
}

export async function saveAppCode(code: AppCode): Promise<void> {
  await db.appCode.put(code);
}
