/**
 * Encrypted IndexedDB storage service
 * All stored data is encrypted with the vault key
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { EncryptedData } from '../types/crypto';

interface HushDBSchema extends DBSchema {
  identity: {
    key: 'current';
    value: {
      id: 'current';
      ciphertext: string;
      iv: string;
      updatedAt: number;
    };
  };
  contacts: {
    key: string; // UUID
    value: {
      uuid: string;
      ciphertext: string; // encrypted display name + notes
      iv: string;
      addedAt: number;
    };
    indexes: { 'by-added': number };
  };
  threads: {
    key: string; // thread_id
    value: {
      threadId: string;
      ciphertext: string; // encrypted thread metadata
      iv: string;
      lastMessageAt: number;
    };
    indexes: { 'by-last-message': number };
  };
  messages: {
    key: string; // message_id
    value: {
      id: string;
      threadId: string;
      ciphertext: string;
      iv: string;
      createdAt: number;
    };
    indexes: { 'by-thread': string; 'by-created': number };
  };
}

const DB_NAME = 'hush-vault';
const DB_VERSION = 1;

let db: IDBPDatabase<HushDBSchema> | null = null;

/**
 * Initialize the database
 */
export async function initDatabase(): Promise<void> {
  db = await openDB<HushDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion, newVersion, transaction) {
      // Identity store (single record)
      if (!database.objectStoreNames.contains('identity')) {
        database.createObjectStore('identity', { keyPath: 'id' });
      }

      // Contacts store
      if (!database.objectStoreNames.contains('contacts')) {
        const contactStore = database.createObjectStore('contacts', { keyPath: 'uuid' });
        contactStore.createIndex('by-added', 'addedAt');
      }

      // Threads store
      if (!database.objectStoreNames.contains('threads')) {
        const threadStore = database.createObjectStore('threads', { keyPath: 'threadId' });
        threadStore.createIndex('by-last-message', 'lastMessageAt');
      }

      // Messages store
      if (!database.objectStoreNames.contains('messages')) {
        const msgStore = database.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('by-thread', 'threadId');
        msgStore.createIndex('by-created', 'createdAt');
      }
    }
  });
}

/**
 * Get database instance
 */
function getDB(): IDBPDatabase<HushDBSchema> {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

// ==================== Identity Operations ====================

/**
 * Save encrypted identity
 */
export async function saveIdentity(encrypted: EncryptedData): Promise<void> {
  await getDB().put('identity', {
    id: 'current',
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    updatedAt: Date.now()
  });
}

/**
 * Load encrypted identity
 */
export async function loadIdentity(): Promise<EncryptedData | null> {
  const record = await getDB().get('identity', 'current');
  if (!record) return null;

  return {
    ciphertext: record.ciphertext,
    iv: record.iv
  };
}

/**
 * Delete identity (on logout/clear)
 */
export async function deleteIdentity(): Promise<void> {
  await getDB().delete('identity', 'current');
}

// ==================== Contact Operations ====================

/**
 * Save a contact (encrypted)
 */
export async function saveContact(uuid: string, encrypted: EncryptedData): Promise<void> {
  await getDB().put('contacts', {
    uuid,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    addedAt: Date.now()
  });
}

/**
 * Load all contacts
 */
export async function loadContacts(): Promise<Array<{ uuid: string; encrypted: EncryptedData }>> {
  const records = await getDB().getAllFromIndex('contacts', 'by-added');
  return records.map(r => ({
    uuid: r.uuid,
    encrypted: { ciphertext: r.ciphertext, iv: r.iv }
  }));
}

/**
 * Delete a contact
 */
export async function deleteContact(uuid: string): Promise<void> {
  await getDB().delete('contacts', uuid);
}

// ==================== Thread Operations ====================

/**
 * Save thread metadata (encrypted)
 */
export async function saveThread(
  threadId: string,
  encrypted: EncryptedData,
  lastMessageAt: number = Date.now()
): Promise<void> {
  await getDB().put('threads', {
    threadId,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    lastMessageAt
  });
}

/**
 * Load all threads
 */
export async function loadThreads(): Promise<Array<{ threadId: string; encrypted: EncryptedData; lastMessageAt: number }>> {
  const records = await getDB().getAllFromIndex('threads', 'by-last-message');
  return records.reverse().map(r => ({
    threadId: r.threadId,
    encrypted: { ciphertext: r.ciphertext, iv: r.iv },
    lastMessageAt: r.lastMessageAt
  }));
}

// ==================== Message Operations ====================

/**
 * Save a message (encrypted)
 */
export async function saveMessage(
  id: string,
  threadId: string,
  encrypted: EncryptedData,
  createdAt: number = Date.now()
): Promise<void> {
  await getDB().put('messages', {
    id,
    threadId,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    createdAt
  });
}

/**
 * Load messages for a thread
 */
export async function loadMessages(
  threadId: string,
  limit: number = 50
): Promise<Array<{ id: string; encrypted: EncryptedData; createdAt: number }>> {
  const records = await getDB().getAllFromIndex('messages', 'by-thread', threadId);

  // Sort by created time and limit
  return records
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-limit)
    .map(r => ({
      id: r.id,
      encrypted: { ciphertext: r.ciphertext, iv: r.iv },
      createdAt: r.createdAt
    }));
}

// ==================== Clear All Data ====================

/**
 * Clear all stored data (for logout)
 */
export async function clearAllData(): Promise<void> {
  const database = getDB();
  await database.clear('identity');
  await database.clear('contacts');
  await database.clear('threads');
  await database.clear('messages');
}

/**
 * Delete entire database
 */
export async function deleteDatabase(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
  await indexedDB.deleteDatabase(DB_NAME);
}
