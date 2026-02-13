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
  const { getThreadKey, encryptMessage } = useCrypto();
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

      // Get thread key and encrypt
      const threadKey = await getThreadKey(user.id, participantId);
      const encrypted = await encryptMessage(threadKey, payloadString);

      if (isConnected) {
        // Send via WebSocket
        const result = await sendMessage(conversationId, encrypted);

        // Save to local storage
        await saveMessage(result.id, conversationId, encrypted, payload.timestamp);

        // Update message with real ID
        markMessageSent(tempId, result.id);
      } else {
        // Queue for later when offline
        const queuedId = await queueMessage(conversationId, tempId, encrypted);

        // Save to local storage with queued ID
        await saveMessage(queuedId, conversationId, encrypted, payload.timestamp);

        // Mark as sent (but queued)
        markMessageSent(tempId, queuedId);
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
    <form className="message-composer" onSubmit={handleSubmit}>
      <textarea
        ref={inputRef}
        value={content}
        onChange={e => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isConnected ? 'Type a message...' : 'Offline - message will be queued...'}
        rows={1}
        disabled={isSending}
      />
      <button
        type="submit"
        className="send-button"
        disabled={!content.trim() || isSending}
        title={isConnected ? 'Send message' : 'Queue message (offline)'}
      >
        {isSending ? '...' : '\u27A4'}
      </button>
    </form>
  );
}
