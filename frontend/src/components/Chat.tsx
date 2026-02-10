/**
 * Main chat interface
 */

import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useContactStore } from '../stores/contactStore';
import { useConversationStore } from '../stores/conversationStore';
import { useCrypto } from '../crypto/CryptoContext';
import { Sidebar } from './Sidebar';
import { ConversationView } from './ConversationView';
import { EmptyState } from './EmptyState';

import '../styles/chat.css';

interface ChatProps {
  onNavigate?: (page: 'chat' | 'settings') => void;
}

export function Chat({ onNavigate }: ChatProps) {
  const user = useAuthStore(state => state.user);
  const { contacts, loadAllContacts } = useContactStore();
  const { activeConversationId, loadAllConversations, discoverConversations } = useConversationStore();
  const { decryptContacts, getThreadId, decryptIdentity } = useCrypto();
  const [hasDiscovered, setHasDiscovered] = useState(false);

  // Default no-op handler if onNavigate not provided
  const handleNavigate = onNavigate || (() => {});

  // Load contacts on mount
  useEffect(() => {
    if (user) {
      loadAllContacts(decryptContacts);
    }
  }, [user]);

  // Load conversations after contacts are loaded
  useEffect(() => {
    if (user && contacts.length > 0) {
      loadAllConversations(
        user.id,
        contacts,
        getThreadId,
        decryptIdentity
      );
    }
  }, [user, contacts.length]);

  // Discover conversations from server and subscribe via WebSocket
  useEffect(() => {
    if (!user || hasDiscovered) return;

    const initializeDiscovery = async () => {
      try {
        // Discover all conversations for this user (including unknown contacts).
        await discoverConversations(user.id, decryptIdentity);
        setHasDiscovered(true);
      } catch (err) {
        console.error('Failed to initialize conversation discovery', err);
      }
    };

    initializeDiscovery();
  }, [user, hasDiscovered]);

  if (!user) {
    return <div className="loading-screen"><div className="spinner" /></div>;
  }

  return (
    <div className="chat-container">
      <Sidebar onNavigate={handleNavigate} />
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
