/**
 * Centralized realtime lifecycle owner.
 * Maintains one WebSocket orchestration path for the whole app.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { wsService, ConnectionState } from '../services/websocket';
import { getSyncService } from '../services/sync';
import { getGroupState } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useMessageStore } from '../stores/messageStore';
import { useConversationStore } from '../stores/conversationStore';
import { useCrypto } from '../crypto/CryptoContext';
import { deleteMessage, replaceMessageId, saveConversation, saveMessage } from '../services/storage';
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
  sendMessage: (conversationId: string, encrypted: EncryptedData, recipientId?: string, groupEpoch?: number, expiresAfterSeenSec?: number) => Promise<{ id: string }>;
  sendMessageSeen: (conversationId: string, messageId: string) => void;
  subscribeConversation: (conversationId: string) => void;
  unsubscribeConversation: (conversationId: string) => void;
  disconnect: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [connectionState, setConnectionState] = useState<ConnectionState>(wsService.getState());
  const [userSubscribed, setUserSubscribed] = useState(false);
  const processedGroupEventsRef = useRef<Set<string>>(new Set());
  const sentSeenRef = useRef<Set<string>>(new Set());

  const { isAuthenticated, user } = useAuthStore();
  const { addMessage, markMessageSent, markMessageSeen, removeMessage } = useMessageStore();
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
      processedGroupEventsRef.current.clear();
      sentSeenRef.current.clear();
      return;
    }

    wsService.connect().catch((error) => {
      console.error('Realtime connection failed', error);
    });
  }, [isAuthenticated, isUnlocked]);

  const shouldProcessGroupEvent = useCallback((msg: {
    type: string;
    conversation_id?: string;
    user_id?: string;
    key_epoch?: number;
  }): boolean => {
    if (!msg.conversation_id) {
      return true;
    }

    const eventKey = [
      msg.type,
      msg.conversation_id,
      msg.user_id || '',
      typeof msg.key_epoch === 'number' ? msg.key_epoch : '',
    ].join(':');

    if (processedGroupEventsRef.current.has(eventKey)) {
      return false;
    }

    processedGroupEventsRef.current.add(eventKey);
    if (processedGroupEventsRef.current.size > 500) {
      const iterator = processedGroupEventsRef.current.values();
      const oldest = iterator.next().value;
      if (oldest) {
        processedGroupEventsRef.current.delete(oldest);
      }
    }

    return true;
  }, []);

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
        async (conversationId, encrypted, recipientId, groupEpoch, expiresAfterSeenSec) => {
          try {
            return await wsService.sendMessage(conversationId, encrypted, recipientId, groupEpoch, expiresAfterSeenSec);
          } catch {
            const syncService = getSyncService();
            return await syncService.sendMessage(conversationId, encrypted, recipientId, groupEpoch, expiresAfterSeenSec);
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
        if (!shouldProcessGroupEvent(msg)) {
          setConnectionState(wsService.getState());
          return;
        }

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
        if (!shouldProcessGroupEvent(msg)) {
          setConnectionState(wsService.getState());
          return;
        }
        await ensureGroupConversationVisibleForUser(msg.conversation_id, msg.group_name, msg.group_epoch);
      }

      if (msg.type === 'message_seen' && msg.message_id && msg.seen_by && msg.seen_at) {
        markMessageSeen(
          msg.message_id,
          msg.seen_by,
          new Date(msg.seen_at).getTime(),
          msg.seen_count,
          msg.total_recipients,
          msg.all_recipients_seen,
          msg.sender_delete_after_seen_at ? new Date(msg.sender_delete_after_seen_at).getTime() : undefined,
        );
      }

      if ((msg.type === 'message_deleted_for_user' || msg.type === 'message_deleted_for_sender') && msg.message_id) {
        removeMessage(msg.message_id);
        deleteMessage(msg.message_id).catch(() => {
          // Best-effort local cleanup; API is source of truth.
        });
      }

      setConnectionState(wsService.getState());
    });

    return () => {
      unsubConnection();
      unsubMessage();
    };
  }, [handleIncomingMessage, getConversation, upsertConversation, ensureGroupConversationVisibleForUser, shouldProcessGroupEvent, markMessageSeen, removeMessage, user]);

  const sendMessage = useCallback((conversationId: string, encrypted: EncryptedData, recipientId?: string, groupEpoch?: number, expiresAfterSeenSec?: number) => {
    return wsService.sendMessage(conversationId, encrypted, recipientId, groupEpoch, expiresAfterSeenSec);
  }, []);

  const sendMessageSeen = useCallback((conversationId: string, messageId: string) => {
    const seenKey = `${conversationId}:${messageId}`;
    if (sentSeenRef.current.has(seenKey)) {
      return;
    }
    sentSeenRef.current.add(seenKey);
    wsService.sendMessageSeen(conversationId, messageId);
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
    sendMessageSeen,
    subscribeConversation,
    unsubscribeConversation,
    disconnect
  }), [
    connectionState,
    sendMessage,
    sendMessageSeen,
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
