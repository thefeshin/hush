/**
 * Sync service for fetching messages via REST API.
 */

import { createAuthenticatedFetch } from "./api";
import { saveMessage } from "./storage";
import type { EncryptedData } from "../types/crypto";

interface MessageFromServer {
  id: string;
  conversation_id: string;
  sender_id: string;
  group_epoch?: number;
  ciphertext: string;
  iv: string;
  created_at: string;
}

export class SyncService {
  private authFetch: ReturnType<typeof createAuthenticatedFetch>;

  constructor() {
    this.authFetch = createAuthenticatedFetch();
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async fetchMessages(
    conversationId: string,
    after?: Date,
    limit: number = 50,
  ): Promise<MessageFromServer[]> {
    let url = `/messages/${conversationId}?limit=${limit}`;
    if (after) {
      url += `&after=${after.toISOString()}`;
    }

    const maxAttempts = 3;
    let response: Response | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      response = await this.authFetch(url);

      if (response.ok) {
        return response.json();
      }

      const retryableNotFound = response.status === 404;
      const retryableServerError = response.status >= 500;
      const shouldRetry =
        (retryableNotFound || retryableServerError) && attempt < maxAttempts;

      if (!shouldRetry) {
        throw new Error("Failed to fetch messages");
      }

      await this.sleep(150 * 2 ** (attempt - 1));
    }

    throw new Error("Failed to fetch messages");
  }

  async queryConversations(conversationIds: string[]): Promise<
    Array<{
      id: string;
      created_at: string;
    }>
  > {
    const response = await this.authFetch("/conversations/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_ids: conversationIds }),
    });

    if (!response.ok) {
      throw new Error("Failed to query conversations");
    }

    return response.json();
  }

  async syncConversation(
    conversationId: string,
    lastSyncTime: Date | null,
  ): Promise<number> {
    const messages = await this.fetchMessages(
      conversationId,
      lastSyncTime || undefined,
      100,
    );

    for (const msg of messages) {
      await saveMessage(
        msg.id,
        msg.conversation_id,
        { ciphertext: msg.ciphertext, iv: msg.iv },
        new Date(msg.created_at).getTime(),
      );
    }

    return messages.length;
  }

  async sendMessage(
    conversationId: string,
    encrypted: EncryptedData,
    recipientId?: string,
    groupEpoch?: number,
  ): Promise<{ id: string; created_at: string }> {
    const response = await this.authFetch("/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: conversationId,
        recipient_id: recipientId,
        group_epoch: groupEpoch,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to send message");
    }

    return response.json();
  }
}

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
