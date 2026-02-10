/**
 * Sidebar with contacts and conversations
 */

import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useContactStore, Contact } from '../stores/contactStore';
import { useConversationStore } from '../stores/conversationStore';
import { useCrypto } from '../crypto/CryptoContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { clearAllData } from '../services/storage';
import { AddContactModal } from './AddContactModal';
import { ConnectionStatus } from './ConnectionStatus';

interface SidebarProps {
  onNavigate: (page: 'chat' | 'settings') => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const [showAddContact, setShowAddContact] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts'>('chats');

  const user = useAuthStore(state => state.user);
  const { logout } = useAuthStore();
  const { lockVault } = useCrypto();
  const { disconnect } = useWebSocket();

  const { conversations, activeConversationId, setActiveConversation } = useConversationStore();
  const { contacts } = useContactStore();

  const handleLogout = async () => {
    disconnect();
    await clearAllData();
    await lockVault();  // lockVault is now async
    await logout();
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();

    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="header-left">
          <h1 className="app-title">HUSH</h1>
          <ConnectionStatus />
        </div>
        <div className="header-actions">
          <button
            onClick={() => setShowProfile(!showProfile)}
            className="icon-button"
            title="Your Profile"
          >
            <span>&#x1F464;</span>
          </button>
          <button
            onClick={handleLogout}
            className="icon-button"
            title="Lock Vault"
          >
            <span>&#x1F512;</span>
          </button>
        </div>
      </div>

      {showProfile && user && (
        <div className="profile-panel">
          <div className="profile-info">
            <div className="profile-avatar">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="profile-details">
              <span className="profile-username">{user.username}</span>
              <span className="profile-id">{user.id.slice(0, 8)}...</span>
            </div>
            <button
              onClick={() => onNavigate('settings')}
              className="settings-link"
              title="Settings"
            >
              &#9881;
            </button>
          </div>
        </div>
      )}

      <div className="sidebar-tabs">
        <button
          className={`tab ${activeTab === 'chats' ? 'active' : ''}`}
          onClick={() => setActiveTab('chats')}
        >
          Chats
        </button>
        <button
          className={`tab ${activeTab === 'contacts' ? 'active' : ''}`}
          onClick={() => setActiveTab('contacts')}
        >
          Contacts
        </button>
      </div>

      <div className="sidebar-content">
        {activeTab === 'chats' && (
          <div className="thread-list">
            {conversations.length === 0 ? (
              <div className="empty-list">
                <p>No conversations yet</p>
                <p className="hint">Add a contact to start chatting</p>
              </div>
            ) : (
              conversations.map(conversation => (
                <div
                  key={conversation.conversationId}
                  className={`thread-item ${conversation.conversationId === activeConversationId ? 'active' : ''}`}
                  onClick={() => setActiveConversation(conversation.conversationId)}
                >
                  <div className="thread-avatar">
                    {conversation.participantUsername[0].toUpperCase()}
                  </div>
                  <div className="thread-info">
                    <div className="thread-name">
                      {conversation.participantUsername === 'Unknown' ? 'Unknown Contact' : conversation.participantUsername}
                    </div>
                    <div className="thread-time">{formatTime(conversation.lastMessageAt)}</div>
                  </div>
                  {conversation.unreadCount > 0 && (
                    <div className="unread-badge">{conversation.unreadCount}</div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'contacts' && (
          <div className="contact-list">
            <button
              className="add-contact-button"
              onClick={() => setShowAddContact(true)}
            >
              + Add Contact
            </button>

            {contacts.length === 0 ? (
              <div className="empty-list">
                <p>No contacts yet</p>
                <p className="hint">Add someone by their username</p>
              </div>
            ) : (
              contacts.map(contact => (
                <ContactItem
                  key={contact.id}
                  contact={contact}
                  user={user!}
                />
              ))
            )}
          </div>
        )}
      </div>

      {showAddContact && (
        <AddContactModal onClose={() => setShowAddContact(false)} />
      )}
    </aside>
  );
}

// Contact item with ability to start chat
function ContactItem({
  contact,
  user
}: {
  contact: Contact;
  user: { id: string; username: string };
}) {
  const { getOrCreateConversation } = useConversationStore();
  const { getThreadId, encryptIdentity } = useCrypto();

  const handleStartChat = async () => {
    const conversation = await getOrCreateConversation(
      user.id,
      user.username,
      contact.id,
      contact.username,
      getThreadId,
      encryptIdentity
    );

    // Also create thread on server if it was newly created
    if (conversation) {
      try {
        const { getSyncService } = await import('../services/sync');
        const syncService = getSyncService();
        const encrypted = await encryptIdentity({
          participants: [user.id, contact.id].sort(),
          created_by: { user_id: user.id, display_name: user.username },
          created_at: conversation.createdAt
        });

        // Sort participant IDs for thread_participants table
        const sortedParticipants = [user.id, contact.id].sort();
        await syncService.createThread(
          conversation.conversationId,
          encrypted,
          sortedParticipants[0], // participant_1 (lower UUID)
          sortedParticipants[1]  // participant_2 (higher UUID)
        );
      } catch (err) {
        // Thread might already exist on server, that's ok
        console.log('Thread may already exist on server');
      }
    }
  };

  return (
    <div className="contact-item">
      <div className="contact-avatar">
        {contact.username[0].toUpperCase()}
      </div>
      <div className="contact-info">
        <div className="contact-name">{contact.username}</div>
        <div className="contact-uuid">{contact.id.slice(0, 8)}...</div>
      </div>
      <button
        className="start-chat-button"
        onClick={handleStartChat}
        title="Start chat"
      >
        &#x1F4AC;
      </button>
    </div>
  );
}
