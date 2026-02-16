/**
 * Main chat interface
 */

import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useContactStore } from '../stores/contactStore';
import { useConversationStore } from '../stores/conversationStore';
import { useCrypto } from '../crypto/CryptoContext';
import { Sidebar } from './Sidebar';
import { ConversationView } from './ConversationView';
import { EmptyState } from './EmptyState';

const VALID_TABS = ['conversations', 'contacts', 'settings'] as const;
type ChatTab = (typeof VALID_TABS)[number];

export function Chat() {
  const user = useAuthStore(state => state.user);
  const { contacts, loadAllContacts } = useContactStore();
  const { conversations, activeConversationId, loadAllConversations, discoverConversations, setActiveConversation } = useConversationStore();
  const { decryptContacts, decryptIdentity } = useCrypto();
  const { username } = useParams<{ username?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [hasDiscovered, setHasDiscovered] = useState(false);
  const pathRoot = location.pathname.split('/')[1] || 'conversations';
  const activeTab: ChatTab = VALID_TABS.includes(pathRoot as ChatTab)
    ? (pathRoot as ChatTab)
    : 'conversations';
  const isConversationRoute = activeTab === 'conversations' && Boolean(username);

  // Load contacts on mount
  useEffect(() => {
    if (user) {
      loadAllContacts(decryptContacts);
    }
  }, [user]);

  // Load conversations after contacts are loaded
  useEffect(() => {
    if (user) {
      loadAllConversations(
        user.id,
        contacts,
        decryptIdentity
      );
    }
  }, [user, contacts.length, loadAllConversations, decryptIdentity]);

  // Discover conversations from server and subscribe via WebSocket
  useEffect(() => {
    if (!user || hasDiscovered) return;

    const initializeDiscovery = async () => {
      try {
        // Discover all conversations for this user (including unknown contacts).
        await discoverConversations();
        setHasDiscovered(true);
      } catch (err) {
        console.error('Failed to initialize conversation discovery', err);
      }
    };

    initializeDiscovery();
  }, [user, hasDiscovered, discoverConversations]);

  useEffect(() => {
    if (activeTab !== 'conversations' || !username) {
      setActiveConversation(null);
      return;
    }

    const decodedUsername = decodeURIComponent(username).toLowerCase();
    if (decodedUsername === 'inbox') {
      setActiveConversation(null);
      navigate('/conversations', { replace: true });
      return;
    }

    const matchedConversation = conversations.find(
      (conversation) => conversation.participantUsername.toLowerCase() === decodedUsername
    );

    if (matchedConversation) {
      if (matchedConversation.conversationId !== activeConversationId) {
        setActiveConversation(matchedConversation.conversationId);
      }
      return;
    }

    setActiveConversation(null);
    navigate('/conversations', { replace: true });
  }, [activeTab, username, conversations, activeConversationId, setActiveConversation, navigate]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-border border-t-accent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar isConversationRoute={isConversationRoute} activeTab={activeTab} />
      <main className={`${isConversationRoute ? 'flex' : 'hidden'} h-[100dvh] w-full min-w-0 flex-col bg-bg-primary`}>
        {activeConversationId ? (
          <ConversationView conversationId={activeConversationId} />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}
