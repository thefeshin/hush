/**
 * Message input and send functionality with offline queue support
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useMessageStore } from '../stores/messageStore';
import { useThreadStore } from '../stores/threadStore';
import { useCrypto } from '../crypto/CryptoContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { saveMessage } from '../services/storage';
import { queueMessage, processQueue } from '../services/messageQueue';
import type { MessagePayload } from '../types/crypto';

interface Props {
  threadId: string;
  participantUUID: string;
}

export function MessageComposer({ threadId, participantUUID }: Props) {
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const identity = useAuthStore(state => state.identity);
  const { addPendingMessage, markMessageSent, markMessageFailed } = useMessageStore();
  const { updateLastMessage } = useThreadStore();
  const { getThreadKey, encryptMessage } = useCrypto();
  const { sendMessage, isConnected } = useWebSocket();

  // Focus input on mount and when thread changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId]);

  // Process queue when connection is restored
  useEffect(() => {
    if (isConnected) {
      processQueue(sendMessage).then(({ sent, failed }) => {
        if (sent > 0) {
          console.log(`Sent ${sent} queued messages`);
        }
        if (failed > 0) {
          console.warn(`Failed to send ${failed} queued messages`);
        }
      }).catch(console.error);
    }
  }, [isConnected, sendMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedContent = content.trim();
    if (!trimmedContent || !identity || isSending) return;

    setIsSending(true);
    setContent('');

    // Add pending message immediately (optimistic UI)
    const tempId = addPendingMessage(
      threadId,
      trimmedContent,
      identity.userId,
      identity.displayName
    );

    try {
      // Create message payload
      const payload: MessagePayload = {
        sender_id: identity.userId,
        sender_name: identity.displayName,
        content: trimmedContent,
        timestamp: Date.now()
      };

      const payloadString = JSON.stringify(payload);

      // Get thread key and encrypt
      const threadKey = await getThreadKey(identity.userId, participantUUID);
      const encrypted = await encryptMessage(threadKey, payloadString);

      if (isConnected) {
        // Send via WebSocket
        const result = await sendMessage(threadId, encrypted);

        // Save to local storage
        await saveMessage(result.id, threadId, encrypted, payload.timestamp);

        // Update message with real ID
        markMessageSent(tempId, result.id);
      } else {
        // Queue for later when offline
        const queuedId = await queueMessage(threadId, encrypted, payloadString);

        // Save to local storage with queued ID
        await saveMessage(queuedId, threadId, encrypted, payload.timestamp);

        // Mark as sent (but queued)
        markMessageSent(tempId, queuedId);
      }

      updateLastMessage(threadId, Date.now());
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
