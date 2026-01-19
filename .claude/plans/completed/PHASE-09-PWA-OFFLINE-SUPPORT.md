# PHASE 09: Progressive Web App & Offline Support

## Overview
This phase implements PWA capabilities including service worker, offline caching, app manifest, and install prompts. Users can install HUSH as a standalone app with offline read support.

## Objectives
1. Service worker with caching strategies
2. Web app manifest for installability
3. Offline-first data strategy
4. Install prompt handling
5. Background sync for messages
6. Push notification preparation

---

## 1. Service Worker

### File: `frontend/public/sw.js`

```javascript
/**
 * HUSH Service Worker
 * Handles caching and offline functionality
 */

const CACHE_NAME = 'hush-v1';
const STATIC_CACHE = 'hush-static-v1';
const DYNAMIC_CACHE = 'hush-dynamic-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        // Activate immediately
        return self.skipWaiting();
      })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    Promise.all([
      // Clean old caches
      caches.keys().then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
            .map((key) => {
              console.log('[SW] Removing old cache:', key);
              return caches.delete(key);
            })
        );
      }),
      // Take control of all clients
      self.clients.claim()
    ])
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip WebSocket connections
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  // Skip API calls (except auth/salt which can be cached)
  if (url.pathname.startsWith('/api/') && !url.pathname.includes('/auth/salt')) {
    // Network-first for API calls
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for static assets
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Stale-while-revalidate for everything else
  event.respondWith(staleWhileRevalidate(request));
});

/**
 * Cache-first strategy
 * Try cache, fallback to network
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return new Response('Offline', { status: 503 });
  }
}

/**
 * Network-first strategy
 * Try network, fallback to cache
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Stale-while-revalidate strategy
 * Return cached immediately, update in background
 */
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        const cache = caches.open(DYNAMIC_CACHE);
        cache.then((c) => c.put(request, response.clone()));
      }
      return response;
    })
    .catch(() => null);

  return cached || fetchPromise || new Response('Offline', { status: 503 });
}

/**
 * Check if path is a static asset
 */
function isStaticAsset(pathname) {
  const staticExtensions = ['.js', '.css', '.png', '.jpg', '.svg', '.woff', '.woff2', '.wasm'];
  return staticExtensions.some((ext) => pathname.endsWith(ext));
}

// Background sync for queued messages
self.addEventListener('sync', (event) => {
  if (event.tag === 'send-messages') {
    event.waitUntil(sendQueuedMessages());
  }
});

async function sendQueuedMessages() {
  // This will be handled by the main app
  // Just notify the app that sync is requested
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: 'SYNC_MESSAGES' });
  });
}

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
```

---

## 2. Web App Manifest

### File: `frontend/public/manifest.json`

```json
{
  "name": "HUSH - Zero-Knowledge Encrypted Chat",
  "short_name": "HUSH",
  "description": "Private, encrypted conversations with zero server knowledge",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#e94560",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icon-72.png",
      "sizes": "72x72",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-96.png",
      "sizes": "96x96",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-128.png",
      "sizes": "128x128",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-144.png",
      "sizes": "144x144",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-152.png",
      "sizes": "152x152",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icon-384.png",
      "sizes": "384x384",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "categories": ["communication", "security"],
  "screenshots": [
    {
      "src": "/screenshot-1.png",
      "sizes": "1080x1920",
      "type": "image/png",
      "form_factor": "narrow"
    }
  ],
  "related_applications": [],
  "prefer_related_applications": false
}
```

---

## 3. Service Worker Registration

### File: `frontend/src/services/serviceWorker.ts`

```typescript
/**
 * Service worker registration and update handling
 */

type UpdateCallback = () => void;

let updateCallback: UpdateCallback | null = null;
let registration: ServiceWorkerRegistration | null = null;

/**
 * Register the service worker
 */
export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    console.log('Service workers not supported');
    return;
  }

  try {
    registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    });

    console.log('Service worker registered:', registration.scope);

    // Check for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration?.installing;

      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available
            console.log('New version available');
            updateCallback?.();
          }
        });
      }
    });

    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);

  } catch (error) {
    console.error('Service worker registration failed:', error);
  }
}

/**
 * Set callback for when an update is available
 */
export function onUpdateAvailable(callback: UpdateCallback): void {
  updateCallback = callback;
}

/**
 * Apply pending update (reload with new service worker)
 */
export function applyUpdate(): void {
  if (registration?.waiting) {
    // Tell the waiting service worker to activate
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  // Reload to use new version
  window.location.reload();
}

/**
 * Check for updates manually
 */
export async function checkForUpdates(): Promise<void> {
  if (registration) {
    await registration.update();
  }
}

/**
 * Request background sync
 */
export async function requestSync(tag: string): Promise<void> {
  if (registration && 'sync' in registration) {
    try {
      await (registration as any).sync.register(tag);
    } catch (error) {
      console.error('Background sync registration failed:', error);
    }
  }
}

/**
 * Handle messages from service worker
 */
function handleServiceWorkerMessage(event: MessageEvent): void {
  const { type } = event.data;

  switch (type) {
    case 'SYNC_MESSAGES':
      // Trigger message queue processing
      window.dispatchEvent(new CustomEvent('hush:sync-messages'));
      break;
  }
}

/**
 * Unregister all service workers (for debugging)
 */
export async function unregisterAll(): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const reg of registrations) {
    await reg.unregister();
  }
}
```

