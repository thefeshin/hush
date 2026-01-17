# PHASE 07: Frontend Chat UI & Threads

## Overview
This phase implements the main chat interface including contact management, thread creation, and message display. The UI enables UUID-gated private conversations while maintaining the zero-knowledge architecture.

## Objectives
1. Contact list management (add by UUID)
2. Thread creation with specific contacts
3. Thread list display
4. Message composition and display
5. Contact state management
6. Thread state management

---

## 1. Contact Store

### File: `frontend/src/stores/contactStore.ts`

```typescript
/**
 * Contact state management
 * Contacts are other users' UUIDs with optional metadata
 */

import { create } from 'zustand';
import { saveContact, loadContacts, deleteContact } from '../services/storage';
import type { EncryptedData } from '../types/crypto';

interface Contact {
  uuid: string;
  displayName: string;
  notes?: string;
  addedAt: number;
}

interface ContactState {
  contacts: Contact[];
  isLoading: boolean;

  // Actions
  loadAllContacts: (decryptFn: (encrypted: EncryptedData) => Promise<any>) => Promise<void>;
  addContact: (
    uuid: string,
    displayName: string,
    encryptFn: (data: any) => Promise<EncryptedData>
  ) => Promise<void>;
  removeContact: (uuid: string) => Promise<void>;
  getContact: (uuid: string) => Contact | undefined;
}

export const useContactStore = create<ContactState>((set, get) => ({
  contacts: [],
  isLoading: false,

  loadAllContacts: async (decryptFn) => {
    set({ isLoading: true });

    try {
      const stored = await loadContacts();
      const contacts: Contact[] = [];

      for (const { uuid, encrypted } of stored) {
        try {
          const data = await decryptFn(encrypted);
          contacts.push({
            uuid,
            displayName: data.displayName,
            notes: data.notes,
            addedAt: data.addedAt
          });
        } catch {
          // Skip contacts that can't be decrypted
          console.warn(`Failed to decrypt contact ${uuid}`);
        }
      }

      set({ contacts, isLoading: false });
    } catch (err) {
      console.error('Failed to load contacts', err);
      set({ isLoading: false });
    }
  },

  addContact: async (uuid, displayName, encryptFn) => {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
      throw new Error('Invalid UUID format');
    }

    // Check for duplicate
    if (get().contacts.some(c => c.uuid === uuid)) {
      throw new Error('Contact already exists');
    }

    const contact: Contact = {
      uuid,
      displayName: displayName.trim(),
      addedAt: Date.now()
    };

    // Encrypt and save
    const encrypted = await encryptFn({
      displayName: contact.displayName,
      notes: contact.notes,
      addedAt: contact.addedAt
    });

    await saveContact(uuid, encrypted);

    set(state => ({
      contacts: [...state.contacts, contact]
    }));
  },

  removeContact: async (uuid) => {
    await deleteContact(uuid);
    set(state => ({
      contacts: state.contacts.filter(c => c.uuid !== uuid)
    }));
  },

  getContact: (uuid) => {
    return get().contacts.find(c => c.uuid === uuid);
  }
}));
```

---

## 2. Thread Store

### File: `frontend/src/stores/threadStore.ts`

```typescript
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
```

---

## 3. Message Store

### File: `frontend/src/stores/messageStore.ts`

```typescript
/**
 * Message state management
 */

import { create } from 'zustand';
import { saveMessage, loadMessages } from '../services/storage';
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

      for (const { id, encrypted, createdAt } of stored) {
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
```

---

## 4. Main Chat Component

### File: `frontend/src/components/Chat.tsx`

