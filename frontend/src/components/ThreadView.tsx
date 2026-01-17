/**
 * Thread view with real-time subscription
 */

import React, { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useThreadStore } from '../stores/threadStore';
import { useMessageStore } from '../stores/messageStore';
import { useCrypto } from '../crypto/CryptoContext';
import { useThreadSubscription } from '../hooks/useThreadSubscription';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';

interface Props {
  threadId: string;
}

export function ThreadView({ threadId }: Props) {
  const identity = useAuthStore(state => state.identity);
  const { getThread } = useThreadStore();
  const { loadMessagesForThread, getMessages } = useMessageStore();
  const { getThreadKey, decryptMessage } = useCrypto();

  const thread = getThread(threadId);
  const messages = getMessages(threadId);

  // Subscribe to real-time updates
  useThreadSubscription(threadId);

  // Load messages when thread changes
  useEffect(() => {
    if (identity && thread) {
      loadThreadMessages();
    }
  }, [threadId, identity, thread]);

  const loadThreadMessages = async () => {
    if (!identity || !thread) return;

    const threadKey = await getThreadKey(identity.userId, thread.participantUUID);

    await loadMessagesForThread(threadId, async (encrypted) => {
      return decryptMessage(threadKey, encrypted);
    });
  };

  if (!thread) {
    return <div className="thread-not-found">Thread not found</div>;
  }

  return (
    <div className="thread-view">
      <div className="thread-header">
        <div className="thread-avatar large">
          {thread.participantName[0].toUpperCase()}
        </div>
        <div className="thread-title">
          <h2>{thread.participantName}</h2>
          <span className="thread-uuid">{thread.participantUUID.slice(0, 8)}...</span>
        </div>
      </div>

      <MessageList
        messages={messages}
        currentUserId={identity?.userId || ''}
      />

      <MessageComposer
        threadId={threadId}
        participantUUID={thread.participantUUID}
      />
    </div>
  );
}
