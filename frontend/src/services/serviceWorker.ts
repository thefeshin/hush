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
