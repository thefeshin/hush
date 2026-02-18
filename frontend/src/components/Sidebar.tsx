/**
 * Sidebar with contacts and conversations
 */

import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';
import { useContactStore, Contact } from '../stores/contactStore';
import { useConversationStore } from '../stores/conversationStore';
import { useCrypto } from '../crypto/CryptoContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { clearAllData } from '../services/storage';
import { clearQueue } from '../services/messageQueue';
import { ContactRound, Lock, MessageCircle, MessageCirclePlus, Settings as SettingsIcon } from 'lucide-react';
import { AddContactModal } from './AddContactModal';
import { GroupCreateModal } from './GroupCreateModal';
import { ConnectionStatus } from './ConnectionStatus';
import { Settings } from './Settings';

const panelVariants = {
  enter: (direction: 1 | -1) => ({
    x: direction > 0 ? 28 : -28,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: 1 | -1) => ({
    x: direction > 0 ? -28 : 28,
    opacity: 0,
  }),
};

interface SidebarProps {
  isConversationRoute?: boolean;
  activeTab: 'conversations' | 'contacts' | 'settings';
}

export function Sidebar({ isConversationRoute = false, activeTab }: SidebarProps) {
  const [showAddContact, setShowAddContact] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  const user = useAuthStore(state => state.user);
  const { logout } = useAuthStore();
  const { lockVault } = useCrypto();
  const { disconnect } = useWebSocket();
  const navigate = useNavigate();

  const { conversations, activeConversationId, setActiveConversation } = useConversationStore();
  const { contacts } = useContactStore();
  const previousTabRef = useRef<'conversations' | 'contacts' | 'settings'>(activeTab);

  const slideDirection = useMemo<1 | -1>(() => {
    const order = { conversations: 0, contacts: 1, settings: 2 };
    const direction: 1 | -1 = order[activeTab] >= order[previousTabRef.current] ? 1 : -1;
    previousTabRef.current = activeTab;
    return direction;
  }, [activeTab]);

  const handleLogout = async () => {
    disconnect();
    await clearQueue();
    await clearAllData();
    await lockVault();  // lockVault is now async
    await logout();
  };

  const handleGroupCreated = (conversationId: string) => {
    setActiveConversation(conversationId);
    navigate(`/conversations/id/${conversationId}`);
    toast.success('Group created');
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
    <aside className={`${isConversationRoute ? 'hidden' : 'flex'} h-[100dvh] w-full flex-col bg-bg-secondary`}>
      <div className="flex items-center justify-between border-b border-border p-4 max-[480px]:p-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-h1 font-black tracking-[0.2rem] text-accent max-[480px]:text-h2">HUSH</h1>
          <ConnectionStatus />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleLogout}
            className="cursor-pointer rounded bg-transparent p-2 text-h2 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
            title="Lock Vault"
          >
            <Lock className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false} custom={slideDirection}>
          {activeTab === 'conversations' && (
            <motion.div
              key="conversations"
              custom={slideDirection}
              variants={panelVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute inset-0 overflow-y-auto"
            >
              <div className="flex flex-col pb-20">
            {conversations.length === 0 ? (
              <div className="p-8 text-center text-text-secondary">
                <p>No conversations yet</p>
                <p className="mt-2 text-caption text-text-secondary">Add a contact to start chatting</p>
              </div>
            ) : (
              conversations.map(conversation => (
                <div
                  key={conversation.conversationId}
                  className={`flex cursor-pointer items-center border-b border-border px-4 py-3 transition-colors max-[480px]:px-3 max-[480px]:py-2 ${conversation.conversationId === activeConversationId ? 'border-l-[3px] border-l-accent bg-bg-tertiary' : 'hover:bg-bg-tertiary'}`}
                  onClick={() => {
                    setActiveConversation(conversation.conversationId);
                    navigate(`/conversations/id/${conversation.conversationId}`);
                  }}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-body font-bold text-zinc-900">
                    {conversation.participantUsername[0].toUpperCase()}
                  </div>
                  <div className="ml-3 min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {conversation.participantUsername}
                    </div>
                    <div className="text-caption text-text-secondary">{formatTime(conversation.lastMessageAt)}</div>
                  </div>
                  {conversation.unreadCount > 0 && (
                    <div className="ml-2 rounded-2xl bg-accent px-2 py-0.5 text-caption font-bold text-zinc-900">{conversation.unreadCount}</div>
                  )}
                </div>
              ))
            )}
              </div>
            </motion.div>
          )}

          {activeTab === 'contacts' && (
            <motion.div
              key="contacts"
              custom={slideDirection}
              variants={panelVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute inset-0 overflow-y-auto"
            >
              <div className="flex flex-col pb-20">
            <button
              className="mx-4 my-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-transparent py-3 text-body text-accent transition-colors hover:bg-bg-tertiary"
              onClick={() => setShowAddContact(true)}
            >
              <MessageCirclePlus className="h-4 w-4" />
              Add Contact
            </button>
            <button
              className="mx-4 mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-bg-primary py-3 text-body text-text-primary transition-colors hover:bg-bg-tertiary"
              onClick={() => setShowCreateGroup(true)}
            >
              <MessageCircle className="h-4 w-4" />
              New Group
            </button>

            {contacts.length === 0 ? (
              <div className="p-8 text-center text-text-secondary">
                <p>No contacts yet</p>
                <p className="mt-2 text-caption text-text-secondary">Add someone by their username</p>
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
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              custom={slideDirection}
              variants={panelVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute inset-0 overflow-y-auto"
            >
              <div className="pb-20">
                <Settings embedded />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <nav className="sticky bottom-0 left-0 right-0 z-20 border-t border-border bg-bg-secondary/95 p-2 backdrop-blur">
        <div className="grid grid-cols-3 gap-1">
          <button
            className={`flex flex-col items-center justify-center gap-1 rounded-lg py-2 text-caption transition-colors ${activeTab === 'conversations' ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary'}`}
            onClick={() => navigate('/conversations')}
            aria-current={activeTab === 'conversations' ? 'page' : undefined}
          >
            <MessageCircle className="h-4 w-4" />
            Conversations
          </button>
          <button
            className={`flex flex-col items-center justify-center gap-1 rounded-lg py-2 text-caption transition-colors ${activeTab === 'contacts' ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary'}`}
            onClick={() => navigate('/contacts')}
            aria-current={activeTab === 'contacts' ? 'page' : undefined}
          >
            <ContactRound className="h-4 w-4" />
            Contacts
          </button>
          <button
            className={`flex flex-col items-center justify-center gap-1 rounded-lg py-2 text-caption transition-colors ${activeTab === 'settings' ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary'}`}
            onClick={() => navigate('/settings')}
            aria-current={activeTab === 'settings' ? 'page' : undefined}
          >
            <SettingsIcon className="h-4 w-4" />
            Settings
          </button>
        </div>
      </nav>

      {showAddContact && (
        <AddContactModal onClose={() => setShowAddContact(false)} />
      )}
      {showCreateGroup && (
        <GroupCreateModal
          onClose={() => setShowCreateGroup(false)}
          onCreated={handleGroupCreated}
        />
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
    navigate(`/conversations/id/${conversation.conversationId}`);
  };

  return (
    <div className="flex items-center border-b border-border px-4 py-3 max-[480px]:px-3 max-[480px]:py-2">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-body font-bold text-zinc-900">
        {contact.username[0].toUpperCase()}
      </div>
      <div className="ml-3 min-w-0 flex-1">
        <div className="truncate font-medium">{contact.username}</div>
      </div>
      <button
        className="cursor-pointer border-0 bg-transparent p-2 text-h2 opacity-70 transition-opacity hover:opacity-100"
        onClick={handleStartChat}
        title="Start chat"
      >
        <MessageCirclePlus className="h-5 w-5" />
      </button>
    </div>
  );
}
