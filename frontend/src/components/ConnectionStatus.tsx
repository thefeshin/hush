/**
 * Connection status indicator
 */

import { useWebSocket } from '../hooks/useWebSocket';
import { ConnectionState } from '../services/websocket';

export function ConnectionStatus() {
  const { connectionState } = useWebSocket();

  const getStatusInfo = () => {
    switch (connectionState) {
      case ConnectionState.CONNECTED:
        return { text: 'Connected', icon: '\u25CF', className: 'connected' };
      case ConnectionState.CONNECTING:
        return { text: 'Connecting...', icon: '\u25CB', className: 'connecting' };
      case ConnectionState.RECONNECTING:
        return { text: 'Reconnecting...', icon: '\u25D0', className: 'reconnecting' };
      case ConnectionState.DISCONNECTED:
        return { text: 'Disconnected', icon: '\u25CB', className: 'disconnected' };
    }
  };

  const status = getStatusInfo();
  const statusColorClass = {
    connected: 'text-success',
    connecting: 'text-text-secondary',
    reconnecting: 'text-warning',
    disconnected: 'text-error'
  }[status.className];
  const statusIconAnimClass = status.className === 'connecting'
    ? 'animate-blink'
    : status.className === 'reconnecting'
      ? 'animate-pulse'
      : '';

  return (
    <div className={`flex items-center gap-2 whitespace-nowrap rounded-2xl bg-bg-primary px-2 py-1 text-xs ${statusColorClass}`} title={status.text}>
      <span className={`text-[0.625rem] leading-none ${statusIconAnimClass}`}>{status.icon}</span>
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
    <div className={`fixed bottom-0 left-0 right-0 z-[1000] animate-slide-up px-4 py-2 text-center text-sm text-white ${isReconnecting ? 'bg-warning' : 'bg-error'}`}>
      {isReconnecting
        ? 'Reconnecting to server...'
        : 'You are offline. Messages will be sent when connection is restored.'}
    </div>
  );
}
