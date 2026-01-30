/**
 * PIN Setup Modal
 * Prompts user to set a PIN for vault key encryption
 * User must confirm PIN by entering it twice
 */

import React, { useState, useEffect } from 'react';

interface PINSetupProps {
  onSuccess: (pin: string) => void;
}

export function PINSetup({ onSuccess }: PINSetupProps) {
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
    <div className="login-screen">
      <div className="login-card">
        <div className="logo">
          <h1>HUSH</h1>
          <p className="tagline">Secure Your Vault</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="pin">{isConfirming ? 'Confirm PIN' : 'Set PIN'}</label>
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
            />
            {!isConfirming && (
              <small className="input-hint">
                This PIN will be required to unlock your vault when you reopen the browser.
                Make sure you remember it - there's no recovery!
              </small>
            )}
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="primary-button"
          >
            {isConfirming ? 'Confirm PIN' : 'Continue'}
          </button>

          {isConfirming && (
            <div className="auth-switch">
              <button
                type="button"
                className="link-button"
                onClick={handleBack}
              >
                Back
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
