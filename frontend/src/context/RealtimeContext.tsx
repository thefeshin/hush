/**
 * Centralized realtime lifecycle owner.
 * Maintains one WebSocket orchestration path for the whole app.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { wsService, ConnectionState } from '../services/websocket';
import { getSyncService } from '../services/sync';
import { getGroupState } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useMessageStore } from '../stores/messageStore';
import { useConversationStore } from '../stores/conversationStore';
import { useCrypto } from '../crypto/CryptoContext';
import { replaceMessageId, saveConversation, saveMessage } from '../services/storage';
import { processQueue } from '../services/messageQueue';
import type { ConversationMetadata, EncryptedData, MessagePayload } from '../types/crypto';
import { ensureGroupConversationVisible } from './realtimeGroup';

function msgEpoch(current?: number, incoming?: number): number {
  if (typeof incoming === 'number' && incoming > 0) {
    return incoming;
  }
  if (typeof current === 'number' && current > 0) {
    return current;
  }
  return 1;
}

interface RealtimeContextValue {
  connectionState: ConnectionState;
  isConnected: boolean;
  sendMessage: (conversationId: string, encrypted: EncryptedData, recipientId?: string, groupEpoch?: number) => Promise<{ id: string }>;
  subscribeConversation: (conversationId: string) => void;
  unsubscribeConversation: (conversationId: string) => void;
  disconnect: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [connectionState, setConnectionState] = useState<ConnectionState>(wsService.getState());
  const [userSubscribed, setUserSubscribed] = useState(false);

  const { isAuthenticated, user } = useAuthStore();
  const { addMessage, markMessageSent } = useMessageStore();
  const { updateLastMessage, incrementUnread, getConversation, upsertConversation } = useConversationStore();
  const { isUnlocked, getConversationKey, getGroupKey, decryptMessage, encryptIdentity } = useCrypto();

  const ensureGroupConversationVisibleForUser = useCallback(async (
    conversationId: string,
    fallbackName?: string,
    fallbackEpoch?: number,
  ) => {
    if (!user) {
      return;
    }

    await ensureGroupConversationVisible({
      user,
      conversationId,
      fallbackName,
      fallbackEpoch,
      getConversation,
      upsertConversation,
      getGroupState,
      encryptIdentity,
    });
  }, [user, getConversation, upsertConversation, encryptIdentity]);

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
    createdAt?: string,
    groupEpoch?: number,
  ) => {
    if (!user || !senderId) {
      return;
    }

    try {
      const existingConversation = getConversation(conversationId);

      if (!existingConversation) {
        let conversationKey;
        let groupState: Awaited<ReturnType<typeof getGroupState>> | null = null;
        if (groupEpoch) {
          groupState = await getGroupState(conversationId);
          conversationKey = await getGroupKey(conversationId, groupState.key_epoch || groupEpoch);
        } else {
          conversationKey = await getConversationKey(user.id, senderId);
        }
        const plaintext = await decryptMessage(conversationKey, encrypted);
        const payload: MessagePayload = JSON.parse(plaintext);
        const timestamp = createdAt ? new Date(createdAt).getTime() : payload.timestamp;
        const participantUsername = payload.sender_name || senderId;

        const metadata: ConversationMetadata = {
          participants: groupState ? groupState.members.map((member) => member.user_id) : [user.id, senderId].sort(),
          kind: groupState ? 'group' : 'direct',
          group_name: groupState?.name,
          key_epoch: groupState?.key_epoch,
          created_by: {
            user_id: payload.sender_id,
            display_name: payload.sender_name
          },
          created_at: payload.timestamp
        };
        const encryptedMetadata = await encryptIdentity(metadata);
        await saveConversation(conversationId, encryptedMetadata, timestamp);

        upsertConversation({
          conversationId,
          kind: groupState ? 'group' : 'direct',
          participantId: groupState ? '' : senderId,
          participantUsername: groupState?.name || participantUsername,
          keyEpoch: groupState?.key_epoch,
          createdAt: Date.now(),
          lastMessageAt: timestamp,
          unreadCount: 1
        });

        wsService.subscribe(conversationId);

        await saveMessage(id, conversationId, encrypted, timestamp);

        addMessage({
          id,
          conversationId,
          senderId: payload.sender_id,
          senderName: payload.sender_name,
          content: payload.content,
          timestamp: payload.timestamp,
          status: 'sent'
        });

        updateLastMessage(conversationId, payload.timestamp);
        return;
      }

      const conversationKey = existingConversation.kind === 'group'
        ? await getGroupKey(conversationId, msgEpoch(existingConversation.keyEpoch, groupEpoch))
        : await getConversationKey(user.id, existingConversation.participantId);
      const plaintext = await decryptMessage(conversationKey, encrypted);
      const payload: MessagePayload = JSON.parse(plaintext);

      const timestamp = createdAt ? new Date(createdAt).getTime() : payload.timestamp;
      await saveMessage(id, conversationId, encrypted, timestamp);

      if (payload.sender_id !== user.id && payload.sender_name) {
        upsertConversation({
          ...existingConversation,
          participantUsername: existingConversation.kind === 'group' ? existingConversation.participantUsername : payload.sender_name,
          keyEpoch: existingConversation.kind === 'group'
            ? (payload.group_epoch || groupEpoch || existingConversation.keyEpoch || 1)
            : existingConversation.keyEpoch,
          lastMessageAt: timestamp
        });
      }

      addMessage({
        id,
        conversationId,
        senderId: payload.sender_id,
        senderName: payload.sender_name,
        content: payload.content,
        timestamp: payload.timestamp,
        status: 'sent'
      });

      updateLastMessage(conversationId, payload.timestamp);
      if (payload.sender_id !== user.id) {
        incrementUnread(conversationId);
      }
    } catch (error) {
      console.error('Failed to process incoming realtime message', error);
    }
  }, [
    user,
    getConversation,
    getConversationKey,
    getGroupKey,
    decryptMessage,
    encryptIdentity,
    upsertConversation,
    addMessage,
    updateLastMessage,
    incrementUnread
  ]);

  useEffect(() => {
    const replayQueue = async () => {
      if (connectionState !== ConnectionState.CONNECTED) {
        return;
      }

      await processQueue(
        async (conversationId, encrypted, recipientId, groupEpoch) => {
          try {
            return await wsService.sendMessage(conversationId, encrypted, recipientId, groupEpoch);
          } catch {
            const syncService = getSyncService();
            return await syncService.sendMessage(conversationId, encrypted, recipientId, groupEpoch);
          }
        },
        async (localMessageId, serverMessageId) => {
          await replaceMessageId(localMessageId, serverMessageId);
          markMessageSent(localMessageId, serverMessageId);
        }
      );
    };

    replayQueue().catch((error) => {
      console.error('Failed to process queued messages', error);
    });

    const handleSyncRequest = () => {
      replayQueue().catch((error) => {
        console.error('Failed to process queued messages', error);
      });
    };

    window.addEventListener('hush:sync-messages', handleSyncRequest);

    return () => {
      window.removeEventListener('hush:sync-messages', handleSyncRequest);
    };
  }, [connectionState, markMessageSent]);

  useEffect(() => {
    const unsubConnection = wsService.onConnectionChange(() => {
      setConnectionState(wsService.getState());
    });

    const unsubMessage = wsService.onMessage(async (msg) => {
      if (msg.type === 'message' && msg.conversation_id && msg.ciphertext && msg.iv && msg.id) {
        await handleIncomingMessage(
          msg.id,
          msg.conversation_id,
          { ciphertext: msg.ciphertext, iv: msg.iv },
          msg.sender_id,
          msg.created_at,
          msg.group_epoch
        );
      }

      if ((msg.type === 'group_member_added' || msg.type === 'group_member_removed' || msg.type === 'group_key_rotated')
        && msg.conversation_id) {
        if (msg.type === 'group_member_added' && msg.user_id && user && msg.user_id === user.id) {
          await ensureGroupConversationVisibleForUser(msg.conversation_id, msg.group_name, msg.group_epoch);
        }

        const existing = getConversation(msg.conversation_id);
        if (existing && existing.kind === 'group') {
          upsertConversation({
            ...existing,
            keyEpoch: msg.group_epoch || existing.keyEpoch || 1,
          });
        }
      }

      if (msg.type === 'group_created' && msg.conversation_id) {
        await ensureGroupConversationVisibleForUser(msg.conversation_id, msg.group_name, msg.group_epoch);
      }

      setConnectionState(wsService.getState());
    });

    return () => {
      unsubConnection();
      unsubMessage();
    };
  }, [handleIncomingMessage, getConversation, upsertConversation, ensureGroupConversationVisibleForUser, user]);

  const sendMessage = useCallback((conversationId: string, encrypted: EncryptedData, recipientId?: string, groupEpoch?: number) => {
    return wsService.sendMessage(conversationId, encrypted, recipientId, groupEpoch);
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
