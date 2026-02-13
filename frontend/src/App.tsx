/**
 * Main application component with PWA support
 * Handles multi-user authentication flow
 */

import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import { CryptoProvider, useCrypto } from './crypto/CryptoContext';
import { useAuthStore, User } from './stores/authStore';
import { initDatabase } from './services/storage';
import { hasStoredVaultKey } from './services/vaultStorage';
import { isPINEnabled } from './services/deviceSettings';
import { LoginForm, RegisterForm } from './components/auth';
import { VaultEntry } from './components/auth/VaultEntry';
import { PINEntry } from './components/auth/PINEntry';
import { Chat } from './components/Chat';
import { Settings } from './components/Settings';
import { InstallBanner } from './components/InstallBanner';
import { UpdateBanner } from './components/UpdateBanner';
import { OfflineIndicator } from './components/OfflineIndicator';
import { RealtimeProvider } from './context/RealtimeContext';
import type { VaultKey } from './types/crypto';

import './styles/main.css';
import './styles/pwa.css';

type AppState = 'loading' | 'vault-entry' | 'pin-entry' | 'ready';

function showPinSetupReminder(onOpenSettings: () => void) {
  toast.custom((t) => (
    <div
      role="status"
      style={{
        background: '#17212b',
        color: '#f8fafc',
        border: '1px solid #334155',
        borderRadius: '10px',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        maxWidth: '440px',
        boxShadow: '0 8px 20px rgba(0, 0, 0, 0.25)'
      }}
    >
      <div style={{ fontSize: '14px', lineHeight: 1.4 }}>
        Set up a PIN to avoid entering your 12 words each time.
      </div>
      <button
        style={{
          border: 'none',
          borderRadius: '8px',
          padding: '6px 10px',
          background: '#22c55e',
          color: '#052e16',
          fontWeight: 700,
          cursor: 'pointer'
        }}
        onClick={() => {
          toast.dismiss(t.id);
          onOpenSettings();
        }}
      >
        Set PIN
      </button>
    </div>
  ), { duration: 12000 });
}