```typescript
/**
 * Main chat interface
 */

import React, { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useContactStore } from '../stores/contactStore';
import { useThreadStore } from '../stores/threadStore';
import { useCrypto } from '../crypto/CryptoContext';
import { Sidebar } from './Sidebar';
import { ThreadView } from './ThreadView';
import { EmptyState } from './EmptyState';

export function Chat() {
  const identity = useAuthStore(state => state.identity);
  const { contacts, loadAllContacts } = useContactStore();
  const { threads, activeThreadId, loadAllThreads } = useThreadStore();
  const { decryptIdentity, getThreadId } = useCrypto();

  // Load contacts on mount
  useEffect(() => {
    if (identity) {
      loadAllContacts(decryptIdentity);
    }
  }, [identity]);

  // Load threads after contacts are loaded
  useEffect(() => {
    if (identity && contacts.length > 0) {
      loadAllThreads(
        identity.userId,
        contacts,
        getThreadId,
        decryptIdentity
      );
    }
  }, [identity, contacts]);

  if (!identity) {
    return <div>Loading...</div>;
  }

  return (
    <div className="chat-container">
      <Sidebar />
      <main className="chat-main">
        {activeThreadId ? (
          <ThreadView threadId={activeThreadId} />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}
```

---

## 5. Sidebar Component

### File: `frontend/src/components/Sidebar.tsx`

```typescript
/**
 * Sidebar with contacts and threads
 */

import React, { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useContactStore } from '../stores/contactStore';
import { useThreadStore } from '../stores/threadStore';
import { useCrypto } from '../crypto/CryptoContext';
import { AddContactModal } from './AddContactModal';
import { UUIDShare } from './UUIDShare';

export function Sidebar() {
  const [showAddContact, setShowAddContact] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts'>('chats');

  const identity = useAuthStore(state => state.identity);
  const { logout } = useAuthStore();
  const { lockVault } = useCrypto();

  const { threads, activeThreadId, setActiveThread } = useThreadStore();
  const { contacts } = useContactStore();

  const handleLogout = () => {
    lockVault();
    logout();
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();

    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1 className="app-title">HUSH</h1>
        <div className="header-actions">
          <button
            onClick={() => setShowProfile(!showProfile)}
            className="icon-button"
            title="Your Profile"
          >
            <span>👤</span>
          </button>
          <button
            onClick={handleLogout}
            className="icon-button"
            title="Lock Vault"
          >
            <span>🔒</span>
          </button>
        </div>
      </div>

      {showProfile && (
        <div className="profile-panel">
          <UUIDShare />
        </div>
      )}

      <div className="sidebar-tabs">
        <button
          className={`tab ${activeTab === 'chats' ? 'active' : ''}`}
          onClick={() => setActiveTab('chats')}
        >
          Chats
        </button>
        <button
          className={`tab ${activeTab === 'contacts' ? 'active' : ''}`}
          onClick={() => setActiveTab('contacts')}
        >
          Contacts
        </button>
      </div>

      <div className="sidebar-content">
        {activeTab === 'chats' && (
          <div className="thread-list">
            {threads.length === 0 ? (
              <div className="empty-list">
                <p>No conversations yet</p>
                <p className="hint">Add a contact to start chatting</p>
              </div>
            ) : (
              threads.map(thread => (
                <div
                  key={thread.threadId}
                  className={`thread-item ${thread.threadId === activeThreadId ? 'active' : ''}`}
                  onClick={() => setActiveThread(thread.threadId)}
                >
                  <div className="thread-avatar">
                    {thread.participantName[0].toUpperCase()}
                  </div>
                  <div className="thread-info">
                    <div className="thread-name">{thread.participantName}</div>
                    <div className="thread-time">{formatTime(thread.lastMessageAt)}</div>
                  </div>
                  {thread.unreadCount > 0 && (
                    <div className="unread-badge">{thread.unreadCount}</div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'contacts' && (
          <div className="contact-list">
            <button
              className="add-contact-button"
              onClick={() => setShowAddContact(true)}
            >
              + Add Contact
            </button>

            {contacts.length === 0 ? (
              <div className="empty-list">
                <p>No contacts yet</p>
                <p className="hint">Add someone by their UUID</p>
              </div>
            ) : (
              contacts.map(contact => (
                <ContactItem
                  key={contact.uuid}
                  contact={contact}
                  identity={identity!}
                />
              ))
            )}
          </div>
        )}
      </div>

      {showAddContact && (
        <AddContactModal onClose={() => setShowAddContact(false)} />
      )}
    </aside>
  );
}

// Contact item with ability to start chat
function ContactItem({
  contact,
  identity
}: {
  contact: { uuid: string; displayName: string };
  identity: { userId: string; displayName: string };
}) {
  const { createThread } = useThreadStore();
  const { getThreadId, encryptIdentity } = useCrypto();

  const handleStartChat = async () => {
    await createThread(
      identity.userId,
      identity.displayName,
      contact.uuid,
      contact.displayName,
      getThreadId,
      encryptIdentity
    );
  };

  return (
    <div className="contact-item">
      <div className="contact-avatar">
        {contact.displayName[0].toUpperCase()}
      </div>
      <div className="contact-info">
        <div className="contact-name">{contact.displayName}</div>
        <div className="contact-uuid">{contact.uuid.slice(0, 8)}...</div>
      </div>
      <button
        className="start-chat-button"
        onClick={handleStartChat}
        title="Start chat"
      >
        💬
      </button>
    </div>
  );
}
```

