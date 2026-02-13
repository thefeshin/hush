/**
 * Hook to manage active conversation subscription lifecycle.
 */

import { useEffect } from 'react';
import { useWebSocket } from './useWebSocket';

export function useConversationSubscription(conversationId: string | null) {
  const { subscribe, unsubscribe, isConnected } = useWebSocket();

  useEffect(() => {
    if (!conversationId || !isConnected) {
      return;
    }

    subscribe(conversationId);

    return () => {
      unsubscribe(conversationId);
    };
  }, [conversationId, isConnected, subscribe, unsubscribe]);
}
