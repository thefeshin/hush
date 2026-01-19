/**
 * Connection status indicator
 */

import { useWebSocket } from '../hooks/useWebSocket';
import { ConnectionState } from '../services/websocket';

import '../styles/connection.css';

export function ConnectionStatus() {
  const { connectionState } = useWebSocket();

  const getStatusInfo = () => {
    switch (connectionState) {
      case ConnectionState.CONNECTED:
        return { color: 'var(--success)', text: 'Connected', icon: '\u25CF', className: 'connected' };
      case ConnectionState.CONNECTING:
        return { color: 'var(--text-secondary)', text: 'Connecting...', icon: '\u25CB', className: 'connecting' };
      case ConnectionState.RECONNECTING:
        return { color: '#f59e0b', text: 'Reconnecting...', icon: '\u25D0', className: 'reconnecting' };
      case ConnectionState.DISCONNECTED:
        return { color: 'var(--error)', text: 'Disconnected', icon: '\u25CB', className: 'disconnected' };
    }
  };

  const status = getStatusInfo();

  return (
    <div
      className={`connection-status ${status.className}`}
      title={status.text}
      style={{ color: status.color }}
    >
      <span className="status-icon">{status.icon}</span>
      <span className="status-text">{status.text}</span>
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
    <div className={`offline-banner ${isReconnecting ? 'reconnecting' : ''}`}>
      {isReconnecting
        ? 'Reconnecting to server...'
        : 'You are offline. Messages will be sent when connection is restored.'}
    </div>
  );
}
