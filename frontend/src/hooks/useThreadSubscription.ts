/**
 * Hook to manage thread subscription lifecycle
 */

import { useEffect } from 'react';
import { useWebSocket } from './useWebSocket';

export function useThreadSubscription(threadId: string | null) {
  const { subscribe, unsubscribe, isConnected } = useWebSocket();

  useEffect(() => {
    if (!threadId || !isConnected) {
      return;
    }

    // Subscribe to thread
    subscribe(threadId);

    // Unsubscribe on cleanup
    return () => {
      unsubscribe(threadId);
    };
  }, [threadId, isConnected, subscribe, unsubscribe]);
}
