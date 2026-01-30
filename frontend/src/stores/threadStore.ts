/**
 * Thread state management
 */

import { create } from 'zustand';
import { saveThread, loadThreads, loadThread } from '../services/storage';
import { discoverThreads as apiDiscoverThreads } from '../services/api';
import type { EncryptedData, ThreadMetadata } from '../types/crypto';

export interface Thread {
  threadId: string;
  participantId: string;       // The other participant's user ID (was participantUUID)
  participantUsername: string; // The other participant's username (was participantName)
  createdAt: number;
  lastMessageAt: number;
  unreadCount: number;
}

interface ThreadState {
  threads: Thread[];
  activeThreadId: string | null;
  isLoading: boolean;

  // Actions
  loadAllThreads: (
    myUserId: string,
    contacts: Array<{ id: string; username: string }>,
    computeThreadId: (id1: string, id2: string) => Promise<string>,
    decryptFn: (encrypted: EncryptedData) => Promise<any>
  ) => Promise<void>;
  discoverThreads: (
    myUserId: string,
    decryptFn: (encrypted: EncryptedData) => Promise<any>
  ) => Promise<string[]>;
  handleUnknownThread: (
    threadId: string,
    myUserId: string,
    decryptFn: (encrypted: EncryptedData) => Promise<any>
  ) => Promise<void>;
  createThread: (
    myUserId: string,
    myUsername: string,
    otherUserId: string,
    otherUsername: string,
    computeThreadId: (id1: string, id2: string) => Promise<string>,
    encryptFn: (data: any) => Promise<EncryptedData>
  ) => Promise<Thread>;
  setActiveThread: (threadId: string | null) => void;
  updateLastMessage: (threadId: string, timestamp: number) => void;
  incrementUnread: (threadId: string) => void;
  getThread: (threadId: string) => Thread | undefined;
  getThreadByParticipant: (participantId: string) => Thread | undefined;
}

