/**
 * WebSocket service for real-time communication
 * Uses cookie-based authentication (cookies sent automatically)
 */

import type { EncryptedData } from '../types/crypto';

// Message types from server
interface ServerMessage {
  type: 'subscribed' | 'unsubscribed' | 'message' | 'error' | 'heartbeat' | 'pong' | 'user_subscribed';
  conversation_id?: string;
  sender_id?: string;  // Sender's user ID (plaintext, for auto-discovery)
  id?: string;
  ciphertext?: string;
  iv?: string;
  created_at?: string;
  message?: string;
  conversation_count?: number;
}

// Message types to server
interface ClientSubscribe {
  type: 'subscribe';
  conversation_id: string;
}

interface ClientUnsubscribe {
  type: 'unsubscribe';
  conversation_id: string;
}

interface ClientMessage {
  type: 'message';
  conversation_id: string;
  recipient_id?: string;
  ciphertext: string;
  iv: string;
}

interface ClientPing {
  type: 'ping';
}

interface ClientSubscribeUser {
  type: 'subscribe_user';
}

type ClientPayload = ClientSubscribe | ClientUnsubscribe | ClientMessage | ClientPing | ClientSubscribeUser;

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
  private url: string;

  // Connection state
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Subscriptions
  private subscribedConversations = new Set<string>();
  private pendingSubscriptions = new Set<string>();

  // Event handlers
  private messageHandlers = new Set<MessageHandler>();
  private connectionHandlers = new Set<ConnectionHandler>();

  // Pending message callbacks
  private pendingMessages = new Map<string, {
    resolve: (result: { id: string }) => void;
    reject: (error: Error) => void;
    conversationId: string;
    ciphertext: string;
    iv: string;
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
   * Connect to WebSocket server (uses cookies for auth)
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.state === ConnectionState.CONNECTED) {
        resolve();
        return;
      }

      this.state = ConnectionState.CONNECTING;

      try {
        // No token needed - cookies are sent automatically
        this.ws = new WebSocket(this.url);

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
    this.subscribedConversations.clear();
    this.pendingSubscriptions.clear();
    this.notifyConnectionHandlers(false);
  }

  /**
   * Subscribe to a conversation for real-time updates
   */
  subscribe(conversationId: string): void {
    if (this.subscribedConversations.has(conversationId)) {
      return;
    }

    this.pendingSubscriptions.add(conversationId);

    if (this.state === ConnectionState.CONNECTED && this.ws) {
      this.send({ type: 'subscribe', conversation_id: conversationId });
    }
  }

  /**
   * Unsubscribe from a conversation
   */
  unsubscribe(conversationId: string): void {
    this.subscribedConversations.delete(conversationId);
    this.pendingSubscriptions.delete(conversationId);

    if (this.state === ConnectionState.CONNECTED && this.ws) {
      this.send({ type: 'unsubscribe', conversation_id: conversationId });
    }
  }

  /**
   * Send an encrypted message
   */
  sendMessage(conversationId: string, encrypted: EncryptedData, recipientId?: string): Promise<{ id: string }> {
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
        conversationId,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv
      });

      // Send message
        this.send({
          type: 'message',
          conversation_id: conversationId,
          recipient_id: recipientId,
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

  /**
   * Get subscribed conversation IDs
   */
  getSubscribedConversations(): string[] {
    return Array.from(this.subscribedConversations);
  }

  /**
   * Subscribe to all conversations for the current user
   * This enables automatic discovery from unknown contacts
   */
  subscribeToUser(): void {
    if (this.state === ConnectionState.CONNECTED && this.ws) {
      this.send({ type: 'subscribe_user' });
    }
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
          if (msg.conversation_id) {
            this.subscribedConversations.add(msg.conversation_id);
            this.pendingSubscriptions.delete(msg.conversation_id);
          }
          break;

        case 'unsubscribed':
          if (msg.conversation_id) {
            this.subscribedConversations.delete(msg.conversation_id);
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
    // Resolve any pending send for this conversation
    // Note: The server echoes our own messages back
    if (msg.id && msg.conversation_id) {
      if (msg.ciphertext && msg.iv) {
        for (const [tempId, pending] of this.pendingMessages) {
          if (
            pending.conversationId === msg.conversation_id
            && pending.ciphertext === msg.ciphertext
            && pending.iv === msg.iv
          ) {
            this.pendingMessages.delete(tempId);
            pending.resolve({ id: msg.id });
            return;
          }
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

    this.notifyConnectionHandlers(false);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(console.error);
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private resubscribeAll(): void {
    // Resubscribe to all previously subscribed conversations
    const allConversations = new Set([...this.subscribedConversations, ...this.pendingSubscriptions]);
    this.subscribedConversations.clear();

    for (const conversationId of allConversations) {
      this.subscribe(conversationId);
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
