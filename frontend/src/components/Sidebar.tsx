/**
 * Sidebar with contacts and conversations
 */

import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useContactStore, Contact } from '../stores/contactStore';
import { useConversationStore } from '../stores/conversationStore';
import { useCrypto } from '../crypto/CryptoContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { clearAllData } from '../services/storage';
import { clearQueue } from '../services/messageQueue';
import { AddContactModal } from './AddContactModal';
import { ConnectionStatus } from './ConnectionStatus';

export function Sidebar() {
  const [showAddContact, setShowAddContact] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts'>('chats');

  const user = useAuthStore(state => state.user);
  const { logout } = useAuthStore();
  const { lockVault } = useCrypto();
  const { disconnect } = useWebSocket();
  const navigate = useNavigate();
  const location = useLocation();

  const { conversations, activeConversationId, setActiveConversation } = useConversationStore();
  const { contacts } = useContactStore();
  const isInboxActive = location.pathname === '/conversation' || location.pathname === '/conversation/inbox';

  const handleLogout = async () => {
    disconnect();
    await clearQueue();
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
            </div>
            <button
              onClick={() => navigate('/settings')}
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
          <div className="conversation-list">
            <div
              className={`conversation-item ${isInboxActive ? 'active' : ''}`}
              onClick={() => {
                setActiveConversation(null);
                navigate('/conversation');
              }}
            >
              <div className="conversation-avatar">#</div>
              <div className="conversation-info">
                <div className="conversation-name">Inbox</div>
                <div className="conversation-time">All conversations</div>
              </div>
            </div>

            {conversations.length === 0 ? (
              <div className="empty-list">
                <p>No conversations yet</p>
                <p className="hint">Add a contact to start chatting</p>
              </div>
            ) : (
              conversations.map(conversation => (
                <div
                  key={conversation.conversationId}
                  className={`conversation-item ${conversation.conversationId === activeConversationId ? 'active' : ''}`}
                  onClick={() => {
                    setActiveConversation(conversation.conversationId);
                    navigate(`/conversation/${encodeURIComponent(conversation.participantUsername)}`);
                  }}
                >
                  <div className="conversation-avatar">
                    {conversation.participantUsername[0].toUpperCase()}
                  </div>
                  <div className="conversation-info">
                    <div className="conversation-name">
                      {conversation.participantUsername}
                    </div>
                    <div className="conversation-time">{formatTime(conversation.lastMessageAt)}</div>
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
  const { getConversationId, encryptIdentity } = useCrypto();
  const navigate = useNavigate();

  const handleStartChat = async () => {
    const conversation = await getOrCreateConversation(
      user.id,
      user.username,
      contact.id,
      contact.username,
      getConversationId,
      encryptIdentity
    );
    navigate(`/conversation/${encodeURIComponent(conversation.participantUsername)}`);
  };

  return (
    <div className="contact-item">
      <div className="contact-avatar">
        {contact.username[0].toUpperCase()}
      </div>
      <div className="contact-info">
        <div className="contact-name">{contact.username}</div>
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
