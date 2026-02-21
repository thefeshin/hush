/**
 * Compatibility hook around the centralized realtime provider.
 */

import { useCallback } from 'react';
import { useRealtime } from '../context/RealtimeContext';
import { ConnectionState } from '../services/websocket';
import type { EncryptedData } from '../types/crypto';

interface UseWebSocketReturn {
  isConnected: boolean;
  connectionState: ConnectionState;
  sendMessage: (conversationId: string, encrypted: EncryptedData, recipientId?: string, groupEpoch?: number, expiresAfterSeenSec?: number) => Promise<{ id: string }>;
  sendMessageSeen: (conversationId: string, messageId: string) => void;
  subscribe: (conversationId: string) => void;
  unsubscribe: (conversationId: string) => void;
  disconnect: () => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const realtime = useRealtime();

  const sendMessage = useCallback((conversationId: string, encrypted: EncryptedData, recipientId?: string, groupEpoch?: number, expiresAfterSeenSec?: number) => {
    return realtime.sendMessage(conversationId, encrypted, recipientId, groupEpoch, expiresAfterSeenSec);
  }, [realtime]);

  const sendMessageSeen = useCallback((conversationId: string, messageId: string) => {
    realtime.sendMessageSeen(conversationId, messageId);
  }, [realtime]);

  const subscribe = useCallback((conversationId: string) => {
    realtime.subscribeConversation(conversationId);
  }, [realtime]);

  const unsubscribe = useCallback((conversationId: string) => {
    realtime.unsubscribeConversation(conversationId);
  }, [realtime]);

  return {
    isConnected: realtime.isConnected,
    connectionState: realtime.connectionState,
    sendMessage,
    sendMessageSeen,
    subscribe,
    unsubscribe,
    disconnect: realtime.disconnect
  };
}
