/**
 * Thread state management
 */

import { create } from 'zustand';
import { saveThread, loadThreads } from '../services/storage';
import type { EncryptedData, ThreadMetadata } from '../types/crypto';

interface Thread {
  threadId: string;
  participantUUID: string; // The other participant (not self)
  participantName: string;
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
    myUUID: string,
    contacts: Array<{ uuid: string; displayName: string }>,
    computeThreadId: (uuid1: string, uuid2: string) => Promise<string>,
    decryptFn: (encrypted: EncryptedData) => Promise<any>
  ) => Promise<void>;
  createThread: (
    myUUID: string,
    myName: string,
    otherUUID: string,
    otherName: string,
    computeThreadId: (uuid1: string, uuid2: string) => Promise<string>,
    encryptFn: (data: any) => Promise<EncryptedData>
  ) => Promise<Thread>;
  setActiveThread: (threadId: string | null) => void;
  updateLastMessage: (threadId: string, timestamp: number) => void;
  getThread: (threadId: string) => Thread | undefined;
}

export const useThreadStore = create<ThreadState>((set, get) => ({
  threads: [],
  activeThreadId: null,
  isLoading: false,

  loadAllThreads: async (myUUID, contacts, computeThreadId, decryptFn) => {
    set({ isLoading: true });

    try {
      // Compute expected thread IDs for all contacts
      const expectedThreadIds = new Map<string, { uuid: string; displayName: string }>();

      for (const contact of contacts) {
        const threadId = await computeThreadId(myUUID, contact.uuid);
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
              participantUUID: contact.uuid,
              participantName: contact.displayName,
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

  createThread: async (myUUID, myName, otherUUID, otherName, computeThreadId, encryptFn) => {
    const threadId = await computeThreadId(myUUID, otherUUID);

    // Check if thread already exists
    const existing = get().threads.find(t => t.threadId === threadId);
    if (existing) {
      set({ activeThreadId: threadId });
      return existing;
    }

    // Create thread metadata
    const metadata: ThreadMetadata = {
      participants: [myUUID, otherUUID].sort() as [string, string],
      created_by: {
        user_id: myUUID,
        display_name: myName
      },
      created_at: Date.now()
    };

    // Encrypt and save locally
    const encrypted = await encryptFn(metadata);
    await saveThread(threadId, encrypted, Date.now());

    const thread: Thread = {
      threadId,
      participantUUID: otherUUID,
      participantName: otherName,
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

  getThread: (threadId) => {
    return get().threads.find(t => t.threadId === threadId);
  }
}));
