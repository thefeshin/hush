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
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-bg-secondary p-8 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
        <div>
          <h1 className="text-center text-[2.5rem] font-black tracking-[0.5rem] text-accent">HUSH</h1>
          <p className="mb-8 text-center text-text-secondary">Unlock Your Vault</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="pin" className="mb-2 block font-medium">Enter PIN</label>
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
              className="w-full rounded-lg border border-border bg-bg-primary px-4 py-3 text-base text-text-primary outline-none focus:border-accent"
            />
          </div>

          {error && <div className="mb-4 rounded-lg border border-error bg-error/10 p-3 text-sm text-error">{error}</div>}

          <button
            type="submit"
            className="w-full cursor-pointer rounded-lg border-0 bg-accent px-4 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading}
          >
            {isLoading ? 'Verifying...' : 'Unlock'}
          </button>

          {showCancel && onCancel && (
            <div className="mt-6 border-t border-border pt-6 text-center">
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent text-sm text-accent underline hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
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