---

## 6. Add Contact Modal

### File: `frontend/src/components/AddContactModal.tsx`

```typescript
/**
 * Modal for adding a new contact by UUID
 */

import React, { useState } from 'react';
import { useContactStore } from '../stores/contactStore';
import { useAuthStore } from '../stores/authStore';
import { useCrypto } from '../crypto/CryptoContext';

interface Props {
  onClose: () => void;
}

export function AddContactModal({ onClose }: Props) {
  const [uuid, setUuid] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const identity = useAuthStore(state => state.identity);
  const { addContact } = useContactStore();
  const { encryptIdentity } = useCrypto();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUuid = uuid.trim().toLowerCase();
    const trimmedName = displayName.trim();

    // Validate
    if (!trimmedUuid) {
      setError('Please enter a UUID');
      return;
    }

    if (!trimmedName) {
      setError('Please enter a display name');
      return;
    }

    // Check if trying to add self
    if (trimmedUuid === identity?.userId) {
      setError("You can't add yourself as a contact");
      return;
    }

    setIsAdding(true);

    try {
      await addContact(trimmedUuid, trimmedName, encryptIdentity);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add contact');
      setIsAdding(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Contact</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="uuid">Their UUID</label>
            <input
              id="uuid"
              type="text"
              value={uuid}
              onChange={e => setUuid(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              autoFocus
              disabled={isAdding}
            />
            <p className="input-hint">
              Ask them to share their UUID from their profile
            </p>
          </div>

          <div className="input-group">
            <label htmlFor="name">Display Name</label>
            <input
              id="name"
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="What should we call them?"
              maxLength={50}
              disabled={isAdding}
            />
          </div>

          {error && (
            <div className="error-message">{error}</div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={isAdding}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={isAdding || !uuid.trim() || !displayName.trim()}
            >
              {isAdding ? 'Adding...' : 'Add Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

---

## 7. Thread View Component

### File: `frontend/src/components/ThreadView.tsx`

```typescript
/**
 * Thread view with messages and composer
 */

import React, { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useThreadStore } from '../stores/threadStore';
import { useMessageStore } from '../stores/messageStore';
import { useCrypto } from '../crypto/CryptoContext';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';

interface Props {
  threadId: string;
}

