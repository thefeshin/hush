/**
 * Queue for messages that couldn't be sent (offline support)
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { EncryptedData } from '../types/crypto';

interface QueuedMessage {
  id: string;
  conversationId: string;
  recipientId?: string;
  localMessageId: string;
  encrypted: EncryptedData;
  queuedAt: number;
  attempts: number;
}

interface QueueDBSchema extends DBSchema {
  queue: {
    key: string;
    value: QueuedMessage;
    indexes: { 'by-conversation': string; 'by-time': number };
  };
}

const DB_NAME = 'hush-queue';
const DB_VERSION = 2;

let db: IDBPDatabase<QueueDBSchema> | null = null;

async function getDB(): Promise<IDBPDatabase<QueueDBSchema>> {
  if (!db) {
    db = await openDB<QueueDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (database.objectStoreNames.contains('queue')) {
          database.deleteObjectStore('queue');
        }
        const store = database.createObjectStore('queue', { keyPath: 'id' });
        store.createIndex('by-conversation', 'conversationId');
        store.createIndex('by-time', 'queuedAt');
      }
    });
  }
  return db;
}

/**
 * Add a message to the send queue
 */
export async function queueMessage(
  conversationId: string,
  localMessageId: string,
  encrypted: EncryptedData,
  recipientId?: string
): Promise<string> {
  const id = `queued-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const database = await getDB();
  await database.put('queue', {
    id,
    conversationId,
    recipientId,
    localMessageId,
    encrypted,
    queuedAt: Date.now(),
    attempts: 0
  });

  return id;
}

/**
 * Get all queued messages
 */
export async function getQueuedMessages(): Promise<QueuedMessage[]> {
  const database = await getDB();
  return database.getAllFromIndex('queue', 'by-time');
}

/**
 * Get queued messages for a specific conversation
 */
export async function getQueuedMessagesForConversation(conversationId: string): Promise<QueuedMessage[]> {
  const database = await getDB();
  return database.getAllFromIndex('queue', 'by-conversation', conversationId);
}

/**
 * Get count of queued messages
 */
export async function getQueueCount(): Promise<number> {
  const database = await getDB();
  return database.count('queue');
}

/**
 * Remove a message from the queue (after successful send)
 */
export async function removeFromQueue(id: string): Promise<void> {
  const database = await getDB();
  await database.delete('queue', id);
}

/**
 * Increment attempt count for a message
 */
export async function incrementAttempts(id: string): Promise<void> {
  const database = await getDB();
  const msg = await database.get('queue', id);
  if (msg) {
    msg.attempts++;
    await database.put('queue', msg);
  }
}

/**
 * Process the queue (send pending messages)
 */
export async function processQueue(
  sendFn: (conversationId: string, encrypted: EncryptedData, recipientId?: string) => Promise<{ id: string }>,
  onSent?: (localMessageId: string, serverMessageId: string) => Promise<void>
): Promise<{ sent: number; failed: number }> {
  const messages = await getQueuedMessages();
  let sent = 0;
  let failed = 0;

  for (const msg of messages) {
    if (msg.attempts >= 3) {
      // Too many attempts, remove from queue
      await removeFromQueue(msg.id);
      failed++;
      continue;
    }

    try {
      const result = await sendFn(msg.conversationId, msg.encrypted, msg.recipientId);
      if (onSent) {
        await onSent(msg.localMessageId, result.id);
      }
      await removeFromQueue(msg.id);
      sent++;
    } catch (_error) {
      await incrementAttempts(msg.id);
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Clear all queued messages
 */
export async function clearQueue(): Promise<void> {
  const database = await getDB();
  await database.clear('queue');
}

/**
 * Close the database connection
 */
export async function closeQueueDB(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
}
