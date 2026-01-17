# PHASE 08: Real-time WebSocket Client

## Overview
This phase implements the frontend WebSocket client for real-time message delivery. The client manages connection lifecycle, automatic reconnection, message subscription, and integrates with the crypto module for end-to-end encryption.

## Objectives
1. WebSocket connection with JWT authentication
2. Automatic reconnection with exponential backoff
3. Thread subscription management
4. Real-time message sending and receiving
5. Connection state management
6. Integration with message store

---

## 1. WebSocket Service

### File: `frontend/src/services/websocket.ts`

```typescript
/**
 * WebSocket service for real-time communication
 * Handles connection, reconnection, and message routing
 */

import type { EncryptedData } from '../types/crypto';

// Message types from server
interface ServerMessage {
  type: 'subscribed' | 'unsubscribed' | 'message' | 'error' | 'heartbeat' | 'pong';
  thread_id?: string;
  id?: string;
  ciphertext?: string;
  iv?: string;
  created_at?: string;
  message?: string;
}

// Message types to server
interface ClientSubscribe {
  type: 'subscribe';
  thread_id: string;
}

interface ClientUnsubscribe {
  type: 'unsubscribe';
  thread_id: string;
}

interface ClientMessage {
  type: 'message';
  thread_id: string;
  ciphertext: string;
  iv: string;
}

interface ClientPing {
  type: 'ping';
}

type ClientPayload = ClientSubscribe | ClientUnsubscribe | ClientMessage | ClientPing;

// Event handlers
type MessageHandler = (msg: ServerMessage) => void;
type ConnectionHandler = (connected: boolean) => void;

// Connection states
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting'
}

export class WebSocketService {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private url: string;

  // Connection state
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Subscriptions
  private subscribedThreads = new Set<string>();
  private pendingSubscriptions = new Set<string>();

  // Event handlers
  private messageHandlers = new Set<MessageHandler>();
  private connectionHandlers = new Set<ConnectionHandler>();

  // Pending message callbacks
  private pendingMessages = new Map<string, {
    resolve: (result: { id: string }) => void;
    reject: (error: Error) => void;
    threadId: string;
  }>();

  // Heartbeat
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private lastPong = Date.now();

  constructor() {
    // Determine WebSocket URL based on current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = `${protocol}//${window.location.host}/ws`;
  }

  /**
   * Connect to WebSocket server
   */
  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.state === ConnectionState.CONNECTED) {
        resolve();
        return;
      }

      this.token = token;
      this.state = ConnectionState.CONNECTING;

      try {
        this.ws = new WebSocket(`${this.url}?token=${token}`);

        this.ws.onopen = () => {
          this.state = ConnectionState.CONNECTED;
          this.reconnectAttempts = 0;
          this.notifyConnectionHandlers(true);
          this.startHeartbeat();
          this.resubscribeAll();
          resolve();
        };

        this.ws.onclose = (event) => {
          this.handleDisconnect(event.code, event.reason);
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          if (this.state === ConnectionState.CONNECTING) {
            reject(new Error('Connection failed'));
          }
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

      } catch (error) {
        this.state = ConnectionState.DISCONNECTED;
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.stopHeartbeat();
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnection
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.state = ConnectionState.DISCONNECTED;
    this.subscribedThreads.clear();
    this.pendingSubscriptions.clear();
    this.notifyConnectionHandlers(false);
  }

  /**
   * Subscribe to a thread for real-time updates
   */
  subscribe(threadId: string): void {
    if (this.subscribedThreads.has(threadId)) {
      return;
    }

    this.pendingSubscriptions.add(threadId);

    if (this.state === ConnectionState.CONNECTED && this.ws) {
      this.send({ type: 'subscribe', thread_id: threadId });
    }
  }

  /**
   * Unsubscribe from a thread
   */
  unsubscribe(threadId: string): void {
    this.subscribedThreads.delete(threadId);
    this.pendingSubscriptions.delete(threadId);

    if (this.state === ConnectionState.CONNECTED && this.ws) {
      this.send({ type: 'unsubscribe', thread_id: threadId });
    }
  }

  /**
   * Send an encrypted message
   */
  sendMessage(threadId: string, encrypted: EncryptedData): Promise<{ id: string }> {
    return new Promise((resolve, reject) => {
      if (this.state !== ConnectionState.CONNECTED || !this.ws) {
        reject(new Error('Not connected'));
        return;
      }

      // Generate temporary ID for tracking
      const tempId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Store callback
      this.pendingMessages.set(tempId, {
        resolve,
        reject,
        threadId
      });

      // Send message
      this.send({
        type: 'message',
        thread_id: threadId,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        const pending = this.pendingMessages.get(tempId);
        if (pending) {
          this.pendingMessages.delete(tempId);
          pending.reject(new Error('Message send timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Add message event handler
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Add connection state handler
   */
  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }

  // ==================== Private Methods ====================

  private send(payload: ClientPayload): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private handleMessage(data: string): void {
    try {
      const msg: ServerMessage = JSON.parse(data);

      switch (msg.type) {
        case 'subscribed':
          if (msg.thread_id) {
            this.subscribedThreads.add(msg.thread_id);
            this.pendingSubscriptions.delete(msg.thread_id);
          }
          break;

        case 'unsubscribed':
          if (msg.thread_id) {
            this.subscribedThreads.delete(msg.thread_id);
          }
          break;

        case 'message':
          this.handleIncomingMessage(msg);
          break;

        case 'heartbeat':
        case 'pong':
          this.lastPong = Date.now();
          break;

        case 'error':
          console.error('WebSocket error:', msg.message);
          break;
      }

      // Notify handlers
      this.messageHandlers.forEach(handler => handler(msg));

    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  private handleIncomingMessage(msg: ServerMessage): void {
    // Resolve any pending send for this thread
    // Note: The server echoes our own messages back
    if (msg.id && msg.thread_id) {
      // Find and resolve pending message
      for (const [tempId, pending] of this.pendingMessages) {
        if (pending.threadId === msg.thread_id) {
          this.pendingMessages.delete(tempId);
          pending.resolve({ id: msg.id });
          break;
        }
      }
    }
  }

  private handleDisconnect(code: number, reason: string): void {
    this.stopHeartbeat();
    this.ws = null;

    const wasConnected = this.state === ConnectionState.CONNECTED;
    this.state = ConnectionState.DISCONNECTED;

    if (wasConnected) {
      this.notifyConnectionHandlers(false);
    }

    // Don't reconnect if:
    // - Token is invalid (4001)
    // - Client initiated disconnect (1000)
    // - Too many attempts
    if (code === 4001 || code === 1000 || this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('WebSocket: Not reconnecting', { code, reason });
      return;
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.state = ConnectionState.RECONNECTING;
    this.reconnectAttempts++;

    // Exponential backoff: 1s, 2s, 4s, 8s, ... max 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);

    console.log(`WebSocket: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      if (this.token) {
        this.connect(this.token).catch(console.error);
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private resubscribeAll(): void {
    // Resubscribe to all previously subscribed threads
    const allThreads = new Set([...this.subscribedThreads, ...this.pendingSubscriptions]);
    this.subscribedThreads.clear();

    for (const threadId of allThreads) {
      this.subscribe(threadId);
    }
  }

  private startHeartbeat(): void {
    this.lastPong = Date.now();

    this.heartbeatInterval = setInterval(() => {
      if (this.state !== ConnectionState.CONNECTED) {
        return;
      }

      // Check if we've received a pong recently
      const timeSinceLastPong = Date.now() - this.lastPong;
      if (timeSinceLastPong > 60000) {
        // No pong for 60 seconds, reconnect
        console.warn('WebSocket: Heartbeat timeout, reconnecting');
        this.ws?.close(4000, 'Heartbeat timeout');
        return;
      }

      // Send ping
      this.send({ type: 'ping' });
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private notifyConnectionHandlers(connected: boolean): void {
    this.connectionHandlers.forEach(handler => handler(connected));
  }
}

// Singleton instance
export const wsService = new WebSocketService();
```

---

## 2. WebSocket React Hook

### File: `frontend/src/hooks/useWebSocket.ts`

```typescript
/**
 * React hook for WebSocket functionality
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { wsService, ConnectionState } from '../services/websocket';
import { useAuthStore } from '../stores/authStore';
import { useMessageStore } from '../stores/messageStore';
import { useThreadStore } from '../stores/threadStore';
import { useCrypto } from '../crypto/CryptoContext';
import type { EncryptedData, MessagePayload } from '../types/crypto';

interface UseWebSocketReturn {
  isConnected: boolean;
  connectionState: ConnectionState;
  sendMessage: (threadId: string, encrypted: EncryptedData) => Promise<{ id: string }>;
  subscribe: (threadId: string) => void;
  unsubscribe: (threadId: string) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    wsService.getState()
  );

  const token = useAuthStore(state => state.token);
  const identity = useAuthStore(state => state.identity);
  const { addMessage } = useMessageStore();
  const { updateLastMessage } = useThreadStore();
  const { getThreadKey, decryptMessage } = useCrypto();

  // Track if we've set up handlers
  const handlersSetup = useRef(false);

  // Connect when token is available
  useEffect(() => {
    if (!token) {
      wsService.disconnect();
      return;
    }

    wsService.connect(token).catch(console.error);

    return () => {
      // Don't disconnect on unmount - keep connection alive
    };
  }, [token]);

  // Set up message and connection handlers
  useEffect(() => {
    if (handlersSetup.current) return;
    handlersSetup.current = true;

    // Connection state handler
    const unsubConnection = wsService.onConnectionChange((connected) => {
      setConnectionState(wsService.getState());
    });

    // Message handler
    const unsubMessage = wsService.onMessage(async (msg) => {
      if (msg.type === 'message' && msg.thread_id && msg.ciphertext && msg.iv && msg.id) {
        await handleIncomingMessage(
          msg.id,
          msg.thread_id,
          { ciphertext: msg.ciphertext, iv: msg.iv },
          msg.created_at
        );
      }
    });

    return () => {
      unsubConnection();
      unsubMessage();
      handlersSetup.current = false;
    };
  }, []);

  // Handle incoming encrypted message
  const handleIncomingMessage = useCallback(async (
    id: string,
    threadId: string,
    encrypted: EncryptedData,
    createdAt?: string
  ) => {
    if (!identity) return;

    try {
      // Get thread to find participant UUID
      const thread = useThreadStore.getState().getThread(threadId);
      if (!thread) {
        console.warn('Received message for unknown thread:', threadId);
        return;
      }

      // Derive thread key and decrypt
      const threadKey = await getThreadKey(identity.userId, thread.participantUUID);
      const plaintext = await decryptMessage(threadKey, encrypted);
      const payload: MessagePayload = JSON.parse(plaintext);

      // Don't add our own messages (we add them optimistically)
      if (payload.sender_id === identity.userId) {
        return;
      }

      // Add to message store
      addMessage({
        id,
        threadId,
        senderId: payload.sender_id,
        senderName: payload.sender_name,
        content: payload.content,
        timestamp: payload.timestamp,
        status: 'sent'
      });

      // Update thread's last message time
      updateLastMessage(threadId, payload.timestamp);

    } catch (error) {
      console.error('Failed to process incoming message:', error);
    }
  }, [identity, getThreadKey, decryptMessage, addMessage, updateLastMessage]);

  // Send message wrapper
  const sendMessage = useCallback(async (
    threadId: string,
    encrypted: EncryptedData
  ): Promise<{ id: string }> => {
    return wsService.sendMessage(threadId, encrypted);
  }, []);

  // Subscribe wrapper
  const subscribe = useCallback((threadId: string) => {
    wsService.subscribe(threadId);
  }, []);

  // Unsubscribe wrapper
  const unsubscribe = useCallback((threadId: string) => {
    wsService.unsubscribe(threadId);
  }, []);

  return {
    isConnected: connectionState === ConnectionState.CONNECTED,
    connectionState,
    sendMessage,
    subscribe,
    unsubscribe
  };
}
```

---

## 3. Thread Subscription Hook

### File: `frontend/src/hooks/useThreadSubscription.ts`

```typescript
/**
 * Hook to manage thread subscription lifecycle
 */

import { useEffect } from 'react';
import { useWebSocket } from './useWebSocket';

export function useThreadSubscription(threadId: string | null) {
  const { subscribe, unsubscribe, isConnected } = useWebSocket();

  useEffect(() => {
    if (!threadId || !isConnected) {
      return;
    }

    // Subscribe to thread
    subscribe(threadId);

    // Unsubscribe on cleanup
    return () => {
      unsubscribe(threadId);
    };
  }, [threadId, isConnected, subscribe, unsubscribe]);
}
```

---

## 4. Connection Status Component

### File: `frontend/src/components/ConnectionStatus.tsx`

```typescript
/**
 * Connection status indicator
 */

import React from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { ConnectionState } from '../services/websocket';

export function ConnectionStatus() {
  const { connectionState } = useWebSocket();

  const getStatusInfo = () => {
    switch (connectionState) {
      case ConnectionState.CONNECTED:
        return { color: 'var(--success)', text: 'Connected', icon: '●' };
      case ConnectionState.CONNECTING:
        return { color: 'var(--text-secondary)', text: 'Connecting...', icon: '○' };
      case ConnectionState.RECONNECTING:
        return { color: '#f59e0b', text: 'Reconnecting...', icon: '◐' };
      case ConnectionState.DISCONNECTED:
        return { color: 'var(--error)', text: 'Disconnected', icon: '○' };
    }
  };

  const status = getStatusInfo();

  return (
    <div
      className="connection-status"
      title={status.text}
      style={{ color: status.color }}
    >
      <span className="status-icon">{status.icon}</span>
      <span className="status-text">{status.text}</span>
    </div>
  );
}
```

---

## 5. Updated ThreadView with Subscription

### File: `frontend/src/components/ThreadView.tsx` (updated)

```typescript
/**
 * Thread view with real-time subscription
 */

import React, { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useThreadStore } from '../stores/threadStore';
import { useMessageStore } from '../stores/messageStore';
import { useCrypto } from '../crypto/CryptoContext';
import { useThreadSubscription } from '../hooks/useThreadSubscription';
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

  // Subscribe to real-time updates
  useThreadSubscription(threadId);

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

## 6. Sync Service for Offline Messages

### File: `frontend/src/services/sync.ts`

```typescript
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
}
```

---

## 7. Online/Offline Detection Hook

### File: `frontend/src/hooks/useOnlineStatus.ts`

```typescript
/**
 * Hook to detect online/offline status
 */

import { useState, useEffect } from 'react';

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
```

---

## 8. Message Queue for Offline Sending

### File: `frontend/src/services/messageQueue.ts`

```typescript
/**
 * Queue for messages that couldn't be sent (offline support)
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { EncryptedData } from '../types/crypto';

interface QueuedMessage {
  id: string;
  threadId: string;
  encrypted: EncryptedData;
  payload: string; // Serialized MessagePayload
  queuedAt: number;
  attempts: number;
}

interface QueueDBSchema extends DBSchema {
  queue: {
    key: string;
    value: QueuedMessage;
    indexes: { 'by-thread': string; 'by-time': number };
  };
}

const DB_NAME = 'hush-queue';
const DB_VERSION = 1;

let db: IDBPDatabase<QueueDBSchema> | null = null;

async function getDB(): Promise<IDBPDatabase<QueueDBSchema>> {
  if (!db) {
    db = await openDB<QueueDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        const store = database.createObjectStore('queue', { keyPath: 'id' });
        store.createIndex('by-thread', 'threadId');
        store.createIndex('by-time', 'queuedAt');
      }
    });
  }
  return db;
}

/**
 * Add a message to the send queue
 */
export async function queueMessage(
  threadId: string,
  encrypted: EncryptedData,
  payload: string
): Promise<string> {
  const id = `queued-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const database = await getDB();
  await database.put('queue', {
    id,
    threadId,
    encrypted,
    payload,
    queuedAt: Date.now(),
    attempts: 0
  });

  return id;
}

/**
 * Get all queued messages
 */
export async function getQueuedMessages(): Promise<QueuedMessage[]> {
  const database = await getDB();
  return database.getAllFromIndex('queue', 'by-time');
}

/**
 * Remove a message from the queue (after successful send)
 */
export async function removeFromQueue(id: string): Promise<void> {
  const database = await getDB();
  await database.delete('queue', id);
}

/**
 * Increment attempt count for a message
 */
export async function incrementAttempts(id: string): Promise<void> {
  const database = await getDB();
  const msg = await database.get('queue', id);
  if (msg) {
    msg.attempts++;
    await database.put('queue', msg);
  }
}

/**
 * Process the queue (send pending messages)
 */
export async function processQueue(
  sendFn: (threadId: string, encrypted: EncryptedData) => Promise<{ id: string }>
): Promise<{ sent: number; failed: number }> {
  const messages = await getQueuedMessages();
  let sent = 0;
  let failed = 0;

  for (const msg of messages) {
    if (msg.attempts >= 3) {
      // Too many attempts, remove from queue
      await removeFromQueue(msg.id);
      failed++;
      continue;
    }

    try {
      await sendFn(msg.threadId, msg.encrypted);
      await removeFromQueue(msg.id);
      sent++;
    } catch (error) {
      await incrementAttempts(msg.id);
      failed++;
    }
  }

  return { sent, failed };
}
```

---

## 9. Connection Status Styles

### File: `frontend/src/styles/connection.css`

```css
/* Connection Status */
.connection-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 1rem;
  background: var(--bg-primary);
}

.status-icon {
  font-size: 0.5rem;
}

/* Reconnecting animation */
.connection-status.reconnecting .status-icon {
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Offline banner */
.offline-banner {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--error);
  color: white;
  padding: 0.5rem;
  text-align: center;
  font-size: 0.875rem;
  z-index: 1000;
}

.offline-banner.reconnecting {
  background: #f59e0b;
}
```

---

## 10. Verification Checklist

After implementing this phase, verify:

- [ ] WebSocket connects with valid JWT
- [ ] Connection status shows correctly
- [ ] Reconnection happens on disconnect
- [ ] Exponential backoff works
- [ ] Thread subscription works
- [ ] Messages are received in real-time
- [ ] Own messages are not duplicated
- [ ] Heartbeat keeps connection alive
- [ ] Offline messages are queued
- [ ] Queue is processed when back online

---

## 11. Test Scenarios

```
1. Basic Connection:
   - Login and verify "Connected" status
   - Open browser dev tools, check WebSocket connection

2. Message Flow:
   - Open two browser windows with same vault
   - Send message from one, verify appears in other

3. Reconnection:
   - Disconnect network briefly
   - Verify status changes to "Reconnecting"
   - Reconnect and verify messages resume

4. Heartbeat:
   - Leave connection idle for 5 minutes
   - Verify connection remains active

5. Offline Queue:
   - Disconnect network
   - Send a message (should show "sending")
   - Reconnect and verify message is sent
```
