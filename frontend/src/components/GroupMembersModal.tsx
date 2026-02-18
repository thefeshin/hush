import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useContactStore } from '../stores/contactStore';
import { addGroupMember, getGroupState, removeGroupMember } from '../services/api';
import { useConversationStore } from '../stores/conversationStore';

interface Props {
  conversationId: string;
  onClose: () => void;
}

export function GroupMembersModal({ conversationId, onClose }: Props) {
  const user = useAuthStore((state) => state.user);
  const contacts = useContactStore((state) => state.contacts);
  const { upsertConversation, getConversation } = useConversationStore();

  const [members, setMembers] = useState<Array<{ user_id: string; role: 'owner' | 'admin' | 'member'; joined_at: string }>>([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contactNameById = useMemo(() => {
    const map = new Map<string, string>();
    contacts.forEach((contact) => map.set(contact.id, contact.username));
    if (user) {
      map.set(user.id, user.username);
    }
    return map;
  }, [contacts, user]);

  const refreshState = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const state = await getGroupState(conversationId);
      setMembers(state.members);
      const existing = getConversation(conversationId);
      if (existing) {
        upsertConversation({
          ...existing,
          keyEpoch: state.key_epoch,
          participantUsername: state.name || existing.participantUsername,
        });
      }
    } catch {
      setError('Failed to load group members');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshState();
  }, [conversationId]);

  const memberSet = useMemo(() => new Set(members.map((member) => member.user_id)), [members]);
  const addableContacts = useMemo(
    () => contacts.filter((contact) => !memberSet.has(contact.id)),
    [contacts, memberSet],
  );

  const handleAddMember = async () => {
    if (!selectedContactId) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const state = await addGroupMember(conversationId, { user_id: selectedContactId, role: 'member' });
      setMembers(state.members);
      const existing = getConversation(conversationId);
      if (existing) {
        upsertConversation({ ...existing, keyEpoch: state.key_epoch });
      }
      setSelectedContactId('');
    } catch {
      setError('Failed to add member');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    setIsSaving(true);
    setError(null);
    try {
      const state = await removeGroupMember(conversationId, memberId);
      setMembers(state.members);
      const existing = getConversation(conversationId);
      if (existing) {
        upsertConversation({ ...existing, keyEpoch: state.key_epoch });
      }
    } catch {
      setError('Failed to remove member');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="m-4 w-full max-w-xl rounded-2xl bg-bg-secondary p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between">
          <h2>Group Members</h2>
          <button className="cursor-pointer border-0 bg-transparent p-0 text-text-secondary hover:text-text-primary" onClick={onClose} type="button">
            <X className="h-6 w-6" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-error bg-zinc-900 p-3 text-body text-text-secondary">{error}</div>
        )}

        <div className="mb-4 flex items-center gap-2">
          <select
            value={selectedContactId}
            onChange={(e) => setSelectedContactId(e.target.value)}
            disabled={isSaving || isLoading || addableContacts.length === 0}
            className="flex-1 rounded-lg border border-border bg-bg-primary px-3 py-2 text-body text-text-primary outline-none focus:border-accent"
          >
            <option value="">Add a contact to group</option>
            {addableContacts.map((contact) => (
              <option key={contact.id} value={contact.id}>{contact.username}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAddMember}
            disabled={!selectedContactId || isSaving || isLoading}
            className="cursor-pointer rounded-lg border-0 bg-accent px-4 py-2 text-body font-semibold text-zinc-900 transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
        </div>

        {isLoading ? (
          <div className="rounded-lg border border-border bg-bg-primary p-4 text-text-secondary">Loading members...</div>
        ) : (
          <div className="max-h-80 overflow-y-auto rounded-lg border border-border bg-bg-primary">
            {members.map((member) => {
              const displayName = contactNameById.get(member.user_id) || member.user_id;
              const isSelf = user?.id === member.user_id;
              return (
                <div key={member.user_id} className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{displayName}</div>
                    <div className="text-caption text-text-secondary">{member.role}</div>
                  </div>
                  {!isSelf && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.user_id)}
                      disabled={isSaving}
                      className="cursor-pointer rounded-lg border border-border bg-transparent px-3 py-1 text-caption text-text-primary transition-colors hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
