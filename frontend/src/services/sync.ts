/**
 * Sync service for fetching messages via REST API
 * Uses cookie-based authentication
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

  constructor() {
    this.authFetch = createAuthenticatedFetch();
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
   * Includes participant information for thread discovery
   */
  async createThread(
    threadId: string,
    encrypted: EncryptedData,
    participant1?: string,
    participant2?: string
  ): Promise<void> {
    const body: any = {
      id: threadId,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv
    };

    // Include participant info if provided (for thread discovery)
    if (participant1 && participant2) {
      body.participant_1 = participant1;
      body.participant_2 = participant2;
    }

    const response = await this.authFetch('/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
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
    _decryptFn: (encrypted: EncryptedData) => Promise<string>
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
    const response = await this.authFetch('/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thread_id: threadId,
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

// Create sync service instance (singleton)
let syncServiceInstance: SyncService | null = null;

export function getSyncService(): SyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new SyncService();
  }
  return syncServiceInstance;
}

export function clearSyncService(): void {
  syncServiceInstance = null;
}
