/**
 * Device Settings Service
 * Stores per-device settings in plain IndexedDB (not encrypted)
 * These are local preferences only, not synced to server
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { DeviceSettings } from '../types/crypto';

interface DeviceSettingsDBSchema extends DBSchema {
  settings: {
    key: string;
    value: DeviceSettings;
  };
}

const DB_NAME = 'hush-device-settings';
const DB_VERSION = 1;
const STORE_NAME = 'settings';
const SETTINGS_KEY = 'device';

let db: IDBPDatabase<DeviceSettingsDBSchema> | null = null;

/**
 * Initialize device settings database
 */
async function getDB(): Promise<IDBPDatabase<DeviceSettingsDBSchema>> {
  if (!db) {
    db = await openDB<DeviceSettingsDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return db;
}

/**
 * Get device settings
 */
export async function getDeviceSettings(): Promise<DeviceSettings> {
  try {
    const database = await getDB();
    const settings = await database.get(STORE_NAME, SETTINGS_KEY);
    return settings || { pinEnabled: false };
  } catch {
    return { pinEnabled: false };
  }
}

/**
 * Set device settings
 */
export async function setDeviceSettings(settings: DeviceSettings): Promise<void> {
  const database = await getDB();
  await database.put(STORE_NAME, settings, SETTINGS_KEY);
}

/**
 * Check if PIN is enabled
 */
export async function isPINEnabled(): Promise<boolean> {
  const settings = await getDeviceSettings();
  return settings.pinEnabled;
}

/**
 * Set PIN enabled/disabled
 */
export async function setPINEnabled(enabled: boolean): Promise<void> {
  const settings = await getDeviceSettings();
  settings.pinEnabled = enabled;
  await setDeviceSettings(settings);
}

/**
 * Clear all device settings
 */
export async function clearDeviceSettings(): Promise<void> {
  try {
    const database = await getDB();
    await database.delete(STORE_NAME, SETTINGS_KEY);
  } catch {
    // Ignore errors
  }
}
