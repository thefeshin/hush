/**
 * Conversation view with real-time subscription
 */

import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useConversationStore } from '../stores/conversationStore';
import { useMessageStore } from '../stores/messageStore';
import { useCrypto } from '../crypto/CryptoContext';
import { useConversationSubscription } from '../hooks/useConversationSubscription';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';

interface Props {
  conversationId: string;
}

export function ConversationView({ conversationId }: Props) {
  const user = useAuthStore(state => state.user);
  const { getConversation } = useConversationStore();
  const { loadMessagesForConversation, getMessages } = useMessageStore();
  const { getConversationKey, decryptMessage } = useCrypto();

  const conversation = getConversation(conversationId);
  const messages = getMessages(conversationId);

  // Subscribe to real-time updates for the active conversation.
  useConversationSubscription(conversationId);

  // Load messages when conversation changes
  useEffect(() => {
    if (user && conversation) {
      loadConversationMessages();
    }
  }, [conversationId, user, conversation]);

  const loadConversationMessages = async () => {
    if (!user || !conversation) return;

    const conversationKey = await getConversationKey(user.id, conversation.participantId);

    await loadMessagesForConversation(conversationId, async (encrypted) => {
      return decryptMessage(conversationKey, encrypted);
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
        conversationId={conversationId}
        participantId={conversation.participantId}
      />
    </div>
  );
}