export function ThreadView({ threadId }: Props) {
  const identity = useAuthStore(state => state.identity);
  const { getThread } = useThreadStore();
  const { loadMessagesForThread, getMessages } = useMessageStore();
  const { getThreadKey, decryptMessage } = useCrypto();

  const thread = getThread(threadId);
  const messages = getMessages(threadId);

  // Load messages when thread changes
  useEffect(() => {
    if (identity && thread) {
      loadThreadMessages();
    }
  }, [threadId, identity, thread]);

  const loadThreadMessages = async () => {
    if (!identity || !thread) return;

    const threadKey = await getThreadKey(identity.userId, thread.participantUUID);

    await loadMessagesForThread(threadId, async (encrypted) => {
      return decryptMessage(threadKey, encrypted);
    });
  };

  if (!thread) {
    return <div className="thread-not-found">Thread not found</div>;
  }

  return (
    <div className="thread-view">
      <div className="thread-header">
        <div className="thread-avatar">
          {thread.participantName[0].toUpperCase()}
        </div>
        <div className="thread-title">
          <h2>{thread.participantName}</h2>
          <span className="thread-uuid">{thread.participantUUID.slice(0, 8)}...</span>
        </div>
      </div>

      <MessageList
        messages={messages}
        currentUserId={identity?.userId || ''}
      />

      <MessageComposer
        threadId={threadId}
        participantUUID={thread.participantUUID}
      />
    </div>
  );
}
```

---

## 8. Message List Component

### File: `frontend/src/components/MessageList.tsx`

```typescript
/**
 * Message list with auto-scroll
 */

import React, { useEffect, useRef } from 'react';

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'failed';
}

interface Props {
  messages: Message[];
  currentUserId: string;
}

