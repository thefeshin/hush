/**
 * Sidebar with contacts and threads
 */

import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useContactStore } from '../stores/contactStore';
import { useThreadStore } from '../stores/threadStore';
import { useCrypto } from '../crypto/CryptoContext';
import { clearAllData } from '../services/storage';
import { wsService } from '../services/websocket';
import { AddContactModal } from './AddContactModal';
import { UUIDShare } from './UUIDShare';
import { ConnectionStatus } from './ConnectionStatus';

export function Sidebar() {
  const [showAddContact, setShowAddContact] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts'>('chats');

  const identity = useAuthStore(state => state.identity);
  const { logout } = useAuthStore();
  const { lockVault } = useCrypto();

  const { threads, activeThreadId, setActiveThread } = useThreadStore();
  const { contacts } = useContactStore();

  const handleLogout = async () => {
    wsService.disconnect();
    await clearAllData();
    lockVault();
    logout();
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

      {showProfile && (
        <div className="profile-panel">
          <UUIDShare />
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
            {threads.length === 0 ? (
              <div className="empty-list">
                <p>No conversations yet</p>
                <p className="hint">Add a contact to start chatting</p>
              </div>
            ) : (
              threads.map(thread => (
                <div
                  key={thread.threadId}
                  className={`thread-item ${thread.threadId === activeThreadId ? 'active' : ''}`}
                  onClick={() => setActiveThread(thread.threadId)}
                >
                  <div className="thread-avatar">
                    {thread.participantName[0].toUpperCase()}
                  </div>
                  <div className="thread-info">
                    <div className="thread-name">{thread.participantName}</div>
                    <div className="thread-time">{formatTime(thread.lastMessageAt)}</div>
                  </div>
                  {thread.unreadCount > 0 && (
                    <div className="unread-badge">{thread.unreadCount}</div>
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
                <p className="hint">Add someone by their UUID</p>
              </div>
            ) : (
              contacts.map(contact => (
                <ContactItem
                  key={contact.uuid}
                  contact={contact}
                  identity={identity!}
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
  identity
}: {
  contact: { uuid: string; displayName: string };
  identity: { userId: string; displayName: string };
}) {
  const { createThread } = useThreadStore();
  const { getThreadId, encryptIdentity } = useCrypto();
  const token = useAuthStore(state => state.token);

  const handleStartChat = async () => {
    const thread = await createThread(
      identity.userId,
      identity.displayName,
      contact.uuid,
      contact.displayName,
      getThreadId,
      encryptIdentity
    );

    // Also create thread on server if it was newly created
    if (token && thread) {
      try {
        const { getSyncService } = await import('../services/sync');
        const syncService = getSyncService(token);
        const encrypted = await encryptIdentity({
          participants: [identity.userId, contact.uuid].sort(),
          created_by: { user_id: identity.userId, display_name: identity.displayName },
          created_at: thread.createdAt
        });
        await syncService.createThread(thread.threadId, encrypted);
      } catch (err) {
        // Thread might already exist on server, that's ok
        console.log('Thread may already exist on server');
      }
    }
  };

  return (
    <div className="contact-item">
      <div className="contact-avatar">
        {contact.displayName[0].toUpperCase()}
      </div>
      <div className="contact-info">
        <div className="contact-name">{contact.displayName}</div>
        <div className="contact-uuid">{contact.uuid.slice(0, 8)}...</div>
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
