/**
 * Message input and send functionality with offline queue support
 */

import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';
import { useMessageStore } from '../stores/messageStore';
import { useConversationStore } from '../stores/conversationStore';
import { useCrypto } from '../crypto/CryptoContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { saveMessage } from '../services/storage';
import { queueMessage } from '../services/messageQueue';
import { getGroupState } from '../services/api';
import { ensureGroupSendReadiness } from '../crypto/group-send';
import type { MessagePayload } from '../types/crypto';

interface Props {
  conversationId: string;
  participantId?: string;
  conversationKind?: 'direct' | 'group';
  groupEpoch?: number;
}

export function MessageComposer({ conversationId, participantId, conversationKind = 'direct', groupEpoch }: Props) {
  const [content, setContent] = useState('');
  const [expiresAfterSeenSec, setExpiresAfterSeenSec] = useState<'' | '15' | '30' | '60'>('');
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const user = useAuthStore(state => state.user);
  const { addPendingMessage, markMessageSent, markMessageFailed } = useMessageStore();
  const { updateLastMessage, getConversation, upsertConversation } = useConversationStore();
  const { getConversationKey, getGroupKey, encryptMessage } = useCrypto();
  const { sendMessage, isConnected } = useWebSocket();

  const focusComposerInput = () => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  // Focus input on mount and when conversation changes.
  useEffect(() => {
    focusComposerInput();
  }, [conversationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedContent = content.trim();
    if (!trimmedContent || !user || isSending) return;

    setIsSending(true);

    if (conversationKind === 'group') {
      const expectedEpoch = groupEpoch || 1;
      const readiness = await ensureGroupSendReadiness(conversationId, expectedEpoch, getGroupState);
      if (!readiness.ok) {
        if (readiness.reason === 'stale_epoch' && readiness.epoch) {
          const existing = getConversation(conversationId);
          if (existing) {
            upsertConversation({
              ...existing,
              keyEpoch: readiness.epoch,
            });
          }
          toast.error('Group key updated. Please send again.');
        } else if (readiness.reason === 'missing_envelope') {
          toast.error('Cannot send yet: your group key is not ready. Try again shortly.');
        } else {
          toast.error('Cannot verify group key right now. Please retry.');
        }

        setIsSending(false);
        focusComposerInput();
        return;
      }
    }

    setContent('');

    // Add pending message immediately (optimistic UI)
    const tempId = addPendingMessage(
      conversationId,
      trimmedContent,
      user.id,
      user.username,
      expiresAfterSeenSec ? Number(expiresAfterSeenSec) as 15 | 30 | 60 : undefined,
    );

    try {
      // Create message payload
      const payload: MessagePayload = {
        sender_id: user.id,
        sender_name: user.username,
        content: trimmedContent,
        timestamp: Date.now(),
        expires_after_seen_sec: expiresAfterSeenSec ? Number(expiresAfterSeenSec) as 15 | 30 | 60 : undefined,
        conversation_kind: conversationKind,
        group_id: conversationKind === 'group' ? conversationId : undefined,
        group_epoch: conversationKind === 'group' ? groupEpoch : undefined,
      };

      const payloadString = JSON.stringify(payload);

      // Get conversation key and encrypt
      const conversationKey = conversationKind === 'group'
        ? await getGroupKey(conversationId, groupEpoch || 1)
        : await getConversationKey(user.id, participantId || '');
      const encrypted = await encryptMessage(conversationKey, payloadString);

      if (isConnected) {
        try {
          const result = await sendMessage(
            conversationId,
            encrypted,
            conversationKind === 'direct' ? participantId : undefined,
            conversationKind === 'group' ? groupEpoch : undefined,
            payload.expires_after_seen_sec,
          );

          // Save to local storage
          await saveMessage(result.id, conversationId, encrypted, payload.timestamp);

          // Update message with real ID
          markMessageSent(tempId, result.id);
        } catch {
          // Silent fallback: queue for retry and keep optimistic UX.
          await queueMessage(
            conversationId,
            tempId,
            encrypted,
            conversationKind === 'direct' ? participantId : undefined,
            conversationKind === 'group' ? groupEpoch : undefined,
            payload.expires_after_seen_sec,
          );
          await saveMessage(tempId, conversationId, encrypted, payload.timestamp);
          markMessageSent(tempId, tempId);
        }
      } else {
        // Queue for later when offline
        await queueMessage(
          conversationId,
          tempId,
          encrypted,
          conversationKind === 'direct' ? participantId : undefined,
          conversationKind === 'group' ? groupEpoch : undefined,
          payload.expires_after_seen_sec,
        );

        // Save to local storage with the same temporary ID for deterministic replay reconciliation
        await saveMessage(tempId, conversationId, encrypted, payload.timestamp);

        // Mark as queued-sent in UI while waiting for server reconciliation
        markMessageSent(tempId, tempId);
      }

      updateLastMessage(conversationId, Date.now());
    } catch (err) {
      console.error('Failed to send message', err);
      markMessageFailed(tempId);
    } finally {
      setIsSending(false);
      focusComposerInput();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form className="flex gap-2 border-t border-border bg-bg-secondary p-4 max-[480px]:p-3" onSubmit={handleSubmit}>
      <select
        value={expiresAfterSeenSec}
        onChange={(e) => setExpiresAfterSeenSec(e.target.value as '' | '15' | '30' | '60')}
        className="h-10 rounded-lg border border-border bg-bg-primary px-2 text-caption text-text-primary"
        title="Disappear after seen"
      >
        <option value="">Off</option>
        <option value="15">15s</option>
        <option value="30">30s</option>
        <option value="60">1m</option>
      </select>
      <textarea
        ref={inputRef}
        value={content}
        onChange={e => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isConnected ? 'Type a message...' : 'Offline - message will be queued...'}
        rows={1}
        className="max-h-[150px] flex-1 resize-none rounded-3xl border border-border bg-bg-primary px-4 py-3 text-body text-text-primary outline-none focus:border-accent"
      />
      <button
        type="submit"
        onMouseDown={e => e.preventDefault()}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-accent text-h2 text-zinc-900 transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!content.trim() || isSending}
        title={isConnected ? 'Send message' : 'Queue message (offline)'}
      >
        {isSending ? '...' : '\u27A4'}
      </button>
    </form>
  );
}
