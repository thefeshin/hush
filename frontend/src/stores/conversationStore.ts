/**
 * Conversation state management
 */

import { create } from 'zustand';
import { saveThread, loadThreads, loadThread } from '../services/storage';
import { discoverThreads as apiDiscoverThreads } from '../services/api';
import { getSyncService } from '../services/sync';
import type { EncryptedData, ThreadMetadata } from '../types/crypto';

export interface Conversation {
  conversationId: string;      // was threadId
  participantId: string;       // The other participant's user ID
  participantUsername: string; // The other participant's username
  createdAt: number;
  lastMessageAt: number;
  unreadCount: number;
}

interface ConversationState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;

  // Actions
  loadAllConversations: (
    myUserId: string,
    contacts: Array<{ id: string; username: string }>,
    computeConversationId: (id1: string, id2: string) => Promise<string>,
    decryptFn: (encrypted: EncryptedData) => Promise<any>
  ) => Promise<void>;
  discoverConversations: (
    myUserId: string,
    decryptFn: (encrypted: EncryptedData) => Promise<any>
  ) => Promise<string[]>;
  handleUnknownConversation: (
    conversationId: string,
    myUserId: string,
    senderId: string,
    decryptFn: (encrypted: EncryptedData) => Promise<any>
  ) => Promise<void>;
  getOrCreateConversation: (
    myUserId: string,
    myUsername: string,
    otherUserId: string,
    otherUsername: string,
    computeConversationId: (id1: string, id2: string) => Promise<string>,
    encryptFn: (data: any) => Promise<EncryptedData>
  ) => Promise<Conversation>;
  setActiveConversation: (conversationId: string | null) => void;
  updateLastMessage: (conversationId: string, timestamp: number) => void;
  incrementUnread: (conversationId: string) => void;
  getConversation: (conversationId: string) => Conversation | undefined;
  getConversationByParticipant: (participantId: string) => Conversation | undefined;
  addConversation: (conversation: Conversation) => void;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  isLoading: false,

  loadAllConversations: async (myUserId, contacts, computeConversationId, decryptFn) => {
    set({ isLoading: true });

    try {
      // Compute expected conversation IDs for all contacts
      const expectedConversationIds = new Map<string, { id: string; username: string }>();

      for (const contact of contacts) {
        const conversationId = await computeConversationId(myUserId, contact.id);
        expectedConversationIds.set(conversationId, contact);
      }

      // Load stored conversations (still uses 'threads' object store in IndexedDB)
      const stored = await loadThreads();
      const conversations: Conversation[] = [];

      for (const { threadId, encrypted, lastMessageAt } of stored) {
        // Check if this conversation belongs to a known contact
        const contact = expectedConversationIds.get(threadId);

        if (contact) {
          try {
            const metadata = await decryptFn(encrypted);
            conversations.push({
              conversationId: threadId,
              participantId: contact.id,
              participantUsername: contact.username,
              createdAt: metadata.created_at,
              lastMessageAt,
              unreadCount: 0
            });
          } catch {
            // Conversation from different vault, skip
          }
        }
      }

      // Sort by last message time
      conversations.sort((a, b) => b.lastMessageAt - a.lastMessageAt);

      set({ conversations, isLoading: false });
    } catch (err) {
      console.error('Failed to load conversations', err);
      set({ isLoading: false });
    }
  },

  getOrCreateConversation: async (myUserId, myUsername, otherUserId, otherUsername, computeConversationId, encryptFn) => {
    const conversationId = await computeConversationId(myUserId, otherUserId);

    // Check if conversation already exists
    const existing = get().conversations.find(c => c.conversationId === conversationId);
    if (existing) {
      set({ activeConversationId: conversationId });
      return existing;
    }

    // Create conversation metadata
    const metadata: ThreadMetadata = {
      participants: [myUserId, otherUserId].sort() as [string, string],
      created_by: {
        user_id: myUserId,
        display_name: myUsername
      },
      created_at: Date.now()
    };

    // Encrypt and save locally (still uses 'threads' object store)
    const encrypted = await encryptFn(metadata);
    await saveThread(conversationId, encrypted, Date.now());

    const conversation: Conversation = {
      conversationId,
      participantId: otherUserId,
      participantUsername: otherUsername,
      createdAt: metadata.created_at,
      lastMessageAt: Date.now(),
      unreadCount: 0
    };

    set(state => ({
      conversations: [conversation, ...state.conversations],
      activeConversationId: conversationId
    }));

    return conversation;
  },

  setActiveConversation: (conversationId) => {
    set({ activeConversationId: conversationId });

    // Clear unread count when conversation becomes active
    if (conversationId) {
      set(state => ({
        conversations: state.conversations.map(c =>
          c.conversationId === conversationId ? { ...c, unreadCount: 0 } : c
        )
      }));
    }
  },

  updateLastMessage: (conversationId, timestamp) => {
    set(state => ({
      conversations: state.conversations.map(c =>
        c.conversationId === conversationId
          ? { ...c, lastMessageAt: timestamp }
          : c
      ).sort((a, b) => b.lastMessageAt - a.lastMessageAt)
    }));
  },

  incrementUnread: (conversationId) => {
    const { activeConversationId } = get();
    // Don't increment if this is the active conversation
    if (conversationId === activeConversationId) return;

    set(state => ({
      conversations: state.conversations.map(c =>
        c.conversationId === conversationId
          ? { ...c, unreadCount: c.unreadCount + 1 }
          : c
      )
    }));
  },

  getConversation: (conversationId) => {
    return get().conversations.find(c => c.conversationId === conversationId);
  },

  getConversationByParticipant: (participantId) => {
    return get().conversations.find(c => c.participantId === participantId);
  },

  /**
   * Discover conversations from server
   * Fetches all conversation IDs where the user is a participant
   * Returns list of discovered conversation IDs
   */
  discoverConversations: async (myUserId, decryptFn) => {
    const { conversations: existingConversations } = get();
    const existingIds = new Set(existingConversations.map(c => c.conversationId));

    try {
      // Fetch conversation IDs from server (API still uses 'threads' endpoint)
      const conversationIds = await apiDiscoverThreads();

      // Filter out conversations we already have
      const newConversationIds = conversationIds.filter(id => !existingIds.has(id));

      // Backfill missing thread metadata from server.
      if (newConversationIds.length > 0) {
        const syncService = getSyncService();
        const serverThreads = await syncService.queryThreads(newConversationIds);
        for (const thread of serverThreads) {
          await saveThread(
            thread.id,
            { ciphertext: thread.ciphertext, iv: thread.iv },
            new Date(thread.created_at).getTime()
          );
        }
      }

      // For each new conversation, try to load from local storage
      const newConversations: Conversation[] = [];

      for (const conversationId of newConversationIds) {
        try {
          const stored = await loadThread(conversationId);
          if (stored) {
            const metadata = await decryptFn(stored.encrypted);
            // Find the other participant
            const otherParticipant = metadata.participants.find((p: string) => p !== myUserId);

            if (otherParticipant) {
              newConversations.push({
                conversationId,
                participantId: otherParticipant,
                participantUsername: 'Unknown', // Will update on lookup
                createdAt: metadata.created_at,
                lastMessageAt: stored.lastMessageAt,
                unreadCount: 0
              });
            }
          }
        } catch (e) {
          console.warn(`Could not load conversation ${conversationId}`, e);
        }
      }

      if (newConversations.length > 0) {
        set(state => ({
          conversations: [...state.conversations, ...newConversations].sort((a, b) => b.lastMessageAt - a.lastMessageAt)
        }));
      }

      return newConversationIds;
    } catch (err) {
      console.error('Failed to discover conversations', err);
      return [];
    }
  },

  /**
   * Handle message from unknown conversation (auto-discovery via WebSocket)
   * Called when receiving a message for a conversation we don't have locally
   */
  handleUnknownConversation: async (conversationId, myUserId, senderId, decryptFn) => {
    const { conversations } = get();

    // Check if we already have this conversation
    if (conversations.some(c => c.conversationId === conversationId)) {
      return;
    }

    // Try to load conversation from server
    try {
      const stored = await loadThread(conversationId);
      if (stored) {
        const metadata = await decryptFn(stored.encrypted);
        // Verify this conversation involves us and the sender
        const participants = metadata.participants.sort();
        const expectedParticipants = [myUserId, senderId].sort();

        if (participants[0] === expectedParticipants[0] && participants[1] === expectedParticipants[1]) {
          // Determine the other participant
          const otherParticipant = participants.find((p: string) => p !== myUserId);

          if (otherParticipant) {
            const newConversation: Conversation = {
              conversationId,
              participantId: otherParticipant,
              participantUsername: 'Unknown', // Will need to look up
              createdAt: metadata.created_at,
              lastMessageAt: Date.now(),
              unreadCount: 1 // First message!
            };

            set(state => ({
              conversations: [newConversation, ...state.conversations].sort((a, b) => b.lastMessageAt - a.lastMessageAt)
            }));
          }
        }
      }
    } catch (e) {
      console.error('Failed to handle unknown conversation', e);
    }
  },

  /**
   * Add a new conversation to the store
   * Used when auto-discovering via WebSocket
   */
  addConversation: (conversation: Conversation) => {
    set(state => {
      // Check for duplicates
      if (state.conversations.some(c => c.conversationId === conversation.conversationId)) {
        return state;
      }
      return {
        conversations: [conversation, ...state.conversations].sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      };
    });
  }
}));
