/**
 * Message state management
 */

import { create } from 'zustand';
import { loadMessages } from '../services/storage';
import type { EncryptedData, MessagePayload } from '../types/crypto';

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  expiresAfterSeenSec?: 15 | 30 | 60;
  seenByUser?: Record<string, number>;
  deleteAfterSeenAt?: number;
  senderDeleteAfterSeenAt?: number;
  seenCount?: number;
  totalRecipients?: number;
  allRecipientsSeen?: boolean;
  status: 'sending' | 'sent' | 'failed';
}

interface MessageState {
  messagesByConversation: Map<string, Message[]>;
  isLoading: boolean;

  // Actions
  loadMessagesForConversation: (
    conversationId: string,
    decryptFn: (encrypted: EncryptedData) => Promise<string>
  ) => Promise<void>;
  addMessage: (message: Message) => void;
  addPendingMessage: (
    conversationId: string,
    content: string,
    senderId: string,
    senderName: string,
    expiresAfterSeenSec?: 15 | 30 | 60,
  ) => string;
  markMessageSent: (tempId: string, realId: string) => void;
  markMessageFailed: (tempId: string) => void;
  markMessageSeen: (
    messageId: string,
    seenByUserId: string,
    seenAt: number,
    seenCount?: number,
    totalRecipients?: number,
    allRecipientsSeen?: boolean,
    senderDeleteAfterSeenAt?: number,
  ) => void;
  removeMessage: (messageId: string) => void;
  getMessages: (conversationId: string) => Message[];
}

// Generate temporary ID for pending messages
function generateTempId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messagesByConversation: new Map(),
  isLoading: false,

  loadMessagesForConversation: async (conversationId, decryptFn) => {
    set({ isLoading: true });

    try {
      const existingMessages = get().messagesByConversation.get(conversationId) || [];
      const existingById = new Map(existingMessages.map((message) => [message.id, message]));

      const stored = await loadMessages(conversationId, 100);
      const messages: Message[] = [];

      for (const { id, encrypted } of stored) {
        try {
          const plaintext = await decryptFn(encrypted);
          const payload: MessagePayload = JSON.parse(plaintext);

          messages.push({
            id,
            conversationId,
            senderId: payload.sender_id,
            senderName: payload.sender_name,
            content: payload.content,
            timestamp: payload.timestamp,
            expiresAfterSeenSec: payload.expires_after_seen_sec,
            seenByUser: existingById.get(id)?.seenByUser || {},
            deleteAfterSeenAt: existingById.get(id)?.deleteAfterSeenAt,
            senderDeleteAfterSeenAt: existingById.get(id)?.senderDeleteAfterSeenAt,
            seenCount: existingById.get(id)?.seenCount,
            totalRecipients: existingById.get(id)?.totalRecipients,
            allRecipientsSeen: existingById.get(id)?.allRecipientsSeen,
            status: 'sent'
          });
        } catch {
          // Skip messages that can't be decrypted
        }
      }

      set(state => {
        const newMap = new Map(state.messagesByConversation);
        newMap.set(conversationId, messages);
        return { messagesByConversation: newMap, isLoading: false };
      });
    } catch (err) {
      console.error('Failed to load messages', err);
      set({ isLoading: false });
    }
  },

  addMessage: (message) => {
    set(state => {
      const newMap = new Map(state.messagesByConversation);
      const existing = newMap.get(message.conversationId) || [];

      // Check for duplicate
      if (existing.some(m => m.id === message.id)) {
        return state;
      }

      newMap.set(message.conversationId, [...existing, message]);
      return { messagesByConversation: newMap };
    });
  },

  addPendingMessage: (conversationId, content, senderId, senderName, expiresAfterSeenSec) => {
    const tempId = generateTempId();
    const message: Message = {
      id: tempId,
      conversationId,
      senderId,
      senderName,
      content,
      timestamp: Date.now(),
      expiresAfterSeenSec,
      seenByUser: {},
      status: 'sending'
    };

    set(state => {
      const newMap = new Map(state.messagesByConversation);
      const existing = newMap.get(conversationId) || [];
      newMap.set(conversationId, [...existing, message]);
      return { messagesByConversation: newMap };
    });

    return tempId;
  },

  markMessageSent: (tempId, realId) => {
    set(state => {
      const newMap = new Map(state.messagesByConversation);

      for (const [conversationId, messages] of newMap) {
        const updated = messages.map(m =>
          m.id === tempId ? { ...m, id: realId, status: 'sent' as const } : m
        );

        const deduped: Message[] = [];
        const seenIds = new Set<string>();
        for (let i = updated.length - 1; i >= 0; i -= 1) {
          const msg = updated[i];
          if (!seenIds.has(msg.id)) {
            seenIds.add(msg.id);
            deduped.push(msg);
          }
        }

        deduped.reverse();
        newMap.set(conversationId, deduped);
      }

      return { messagesByConversation: newMap };
    });
  },

  markMessageFailed: (tempId) => {
    set(state => {
      const newMap = new Map(state.messagesByConversation);

      for (const [conversationId, messages] of newMap) {
        const updated = messages.map(m =>
          m.id === tempId ? { ...m, status: 'failed' as const } : m
        );
        newMap.set(conversationId, updated);
      }

      return { messagesByConversation: newMap };
    });
  },

  markMessageSeen: (messageId, seenByUserId, seenAt, seenCount, totalRecipients, allRecipientsSeen, senderDeleteAfterSeenAt) => {
    set(state => {
      const newMap = new Map(state.messagesByConversation);

      for (const [conversationId, messages] of newMap) {
        let changed = false;
        const updated = messages.map((message) => {
          if (message.id !== messageId) {
            return message;
          }
          const seenByUser = { ...(message.seenByUser || {}) };
          if (seenByUser[seenByUserId]) {
            return message;
          }
          seenByUser[seenByUserId] = seenAt;
          changed = true;

          let deleteAfterSeenAt = message.deleteAfterSeenAt;
          if (message.expiresAfterSeenSec && message.senderId !== seenByUserId && !deleteAfterSeenAt) {
            deleteAfterSeenAt = seenAt + (message.expiresAfterSeenSec * 1000);
          }

          return {
            ...message,
            seenByUser,
            deleteAfterSeenAt,
            seenCount: typeof seenCount === 'number' ? seenCount : message.seenCount,
            totalRecipients: typeof totalRecipients === 'number' ? totalRecipients : message.totalRecipients,
            allRecipientsSeen: typeof allRecipientsSeen === 'boolean' ? allRecipientsSeen : message.allRecipientsSeen,
            senderDeleteAfterSeenAt: typeof senderDeleteAfterSeenAt === 'number' ? senderDeleteAfterSeenAt : message.senderDeleteAfterSeenAt,
          };
        });

        if (changed) {
          newMap.set(conversationId, updated);
        }
      }

      return { messagesByConversation: newMap };
    });
  },

  removeMessage: (messageId) => {
    set(state => {
      const newMap = new Map(state.messagesByConversation);
      for (const [conversationId, messages] of newMap) {
        const filtered = messages.filter((message) => message.id !== messageId);
        if (filtered.length !== messages.length) {
          newMap.set(conversationId, filtered);
        }
      }
      return { messagesByConversation: newMap };
    });
  },

  getMessages: (conversationId) => {
    return get().messagesByConversation.get(conversationId) || [];
  }
}));
