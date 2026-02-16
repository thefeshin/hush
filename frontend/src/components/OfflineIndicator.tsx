/**
 * Offline mode indicator
 */

import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 bg-warning p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-sm text-white">
      <span className="flex h-5 w-5 animate-pulse items-center justify-center rounded-full bg-white/30 text-xs font-bold">!</span>
      <span>You're offline. Messages will be sent when you reconnect.</span>
    </div>
  );
}
