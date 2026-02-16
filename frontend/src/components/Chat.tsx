/**
 * Main chat interface
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useContactStore } from '../stores/contactStore';
import { useConversationStore } from '../stores/conversationStore';
import { useCrypto } from '../crypto/CryptoContext';
import { Sidebar } from './Sidebar';
import { ConversationView } from './ConversationView';
import { EmptyState } from './EmptyState';

export function Chat() {
  const user = useAuthStore(state => state.user);
  const { contacts, loadAllContacts } = useContactStore();
  const { conversations, activeConversationId, loadAllConversations, discoverConversations, setActiveConversation } = useConversationStore();
  const { decryptContacts, decryptIdentity } = useCrypto();
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [hasDiscovered, setHasDiscovered] = useState(false);
  const isConversationRoute = Boolean(username);

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
    if (!username) {
      setActiveConversation(null);
      return;
    }

    const decodedUsername = decodeURIComponent(username).toLowerCase();
    if (decodedUsername === 'inbox') {
      setActiveConversation(null);
      navigate('/conversation', { replace: true });
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
    navigate('/conversation', { replace: true });
  }, [username, conversations, activeConversationId, setActiveConversation, navigate]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-border border-t-accent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden md:h-screen">
      <Sidebar isConversationRoute={isConversationRoute} />
      <main className={`${isConversationRoute ? 'flex' : 'hidden'} h-[100dvh] w-full flex-col bg-bg-primary min-w-0 md:flex md:h-screen md:flex-1`}>
        {activeConversationId ? (
          <ConversationView conversationId={activeConversationId} />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}
