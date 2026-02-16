/**
 * Connection status indicator
 */

import { useWebSocket } from '../hooks/useWebSocket';
import { ConnectionState } from '../services/websocket';
import { Circle, Loader2, RotateCw, WifiOff } from 'lucide-react';

export function ConnectionStatus() {
  const { connectionState } = useWebSocket();

  const getStatusInfo = () => {
    switch (connectionState) {
      case ConnectionState.CONNECTED:
        return { text: 'Connected', className: 'connected' };
      case ConnectionState.CONNECTING:
        return { text: 'Connecting...', className: 'connecting' };
      case ConnectionState.RECONNECTING:
        return { text: 'Reconnecting...', className: 'reconnecting' };
      case ConnectionState.DISCONNECTED:
        return { text: 'Disconnected', className: 'disconnected' };
    }
  };

  const status = getStatusInfo();
  const statusColorClass = {
    connected: 'text-zinc-300',
    connecting: 'text-text-secondary',
    reconnecting: 'text-zinc-400',
    disconnected: 'text-zinc-500'
  }[status.className];
  const statusIcon = status.className === 'connected'
    ? <Circle className="h-3 w-3 fill-current" />
    : status.className === 'connecting'
      ? <Loader2 className="h-3 w-3 animate-spin" />
      : status.className === 'reconnecting'
        ? <RotateCw className="h-3 w-3 animate-spin" />
        : <WifiOff className="h-3 w-3" />;

  return (
    <div className={`flex items-center gap-2 whitespace-nowrap rounded-2xl bg-bg-primary px-2 py-1 text-xs ${statusColorClass}`} title={status.text}>
      <span className="inline-flex items-center">{statusIcon}</span>
      <span>{status.text}</span>
    </div>
  );
}

/**
 * Offline banner shown when browser is offline
 */
export function OfflineBanner() {
  const { connectionState } = useWebSocket();

  if (connectionState === ConnectionState.CONNECTED) {
    return null;
  }

  const isReconnecting = connectionState === ConnectionState.RECONNECTING;

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-[1000] animate-slide-up px-4 py-2 text-center text-sm text-zinc-100 ${isReconnecting ? 'bg-zinc-700' : 'bg-zinc-800'}`}>
      {isReconnecting
        ? 'Reconnecting to server...'
        : 'You are offline. Messages will be sent when connection is restored.'}
    </div>
  );
}
