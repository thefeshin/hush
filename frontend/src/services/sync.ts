/**
 * Sync service for fetching messages via REST API
 * Used when WebSocket is unavailable or for initial load
 */

import { createAuthenticatedFetch } from './api';
import { saveMessage } from './storage';
import type { EncryptedData } from '../types/crypto';

interface MessageFromServer {
  id: string;
  thread_id: string;
  ciphertext: string;
  iv: string;
  created_at: string;
}

export class SyncService {
  private authFetch: ReturnType<typeof createAuthenticatedFetch>;

  constructor(token: string) {
    this.authFetch = createAuthenticatedFetch(token);
  }

  /**
   * Fetch messages for a thread from the server
   */
  async fetchMessages(
    threadId: string,
    after?: Date,
    limit: number = 50
  ): Promise<MessageFromServer[]> {
    let url = `/messages/${threadId}?limit=${limit}`;
    if (after) {
      url += `&after=${after.toISOString()}`;
    }

    const response = await this.authFetch(url);

    if (!response.ok) {
      throw new Error('Failed to fetch messages');
    }

    return response.json();
  }

  /**
   * Create a thread on the server
   */
  async createThread(
    threadId: string,
    encrypted: EncryptedData
  ): Promise<void> {
    const response = await this.authFetch('/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: threadId,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv
      })
    });

    if (!response.ok) {
      throw new Error('Failed to create thread');
    }
  }

  /**
   * Query threads by IDs
   */
  async queryThreads(threadIds: string[]): Promise<Array<{
    id: string;
    ciphertext: string;
    iv: string;
    created_at: string;
  }>> {
    const response = await this.authFetch('/threads/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_ids: threadIds })
    });

    if (!response.ok) {
      throw new Error('Failed to query threads');
    }

    return response.json();
  }

  /**
   * Sync messages for a thread (fetch new ones since last sync)
   */
  async syncThread(
    threadId: string,
    lastSyncTime: Date | null,
    decryptFn: (encrypted: EncryptedData) => Promise<string>
  ): Promise<number> {
    const messages = await this.fetchMessages(
      threadId,
      lastSyncTime || undefined,
      100
    );

    // Save each message to local storage
    for (const msg of messages) {
      await saveMessage(
        msg.id,
        msg.thread_id,
        { ciphertext: msg.ciphertext, iv: msg.iv },
        new Date(msg.created_at).getTime()
      );
    }

    return messages.length;
  }

  /**
   * Send a message via REST API (fallback when WebSocket unavailable)
   */
  async sendMessage(
    threadId: string,
    encrypted: EncryptedData
  ): Promise<{ id: string; created_at: string }> {
    const response = await this.authFetch(`/threads/${threadId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv
      })
    });

    if (!response.ok) {
      throw new Error('Failed to send message');
    }

    return response.json();
  }
}

// Create sync service instance
let syncServiceInstance: SyncService | null = null;

export function getSyncService(token: string): SyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new SyncService(token);
  }
  return syncServiceInstance;
}

export function clearSyncService(): void {
  syncServiceInstance = null;
}
