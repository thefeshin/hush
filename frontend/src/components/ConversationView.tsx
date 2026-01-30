/**
 * Conversation view with real-time subscription (renamed from ThreadView)
 */

import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useConversationStore } from '../stores/conversationStore';
import { useMessageStore } from '../stores/messageStore';
import { useCrypto } from '../crypto/CryptoContext';
import { useThreadSubscription } from '../hooks/useThreadSubscription';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';

interface Props {
  conversationId: string;
}

export function ConversationView({ conversationId }: Props) {
  const user = useAuthStore(state => state.user);
  const { getConversation } = useConversationStore();
  const { loadMessagesForThread, getMessages } = useMessageStore();
  const { getThreadKey, decryptMessage } = useCrypto();

  const conversation = getConversation(conversationId);
  const messages = getMessages(conversationId);

  // Subscribe to real-time updates (still uses threadId internally)
  useThreadSubscription(conversationId);

  // Load messages when conversation changes
  useEffect(() => {
    if (user && conversation) {
      loadConversationMessages();
    }
  }, [conversationId, user, conversation]);

  const loadConversationMessages = async () => {
    if (!user || !conversation) return;

    const threadKey = await getThreadKey(user.id, conversation.participantId);

    await loadMessagesForThread(conversationId, async (encrypted) => {
      return decryptMessage(threadKey, encrypted);
    });
  };

  if (!conversation) {
    return <div className="conversation-not-found">Conversation not found</div>;
  }

  return (
    <div className="conversation-view">
      <div className="conversation-header">
        <div className="conversation-avatar large">
          {conversation.participantUsername[0].toUpperCase()}
        </div>
        <div className="conversation-title">
          <h2>{conversation.participantUsername}</h2>
          <span className="conversation-uuid">{conversation.participantId.slice(0, 8)}...</span>
        </div>
      </div>

      <MessageList
        messages={messages}
        currentUserId={user?.id || ''}
      />

      <MessageComposer
        threadId={conversationId}
        participantId={conversation.participantId}
      />
    </div>
  );
}

// Export as ThreadView for backward compatibility
// TODO: Remove after full migration
export function ThreadView(props: { threadId: string }) {
  return <ConversationView conversationId={props.threadId} />;
}
