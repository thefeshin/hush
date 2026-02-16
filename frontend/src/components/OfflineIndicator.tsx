/**
 * Offline mode indicator
 */

import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 bg-zinc-700 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-body text-zinc-100">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-500/60">
        <WifiOff className="h-3.5 w-3.5" />
      </span>
      <span>You're offline. Messages will be sent when you reconnect.</span>
    </div>
  );
}
