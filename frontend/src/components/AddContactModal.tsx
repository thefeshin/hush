/**
 * Modal for adding a new contact by UUID
 */

import React, { useState } from 'react';
import { useContactStore } from '../stores/contactStore';
import { useAuthStore } from '../stores/authStore';
import { useCrypto } from '../crypto/CryptoContext';

interface Props {
  onClose: () => void;
}

export function AddContactModal({ onClose }: Props) {
  const [uuid, setUuid] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const identity = useAuthStore(state => state.identity);
  const { addContact } = useContactStore();
  const { encryptContacts } = useCrypto();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUuid = uuid.trim().toLowerCase();
    const trimmedName = displayName.trim();

    // Validate
    if (!trimmedUuid) {
      setError('Please enter a UUID');
      return;
    }

    if (!trimmedName) {
      setError('Please enter a display name');
      return;
    }

    // Check if trying to add self
    if (trimmedUuid === identity?.userId) {
      setError("You can't add yourself as a contact");
      return;
    }

    setIsAdding(true);

    try {
      await addContact(trimmedUuid, trimmedName, encryptContacts);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add contact');
      setIsAdding(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Contact</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="uuid">Their UUID</label>
            <input
              id="uuid"
              type="text"
              value={uuid}
              onChange={e => setUuid(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              autoFocus
              disabled={isAdding}
            />
            <p className="input-hint">
              Ask them to share their UUID from their profile
            </p>
          </div>

          <div className="input-group">
            <label htmlFor="name">Display Name</label>
            <input
              id="name"
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="What should we call them?"
              maxLength={50}
              disabled={isAdding}
            />
          </div>

          {error && (
            <div className="error-message">{error}</div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={isAdding}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={isAdding || !uuid.trim() || !displayName.trim()}
            >
              {isAdding ? 'Adding...' : 'Add Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
