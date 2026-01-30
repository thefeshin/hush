/**
 * React hook for WebSocket functionality
 * Uses cookie-based authentication
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { wsService, ConnectionState } from '../services/websocket';
import { useAuthStore } from '../stores/authStore';
import { useMessageStore } from '../stores/messageStore';
import { useConversationStore } from '../stores/conversationStore';
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

  const { isAuthenticated, user } = useAuthStore();
  const { addMessage } = useMessageStore();
  const { updateLastMessage, incrementUnread, getConversation, addConversation } = useConversationStore();
  const { getThreadKey, decryptMessage, isUnlocked } = useCrypto();

  // Track if we've set up handlers
  const handlersSetup = useRef(false);

  // Connect when authenticated (cookies will be sent automatically)
  useEffect(() => {
    if (!isAuthenticated || !isUnlocked) {
      wsService.disconnect();
      return;
    }

    wsService.connect().catch(console.error);

    return () => {
      // Don't disconnect on unmount - keep connection alive
    };
  }, [isAuthenticated, isUnlocked]);

  // Handle incoming encrypted message
  const handleIncomingMessage = useCallback(async (
    id: string,
    conversationId: string,
    encrypted: EncryptedData,
    senderId: string | undefined,
    createdAt?: string
  ) => {
    if (!user || !senderId) return;

    try {
      // Get conversation to find participant ID
      const conversation = getConversation(conversationId);

      // If we don't have this conversation, handle auto-discovery
      if (!conversation) {
        console.log('Received message for unknown conversation, attempting auto-discovery:', conversationId);

        // Derive thread key and decrypt to get sender info
        const threadKey = await getThreadKey(user.id, senderId);
        const plaintext = await decryptMessage(threadKey, encrypted);
        const payload: MessagePayload = JSON.parse(plaintext);

        // Create new conversation entry
        const newConversation = {
          conversationId,
          participantId: senderId,
          participantUsername: payload.sender_name || 'Unknown',
          createdAt: Date.now(),
          lastMessageAt: payload.timestamp,
          unreadCount: 1
        };

        addConversation(newConversation);

        // Subscribe to this conversation
        wsService.subscribe(conversationId);

        // Save message and add to store (use threadId internally)
        const timestamp = createdAt ? new Date(createdAt).getTime() : payload.timestamp;
        await saveMessage(id, conversationId, encrypted, timestamp);

        addMessage({
          id,
          threadId: conversationId,  // Use threadId for message store
          senderId: payload.sender_id,
          senderName: payload.sender_name,
          content: payload.content,
          timestamp: payload.timestamp,
          status: 'sent'
        });

        updateLastMessage(conversationId, payload.timestamp);
        return;
      }

      // Derive thread key and decrypt
      const threadKey = await getThreadKey(user.id, conversation.participantId);
      const plaintext = await decryptMessage(threadKey, encrypted);
      const payload: MessagePayload = JSON.parse(plaintext);

      // Don't add our own messages (we add them optimistically)
      if (payload.sender_id === user.id) {
        return;
      }

      // Save to local storage
      const timestamp = createdAt ? new Date(createdAt).getTime() : payload.timestamp;
      await saveMessage(id, conversationId, encrypted, timestamp);

      // Add to message store (use threadId internally)
      addMessage({
        id,
        threadId: conversationId,  // Use threadId for message store
        senderId: payload.sender_id,
        senderName: payload.sender_name,
        content: payload.content,
        timestamp: payload.timestamp,
        status: 'sent'
      });

      // Update conversation's last message time
      updateLastMessage(conversationId, payload.timestamp);

      // Increment unread count if not the active conversation
      incrementUnread(conversationId);

    } catch (error) {
      console.error('Failed to process incoming message:', error);
    }
  }, [user, getConversation, getThreadKey, decryptMessage, addMessage, updateLastMessage, incrementUnread, addConversation]);

  // Set up message and connection handlers
  useEffect(() => {
    if (handlersSetup.current) return;
    handlersSetup.current = true;

    // Connection state handler
    const unsubConnection = wsService.onConnectionChange(() => {
      setConnectionState(wsService.getState());
    });

    // Message handler
    const unsubMessage = wsService.onMessage(async (msg) => {
      if (msg.type === 'message' && msg.thread_id && msg.ciphertext && msg.iv && msg.id) {
        await handleIncomingMessage(
          msg.id,
          msg.thread_id,
          { ciphertext: msg.ciphertext, iv: msg.iv },
          msg.sender_id,
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
