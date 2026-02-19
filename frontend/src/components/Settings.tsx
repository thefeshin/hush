/**
 * Settings Page
 * Manages PIN enable/disable/change and account info
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
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
  onBack?: () => void;
  embedded?: boolean;
}

const cardWrapper = 'flex min-h-dvh items-center justify-center p-4';
const card = 'w-full max-w-md rounded-2xl bg-bg-secondary p-8 shadow-[0_4px_20px_rgba(0,0,0,0.3)]';
const title = 'text-center text-display font-black tracking-[0.5rem] text-accent';
const subtitle = 'mb-8 text-center text-text-secondary';
const inputGroup = 'mb-4';
const label = 'mb-2 block font-medium';
const input = 'w-full rounded-lg border border-border bg-bg-primary px-4 py-3 text-body text-text-primary outline-none focus:border-accent';
const errorClass = 'mb-4 rounded-lg border border-error bg-zinc-900 p-3 text-body text-text-secondary';
const primaryButton = 'w-full cursor-pointer rounded-lg border-0 bg-accent px-4 py-4 text-body font-semibold text-zinc-900 transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50';
const linkButton = 'mt-4 cursor-pointer border-0 bg-transparent text-body text-accent underline hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-50';

export function Settings({ onBack, embedded = false }: SettingsProps) {
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const { lockVault } = useCrypto();
  const [state, setState] = useState<SettingsState>('view');
  const [pinEnabled, setPinEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [disablePinInput, setDisablePinInput] = useState('');

  const [pinChangeStep, setPinChangeStep] = useState<PINChangeStep>('old');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pendingChangeVaultKey, setPendingChangeVaultKey] = useState<VaultKey | null>(null);

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
      setDisablePinInput('');
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
        await setSessionVaultKey(pendingChangeVaultKey);

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
    if (onBack) {
      onBack();
      return;
    }
    navigate('/login');
  };

  const handleBack = () => {
    if (embedded) {
      return;
    }

    if (onBack) {
      onBack();
      return;
    }
    navigate(-1);
  };

  if (state === 'change-pin') {
    const wrapperClass = embedded
      ? 'px-4 py-6'
      : cardWrapper;

    return (
      <div className={wrapperClass}>
        <div className={card}>
          <div>
            <h1 className={title}>HUSH</h1>
            <p className={subtitle}>Change PIN</p>
          </div>

          {pinChangeStep === 'old' && (
            <form onSubmit={(e) => { e.preventDefault(); handleChangePIN('old'); }}>
              <div className={inputGroup}>
                <label htmlFor="old-pin" className={label}>Current PIN</label>
                <input
                  id="old-pin"
                  type="password"
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value)}
                  maxLength={8}
                  autoComplete="current-password"
                  required
                  disabled={isLoading}
                  className={input}
                />
              </div>
              {error && <div className={errorClass}>{error}</div>}
              <button type="submit" className={primaryButton} disabled={isLoading || !oldPin}>
                {isLoading ? 'Verifying...' : 'Continue'}
              </button>
              <button
                type="button"
                className={linkButton}
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
              <div className={inputGroup}>
                <label htmlFor="new-pin" className={label}>New PIN</label>
                <input
                  id="new-pin"
                  type="password"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  maxLength={8}
                  autoComplete="new-password"
                  required
                  disabled={isLoading}
                  className={input}
                />
                <small className="mt-2 block text-caption text-text-secondary">
                  Enter your new PIN (at least 4 characters)
                </small>
              </div>
              {error && <div className={errorClass}>{error}</div>}
              <button type="submit" className={primaryButton} disabled={isLoading || newPin.length < 4}>
                Continue
              </button>
              <button
                type="button"
                className={linkButton}
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
              <div className={inputGroup}>
                <label htmlFor="confirm-pin" className={label}>Confirm New PIN</label>
                <input
                  id="confirm-pin"
                  type="password"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  maxLength={8}
                  autoComplete="new-password"
                  required
                  disabled={isLoading}
                  className={input}
                />
              </div>
              {error && <div className={errorClass}>{error}</div>}
              <button type="submit" className={primaryButton} disabled={isLoading || !confirmPin}>
                {isLoading ? 'Changing...' : 'Change PIN'}
              </button>
              <button
                type="button"
                className={linkButton}
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

  return (
    <div className={embedded ? 'bg-bg-secondary px-0 py-4' : 'flex h-dvh overflow-hidden'}>
      <div className={embedded ? 'mx-auto w-full max-w-4xl px-4' : 'flex-1 overflow-y-auto bg-bg-primary'}>
        {!embedded && (
          <div className="flex items-center gap-4 border-b border-border bg-bg-secondary px-6 py-4">
            <button
              className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-2 text-body font-medium text-accent transition-colors hover:text-accent-hover"
              onClick={handleBack}
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <h1 className="text-h1 text-text-primary">Settings</h1>
          </div>
        )}

        <div className={embedded ? 'mx-auto max-w-4xl pb-4' : 'mx-auto max-w-4xl px-4 py-8'}>
          <section className="mb-6 rounded-lg bg-bg-secondary p-6">
            <h2 className="mb-4 border-b border-border pb-2 text-h2 text-text-primary">Account</h2>
            <div className="flex items-center justify-between gap-4 border-b border-border py-4">
              <div className="flex flex-col">
                <span className="font-medium">Username</span>
                <span className="text-body text-text-secondary">{user?.username || 'Unknown'}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 py-4">
              <div className="flex flex-col">
                <span className="font-medium">User ID</span>
                <span className="text-body text-text-secondary">{user?.id.slice(0, 16)}...</span>
              </div>
            </div>
          </section>

          <section className="mb-6 rounded-lg bg-bg-secondary p-6">
            <h2 className="mb-4 border-b border-border pb-2 text-h2 text-text-primary">Security</h2>
            <div className="flex items-center justify-between gap-4 py-4">
              <div className="flex flex-col">
                <span className="font-medium">PIN Protection</span>
                <span className="text-body text-text-secondary">{pinEnabled ? 'Enabled' : 'Disabled'}</span>
              </div>
              <div className="flex items-center gap-2">
                {pinEnabled ? (
                  <>
                    <button
                      className="cursor-pointer rounded-lg border border-border bg-transparent px-6 py-3 text-body text-text-primary transition-colors hover:border-accent"
                      onClick={() => setState('change-pin')}
                    >
                      Change PIN
                    </button>
                    <button
                      className="cursor-pointer rounded-lg border border-zinc-500 bg-zinc-700 px-6 py-3 text-body font-semibold text-zinc-100 transition-colors hover:bg-zinc-600"
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
                    className="cursor-pointer rounded-lg border-0 bg-accent px-6 py-3 text-body font-semibold text-zinc-900 transition-colors hover:bg-accent-hover"
                    onClick={() => setState('enable-pin')}
                  >
                    Enable PIN
                  </button>
                )}
              </div>
            </div>
            <p className="mt-3 rounded bg-bg-primary p-3 text-caption leading-relaxed text-text-secondary">
              When PIN is enabled, you'll need to enter your PIN instead of your 12-word passphrase
              when reopening the browser. Your 12 words are still required for initial setup.
            </p>
          </section>

          <section className="mb-6 rounded-lg bg-bg-secondary p-6">
            <h2 className="mb-4 border-b border-border pb-2 text-h2 text-text-primary">Actions</h2>
            <button
              className="w-full cursor-pointer rounded-lg border border-zinc-500 bg-zinc-700 px-6 py-3 text-body font-semibold text-zinc-100 transition-colors hover:bg-zinc-600"
              onClick={handleLockVault}
            >
              Lock Vault
            </button>
            <p className="mt-3 rounded bg-bg-primary p-3 text-caption leading-relaxed text-text-secondary">
              Lock the vault to require re-authentication. Your data remains encrypted.
            </p>
          </section>
        </div>
      </div>

      {state === 'enable-pin' && (
        <PINSetup
          onSuccess={handleEnablePIN}
          onCancel={() => {
            setError(null);
            setState('view');
          }}
          isLoading={isLoading}
        />
      )}

      {state === 'disable-pin' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={() => {
          if (isLoading) return;
          setError(null);
          setDisablePinInput('');
          setState('view');
        }}>
          <div className={card} onClick={(e) => e.stopPropagation()}>
            <div>
              <h1 className={title}>HUSH</h1>
              <p className={subtitle}>Disable PIN</p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleDisablePIN(disablePinInput);
              }}
            >
              <div className={inputGroup}>
                <label htmlFor="disable-pin-input" className={label}>Enter current PIN to disable</label>
                <input
                  id="disable-pin-input"
                  type="password"
                  maxLength={8}
                  autoComplete="current-password"
                  required
                  value={disablePinInput}
                  onChange={(e) => setDisablePinInput(e.target.value)}
                  disabled={isLoading}
                  className={input}
                />
              </div>
              {error && <div className={errorClass}>{error}</div>}
              <button type="submit" className={primaryButton} disabled={isLoading || !disablePinInput}>
                {isLoading ? 'Disabling...' : 'Disable PIN'}
              </button>
              <button
                type="button"
                className={linkButton}
                onClick={() => {
                  setError(null);
                  setDisablePinInput('');
                  setState('view');
                }}
                disabled={isLoading}
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