export function MessageList({ messages, currentUserId }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (messages.length === 0) {
    return (
      <div className="message-list empty">
        <div className="empty-messages">
          <p>No messages yet</p>
          <p className="hint">Send a message to start the conversation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="message-list" ref={listRef}>
      {messages.map((message, index) => {
        const isOwn = message.senderId === currentUserId;
        const showSender = !isOwn && (
          index === 0 ||
          messages[index - 1].senderId !== message.senderId
        );

        return (
          <div
            key={message.id}
            className={`message ${isOwn ? 'own' : 'other'} ${message.status}`}
          >
            {showSender && (
              <div className="message-sender">{message.senderName}</div>
            )}
            <div className="message-bubble">
              <div className="message-content">{message.content}</div>
              <div className="message-meta">
                <span className="message-time">{formatTime(message.timestamp)}</span>
                {isOwn && (
                  <span className="message-status">
                    {message.status === 'sending' && '⏳'}
                    {message.status === 'sent' && '✓'}
                    {message.status === 'failed' && '⚠️'}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
```

---

## 9. Message Composer Component

### File: `frontend/src/components/MessageComposer.tsx`

```typescript
/**
 * Message input and send functionality
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useMessageStore } from '../stores/messageStore';
import { useThreadStore } from '../stores/threadStore';
import { useCrypto } from '../crypto/CryptoContext';
import { useWebSocket } from '../hooks/useWebSocket';
import type { MessagePayload } from '../types/crypto';

interface Props {
  threadId: string;
  participantUUID: string;
}

export function MessageComposer({ threadId, participantUUID }: Props) {
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const identity = useAuthStore(state => state.identity);
  const { addPendingMessage, markMessageSent, markMessageFailed } = useMessageStore();
  const { updateLastMessage } = useThreadStore();
  const { getThreadKey, encryptMessage } = useCrypto();
  const { sendMessage } = useWebSocket();

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedContent = content.trim();
    if (!trimmedContent || !identity || isSending) return;

    setIsSending(true);
    setContent('');

    // Add pending message immediately
    const tempId = addPendingMessage(
      threadId,
      trimmedContent,
      identity.userId,
      identity.displayName
    );

    try {
      // Create message payload
      const payload: MessagePayload = {
        sender_id: identity.userId,
        sender_name: identity.displayName,
        content: trimmedContent,
        timestamp: Date.now()
      };

      // Get thread key and encrypt
      const threadKey = await getThreadKey(identity.userId, participantUUID);
      const encrypted = await encryptMessage(threadKey, JSON.stringify(payload));

      // Send via WebSocket
      const result = await sendMessage(threadId, encrypted);

      // Update message with real ID
      markMessageSent(tempId, result.id);
      updateLastMessage(threadId, Date.now());
    } catch (err) {
      console.error('Failed to send message', err);
      markMessageFailed(tempId);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form className="message-composer" onSubmit={handleSubmit}>
      <textarea
        ref={inputRef}
        value={content}
        onChange={e => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        rows={1}
        disabled={isSending}
      />
      <button
        type="submit"
        className="send-button"
        disabled={!content.trim() || isSending}
      >
        {isSending ? '...' : '➤'}
      </button>
    </form>
  );
}
```

---

## 10. Empty State Component

### File: `frontend/src/components/EmptyState.tsx`

```typescript
/**
 * Empty state when no thread is selected
 */

import React from 'react';

export function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state-content">
        <div className="empty-icon">💬</div>
        <h2>Welcome to HUSH</h2>
        <p>Select a conversation or start a new one</p>
        <ul className="getting-started">
          <li>Add a contact using their UUID</li>
          <li>Click on a contact to start chatting</li>
          <li>All messages are end-to-end encrypted</li>
        </ul>
      </div>
    </div>
  );
}
```

---

## 11. Additional Styles

### File: `frontend/src/styles/chat.css`

```css
/* Chat Layout */
.chat-container {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* Sidebar */
.sidebar {
  width: 320px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--border);
}

.app-title {
  font-size: 1.5rem;
  color: var(--accent);
  letter-spacing: 0.2rem;
}

.sidebar-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}

.tab {
  flex: 1;
  padding: 0.75rem;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
}

.tab.active {
  color: var(--text-primary);
  border-bottom: 2px solid var(--accent);
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
}

/* Thread List */
.thread-item {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}

.thread-item:hover {
  background: var(--bg-tertiary);
}

.thread-item.active {
  background: var(--bg-tertiary);
  border-left: 3px solid var(--accent);
}

.thread-avatar,
.contact-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  margin-right: 0.75rem;
}

/* Main Chat Area */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.thread-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.thread-header {
  display: flex;
  align-items: center;
  padding: 1rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}

/* Message List */
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.message {
  max-width: 70%;
  display: flex;
  flex-direction: column;
}

.message.own {
  align-self: flex-end;
}

.message.other {
  align-self: flex-start;
}

.message-bubble {
  padding: 0.75rem 1rem;
  border-radius: 1rem;
}

.message.own .message-bubble {
  background: var(--accent);
  border-bottom-right-radius: 0.25rem;
}

.message.other .message-bubble {
  background: var(--bg-secondary);
  border-bottom-left-radius: 0.25rem;
}

.message-sender {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-bottom: 0.25rem;
}

.message-meta {
  display: flex;
  gap: 0.5rem;
  font-size: 0.7rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}

/* Message Composer */
.message-composer {
  display: flex;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
}

.message-composer textarea {
  flex: 1;
  padding: 0.75rem 1rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 1.5rem;
  color: var(--text-primary);
  resize: none;
  font-family: inherit;
}

.send-button {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--accent);
  border: none;
  color: white;
  cursor: pointer;
  font-size: 1.2rem;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: var(--bg-secondary);
  border-radius: 1rem;
  padding: 1.5rem;
  width: 100%;
  max-width: 400px;
  margin: 1rem;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.modal-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

/* Empty States */
.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state-content {
  text-align: center;
  padding: 2rem;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}
```

---

## 12. Verification Checklist

After implementing this phase, verify:

- [ ] Sidebar shows tabs for Chats and Contacts
- [ ] Add Contact modal appears and validates UUID
- [ ] Contacts are saved and persist across sessions
- [ ] Starting chat creates thread correctly
- [ ] Thread list shows recent conversations
- [ ] Clicking thread shows ThreadView
- [ ] Messages display with correct alignment
- [ ] Own messages appear on right, others on left
- [ ] Message composer sends messages
- [ ] Empty states show helpful guidance
