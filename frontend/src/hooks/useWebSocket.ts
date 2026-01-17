/**
 * React hook for WebSocket functionality
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { wsService, ConnectionState } from '../services/websocket';
import { useAuthStore } from '../stores/authStore';
import { useMessageStore } from '../stores/messageStore';
import { useThreadStore } from '../stores/threadStore';
import { useCrypto } from '../crypto/CryptoContext';
import { saveMessage } from '../services/storage';
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

      // Save to local storage
      const timestamp = createdAt ? new Date(createdAt).getTime() : payload.timestamp;
      await saveMessage(id, threadId, encrypted, timestamp);

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

      // Update connection state on any message
      setConnectionState(wsService.getState());
    });

    return () => {
      unsubConnection();
      unsubMessage();
      handlersSetup.current = false;
    };
  }, [handleIncomingMessage]);

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
