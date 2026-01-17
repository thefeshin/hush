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
      <span className="offline-icon">!</span>
      <span>You're offline. Messages will be sent when you reconnect.</span>
    </div>
  );
}
