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
  conversations: {
    key: string; // conversation_id
    value: {
      conversationId: string;
      ciphertext: string; // encrypted conversation metadata
      iv: string;
      lastMessageAt: number;
    };
    indexes: { 'by-last-message': number };
  };
  messages: {
    key: string; // message_id
    value: {
      id: string;
      conversationId: string;
      ciphertext: string;
      iv: string;
      createdAt: number;
    };
    indexes: { 'by-conversation': string; 'by-created': number };
  };
}

const DB_NAME = 'hush-vault';
const DB_VERSION = 3;

let db: IDBPDatabase<HushDBSchema> | null = null;

/**
 * Initialize the database
 */
export async function initDatabase(): Promise<void> {
  db = await openDB<HushDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      // Identity store (single record)
      if (!database.objectStoreNames.contains('identity')) {
        database.createObjectStore('identity', { keyPath: 'id' });
      }

      // Contacts store
      if (!database.objectStoreNames.contains('contacts')) {
        const contactStore = database.createObjectStore('contacts', { keyPath: 'uuid' });
        contactStore.createIndex('by-added', 'addedAt');
      }

      // Clean reset on pre-release schema changes.
      // Keep identity and contacts, reset conversation/message history stores.
      if (database.objectStoreNames.contains('threads' as any)) {
        database.deleteObjectStore('threads' as any);
      }
      if (database.objectStoreNames.contains('conversations')) {
        database.deleteObjectStore('conversations');
      }
      if (database.objectStoreNames.contains('messages')) {
        database.deleteObjectStore('messages');
      }

      const conversationStore = database.createObjectStore('conversations', { keyPath: 'conversationId' });
      conversationStore.createIndex('by-last-message', 'lastMessageAt');

      const msgStore = database.createObjectStore('messages', { keyPath: 'id' });
      msgStore.createIndex('by-conversation', 'conversationId');
      msgStore.createIndex('by-created', 'createdAt');
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

// ==================== Conversation Operations ====================

/**
 * Save conversation metadata (encrypted)
 */
export async function saveConversation(
  conversationId: string,
  encrypted: EncryptedData,
  lastMessageAt: number = Date.now()
): Promise<void> {
  await getDB().put('conversations', {
    conversationId,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    lastMessageAt
  });
}

/**
 * Load all conversations
 */
export async function loadConversations(): Promise<Array<{ conversationId: string; encrypted: EncryptedData; lastMessageAt: number }>> {
  const records = await getDB().getAllFromIndex('conversations', 'by-last-message');
  return records.reverse().map(r => ({
    conversationId: r.conversationId,
    encrypted: { ciphertext: r.ciphertext, iv: r.iv },
    lastMessageAt: r.lastMessageAt
  }));
}

/**
 * Load a single conversation by ID
 */
export async function loadConversation(conversationId: string): Promise<{ encrypted: EncryptedData; lastMessageAt: number } | null> {
  const record = await getDB().get('conversations', conversationId);
  if (!record) return null;

  return {
    encrypted: { ciphertext: record.ciphertext, iv: record.iv },
    lastMessageAt: record.lastMessageAt
  };
}

// ==================== Message Operations ====================

/**
 * Save a message (encrypted)
 */
export async function saveMessage(
  id: string,
  conversationId: string,
  encrypted: EncryptedData,
  createdAt: number = Date.now()
): Promise<void> {
  await getDB().put('messages', {
    id,
    conversationId,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    createdAt
  });
}

/**
 * Replace a local message ID with the canonical server ID.
 */
export async function replaceMessageId(oldId: string, newId: string): Promise<void> {
  if (oldId === newId) {
    return;
  }

  const database = getDB();
  const record = await database.get('messages', oldId);
  if (!record) {
    return;
  }

  const existing = await database.get('messages', newId);
  if (existing) {
    await database.delete('messages', oldId);
    return;
  }

  await database.put('messages', { ...record, id: newId });
  await database.delete('messages', oldId);
}

/**
 * Load messages for a conversation
 */
export async function loadMessages(
  conversationId: string,
  limit: number = 50
): Promise<Array<{ id: string; encrypted: EncryptedData; createdAt: number }>> {
  let records: Array<{ id: string; conversationId: string; ciphertext: string; iv: string; createdAt: number }> = [];
  try {
    records = await getDB().getAllFromIndex('messages', 'by-conversation', conversationId);
  } catch (error) {
    console.warn('Messages index missing, returning empty history', error);
    return [];
  }

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
  await database.clear('conversations');
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
