/**
 * Centralized realtime lifecycle owner.
 * Maintains one WebSocket orchestration path for the whole app.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { wsService, ConnectionState } from '../services/websocket';
import { useAuthStore } from '../stores/authStore';
import { useMessageStore } from '../stores/messageStore';
import { useConversationStore } from '../stores/conversationStore';
import { useCrypto } from '../crypto/CryptoContext';
import { saveMessage } from '../services/storage';
import type { EncryptedData, MessagePayload } from '../types/crypto';

interface RealtimeContextValue {
  connectionState: ConnectionState;
  isConnected: boolean;
  sendMessage: (conversationId: string, encrypted: EncryptedData) => Promise<{ id: string }>;
  subscribeConversation: (conversationId: string) => void;
  unsubscribeConversation: (conversationId: string) => void;
  disconnect: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [connectionState, setConnectionState] = useState<ConnectionState>(wsService.getState());
  const [userSubscribed, setUserSubscribed] = useState(false);

  const { isAuthenticated, user } = useAuthStore();
  const { addMessage } = useMessageStore();
  const { updateLastMessage, incrementUnread, getConversation, addConversation } = useConversationStore();
  const { isUnlocked, getThreadKey, decryptMessage } = useCrypto();

  // Connection lifecycle is owned here.
  useEffect(() => {
    if (!isAuthenticated || !isUnlocked) {
      wsService.disconnect();
      setUserSubscribed(false);
      setConnectionState(ConnectionState.DISCONNECTED);
      return;
    }

    wsService.connect().catch((error) => {
      console.error('Realtime connection failed', error);
    });
  }, [isAuthenticated, isUnlocked]);

  // Subscribe to all user conversations once per active connection.
  useEffect(() => {
    if (connectionState !== ConnectionState.CONNECTED) {
      setUserSubscribed(false);
      return;
    }

    if (!userSubscribed) {
      wsService.subscribeToUser();
      setUserSubscribed(true);
    }
  }, [connectionState, userSubscribed]);

  const handleIncomingMessage = useCallback(async (
    id: string,
    conversationId: string,
    encrypted: EncryptedData,
    senderId: string | undefined,
    createdAt?: string
  ) => {
    if (!user || !senderId) {
      return;
    }

    try {
      const existingConversation = getConversation(conversationId);

      if (!existingConversation) {
        const threadKey = await getThreadKey(user.id, senderId);
        const plaintext = await decryptMessage(threadKey, encrypted);
        const payload: MessagePayload = JSON.parse(plaintext);
        const timestamp = createdAt ? new Date(createdAt).getTime() : payload.timestamp;

        addConversation({
          conversationId,
          participantId: senderId,
          participantUsername: payload.sender_name || 'Unknown',
          createdAt: Date.now(),
          lastMessageAt: payload.timestamp,
          unreadCount: 1
        });

        wsService.subscribe(conversationId);

        await saveMessage(id, conversationId, encrypted, timestamp);

        addMessage({
          id,
          threadId: conversationId,
          senderId: payload.sender_id,
          senderName: payload.sender_name,
          content: payload.content,
          timestamp: payload.timestamp,
          status: 'sent'
        });

        updateLastMessage(conversationId, payload.timestamp);
        return;
      }

      const threadKey = await getThreadKey(user.id, existingConversation.participantId);
      const plaintext = await decryptMessage(threadKey, encrypted);
      const payload: MessagePayload = JSON.parse(plaintext);

      if (payload.sender_id === user.id) {
        return;
      }

      const timestamp = createdAt ? new Date(createdAt).getTime() : payload.timestamp;
      await saveMessage(id, conversationId, encrypted, timestamp);

      addMessage({
        id,
        threadId: conversationId,
        senderId: payload.sender_id,
        senderName: payload.sender_name,
        content: payload.content,
        timestamp: payload.timestamp,
        status: 'sent'
      });

      updateLastMessage(conversationId, payload.timestamp);
      incrementUnread(conversationId);
    } catch (error) {
      console.error('Failed to process incoming realtime message', error);
    }
  }, [
    user,
    getConversation,
    getThreadKey,
    decryptMessage,
    addConversation,
    addMessage,
    updateLastMessage,
    incrementUnread
  ]);

  useEffect(() => {
    const unsubConnection = wsService.onConnectionChange(() => {
      setConnectionState(wsService.getState());
    });

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

      setConnectionState(wsService.getState());
    });

    return () => {
      unsubConnection();
      unsubMessage();
    };
  }, [handleIncomingMessage]);

  const sendMessage = useCallback((conversationId: string, encrypted: EncryptedData) => {
    return wsService.sendMessage(conversationId, encrypted);
  }, []);

  const subscribeConversation = useCallback((conversationId: string) => {
    wsService.subscribe(conversationId);
  }, []);

  const unsubscribeConversation = useCallback((conversationId: string) => {
    wsService.unsubscribe(conversationId);
  }, []);

  const disconnect = useCallback(() => {
    wsService.disconnect();
    setUserSubscribed(false);
    setConnectionState(ConnectionState.DISCONNECTED);
  }, []);

  const value = useMemo<RealtimeContextValue>(() => ({
    connectionState,
    isConnected: connectionState === ConnectionState.CONNECTED,
    sendMessage,
    subscribeConversation,
    unsubscribeConversation,
    disconnect
  }), [
    connectionState,
    sendMessage,
    subscribeConversation,
    unsubscribeConversation,
    disconnect
  ]);

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within RealtimeProvider');
  }
  return context;
}
