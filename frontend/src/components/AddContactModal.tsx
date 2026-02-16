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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="m-4 w-full max-w-md rounded-2xl bg-bg-secondary p-6" onClick={e => e.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between">
          <h2>Add Contact</h2>
          <button className="cursor-pointer border-0 bg-transparent p-0 text-2xl leading-none text-text-secondary hover:text-text-primary" onClick={onClose}>&times;</button>
        </div>

        {!foundUser ? (
          <form onSubmit={handleSearch}>
            <div className="mb-4">
              <label htmlFor="username" className="mb-2 block font-medium">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter their username"
                autoFocus
                disabled={isSearching}
                autoCapitalize="off"
                className="w-full rounded-lg border border-border bg-bg-primary px-4 py-3 text-base text-text-primary outline-none focus:border-accent"
              />
              <p className="mt-2 text-xs text-text-secondary">
                Enter the username of the person you want to add
              </p>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-error bg-error/10 p-3 text-sm text-error">{error}</div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                className="flex-1 cursor-pointer rounded-lg border border-border bg-transparent px-4 py-3 text-sm text-text-primary transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onClose}
                disabled={isSearching}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 cursor-pointer rounded-lg border-0 bg-accent px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSearching || !username.trim()}
              >
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>
          </form>
        ) : (
          <div className="py-4">
            <div className="mb-4 flex items-center gap-4 rounded-lg bg-bg-primary p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-xl font-semibold text-white">
                {foundUser.username.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-semibold">{foundUser.username}</span>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-error bg-error/10 p-3 text-sm text-error">{error}</div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                className="flex-1 cursor-pointer rounded-lg border border-border bg-transparent px-4 py-3 text-sm text-text-primary transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleReset}
                disabled={isAdding}
              >
                Search Again
              </button>
              <button
                type="button"
                className="flex-1 cursor-pointer rounded-lg border-0 bg-accent px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
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