---

## 4. Install Prompt Hook

### File: `frontend/src/hooks/useInstallPrompt.ts`

```typescript
/**
 * Hook for handling PWA install prompt
 */

import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface UseInstallPromptReturn {
  canInstall: boolean;
  isInstalled: boolean;
  promptInstall: () => Promise<boolean>;
}

export function useInstallPrompt(): UseInstallPromptReturn {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    const checkInstalled = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isIOSStandalone = (navigator as any).standalone === true;
      setIsInstalled(isStandalone || isIOSStandalone);
    };

    checkInstalled();

    // Listen for install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // Listen for successful install
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) {
      return false;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      return true;
    }

    return false;
  }, [deferredPrompt]);

  return {
    canInstall: !!deferredPrompt,
    isInstalled,
    promptInstall
  };
}
```

---

## 5. Install Banner Component

### File: `frontend/src/components/InstallBanner.tsx`

```typescript
/**
 * PWA install banner
 */

import React, { useState } from 'react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

export function InstallBanner() {
  const [dismissed, setDismissed] = useState(false);
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt();

  if (dismissed || isInstalled || !canInstall) {
    return null;
  }

  const handleInstall = async () => {
    const installed = await promptInstall();
    if (!installed) {
      setDismissed(true);
    }
  };

  return (
    <div className="install-banner">
      <div className="install-content">
        <span className="install-icon">📱</span>
        <div className="install-text">
          <strong>Install HUSH</strong>
          <span>Add to home screen for the best experience</span>
        </div>
      </div>
      <div className="install-actions">
        <button onClick={() => setDismissed(true)} className="dismiss-button">
          Later
        </button>
        <button onClick={handleInstall} className="install-button">
          Install
        </button>
      </div>
    </div>
  );
}
```

---

## 6. Update Available Banner

### File: `frontend/src/components/UpdateBanner.tsx`

```typescript
/**
 * Update available notification
 */

import React, { useState, useEffect } from 'react';
import { onUpdateAvailable, applyUpdate } from '../services/serviceWorker';

export function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    onUpdateAvailable(() => {
      setUpdateAvailable(true);
    });
  }, []);

  if (!updateAvailable) {
    return null;
  }

  return (
    <div className="update-banner">
      <span>A new version is available</span>
      <button onClick={applyUpdate} className="update-button">
        Update Now
      </button>
    </div>
  );
}
```

---

## 7. Offline Indicator

### File: `frontend/src/components/OfflineIndicator.tsx`

```typescript
/**
 * Offline mode indicator
 */

import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div className="offline-indicator">
      <span className="offline-icon">📡</span>
      <span>You're offline. Messages will be sent when you reconnect.</span>
    </div>
  );
}
```

---

## 8. PWA Styles

### File: `frontend/src/styles/pwa.css`

```css
/* Install Banner */
.install-banner {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 100;
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.install-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.install-icon {
  font-size: 1.5rem;
}

.install-text {
  display: flex;
  flex-direction: column;
}

.install-text strong {
  font-size: 0.875rem;
}

.install-text span {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.install-actions {
  display: flex;
  gap: 0.5rem;
}

.dismiss-button {
  padding: 0.5rem 1rem;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 0.25rem;
  color: var(--text-secondary);
  cursor: pointer;
}

.install-button {
  padding: 0.5rem 1rem;
  background: var(--accent);
  border: none;
  border-radius: 0.25rem;
  color: white;
  cursor: pointer;
}

/* Update Banner */
.update-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: var(--accent);
  color: white;
  padding: 0.5rem 1rem;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  z-index: 100;
}

.update-button {
  padding: 0.25rem 0.75rem;
  background: white;
  color: var(--accent);
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  font-weight: 600;
}

/* Offline Indicator */
.offline-indicator {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #f59e0b;
  color: white;
  padding: 0.5rem;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  z-index: 100;
}

.offline-icon {
  animation: pulse 2s infinite;
}

/* iOS Specific */
@supports (-webkit-touch-callout: none) {
  .install-banner,
  .update-banner,
  .offline-indicator {
    padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
  }
}

/* Standalone Mode Adjustments */
@media (display-mode: standalone) {
  body {
    /* Prevent overscroll */
    overscroll-behavior: none;
  }

  /* Safe areas for notched devices */
  .chat-container {
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
}
```

