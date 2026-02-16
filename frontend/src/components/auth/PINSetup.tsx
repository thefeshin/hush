/**
 * PIN Setup Modal
 * Prompts user to set a PIN for vault key encryption
 * User must confirm PIN by entering it twice
 */

import React, { useState, useEffect } from 'react';

interface PINSetupProps {
  onSuccess: (pin: string) => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

export function PINSetup({ onSuccess, onCancel, isLoading = false }: PINSetupProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string>('');
  const [isConfirming, setIsConfirming] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [isConfirming]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConfirming) {
      // First entry - move to confirmation
      if (pin.length < 4) {
        setError('PIN must be at least 4 characters');
        return;
      }
      setIsConfirming(true);
      setConfirmPin('');
      return;
    }

    // Confirmation step
    if (pin !== confirmPin) {
      setError('PINs do not match');
      setIsConfirming(false);
      setPin('');
      setConfirmPin('');
      return;
    }

    if (pin.length < 4) {
      setError('PIN must be at least 4 characters');
      return;
    }

    // Success
    onSuccess(pin);
  };

  const handleBack = () => {
    if (isConfirming) {
      setIsConfirming(false);
      setConfirmPin('');
      setError('');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-bg-secondary p-8 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
        <div>
          <h1 className="text-center text-[2.5rem] font-black tracking-[0.5rem] text-accent">HUSH</h1>
          <p className="mb-8 text-center text-text-secondary">Secure Your Vault</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="pin" className="mb-2 block font-medium">{isConfirming ? 'Confirm PIN' : 'Set PIN'}</label>
            <input
              id="pin"
              ref={inputRef}
              type="password"
              value={isConfirming ? confirmPin : pin}
              onChange={(e) => isConfirming ? setConfirmPin(e.target.value) : setPin(e.target.value)}
              placeholder={isConfirming ? 'Confirm your PIN' : 'Choose a PIN'}
              maxLength={8}
              autoComplete="new-password"
              required
              className="w-full rounded-lg border border-border bg-bg-primary px-4 py-3 text-base text-text-primary outline-none focus:border-accent"
            />
            {!isConfirming && (
              <small className="mt-2 block text-xs text-text-secondary">
                This PIN will be required to unlock your vault when you reopen the browser.
                Make sure you remember it - there's no recovery!
              </small>
            )}
          </div>

          {error && <div className="mb-4 rounded-lg border border-error bg-error/10 p-3 text-sm text-error">{error}</div>}

          <button
            type="submit"
            className="w-full cursor-pointer rounded-lg border-0 bg-accent px-4 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading}
          >
            {isLoading ? 'Setting up...' : (isConfirming ? 'Confirm PIN' : 'Continue')}
          </button>

          {isConfirming ? (
            <div className="mt-6 border-t border-border pt-6 text-center">
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent text-sm text-accent underline hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleBack}
                disabled={isLoading}
              >
                Back
              </button>
            </div>
          ) : onCancel && (
            <div className="mt-6 border-t border-border pt-6 text-center">
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent text-sm text-accent underline hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onCancel}
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
