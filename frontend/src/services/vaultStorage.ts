/**
 * PIN-Protected Vault Storage
 * Stores encrypted vault key in IndexedDB, unlocked with PIN
 * Zero-knowledge: Server never sees PIN or vault key
 */

import { openDB, DBSchema, IDBPDatabase } from "idb";
import type { VaultKey } from "../types/crypto";
import { base64ToBytes, bytesToBase64 } from "../crypto/encoding";

// Vault key storage interface
interface EncryptedVaultKey {
  id: "vault_key";
  encrypted: number[]; // Uint8Array as array for IndexedDB
  salt: number[]; // PBKDF2 salt
  iv: number[]; // AES-GCM IV
  timestamp: number;
}

interface VaultStorageDBSchema extends DBSchema {
  vault: {
    key: "vault_key";
    value: EncryptedVaultKey;
  };
}

const DB_NAME = "hush-vault-storage";
const DB_VERSION = 2;
const VAULT_KEY_STORE = "vault";
const VAULT_KEY_ITEM = "vault_key";

let db: IDBPDatabase<VaultStorageDBSchema> | null = null;

/**
 * Initialize vault storage database
 */
async function getDB(): Promise<IDBPDatabase<VaultStorageDBSchema>> {
  if (!db) {
    db = await openDB<VaultStorageDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        if (database.objectStoreNames.contains(VAULT_KEY_STORE)) {
          // v1 store was created without a keyPath; recreate to support out-of-line keys.
          if (oldVersion < 2) {
            database.deleteObjectStore(VAULT_KEY_STORE);
          }
        }

        if (!database.objectStoreNames.contains(VAULT_KEY_STORE)) {
          database.createObjectStore(VAULT_KEY_STORE, { keyPath: "id" });
        }
      },
    });
  }
  return db;
}

/**
 * Derive encryption key from PIN using PBKDF2
 */
export async function derivePinKey(
  pin: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as Uint8Array<ArrayBuffer>,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt vault key with PIN-derived key
 */
function toArrayBufferBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  // Copy into a new ArrayBuffer-backed Uint8Array for WebCrypto typings
  return new Uint8Array(bytes) as Uint8Array<ArrayBuffer>;
}

export async function encryptVaultKey(
  rawKey: Uint8Array,
  pinKey: CryptoKey
): Promise<{ encrypted: Uint8Array; iv: Uint8Array }> {
  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt raw key bytes with PIN-derived key
  const data = toArrayBufferBytes(rawKey);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    pinKey,
    data
  );

  return { encrypted: new Uint8Array(encrypted), iv };
}

/**
 * Decrypt vault key with PIN-derived key
 */
export async function decryptVaultKey(
  encryptedData: Uint8Array,
  salt: Uint8Array,
  iv: Uint8Array,
  pin: string
): Promise<VaultKey> {
  // Derive PIN key
  const pinKey = await derivePinKey(pin, salt);

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as Uint8Array<ArrayBuffer> },
    pinKey,
    encryptedData as Uint8Array<ArrayBuffer>
  );

  const rawKey = new Uint8Array(decrypted);

  // Import vault key
  const key = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HKDF" }, // Vault key is used for HKDF
    false,
    ["deriveKey", "deriveBits"]
  );

  return { key, raw: rawKey };
}

/**
 * Store encrypted vault key in IndexedDB
 */
export async function storeVaultKey(
  vaultKey: VaultKey,
  pin: string
): Promise<void> {
  // Derive PIN key with fresh salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pinKey = await derivePinKey(pin, salt);

  // Encrypt vault key
  const { encrypted, iv } = await encryptVaultKey(vaultKey.raw, pinKey);

  // Store in IndexedDB
  const database = await getDB();
  await database.put(VAULT_KEY_STORE, {
    id: VAULT_KEY_ITEM,
    encrypted: Array.from(encrypted),
    salt: Array.from(salt),
    iv: Array.from(iv),
    timestamp: Date.now(),
  });
}

/**
 * Retrieve and decrypt vault key with PIN
 * Returns null if:
 * - No stored key exists
 * - PIN is incorrect (decryption fails)
 */
export async function retrieveVaultKey(pin: string): Promise<VaultKey | null> {
  const database = await getDB();
  const record = await database.get(VAULT_KEY_STORE, VAULT_KEY_ITEM);

  if (!record) {
    return null;
  }

  try {
    return await decryptVaultKey(
      Uint8Array.from(record.encrypted),
      Uint8Array.from(record.salt),
      Uint8Array.from(record.iv),
      pin
    );
  } catch {
    // Decryption failed = wrong PIN
    return null;
  }
}

/**
 * Check if vault key exists in storage
 */
export async function hasStoredVaultKey(): Promise<boolean> {
  try {
    const database = await getDB();
    const record = await database.get(VAULT_KEY_STORE, VAULT_KEY_ITEM);
    return !!record;
  } catch {
    return false;
  }
}

/**
 * Clear stored vault key from IndexedDB
 */
export async function clearStoredVaultKey(): Promise<void> {
  try {
    const database = await getDB();
    await database.delete(VAULT_KEY_STORE, VAULT_KEY_ITEM);
  } catch {
    // Ignore errors
  }
}

// ==================== Session Storage (survives refresh, not tab close) ====================

/**
 * Store vault key in sessionStorage (no PIN needed, survives refresh)
 */
export async function setSessionVaultKey(vaultKey: VaultKey): Promise<void> {
  try {
    const encoded = bytesToBase64(vaultKey.raw);
    sessionStorage.setItem("vault_key_session", encoded);
  } catch {
    console.warn("Could not store vault key in session storage");
  }
}

/**
 * Retrieve vault key from sessionStorage
 */
export async function getSessionVaultKey(): Promise<VaultKey | null> {
  const stored = sessionStorage.getItem("vault_key_session");
  if (!stored) {
    return null;
  }

  try {
    const rawKey = toArrayBufferBytes(base64ToBytes(stored));
    const key = await crypto.subtle.importKey(
      "raw",
      rawKey,
      { name: "HKDF" },
      false,
      ["deriveKey", "deriveBits"]
    );
    return { key, raw: rawKey };
  } catch {
    // Invalid stored key
    return null;
  }
}

/**
 * Clear vault key from sessionStorage
 */
export function clearSessionVaultKey(): void {
  sessionStorage.removeItem("vault_key_session");
}
