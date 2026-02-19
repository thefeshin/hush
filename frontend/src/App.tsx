/**
 * Main application component with PWA support
 * Handles multi-user authentication flow
 */

import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { ToastBar, Toaster, toast, type Toast } from 'react-hot-toast';
import { CryptoProvider, useCrypto } from './crypto/CryptoContext';
import { useAuthStore, User } from './stores/authStore';
import { initDatabase } from './services/storage';
import { hasStoredVaultKey } from './services/vaultStorage';
import { isPINEnabled } from './services/deviceSettings';
import { LoginForm, RegisterForm } from './components/auth';
import { VaultEntry } from './components/auth/VaultEntry';
import { PINEntry } from './components/auth/PINEntry';
import { Chat } from './components/Chat';
import { InstallBanner } from './components/InstallBanner';
import { UpdateBanner } from './components/UpdateBanner';
import { OfflineIndicator } from './components/OfflineIndicator';
import { RealtimeProvider } from './context/RealtimeContext';
import type { VaultKey } from './types/crypto';

type AppState = 'loading' | 'vault-entry' | 'pin-entry' | 'ready';

function showPinSetupReminder(onOpenSettings: () => void) {
  toast.custom((t) => (
    <div
      role="status"
      className="flex w-full max-w-[440px] items-center gap-3 rounded-[10px] border border-slate-700 bg-[#17212b] px-3.5 py-3 text-slate-50 shadow-[0_8px_20px_rgba(0,0,0,0.25)]"
    >
      <div className="min-w-0 text-body leading-[1.4]">
        Set up a PIN to avoid entering your 12 words each time.
      </div>
      <button
        className="shrink-0 whitespace-nowrap rounded-lg border border-zinc-600 bg-zinc-200 px-2.5 py-1.5 font-bold text-zinc-900 hover:bg-zinc-100"
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

function SwipeToast({ toastItem, children }: { toastItem: Toast; children: React.ReactNode }) {
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const draggingRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    startXRef.current = e.clientX - offsetX;
    draggingRef.current = true;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) {
      return;
    }
    const next = e.clientX - startXRef.current;
    setOffsetX(next);
  };

  const finishDrag = () => {
    draggingRef.current = false;
    setDragging(false);
    if (Math.abs(offsetX) > 90) {
      toast.dismiss(toastItem.id);
      return;
    }
    setOffsetX(0);
  };

  return (
    <div
      className="touch-pan-y"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      style={{
        transform: `translateX(${offsetX}px)`,
        opacity: Math.max(0.25, 1 - Math.abs(offsetX) / 180),
        transition: dragging ? 'none' : 'transform 150ms ease, opacity 150ms ease',
      }}
    >
      {children}
    </div>
  );
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
      navigate('/conversations', { replace: true });
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
    navigate('/conversations', { replace: true });
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
    navigate('/conversations', { replace: true });
  };

  const handlePINUnlock = async (vaultKey: VaultKey) => {
    await unlockVaultWithKey(vaultKey);
    setAppState('ready');
    navigate('/conversations', { replace: true });
  };

  const handleVaultEntryCancel = () => {
    // User cancelled PIN entry, go back to full vault entry
      setAppState('vault-entry');
    };

  return (
    <div className="min-h-dvh bg-bg-primary text-body text-text-primary leading-relaxed">
      <Toaster
        position="bottom-center"
        containerStyle={{
          bottom: 'calc(5.25rem + env(safe-area-inset-bottom))',
          left: '0.75rem',
          right: '0.75rem',
          zIndex: 1200,
        }}
        toastOptions={{
          style: {
            maxWidth: 'min(440px, calc(100vw - 1.5rem))',
            width: '100%',
          },
        }}
      >
        {(t) => (
          <SwipeToast toastItem={t}>
            <ToastBar toast={t} />
          </SwipeToast>
        )}
      </Toaster>
      {/* PWA Banners */}
      <UpdateBanner />

      {/* Main Content */}
      {appState === 'loading' && (
        <div className="flex min-h-dvh items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-border border-t-accent" />
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
                : <Navigate to="/conversations" replace />
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
                : <Navigate to="/conversations" replace />
            }
          />
          <Route
            path="/conversations"
            element={isAuthenticated ? <Chat /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/conversations/:username"
            element={isAuthenticated ? <Chat /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/conversations/id/:conversationId"
            element={isAuthenticated ? <Chat /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/contacts"
            element={isAuthenticated ? <Chat /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/settings"
            element={isAuthenticated ? <Chat /> : <Navigate to="/login" replace />}
          />
          <Route
            path="*"
            element={<Navigate to={isAuthenticated ? '/conversations' : '/login'} replace />}
          />
        </Routes>
      )}

      {/* Bottom Banners */}
      <OfflineIndicator />
      <InstallBanner />
    </div>
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
