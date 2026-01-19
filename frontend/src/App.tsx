/**
 * Main application component with PWA support
 * Handles authentication flow and routing
 */

import { useEffect, useState } from 'react';
import { CryptoProvider, useCrypto } from './crypto/CryptoContext';
import { useAuthStore } from './stores/authStore';
import { initDatabase, loadIdentity } from './services/storage';
import { Login } from './components/Login';
import { IdentitySetup } from './components/IdentitySetup';
import { Chat } from './components/Chat';
import { InstallBanner } from './components/InstallBanner';
import { UpdateBanner } from './components/UpdateBanner';
import { OfflineIndicator } from './components/OfflineIndicator';
import type { IdentityPayload } from './types/crypto';

import './styles/main.css';
import './styles/pwa.css';

function AppContent() {
  const [appState, setAppState] = useState<'loading' | 'login' | 'setup' | 'chat'>('loading');

  const { isAuthenticated } = useAuthStore();
  const { isUnlocked, decryptIdentity } = useCrypto();
  const setIdentity = useAuthStore(state => state.setIdentity);

  // Initialize database on mount
  useEffect(() => {
    initDatabase().catch(console.error);
  }, []);

  // Handle auth state changes
  useEffect(() => {
    console.log('[App] Auth state changed:', { isAuthenticated, isUnlocked, appState });

    if (!isAuthenticated || !isUnlocked) {
      setAppState('login');
      return;
    }

    // Try to load existing identity
    console.log('[App] Calling loadExistingIdentity');
    loadExistingIdentity();
  }, [isAuthenticated, isUnlocked]);

  const loadExistingIdentity = async () => {
    try {
      console.log('[App] Loading existing identity...');
      const encrypted = await loadIdentity();
      console.log('[App] Encrypted identity:', encrypted ? 'found' : 'not found');

      if (encrypted) {
        // Decrypt and restore identity
        const identity = await decryptIdentity<IdentityPayload>(encrypted);
        console.log('[App] Identity decrypted:', identity);
        setIdentity({
          userId: identity.user_id,
          displayName: identity.display_name
        });
        setAppState('chat');
      } else {
        // No existing identity - show setup
        console.log('[App] No identity found, showing setup');
        setAppState('setup');
      }
    } catch (err) {
      // Decryption failed - identity from different vault
      console.error('[App] Failed to decrypt identity:', err);
      setAppState('setup');
    }
  };

  const handleLoginSuccess = () => {
    // Will trigger useEffect to check for identity
  };

  const handleIdentityCreated = () => {
    setAppState('chat');
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

      {appState === 'login' && (
        <Login onSuccess={handleLoginSuccess} />
      )}

      {appState === 'setup' && (
        <IdentitySetup onComplete={handleIdentityCreated} />
      )}

      {appState === 'chat' && (
        <Chat />
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
      <AppContent />
    </CryptoProvider>
  );
}

export default App;