export const useThreadStore = create<ThreadState>((set, get) => ({
  threads: [],
  activeThreadId: null,
  isLoading: false,

  loadAllThreads: async (myUserId, contacts, computeThreadId, decryptFn) => {
    set({ isLoading: true });

    try {
      // Compute expected thread IDs for all contacts
      const expectedThreadIds = new Map<string, { id: string; username: string }>();

      for (const contact of contacts) {
        const threadId = await computeThreadId(myUserId, contact.id);
        expectedThreadIds.set(threadId, contact);
      }

      // Load stored threads
      const stored = await loadThreads();
      const threads: Thread[] = [];

      for (const { threadId, encrypted, lastMessageAt } of stored) {
        // Check if this thread belongs to a known contact
        const contact = expectedThreadIds.get(threadId);

        if (contact) {
          try {
            const metadata = await decryptFn(encrypted);
            threads.push({
              threadId,
              participantId: contact.id,
              participantUsername: contact.username,
              createdAt: metadata.created_at,
              lastMessageAt,
              unreadCount: 0
            });
          } catch {
            // Thread from different vault, skip
          }
        }
      }

      // Sort by last message time
      threads.sort((a, b) => b.lastMessageAt - a.lastMessageAt);

      set({ threads, isLoading: false });
    } catch (err) {
      console.error('Failed to load threads', err);
      set({ isLoading: false });
    }
  },

  createThread: async (myUserId, myUsername, otherUserId, otherUsername, computeThreadId, encryptFn) => {
    const threadId = await computeThreadId(myUserId, otherUserId);

    // Check if thread already exists
    const existing = get().threads.find(t => t.threadId === threadId);
    if (existing) {
      set({ activeThreadId: threadId });
      return existing;
    }

    // Create thread metadata
    const metadata: ThreadMetadata = {
      participants: [myUserId, otherUserId].sort() as [string, string],
      created_by: {
        user_id: myUserId,
        display_name: myUsername
      },
      created_at: Date.now()
    };

    // Encrypt and save locally
    const encrypted = await encryptFn(metadata);
    await saveThread(threadId, encrypted, Date.now());

    const thread: Thread = {
      threadId,
      participantId: otherUserId,
      participantUsername: otherUsername,
      createdAt: metadata.created_at,
      lastMessageAt: Date.now(),
      unreadCount: 0
    };

    set(state => ({
      threads: [thread, ...state.threads],
      activeThreadId: threadId
    }));

    return thread;
  },

  setActiveThread: (threadId) => {
    set({ activeThreadId: threadId });

    // Clear unread count when thread becomes active
    if (threadId) {
      set(state => ({
        threads: state.threads.map(t =>
          t.threadId === threadId ? { ...t, unreadCount: 0 } : t
        )
      }));
    }
  },

  updateLastMessage: (threadId, timestamp) => {
    set(state => ({
      threads: state.threads.map(t =>
        t.threadId === threadId
          ? { ...t, lastMessageAt: timestamp }
          : t
      ).sort((a, b) => b.lastMessageAt - a.lastMessageAt)
    }));
  },

  incrementUnread: (threadId) => {
    const { activeThreadId } = get();
    // Don't increment if this is the active thread
    if (threadId === activeThreadId) return;

    set(state => ({
      threads: state.threads.map(t =>
        t.threadId === threadId
          ? { ...t, unreadCount: t.unreadCount + 1 }
          : t
      )
    }));
  },

  getThread: (threadId) => {
    return get().threads.find(t => t.threadId === threadId);
  },

  getThreadByParticipant: (participantId) => {
    return get().threads.find(t => t.participantId === participantId);
  },

  /**
   * Discover threads from server
   * Fetches all thread IDs where the user is a participant
   * Returns list of discovered thread IDs
   */
  discoverThreads: async (myUserId, decryptFn) => {
    const { threads: existingThreads } = get();
    const existingIds = new Set(existingThreads.map(t => t.threadId));

    try {
      // Fetch thread IDs from server
      const threadIds = await apiDiscoverThreads();

      // Filter out threads we already have
      const newThreadIds = threadIds.filter(id => !existingIds.has(id));

      // For each new thread, try to load from local storage
      const newThreads: Thread[] = [];

      for (const threadId of newThreadIds) {
        try {
          const stored = await loadThread(threadId);
          if (stored) {
            const metadata = await decryptFn(stored.encrypted);
            // Find the other participant
            const otherParticipant = metadata.participants.find((p: string) => p !== myUserId);

            if (otherParticipant) {
              newThreads.push({
                threadId,
                participantId: otherParticipant,
                participantUsername: 'Unknown', // Will update on lookup
                createdAt: metadata.created_at,
                lastMessageAt: stored.lastMessageAt,
                unreadCount: 0
              });
            }
          }
        } catch (e) {
          console.warn(`Could not load thread ${threadId}`, e);
        }
      }

      if (newThreads.length > 0) {
        set(state => ({
          threads: [...state.threads, ...newThreads].sort((a, b) => b.lastMessageAt - a.lastMessageAt)
        }));
      }

      return newThreadIds;
    } catch (err) {
      console.error('Failed to discover threads', err);
      return [];
    }
  },

  /**
   * Handle message from unknown thread
   * Called when receiving a message for a thread we don't have locally
   */
  handleUnknownThread: async (threadId, myUserId, decryptFn) => {
    const { threads } = get();

    // Check if we already have this thread
    if (threads.some(t => t.threadId === threadId)) {
      return;
    }

    // Try to load thread from server
    try {
      const stored = await loadThread(threadId);
      if (stored) {
        const metadata = await decryptFn(stored.encrypted);
        const otherParticipant = metadata.participants.find((p: string) => p !== myUserId);

        if (otherParticipant) {
          const newThread: Thread = {
            threadId,
            participantId: otherParticipant,
            participantUsername: 'Unknown', // Will need to look up
            createdAt: metadata.created_at,
            lastMessageAt: Date.now(),
            unreadCount: 1 // First message!
          };

          set(state => ({
            threads: [newThread, ...state.threads].sort((a, b) => b.lastMessageAt - a.lastMessageAt)
          }));
        }
      }
    } catch (e) {
      console.error('Failed to handle unknown thread', e);
    }
  }
}));