---

## 9. App Entry Point Updates

### File: `frontend/src/main.tsx`

```typescript
/**
 * Application entry point with PWA support
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { registerServiceWorker } from './services/serviceWorker';
import './styles/main.css';
import './styles/chat.css';
import './styles/pwa.css';

// Register service worker
registerServiceWorker();

// Render app
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

---

## 10. Updated App with PWA Components

### File: `frontend/src/App.tsx` (with PWA components)

```typescript
/**
 * Main application component with PWA support
 */

import React, { useEffect, useState } from 'react';
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

function AppContent() {
  const [appState, setAppState] = useState<'loading' | 'login' | 'setup' | 'chat'>('loading');

  const { isAuthenticated } = useAuthStore();
  const { isUnlocked, decryptIdentity } = useCrypto();
  const setIdentity = useAuthStore(state => state.setIdentity);

  useEffect(() => {
    initDatabase().catch(console.error);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !isUnlocked) {
      setAppState('login');
      return;
    }

    loadExistingIdentity();
  }, [isAuthenticated, isUnlocked]);

  const loadExistingIdentity = async () => {
    try {
      const encrypted = await loadIdentity();

      if (encrypted) {
        const identity = await decryptIdentity<IdentityPayload>(encrypted);
        setIdentity({
          userId: identity.user_id,
          displayName: identity.display_name
        });
        setAppState('chat');
      } else {
        setAppState('setup');
      }
    } catch (err) {
      console.error('Failed to decrypt identity');
      setAppState('setup');
    }
  };

  const handleLoginSuccess = () => {
    // Will trigger useEffect
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
```

---

## 11. HTML Updates for PWA

### File: `frontend/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />

  <!-- PWA Meta Tags -->
  <meta name="theme-color" content="#e94560" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="HUSH" />

  <!-- Security -->
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'self';
    script-src 'self' 'wasm-unsafe-eval';
    style-src 'self' 'unsafe-inline';
    connect-src 'self' wss: ws:;
    img-src 'self' data: blob:;
  " />

  <!-- App Info -->
  <title>HUSH</title>
  <meta name="description" content="Zero-Knowledge Encrypted Chat" />

  <!-- Manifest -->
  <link rel="manifest" href="/manifest.json" />

  <!-- Icons -->
  <link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png" />
  <link rel="apple-touch-icon" href="/icon-192.png" />

  <!-- iOS Splash Screens -->
  <link rel="apple-touch-startup-image" href="/splash-640x1136.png"
        media="(device-width: 320px) and (device-height: 568px)" />
  <link rel="apple-touch-startup-image" href="/splash-750x1334.png"
        media="(device-width: 375px) and (device-height: 667px)" />
  <link rel="apple-touch-startup-image" href="/splash-1242x2208.png"
        media="(device-width: 414px) and (device-height: 736px)" />
  <link rel="apple-touch-startup-image" href="/splash-1125x2436.png"
        media="(device-width: 375px) and (device-height: 812px)" />

  <!-- Preload critical assets -->
  <link rel="preload" href="/argon2-wasm/argon2.wasm" as="fetch" crossorigin />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>

  <!-- No-JS fallback -->
  <noscript>
    <style>
      #root { display: none; }
      .no-js { display: block !important; }
    </style>
    <div class="no-js" style="padding: 2rem; text-align: center;">
      <h1>HUSH requires JavaScript</h1>
      <p>Please enable JavaScript to use this application.</p>
    </div>
  </noscript>
</body>
</html>
```

---

## 12. Verification Checklist

After implementing this phase, verify:

- [ ] Service worker registers successfully
- [ ] Static assets are cached
- [ ] App works offline (read mode)
- [ ] Install banner appears on supported browsers
- [ ] App can be installed to home screen
- [ ] Standalone mode works correctly
- [ ] Update banner appears when new version available
- [ ] Offline indicator shows when disconnected
- [ ] Safe area insets work on notched devices
- [ ] CSP headers don't break functionality

---

## 13. Test Scenarios

```
1. Offline Mode:
   - Load app while online
   - Turn off network
   - Verify app shell still loads
   - Verify cached messages display

2. Install Flow:
   - Open in Chrome/Edge
   - Verify install banner appears
   - Click install
   - Verify app opens in standalone mode

3. Update Flow:
   - Deploy new version
   - Open app
   - Verify update banner appears
   - Click update
   - Verify new version loads

4. Background Sync:
   - Go offline
   - Send a message
   - Go online
   - Verify message is sent
```
