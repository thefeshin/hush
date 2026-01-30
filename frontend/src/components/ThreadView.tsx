/**
 * Thread view with real-time subscription
 */

import { useEffect } from 'react';
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
  const user = useAuthStore(state => state.user);
  const { getThread } = useThreadStore();
  const { loadMessagesForThread, getMessages } = useMessageStore();
  const { getThreadKey, decryptMessage } = useCrypto();

  const thread = getThread(threadId);
  const messages = getMessages(threadId);

  // Subscribe to real-time updates
  useThreadSubscription(threadId);

  // Load messages when thread changes
  useEffect(() => {
    if (user && thread) {
      loadThreadMessages();
    }
  }, [threadId, user, thread]);

  const loadThreadMessages = async () => {
    if (!user || !thread) return;

    const threadKey = await getThreadKey(user.id, thread.participantId);

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
          {thread.participantUsername[0].toUpperCase()}
        </div>
        <div className="thread-title">
          <h2>{thread.participantUsername}</h2>
          <span className="thread-uuid">{thread.participantId.slice(0, 8)}...</span>
        </div>
      </div>

      <MessageList
        messages={messages}
        currentUserId={user?.id || ''}
      />

      <MessageComposer
        threadId={threadId}
        participantId={thread.participantId}
      />
    </div>
  );
}
