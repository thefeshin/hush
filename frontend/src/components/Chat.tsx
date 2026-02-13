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

import '../styles/chat.css';

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
    return <div className="loading-screen"><div className="spinner" /></div>;
  }

  return (
    <div className={`chat-container ${isConversationRoute ? 'mobile-conversation-open' : ''}`}>
      <Sidebar />
      <main className="chat-main">
        {activeConversationId ? (
          <ConversationView conversationId={activeConversationId} />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}
