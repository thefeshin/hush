/**
 * Main application component with PWA support
 * Handles multi-user authentication flow
 */

import { useEffect, useState } from 'react';
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

type AppState = 'loading' | 'vault-entry' | 'pin-entry' | 'login' | 'register' | 'chat' | 'settings';

function AppContent() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [vaultToken, setVaultToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);

  const { isAuthenticated, user, checkAuth, setUser } = useAuthStore();
  const { isUnlocked, unlockVaultWithKey: unlockVaultWithKeyRaw } = useCrypto();
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

  // Handle auth state changes
  useEffect(() => {
    console.log('[App] State check:', { isAuthenticated, isUnlocked, appState, user: user?.username });

    // Only auto-transition to chat if not in settings mode
    if (isAuthenticated && isUnlocked && appState !== 'chat' && appState !== 'settings') {
      setAppState('chat');
    }
  }, [isAuthenticated, isUnlocked, appState]);

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
      setAppState('chat');
    } else {
      setAppState('login');
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

    setAppState('chat');
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

    setAppState('chat');
  };

  const handlePINUnlock = async (vaultKey: VaultKey) => {
    await unlockVaultWithKey(vaultKey);
    setAppState('chat');
  };

  const handleVaultEntryCancel = () => {
    // User cancelled PIN entry, go back to full vault entry
    setAppState('vault-entry');
  };

  return (
    <>
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

      {appState === 'login' && vaultToken && (
        <LoginForm
          vaultToken={vaultToken}
          onSuccess={handleLoginSuccess}
          onSwitchToRegister={() => setAppState('register')}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
        />
      )}

      {appState === 'register' && vaultToken && (
        <RegisterForm
          vaultToken={vaultToken}
          onSuccess={handleRegisterSuccess}
          onSwitchToLogin={() => setAppState('login')}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
        />
      )}

      {appState === 'chat' && (
        <Chat onNavigate={(page) => setAppState(page === 'settings' ? 'settings' : 'chat')} />
      )}

      {appState === 'settings' && (
        <Settings onBack={() => setAppState('chat')} />
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
        <AppContent />
      </RealtimeProvider>
    </CryptoProvider>
  );
}

export default App;
