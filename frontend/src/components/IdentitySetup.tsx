/**
 * Identity creation screen
 * Shown after successful authentication if no identity exists
 */

import React, { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useCrypto } from '../crypto/CryptoContext';
import { saveIdentity } from '../services/storage';
import type { IdentityPayload } from '../types/crypto';

// Generate UUID v4
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 0x0f) >> (c === 'x' ? 0 : 1);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface Props {
  onComplete: () => void;
}

export function IdentitySetup({ onComplete }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setIdentity = useAuthStore(state => state.setIdentity);
  const { encryptIdentity } = useCrypto();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError('Please enter a display name');
      return;
    }

    if (trimmedName.length > 50) {
      setError('Display name must be 50 characters or less');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Generate UUID
      const userId = generateUUID();

      // Create identity payload
      const identity: IdentityPayload = {
        user_id: userId,
        display_name: trimmedName
      };

      // Encrypt and save to IndexedDB
      const encrypted = await encryptIdentity(identity);
      await saveIdentity(encrypted);

      // Update auth store
      setIdentity({
        userId,
        displayName: trimmedName
      });

      onComplete();
    } catch (err) {
      setError('Failed to create identity. Please try again.');
      setIsCreating(false);
    }
  };

  return (
    <div className="identity-setup">
      <div className="identity-setup-card">
        <h2>Create Your Identity</h2>
        <p className="subtitle">
          Choose a display name. This is how you'll appear to others.
        </p>

        <form onSubmit={handleCreate}>
          <div className="input-group">
            <label htmlFor="displayName">Display Name</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name..."
              maxLength={50}
              autoFocus
              disabled={isCreating}
            />
          </div>

          {error && (
            <div className="error-message">{error}</div>
          )}

          <button
            type="submit"
            className="primary-button"
            disabled={isCreating || !displayName.trim()}
          >
            {isCreating ? 'Creating...' : 'Create Identity'}
          </button>
        </form>

        <p className="note">
          Your identity is stored locally and encrypted with your vault key.
          The server never sees your name or UUID.
        </p>
      </div>
    </div>
  );
}
