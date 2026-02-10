/**
 * PIN Entry Modal
 * Handles PIN unlock flow
 */

import React, { useState, useEffect } from 'react';
import {
  retrieveVaultKey,
  setSessionVaultKey,
} from '../../services/vaultStorage';
import type { VaultKey } from '../../types/crypto';

interface PINEntryProps {
  onSuccess: (vaultKey: VaultKey) => void;
  onCancel?: () => void;
  showCancel?: boolean;
}

export function PINEntry({
  onSuccess,
  onCancel,
  showCancel = false
}: PINEntryProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsLoading(true);
    setError('');

    // Unlock mode: verify PIN
    const vaultKey = await retrieveVaultKey(pin);
    if (vaultKey) {
      // Cache in memory for current runtime.
      await setSessionVaultKey(vaultKey);
      onSuccess(vaultKey);
    } else {
      setError('Invalid PIN');
    }

    setIsLoading(false);
  };

  const handleCancel = () => {
    setPin('');
    setError('');
    onCancel?.();
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="logo">
          <h1>HUSH</h1>
          <p className="tagline">Unlock Your Vault</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="pin">Enter PIN</label>
            <input
              id="pin"
              ref={inputRef}
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter your PIN"
              maxLength={8}
              autoComplete="current-password"
              required
              disabled={isLoading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="primary-button"
            disabled={isLoading}
          >
            {isLoading ? 'Verifying...' : 'Unlock'}
          </button>

          {showCancel && onCancel && (
            <div className="auth-switch">
              <button
                type="button"
                className="link-button"
                onClick={handleCancel}
                disabled={isLoading}
              >
                Cancel
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
