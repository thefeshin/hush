/**
 * Conversation view with real-time subscription
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useConversationStore } from "../stores/conversationStore";
import { useMessageStore } from "../stores/messageStore";
import { useCrypto } from "../crypto/CryptoContext";
import { useWebSocket } from '../hooks/useWebSocket';
import { getSyncService } from "../services/sync";
import { ChevronLeft, Users } from 'lucide-react';
import { useConversationSubscription } from "../hooks/useConversationSubscription";
import { MessageList } from "./MessageList";
import { MessageComposer } from "./MessageComposer";
import { GroupMembersModal } from './GroupMembersModal';

interface Props {
  conversationId: string;
}

export function ConversationView({ conversationId }: Props) {
  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const user = useAuthStore((state) => state.user);
  const { getConversation, setActiveConversation } = useConversationStore();
  const { loadMessagesForConversation, getMessages } = useMessageStore();
  const { getConversationKey, getGroupKey, decryptMessage } = useCrypto();
  const { sendMessageSeen } = useWebSocket();
  const navigate = useNavigate();

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

    try {
      const syncService = getSyncService();
      await syncService.syncConversation(conversationId, null);

      const conversationKey = conversation.kind === 'group'
        ? await getGroupKey(conversationId, conversation.keyEpoch || 1)
        : await getConversationKey(user.id, conversation.participantId);

      await loadMessagesForConversation(conversationId, async (encrypted) => {
        return decryptMessage(conversationKey, encrypted);
      });
    } catch (error) {
      console.error("Failed to load conversation messages", error);
    }
  };

  if (!conversation) {
    return <div className="flex h-full items-center justify-center text-text-secondary">Conversation not found</div>;
  }

  return (
    <div className="flex h-[100dvh] flex-col md:h-full">
      <div className="flex items-center gap-3 border-b border-border bg-bg-secondary p-4">
        <button
          type="button"
          className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-border bg-bg-primary font-bold leading-none text-text-primary"
          onClick={() => {
            setActiveConversation(null);
            navigate("/conversations");
          }}
          aria-label="Back to conversations"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-body font-bold text-zinc-900 md:h-12 md:w-12 md:text-h2">
          {conversation.participantUsername[0].toUpperCase()}
        </div>
        <div className="ml-1">
          <h2 className="text-h2">{conversation.participantUsername}</h2>
        </div>
        {conversation.kind === 'group' && (
          <button
            type="button"
            className="ml-auto inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-border bg-bg-primary text-text-primary"
            onClick={() => setShowGroupMembers(true)}
            aria-label="Manage group members"
            title="Manage members"
          >
            <Users className="h-4 w-4" />
          </button>
        )}
      </div>

      <MessageList
        messages={messages}
        currentUserId={user?.id || ""}
        onMessageVisible={(messageId) => sendMessageSeen(conversationId, messageId)}
      />

      <MessageComposer
        conversationId={conversationId}
        participantId={conversation.participantId}
        conversationKind={conversation.kind}
        groupEpoch={conversation.keyEpoch}
      />

      {showGroupMembers && conversation.kind === 'group' && (
        <GroupMembersModal
          conversationId={conversationId}
          onClose={() => setShowGroupMembers(false)}
        />
      )}
    </div>
  );
}
