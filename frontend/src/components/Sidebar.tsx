/**
 * Sidebar with contacts and conversations
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useContactStore, Contact } from '../stores/contactStore';
import { useConversationStore } from '../stores/conversationStore';
import { useCrypto } from '../crypto/CryptoContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { clearAllData } from '../services/storage';
import { clearQueue } from '../services/messageQueue';
import { MessageCirclePlus, Settings as SettingsIcon, Shield, UserCircle2 } from 'lucide-react';
import { AddContactModal } from './AddContactModal';
import { ConnectionStatus } from './ConnectionStatus';

interface SidebarProps {
  isConversationRoute?: boolean;
}

export function Sidebar({ isConversationRoute = false }: SidebarProps) {
  const [showAddContact, setShowAddContact] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts'>('chats');

  const user = useAuthStore(state => state.user);
  const { logout } = useAuthStore();
  const { lockVault } = useCrypto();
  const { disconnect } = useWebSocket();
  const navigate = useNavigate();

  const { conversations, activeConversationId, setActiveConversation } = useConversationStore();
  const { contacts } = useContactStore();

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
    <aside className={`${isConversationRoute ? 'hidden' : 'flex'} h-[100dvh] w-full flex-col bg-bg-secondary md:flex md:h-screen md:w-80 md:border-r md:border-border`}>
      <div className="flex items-center justify-between border-b border-border p-4 max-[480px]:p-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl font-black tracking-[0.2rem] text-accent max-[480px]:text-xl">HUSH</h1>
          <ConnectionStatus />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowProfile(!showProfile)}
            className="cursor-pointer rounded bg-transparent p-2 text-xl text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
            title="Your Profile"
          >
            <UserCircle2 className="h-5 w-5" />
          </button>
          <button
            onClick={handleLogout}
            className="cursor-pointer rounded bg-transparent p-2 text-xl text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
            title="Lock Vault"
          >
            <Shield className="h-5 w-5" />
          </button>
        </div>
      </div>

      {showProfile && user && (
        <div className="border-b border-border bg-bg-tertiary p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent font-semibold text-zinc-900">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col">
                <span className="text-lg font-semibold">{user.username}</span>
            </div>
            <button
              onClick={() => navigate('/settings')}
              className="ml-auto cursor-pointer rounded bg-transparent p-2 text-xl text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
              title="Settings"
            >
              <SettingsIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex border-b border-border">
        <button
          className={`flex-1 border-0 border-b-2 bg-transparent px-3 py-3 text-sm font-medium transition-colors ${activeTab === 'chats' ? 'border-b-accent text-text-primary' : 'border-b-transparent text-text-secondary hover:text-text-primary'}`}
          onClick={() => setActiveTab('chats')}
        >
          Chats
        </button>
        <button
          className={`flex-1 border-0 border-b-2 bg-transparent px-3 py-3 text-sm font-medium transition-colors ${activeTab === 'contacts' ? 'border-b-accent text-text-primary' : 'border-b-transparent text-text-secondary hover:text-text-primary'}`}
          onClick={() => setActiveTab('contacts')}
        >
          Contacts
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'chats' && (
          <div className="flex flex-col">
            {conversations.length === 0 ? (
              <div className="p-8 text-center text-text-secondary">
                <p>No conversations yet</p>
                <p className="mt-2 text-xs text-text-secondary">Add a contact to start chatting</p>
              </div>
            ) : (
              conversations.map(conversation => (
                <div
                  key={conversation.conversationId}
                  className={`flex cursor-pointer items-center border-b border-border px-4 py-3 transition-colors max-[480px]:px-3 max-[480px]:py-2 ${conversation.conversationId === activeConversationId ? 'border-l-[3px] border-l-accent bg-bg-tertiary' : 'hover:bg-bg-tertiary'}`}
                  onClick={() => {
                    setActiveConversation(conversation.conversationId);
                    navigate(`/conversation/${encodeURIComponent(conversation.participantUsername)}`);
                  }}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-base font-bold text-zinc-900">
                    {conversation.participantUsername[0].toUpperCase()}
                  </div>
                  <div className="ml-3 min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {conversation.participantUsername}
                    </div>
                    <div className="text-xs text-text-secondary">{formatTime(conversation.lastMessageAt)}</div>
                  </div>
                  {conversation.unreadCount > 0 && (
                    <div className="ml-2 rounded-2xl bg-accent px-2 py-0.5 text-xs font-bold text-zinc-900">{conversation.unreadCount}</div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'contacts' && (
          <div className="flex flex-col">
            <button
              className="mx-4 my-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-transparent py-3 text-sm text-accent transition-colors hover:bg-bg-tertiary"
              onClick={() => setShowAddContact(true)}
            >
              <MessageCirclePlus className="h-4 w-4" />
              Add Contact
            </button>

            {contacts.length === 0 ? (
              <div className="p-8 text-center text-text-secondary">
                <p>No contacts yet</p>
                <p className="mt-2 text-xs text-text-secondary">Add someone by their username</p>
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
    <div className="flex items-center border-b border-border px-4 py-3 max-[480px]:px-3 max-[480px]:py-2">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-base font-bold text-zinc-900">
        {contact.username[0].toUpperCase()}
      </div>
      <div className="ml-3 min-w-0 flex-1">
        <div className="truncate font-medium">{contact.username}</div>
      </div>
      <button
        className="cursor-pointer border-0 bg-transparent p-2 text-xl opacity-70 transition-opacity hover:opacity-100"
        onClick={handleStartChat}
        title="Start chat"
      >
        <MessageCirclePlus className="h-5 w-5" />
      </button>
    </div>
  );
}