function AppContent() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [vaultToken, setVaultToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const navigate = useNavigate();

  const { isAuthenticated, user, checkAuth, setUser } = useAuthStore();
  const { unlockVaultWithKey: unlockVaultWithKeyRaw } = useCrypto();
  const unlockVaultWithKey = unlockVaultWithKeyRaw as (key: VaultKey) => Promise<void>;

  // Initialize database on mount
  useEffect(() => {
    initDatabase().catch(console.error);
  }, []);

  // Check for existing session on mount
  useEffect(() => {
    const init = async () => {
      console.log('[App] Checking existing session...');
      const existingUser = await checkAuth();

      // Check device settings for PIN preference FIRST
      const pinEnabled = await isPINEnabled();
      if (pinEnabled && existingUser) {
        // Check if PIN-protected vault key exists
        const hasStoredKey = await hasStoredVaultKey();
        if (hasStoredKey) {
          console.log('[App] PIN enabled with stored key, prompting for PIN...');
          setAppState('pin-entry');
          return;
        }
        // PIN enabled but no stored key (edge case) - fall through to vault entry
      }

      // No PIN or PIN disabled -> show vault entry (12 words)
      console.log('[App] No PIN-enabled stored key, showing vault entry');
      setAppState('vault-entry');
    };

    init();
  }, []);

  const handleVaultSuccess = async (token: string, _salt: string) => {
    console.log('[App] Vault verified...');
    setVaultToken(token);
    // Salt is handled internally by VaultEntry component

    // If already authenticated (existing session), unlock vault and go to chat
    if (isAuthenticated && user) {
      const { getSessionVaultKey } = await import('./services/vaultStorage');
      const storedKey = await getSessionVaultKey();
      if (storedKey) {
        await unlockVaultWithKey(storedKey);
      }
      setAppState('ready');
      navigate('/conversation', { replace: true });
    } else {
      setAppState('ready');
      navigate('/login', { replace: true });
    }
  };

  const handleLoginSuccess = async (loggedInUser: User) => {
    console.log('[App] Login successful:', loggedInUser.username);
    setUser(loggedInUser);

    // Unlock vault with stored key after login
    const { getSessionVaultKey } = await import('./services/vaultStorage');
    const storedKey = await getSessionVaultKey();
    if (storedKey) {
      await unlockVaultWithKey(storedKey);
    }

    if (!(await isPINEnabled())) {
      showPinSetupReminder(() => navigate('/settings'));
    }

    setAppState('ready');
    navigate('/conversation', { replace: true });
  };

  const handleRegisterSuccess = async (newUser: User) => {
    console.log('[App] Registration successful:', newUser.username);
    setUser(newUser);

    // Unlock vault with stored key after registration
    const { getSessionVaultKey } = await import('./services/vaultStorage');
    const storedKey = await getSessionVaultKey();
    if (storedKey) {
      await unlockVaultWithKey(storedKey);
    }

    if (!(await isPINEnabled())) {
      showPinSetupReminder(() => navigate('/settings'));
    }

    setAppState('ready');
    navigate('/conversation', { replace: true });
  };

  const handlePINUnlock = async (vaultKey: VaultKey) => {
    await unlockVaultWithKey(vaultKey);
    setAppState('ready');
    navigate('/conversation', { replace: true });
  };

  const handleVaultEntryCancel = () => {
    // User cancelled PIN entry, go back to full vault entry
      setAppState('vault-entry');
    };

  return (
    <>
      <Toaster position="top-right" />
      {/* PWA Banners */}
      <UpdateBanner />

      {/* Main Content */}
      {appState === 'loading' && (
        <div className="loading-screen">
          <div className="spinner" />
        </div>
      )}

      {appState === 'vault-entry' && (
        <VaultEntry
          onSuccess={handleVaultSuccess}
          isLoading={isLoading}
          error={vaultError}
          onClearError={() => setVaultError(null)}
        />
      )}

      {appState === 'pin-entry' && (
        <PINEntry
          onSuccess={handlePINUnlock}
          onCancel={handleVaultEntryCancel}
          showCancel={true}
        />
      )}

      {appState === 'ready' && (
        <Routes>
          <Route
            path="/login"
            element={
              !isAuthenticated
                ? (
                    vaultToken ? (
                      <LoginForm
                        vaultToken={vaultToken}
                        onSuccess={handleLoginSuccess}
                        onSwitchToRegister={() => navigate('/signup')}
                        isLoading={isLoading}
                        setIsLoading={setIsLoading}
                      />
                    ) : (
                      <Navigate to="/" replace />
                    )
                  )
                : <Navigate to="/conversation" replace />
            }
          />
          <Route
            path="/signup"
            element={
              !isAuthenticated
                ? (
                    vaultToken ? (
                      <RegisterForm
                        vaultToken={vaultToken}
                        onSuccess={handleRegisterSuccess}
                        onSwitchToLogin={() => navigate('/login')}
                        isLoading={isLoading}
                        setIsLoading={setIsLoading}
                      />
                    ) : (
                      <Navigate to="/" replace />
                    )
                  )
                : <Navigate to="/conversation" replace />
            }
          />
          <Route
            path="/conversation"
            element={isAuthenticated ? <Chat /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/conversation/:username"
            element={isAuthenticated ? <Chat /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/settings"
            element={isAuthenticated ? <Settings /> : <Navigate to="/login" replace />}
          />
          <Route
            path="*"
            element={<Navigate to={isAuthenticated ? '/conversation' : '/login'} replace />}
          />
        </Routes>
      )}

      {/* Bottom Banners */}
      <OfflineIndicator />
      <InstallBanner />
    </>
  );
}

export function App() {
  return (
    <CryptoProvider>
      <RealtimeProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </RealtimeProvider>
    </CryptoProvider>
  );
}

export default App;
