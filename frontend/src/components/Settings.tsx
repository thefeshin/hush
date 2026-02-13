/**
 * Settings Page
 * Manages PIN enable/disable/change and account info
 */

import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useCrypto } from '../crypto/CryptoContext';
import { isPINEnabled } from '../services/deviceSettings';
import { enablePIN, disablePIN, changePIN, verifyPIN } from '../services/pinService';
import { getSessionVaultKey, setSessionVaultKey } from '../services/vaultStorage';
import { PINSetup } from './auth/PINSetup';
import type { VaultKey } from '../types/crypto';

type SettingsState = 'view' | 'enable-pin' | 'disable-pin' | 'change-pin' | 'change-pin-new';
type PINChangeStep = 'old' | 'new' | 'confirm';

interface SettingsProps {
  onBack: () => void;
}

export function Settings({ onBack }: SettingsProps) {
  const user = useAuthStore(state => state.user);
  const { lockVault } = useCrypto();
  const [state, setState] = useState<SettingsState>('view');
  const [pinEnabled, setPinEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // PIN change state
  const [pinChangeStep, setPinChangeStep] = useState<PINChangeStep>('old');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pendingChangeVaultKey, setPendingChangeVaultKey] = useState<VaultKey | null>(null);

  // Load PIN enabled status on mount
  useEffect(() => {
    const loadSettings = async () => {
      const enabled = await isPINEnabled();
      setPinEnabled(enabled);
    };
    loadSettings();
  }, []);

  const handleEnablePIN = async (pin: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const vaultKey = await getSessionVaultKey();
      if (!vaultKey) {
        throw new Error('Vault key not available. Please log in again.');
      }

      await enablePIN(vaultKey, pin);
      setPinEnabled(true);
      setState('view');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable PIN');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisablePIN = async (pin: string) => {
    setIsLoading(true);
    setError(null);

    try {
      await disablePIN(pin);
      setPinEnabled(false);
      setState('view');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable PIN');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePIN = async (step: PINChangeStep) => {
    setIsLoading(true);
    setError(null);

    if (step === 'old') {
      // Verify old PIN
      try {
        const vaultKey = await verifyPIN(oldPin);
        if (!vaultKey) {
          throw new Error('Invalid current PIN');
        }
        setPendingChangeVaultKey(vaultKey);
        setPinChangeStep('new');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid PIN');
      } finally {
        setIsLoading(false);
      }
    } else if (step === 'confirm') {
      // Confirm new PIN
      if (newPin !== confirmPin) {
        setError('PINs do not match');
        setIsLoading(false);
        return;
      }

      if (newPin.length < 4) {
        setError('PIN must be at least 4 characters');
        setIsLoading(false);
        return;
      }

      try {
        if (!pendingChangeVaultKey) {
          throw new Error('Session expired. Please try again.');
        }

        await changePIN(oldPin, newPin, pendingChangeVaultKey);

        // Update session with new PIN
        await setSessionVaultKey(pendingChangeVaultKey);

        // Reset form
        setOldPin('');
        setNewPin('');
        setConfirmPin('');
        setPendingChangeVaultKey(null);
        setPinChangeStep('old');
        setState('view');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to change PIN');
      } finally {
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }
  };

  const handleLockVault = async () => {
    await lockVault();
    onBack();
  };

  // Render different states
  if (state === 'enable-pin') {
    return <PINSetup onSuccess={handleEnablePIN} onCancel={() => setState('view')} isLoading={isLoading} />;
  }

  if (state === 'disable-pin') {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="logo">
            <h1>HUSH</h1>
            <p className="tagline">Disable PIN</p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); handleDisablePIN((document.getElementById('disable-pin-input') as HTMLInputElement)?.value || ''); }}>
            <div className="input-group">
              <label htmlFor="disable-pin-input">Enter current PIN to disable</label>
              <input
                id="disable-pin-input"
                type="password"
                maxLength={8}
                autoComplete="current-password"
                required
                disabled={isLoading}
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            <button type="submit" className="primary-button" disabled={isLoading}>
              {isLoading ? 'Disabling...' : 'Disable PIN'}
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => setState('view')}
              disabled={isLoading}
            >
              Cancel
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (state === 'change-pin') {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="logo">
            <h1>HUSH</h1>
            <p className="tagline">Change PIN</p>
          </div>

          {pinChangeStep === 'old' && (
            <form onSubmit={(e) => { e.preventDefault(); handleChangePIN('old'); }}>
              <div className="input-group">
                <label htmlFor="old-pin">Current PIN</label>
                <input
                  id="old-pin"
                  type="password"
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value)}
                  maxLength={8}
                  autoComplete="current-password"
                  required
                  disabled={isLoading}
                />
              </div>
              {error && <div className="error-message">{error}</div>}
              <button type="submit" className="primary-button" disabled={isLoading || !oldPin}>
                {isLoading ? 'Verifying...' : 'Continue'}
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setOldPin('');
                  setPendingChangeVaultKey(null);
                  setState('view');
                }}
                disabled={isLoading}
              >
                Cancel
              </button>
            </form>
          )}

          {pinChangeStep === 'new' && (
            <form onSubmit={(e) => { e.preventDefault(); setPinChangeStep('confirm'); }}>
              <div className="input-group">
                <label htmlFor="new-pin">New PIN</label>
                <input
                  id="new-pin"
                  type="password"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  maxLength={8}
                  autoComplete="new-password"
                  required
                  disabled={isLoading}
                />
                <small className="input-hint">
                  Enter your new PIN (at least 4 characters)
                </small>
              </div>
              {error && <div className="error-message">{error}</div>}
              <button type="submit" className="primary-button" disabled={isLoading || newPin.length < 4}>
                Continue
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setNewPin('');
                  setError(null);
                  setPendingChangeVaultKey(null);
                  setPinChangeStep('old');
                }}
                disabled={isLoading}
              >
                Back
              </button>
            </form>
          )}

          {pinChangeStep === 'confirm' && (
            <form onSubmit={(e) => { e.preventDefault(); handleChangePIN('confirm'); }}>
              <div className="input-group">
                <label htmlFor="confirm-pin">Confirm New PIN</label>
                <input
                  id="confirm-pin"
                  type="password"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  maxLength={8}
                  autoComplete="new-password"
                  required
                  disabled={isLoading}
                />
              </div>
              {error && <div className="error-message">{error}</div>}
              <button type="submit" className="primary-button" disabled={isLoading || !confirmPin}>
                {isLoading ? 'Changing...' : 'Change PIN'}
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setConfirmPin('');
                  setError(null);
                  setPinChangeStep('new');
                }}
                disabled={isLoading}
              >
                Back
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // View settings (default state)
  return (
    <div className="chat-container">
      <div className="settings-container">
        <div className="settings-header">
          <button className="back-button" onClick={onBack}>
            &#8592; Back
          </button>
          <h1>Settings</h1>
        </div>

        <div className="settings-content">
          {/* Account Info */}
          <section className="settings-section">
            <h2>Account</h2>
            <div className="setting-item">
              <div className="setting-info">
                <span className="setting-label">Username</span>
                <span className="setting-value">{user?.username || 'Unknown'}</span>
              </div>
            </div>
            <div className="setting-item">
              <div className="setting-info">
                <span className="setting-label">User ID</span>
                <span className="setting-value">{user?.id.slice(0, 16)}...</span>
              </div>
            </div>
          </section>

          {/* Security Settings */}
          <section className="settings-section">
            <h2>Security</h2>
            <div className="setting-item">
              <div className="setting-info">
                <span className="setting-label">PIN Protection</span>
                <span className="setting-value">{pinEnabled ? 'Enabled' : 'Disabled'}</span>
              </div>
              <div className="setting-actions">
                {pinEnabled ? (
                  <>
                    <button
                      className="secondary-button"
                      onClick={() => setState('change-pin')}
                    >
                      Change PIN
                    </button>
                    <button
                      className="danger-button"
                      onClick={() => {
                        setError(null);
                        setState('disable-pin');
                      }}
                    >
                      Disable
                    </button>
                  </>
                ) : (
                  <button
                    className="primary-button"
                    onClick={() => setState('enable-pin')}
                  >
                    Enable PIN
                  </button>
                )}
              </div>
            </div>
            <p className="setting-hint">
              When PIN is enabled, you'll need to enter your PIN instead of your 12-word passphrase
              when reopening the browser. Your 12 words are still required for initial setup.
            </p>
          </section>

          {/* Actions */}
          <section className="settings-section">
            <h2>Actions</h2>
            <button
              className="danger-button full-width"
              onClick={handleLockVault}
            >
              Lock Vault
            </button>
            <p className="setting-hint">
              Lock the vault to require re-authentication. Your data remains encrypted.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
