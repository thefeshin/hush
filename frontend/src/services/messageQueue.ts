/**
 * Queue for messages that couldn't be sent (offline support)
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { EncryptedData } from '../types/crypto';

interface QueuedMessage {
  id: string;
  threadId: string;
  encrypted: EncryptedData;
  payload: string; // Serialized MessagePayload
  queuedAt: number;
  attempts: number;
}

interface QueueDBSchema extends DBSchema {
  queue: {
    key: string;
    value: QueuedMessage;
    indexes: { 'by-thread': string; 'by-time': number };
  };
}

const DB_NAME = 'hush-queue';
const DB_VERSION = 1;

let db: IDBPDatabase<QueueDBSchema> | null = null;

async function getDB(): Promise<IDBPDatabase<QueueDBSchema>> {
  if (!db) {
    db = await openDB<QueueDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        const store = database.createObjectStore('queue', { keyPath: 'id' });
        store.createIndex('by-thread', 'threadId');
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
  threadId: string,
  encrypted: EncryptedData,
  payload: string
): Promise<string> {
  const id = `queued-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

  const database = await getDB();
  await database.put('queue', {
    id,
    threadId,
    encrypted,
    payload,
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
 * Get queued messages for a specific thread
 */
export async function getQueuedMessagesForThread(threadId: string): Promise<QueuedMessage[]> {
  const database = await getDB();
  return database.getAllFromIndex('queue', 'by-thread', threadId);
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
  sendFn: (threadId: string, encrypted: EncryptedData) => Promise<{ id: string }>
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
      await sendFn(msg.threadId, msg.encrypted);
      await removeFromQueue(msg.id);
      sent++;
    } catch (error) {
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
