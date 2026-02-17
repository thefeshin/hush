/**
 * Conversation state management
 */

import { create } from 'zustand';
import { saveConversation, loadConversations, loadConversation } from '../services/storage';
import { discoverConversations as apiDiscoverConversations } from '../services/api';
import { getSyncService } from '../services/sync';
import { useContactStore } from './contactStore';
import type { EncryptedData, ConversationMetadata } from '../types/crypto';

export interface Conversation {
  conversationId: string;
  kind: 'direct' | 'group';
  participantId: string;       // The other participant's user ID (direct only)
  participantUsername: string; // The other participant's username OR group name
  keyEpoch?: number;
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
    decryptFn: (encrypted: EncryptedData) => Promise<any>
  ) => Promise<void>;
  discoverConversations: () => Promise<string[]>;
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
  upsertConversation: (conversation: Conversation) => void;
  addConversation: (conversation: Conversation) => void;
}

function isPlaceholderName(name: string, participantId: string): boolean {
  return !name || name === 'Unknown' || name === participantId;
}

function mergeConversationLists(existing: Conversation[], incoming: Conversation[]): Conversation[] {
  const byId = new Map<string, Conversation>();

  for (const conversation of existing) {
    byId.set(conversation.conversationId, conversation);
  }

  for (const conversation of incoming) {
    const current = byId.get(conversation.conversationId);
    if (!current) {
      byId.set(conversation.conversationId, conversation);
      continue;
    }

    const participantId = conversation.participantId || current.participantId;
    const incomingName = conversation.participantUsername || '';
    const currentName = current.participantUsername || '';
    const participantUsername = !isPlaceholderName(incomingName, participantId)
      ? incomingName
      : (!isPlaceholderName(currentName, participantId) ? currentName : (incomingName || currentName || participantId));

    byId.set(conversation.conversationId, {
      ...current,
      ...conversation,
      participantId,
      participantUsername,
      createdAt: Math.min(current.createdAt, conversation.createdAt),
      lastMessageAt: Math.max(current.lastMessageAt, conversation.lastMessageAt),
      unreadCount: Math.max(current.unreadCount, conversation.unreadCount)
    });
  }

  return Array.from(byId.values()).sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  isLoading: false,

  loadAllConversations: async (myUserId, contacts, decryptFn) => {
    set({ isLoading: true });

    try {
      const contactById = new Map(contacts.map(contact => [contact.id, contact.username]));

      const stored = await loadConversations();
      const conversations: Conversation[] = [];

      for (const { conversationId, encrypted, lastMessageAt } of stored) {
        try {
          const metadata = await decryptFn(encrypted);
          const participants: string[] = Array.isArray(metadata?.participants) ? metadata.participants : [];
          const kind: 'direct' | 'group' = metadata?.kind === 'group' ? 'group' : 'direct';
          const participantId = kind === 'group'
            ? ''
            : (participants.find((participant) => participant !== myUserId) || '');

          if (kind === 'direct' && !participantId) {
            continue;
          }

          const participantUsername = kind === 'group'
            ? (metadata?.group_name || `Group ${conversationId.slice(0, 8)}`)
            : (
              contactById.get(participantId)
              || (metadata?.created_by?.user_id === participantId ? metadata?.created_by?.display_name : '')
              || participantId
            );

          conversations.push({
            conversationId,
            kind,
            participantId,
            participantUsername,
            keyEpoch: metadata?.key_epoch,
            createdAt: metadata?.created_at || lastMessageAt,
            lastMessageAt,
            unreadCount: 0
          });
        } catch {
          // Conversation from different vault or invalid metadata, skip.
        }
      }

      set(state => ({
        conversations: mergeConversationLists(state.conversations, conversations),
        isLoading: false
      }));
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
    const metadata: ConversationMetadata = {
      participants: [myUserId, otherUserId].sort() as [string, string],
      created_by: {
        user_id: myUserId,
        display_name: myUsername
      },
      created_at: Date.now()
    };

    // Encrypt and save locally
    const encrypted = await encryptFn(metadata);
    await saveConversation(conversationId, encrypted, Date.now());

    const conversation: Conversation = {
      conversationId,
      kind: 'direct',
      participantId: otherUserId,
      participantUsername: otherUsername,
      createdAt: metadata.created_at,
      lastMessageAt: Date.now(),
      unreadCount: 0
    };

    set(state => ({
      conversations: mergeConversationLists(state.conversations, [conversation]),
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
  discoverConversations: async () => {
    const contacts = useContactStore.getState().contacts;
    const contactById = new Map(contacts.map(contact => [contact.id, contact.username]));
    const existingByConversationId = new Map(
      get().conversations.map(conversation => [conversation.conversationId, conversation])
    );

    try {
      const discovered = await apiDiscoverConversations();
      const discoveredIds = discovered.map(item => item.conversation_id);
      if (discoveredIds.length === 0) {
        return [];
      }

      const syncService = getSyncService();
      const serverConversations = await syncService.queryConversations(discoveredIds);
      const serverCreatedAtById = new Map(
        serverConversations.map(item => [item.id, new Date(item.created_at).getTime()])
      );

      const newConversations: Conversation[] = [];
      for (const item of discovered) {
        const conversationId = item.conversation_id;
        const existingConversation = existingByConversationId.get(conversationId);
        const participantId = item.other_user_id || existingConversation?.participantId || '';
        const kind: 'direct' | 'group' = item.kind === 'group' ? 'group' : 'direct';

        if (!conversationId || (kind === 'direct' && !participantId)) {
          continue;
        }

        const stored = await loadConversation(conversationId);
        const lastMessageAt = stored?.lastMessageAt || serverCreatedAtById.get(conversationId) || Date.now();
        const participantUsername = kind === 'group'
          ? (item.group_name || existingConversation?.participantUsername || `Group ${conversationId.slice(0, 8)}`)
          : (
            contactById.get(participantId)
            || item.other_username
            || existingConversation?.participantUsername
            || participantId
          );

        newConversations.push({
          conversationId,
          kind,
          participantId,
          participantUsername,
          keyEpoch: existingConversation?.keyEpoch,
          createdAt: serverCreatedAtById.get(conversationId) || Date.now(),
          lastMessageAt,
          unreadCount: 0
        });
      }

      if (newConversations.length > 0) {
        set(state => ({
          conversations: mergeConversationLists(state.conversations, newConversations)
        }));
      }

      return discoveredIds;
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
      const stored = await loadConversation(conversationId);
      if (stored) {
        const metadata = await decryptFn(stored.encrypted);
        // Verify this conversation involves us and the sender
        const participants = metadata.participants.sort();
        const expectedParticipants = [myUserId, senderId].sort();

        if (participants[0] === expectedParticipants[0] && participants[1] === expectedParticipants[1]) {
          // Determine the other participant
          const otherParticipant = participants.find((p: string) => p !== myUserId);

          if (otherParticipant) {
            const participantUsername =
              metadata?.created_by?.user_id === otherParticipant
                ? metadata?.created_by?.display_name || otherParticipant
                : otherParticipant;

            const newConversation: Conversation = {
              conversationId,
              kind: 'direct',
              participantId: otherParticipant,
              participantUsername,
              createdAt: metadata.created_at,
              lastMessageAt: Date.now(),
              unreadCount: 1
            };

            set(state => ({
              conversations: mergeConversationLists(state.conversations, [newConversation])
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
  upsertConversation: (conversation: Conversation) => {
    set(state => {
      return {
        conversations: mergeConversationLists(state.conversations, [conversation])
      };
    });
  },

  addConversation: (conversation: Conversation) => {
    get().upsertConversation(conversation);
  }
}));
