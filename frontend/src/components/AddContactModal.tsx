/**
 * Modal for adding a new contact by username
 */

import React, { useState } from 'react';
import { useContactStore } from '../stores/contactStore';
import { useAuthStore } from '../stores/authStore';
import { useCrypto } from '../crypto/CryptoContext';
import { lookupUser } from '../services/api';

interface Props {
  onClose: () => void;
}

export function AddContactModal({ onClose }: Props) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [foundUser, setFoundUser] = useState<{ id: string; username: string } | null>(null);

  const user = useAuthStore(state => state.user);
  const { addContact, getContact } = useContactStore();
  const { encryptContacts } = useCrypto();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFoundUser(null);

    const trimmedUsername = username.trim().toLowerCase();

    if (!trimmedUsername) {
      setError('Please enter a username');
      return;
    }

    if (trimmedUsername.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    // Check if trying to add self
    if (trimmedUsername === user?.username?.toLowerCase()) {
      setError("You can't add yourself as a contact");
      return;
    }

    setIsSearching(true);

    try {
      const result = await lookupUser(trimmedUsername);

      if (!result.found || !result.user) {
        setError('User not found');
        return;
      }

      // Check if already a contact
      if (getContact(result.user.id)) {
        setError('Already in your contacts');
        return;
      }

      setFoundUser(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleAdd = async () => {
    if (!foundUser) return;

    setIsAdding(true);
    setError(null);

    try {
      await addContact(foundUser.id, foundUser.username, encryptContacts);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add contact');
      setIsAdding(false);
    }
  };

  const handleReset = () => {
    setFoundUser(null);
    setUsername('');
    setError(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Contact</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>

        {!foundUser ? (
          <form onSubmit={handleSearch}>
            <div className="input-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter their username"
                autoFocus
                disabled={isSearching}
                autoCapitalize="off"
              />
              <p className="input-hint">
                Enter the username of the person you want to add
              </p>
            </div>

            {error && (
              <div className="error-message">{error}</div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
                disabled={isSearching}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={isSearching || !username.trim()}
              >
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>
          </form>
        ) : (
          <div className="found-user">
            <div className="user-info">
              <div className="user-avatar">
                {foundUser.username.charAt(0).toUpperCase()}
              </div>
              <div className="user-details">
                <span className="user-name">{foundUser.username}</span>
              </div>
            </div>

            {error && (
              <div className="error-message">{error}</div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={handleReset}
                disabled={isAdding}
              >
                Search Again
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleAdd}
                disabled={isAdding}
              >
                {isAdding ? 'Adding...' : 'Add Contact'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
