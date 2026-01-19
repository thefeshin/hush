/**
 * Message state management
 */

import { create } from 'zustand';
import { loadMessages } from '../services/storage';
import type { EncryptedData, MessagePayload } from '../types/crypto';

interface Message {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'failed';
}

interface MessageState {
  messagesByThread: Map<string, Message[]>;
  isLoading: boolean;

  // Actions
  loadMessagesForThread: (
    threadId: string,
    decryptFn: (encrypted: EncryptedData) => Promise<string>
  ) => Promise<void>;
  addMessage: (message: Message) => void;
  addPendingMessage: (
    threadId: string,
    content: string,
    senderId: string,
    senderName: string
  ) => string;
  markMessageSent: (tempId: string, realId: string) => void;
  markMessageFailed: (tempId: string) => void;
  getMessages: (threadId: string) => Message[];
}

// Generate temporary ID for pending messages
function generateTempId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messagesByThread: new Map(),
  isLoading: false,

  loadMessagesForThread: async (threadId, decryptFn) => {
    set({ isLoading: true });

    try {
      const stored = await loadMessages(threadId, 100);
      const messages: Message[] = [];

      for (const { id, encrypted } of stored) {
        try {
          const plaintext = await decryptFn(encrypted);
          const payload: MessagePayload = JSON.parse(plaintext);

          messages.push({
            id,
            threadId,
            senderId: payload.sender_id,
            senderName: payload.sender_name,
            content: payload.content,
            timestamp: payload.timestamp,
            status: 'sent'
          });
        } catch {
          // Skip messages that can't be decrypted
        }
      }

      set(state => {
        const newMap = new Map(state.messagesByThread);
        newMap.set(threadId, messages);
        return { messagesByThread: newMap, isLoading: false };
      });
    } catch (err) {
      console.error('Failed to load messages', err);
      set({ isLoading: false });
    }
  },

  addMessage: (message) => {
    set(state => {
      const newMap = new Map(state.messagesByThread);
      const existing = newMap.get(message.threadId) || [];

      // Check for duplicate
      if (existing.some(m => m.id === message.id)) {
        return state;
      }

      newMap.set(message.threadId, [...existing, message]);
      return { messagesByThread: newMap };
    });
  },

  addPendingMessage: (threadId, content, senderId, senderName) => {
    const tempId = generateTempId();
    const message: Message = {
      id: tempId,
      threadId,
      senderId,
      senderName,
      content,
      timestamp: Date.now(),
      status: 'sending'
    };

    set(state => {
      const newMap = new Map(state.messagesByThread);
      const existing = newMap.get(threadId) || [];
      newMap.set(threadId, [...existing, message]);
      return { messagesByThread: newMap };
    });

    return tempId;
  },

  markMessageSent: (tempId, realId) => {
    set(state => {
      const newMap = new Map(state.messagesByThread);

      for (const [threadId, messages] of newMap) {
        const updated = messages.map(m =>
          m.id === tempId ? { ...m, id: realId, status: 'sent' as const } : m
        );
        newMap.set(threadId, updated);
      }

      return { messagesByThread: newMap };
    });
  },

  markMessageFailed: (tempId) => {
    set(state => {
      const newMap = new Map(state.messagesByThread);

      for (const [threadId, messages] of newMap) {
        const updated = messages.map(m =>
          m.id === tempId ? { ...m, status: 'failed' as const } : m
        );
        newMap.set(threadId, updated);
      }

      return { messagesByThread: newMap };
    });
  },

  getMessages: (threadId) => {
    return get().messagesByThread.get(threadId) || [];
  }
}));
