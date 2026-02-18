import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useContactStore } from '../stores/contactStore';
import { useConversationStore } from '../stores/conversationStore';
import { useCrypto } from '../crypto/CryptoContext';
import { createGroup } from '../services/api';
import { saveConversation } from '../services/storage';
import type { ConversationMetadata } from '../types/crypto';

interface Props {
  onClose: () => void;
  onCreated?: (conversationId: string) => void;
}

export function GroupCreateModal({ onClose, onCreated }: Props) {
  const user = useAuthStore((state) => state.user);
  const contacts = useContactStore((state) => state.contacts);
  const { upsertConversation } = useConversationStore();
  const { encryptIdentity } = useCrypto();

  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedContacts = useMemo(
    () => [...contacts].sort((a, b) => a.username.localeCompare(b.username)),
    [contacts],
  );

  const canSubmit = name.trim().length > 0 && picked.size >= 2 && !isSubmitting;

  const toggleMember = (id: string) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      return;
    }

    if (name.trim().length === 0) {
      setError('Group name is required');
      return;
    }
    if (picked.size < 2) {
      setError('Select at least two members');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const memberIds = Array.from(picked);
      const group = await createGroup({
        name: name.trim(),
        member_ids: memberIds,
      });

      const metadata: ConversationMetadata = {
        participants: [user.id, ...memberIds],
        kind: 'group',
        group_name: group.name,
        key_epoch: group.key_epoch,
        created_by: {
          user_id: user.id,
          display_name: user.username,
        },
        created_at: Date.now(),
      };

      const encryptedMetadata = await encryptIdentity(metadata);
      await saveConversation(group.conversation_id, encryptedMetadata, Date.now());

      upsertConversation({
        conversationId: group.conversation_id,
        kind: 'group',
        participantId: '',
        participantUsername: group.name,
        keyEpoch: group.key_epoch,
        createdAt: new Date(group.created_at).getTime(),
        lastMessageAt: Date.now(),
        unreadCount: 0,
      });

      onCreated?.(group.conversation_id);
      onClose();
    } catch {
      setError('Failed to create group');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="m-4 w-full max-w-lg rounded-2xl bg-bg-secondary p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between">
          <h2>Create Group</h2>
          <button
            className="cursor-pointer border-0 bg-transparent p-0 text-text-secondary hover:text-text-primary"
            onClick={onClose}
            type="button"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="group-name" className="mb-2 block font-medium">Group name</label>
            <input
              id="group-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={120}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-border bg-bg-primary px-4 py-3 text-body text-text-primary outline-none focus:border-accent"
              placeholder="e.g. Product Team"
            />
          </div>

          <div className="mb-2 flex items-center justify-between">
            <label className="font-medium">Members</label>
            <span className="text-caption text-text-secondary">{picked.size} selected</span>
          </div>
          <div className="mb-4 max-h-64 overflow-y-auto rounded-lg border border-border bg-bg-primary">
            {sortedContacts.length === 0 ? (
              <div className="p-4 text-caption text-text-secondary">No contacts available.</div>
            ) : (
              sortedContacts.map((contact) => (
                <label key={contact.id} className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                  <input
                    type="checkbox"
                    checked={picked.has(contact.id)}
                    onChange={() => toggleMember(contact.id)}
                    disabled={isSubmitting}
                    className="h-4 w-4"
                  />
                  <span className="truncate">{contact.username}</span>
                </label>
              ))
            )}
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-error bg-zinc-900 p-3 text-body text-text-secondary">{error}</div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              className="flex-1 cursor-pointer rounded-lg border border-border bg-transparent px-4 py-3 text-body text-text-primary transition-colors hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 cursor-pointer rounded-lg border-0 bg-accent px-4 py-3 text-body font-semibold text-zinc-900 transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSubmit}
            >
              {isSubmitting ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
