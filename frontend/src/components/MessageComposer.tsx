/**
 * Message input and send functionality with offline queue support
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useMessageStore } from '../stores/messageStore';
import { useConversationStore } from '../stores/conversationStore';
import { useCrypto } from '../crypto/CryptoContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { saveMessage } from '../services/storage';
import { queueMessage } from '../services/messageQueue';
import type { MessagePayload } from '../types/crypto';

interface Props {
  conversationId: string;
  participantId: string;
}

export function MessageComposer({ conversationId, participantId }: Props) {
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const user = useAuthStore(state => state.user);
  const { addPendingMessage, markMessageSent, markMessageFailed } = useMessageStore();
  const { updateLastMessage } = useConversationStore();
  const { getConversationKey, encryptMessage } = useCrypto();
  const { sendMessage, isConnected } = useWebSocket();

  // Focus input on mount and when conversation changes.
  useEffect(() => {
    inputRef.current?.focus();
  }, [conversationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedContent = content.trim();
    if (!trimmedContent || !user || isSending) return;

    setIsSending(true);
    setContent('');

    // Add pending message immediately (optimistic UI)
    const tempId = addPendingMessage(
      conversationId,
      trimmedContent,
      user.id,
      user.username
    );

    try {
      // Create message payload
      const payload: MessagePayload = {
        sender_id: user.id,
        sender_name: user.username,
        content: trimmedContent,
        timestamp: Date.now()
      };

      const payloadString = JSON.stringify(payload);

      // Get conversation key and encrypt
      const conversationKey = await getConversationKey(user.id, participantId);
      const encrypted = await encryptMessage(conversationKey, payloadString);

      if (isConnected) {
        try {
          const result = await sendMessage(conversationId, encrypted, participantId);

          // Save to local storage
          await saveMessage(result.id, conversationId, encrypted, payload.timestamp);

          // Update message with real ID
          markMessageSent(tempId, result.id);
        } catch {
          // Silent fallback: queue for retry and keep optimistic UX.
          await queueMessage(conversationId, tempId, encrypted, participantId);
          await saveMessage(tempId, conversationId, encrypted, payload.timestamp);
          markMessageSent(tempId, tempId);
        }
      } else {
        // Queue for later when offline
        await queueMessage(conversationId, tempId, encrypted, participantId);

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
    <form className="flex gap-2 border-t border-border bg-bg-secondary p-4 max-[480px]:p-3" onSubmit={handleSubmit}>
      <textarea
        ref={inputRef}
        value={content}
        onChange={e => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isConnected ? 'Type a message...' : 'Offline - message will be queued...'}
        rows={1}
        disabled={isSending}
        className="max-h-[150px] flex-1 resize-none rounded-3xl border border-border bg-bg-primary px-4 py-3 text-sm text-text-primary outline-none focus:border-accent"
      />
      <button
        type="submit"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-accent text-xl text-zinc-900 transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!content.trim() || isSending}
        title={isConnected ? 'Send message' : 'Queue message (offline)'}
      >
        {isSending ? '...' : '\u27A4'}
      </button>
    </form>
  );
}
