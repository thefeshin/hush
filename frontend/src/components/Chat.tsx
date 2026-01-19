/**
 * Main chat interface
 */

import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useContactStore } from '../stores/contactStore';
import { useThreadStore } from '../stores/threadStore';
import { useCrypto } from '../crypto/CryptoContext';
import { Sidebar } from './Sidebar';
import { ThreadView } from './ThreadView';
import { EmptyState } from './EmptyState';

import '../styles/chat.css';

export function Chat() {
  const identity = useAuthStore(state => state.identity);
  const { contacts, loadAllContacts } = useContactStore();
  const { activeThreadId, loadAllThreads } = useThreadStore();
  const { decryptContacts, getThreadId, decryptIdentity } = useCrypto();

  // Load contacts on mount
  useEffect(() => {
    if (identity) {
      loadAllContacts(decryptContacts);
    }
  }, [identity]);

  // Load threads after contacts are loaded
  useEffect(() => {
    if (identity && contacts.length > 0) {
      loadAllThreads(
        identity.userId,
        contacts,
        getThreadId,
        decryptIdentity
      );
    }
  }, [identity, contacts.length]);

  if (!identity) {
    return <div className="loading-screen"><div className="spinner" /></div>;
  }

  return (
    <div className="chat-container">
      <Sidebar />
      <main className="chat-main">
        {activeThreadId ? (
          <ThreadView threadId={activeThreadId} />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}
