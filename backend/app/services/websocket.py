"""
WebSocket connection manager
Handles connection pool and message broadcasting
"""

import asyncio
from collections import deque
from typing import Deque, Dict, Set
from dataclasses import dataclass, field
from datetime import datetime, timezone
from time import monotonic

from fastapi import WebSocket
from starlette.websockets import WebSocketState


@dataclass
class Connection:
    """Represents an active WebSocket connection"""
    websocket: WebSocket
    connected_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    subscribed_conversations: Set[str] = field(default_factory=set)
    last_activity: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    message_timestamps: Deque[float] = field(default_factory=deque)


class WebSocketManager:
    """
    Manages WebSocket connections and message broadcasting

    Key design decisions:
    - No user identification (zero-knowledge)
    - Connections subscribe to conversation_ids
    - Messages broadcast to conversation subscribers only
    - Server never inspects message content
    """

    def __init__(self):
        # All active connections
        self._connections: Dict[WebSocket, Connection] = {}
        # Conversation ID -> Set of connections subscribed to it
        self._conversation_subscriptions: Dict[str, Set[WebSocket]] = {}
        # Lock for concurrent operations
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> Connection:
        """Accept and register a new connection"""
        await websocket.accept()

        async with self._lock:
            connection = Connection(websocket=websocket)
            self._connections[websocket] = connection

        return connection

    async def disconnect(self, websocket: WebSocket):
        """Remove a connection and its subscriptions"""
        async with self._lock:
            connection = self._connections.pop(websocket, None)

            if connection:
                # Remove from all conversation subscriptions
                for conversation_id in connection.subscribed_conversations:
                    if conversation_id in self._conversation_subscriptions:
                        self._conversation_subscriptions[conversation_id].discard(websocket)
                        # Clean up empty sets
                        if not self._conversation_subscriptions[conversation_id]:
                            del self._conversation_subscriptions[conversation_id]

    async def subscribe_to_conversation(self, websocket: WebSocket, conversation_id: str):
        """Subscribe a connection to a conversation"""
        async with self._lock:
            connection = self._connections.get(websocket)
            if not connection:
                return

            connection.subscribed_conversations.add(conversation_id)
            connection.last_activity = datetime.now(timezone.utc)

            if conversation_id not in self._conversation_subscriptions:
                self._conversation_subscriptions[conversation_id] = set()
            self._conversation_subscriptions[conversation_id].add(websocket)

    async def unsubscribe_from_conversation(self, websocket: WebSocket, conversation_id: str):
        """Unsubscribe a connection from a conversation"""
        async with self._lock:
            connection = self._connections.get(websocket)
            if not connection:
                return

            connection.subscribed_conversations.discard(conversation_id)
            connection.last_activity = datetime.now(timezone.utc)

            if conversation_id in self._conversation_subscriptions:
                self._conversation_subscriptions[conversation_id].discard(websocket)
                if not self._conversation_subscriptions[conversation_id]:
                    del self._conversation_subscriptions[conversation_id]

    async def broadcast_to_conversation(self, conversation_id: str, message: dict):
        """
        Broadcast a message to all connections subscribed to a conversation
        Message is sent as-is (encrypted blob from client)
        """
        async with self._lock:
            subscribers = self._conversation_subscriptions.get(conversation_id, set()).copy()

        # Send to all subscribers (outside lock)
        dead_connections = []
        for websocket in subscribers:
            try:
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_json(message)
            except Exception:
                dead_connections.append(websocket)

        # Clean up dead connections
        for ws in dead_connections:
            await self.disconnect(ws)

    async def send_personal(self, websocket: WebSocket, message: dict):
        """Send a message to a specific connection"""
        try:
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.send_json(message)
        except Exception:
            await self.disconnect(websocket)

    async def update_activity(self, websocket: WebSocket):
        """Update last activity timestamp for a connection"""
        async with self._lock:
            connection = self._connections.get(websocket)
            if connection:
                connection.last_activity = datetime.now(timezone.utc)

    async def is_subscribed_to_conversation(self, websocket: WebSocket, conversation_id: str) -> bool:
        """Check whether a connection is already subscribed to a conversation."""
        async with self._lock:
            connection = self._connections.get(websocket)
            if not connection:
                return False
            return conversation_id in connection.subscribed_conversations

    async def get_subscription_count(self, websocket: WebSocket) -> int:
        """Return current subscription count for a connection."""
        async with self._lock:
            connection = self._connections.get(websocket)
            if not connection:
                return 0
            return len(connection.subscribed_conversations)

    async def allow_incoming_message(
        self,
        websocket: WebSocket,
        *,
        max_messages: int,
        window_seconds: int,
    ) -> bool:
        """
        Sliding-window per-connection message rate guard.

        Returns True if message is allowed, False if over limit.
        """
        now = monotonic()
        cutoff = now - float(window_seconds)

        async with self._lock:
            connection = self._connections.get(websocket)
            if not connection:
                return False

            while connection.message_timestamps and connection.message_timestamps[0] < cutoff:
                connection.message_timestamps.popleft()

            if len(connection.message_timestamps) >= max_messages:
                return False

            connection.message_timestamps.append(now)
            connection.last_activity = datetime.now(timezone.utc)
            return True

    @property
    def connection_count(self) -> int:
        """Get total number of active connections"""
        return len(self._connections)

    @property
    def conversation_subscription_counts(self) -> Dict[str, int]:
        """Get subscription count per conversation"""
        return {
            conversation_id: len(subs)
            for conversation_id, subs in self._conversation_subscriptions.items()
        }

    def get_stats(self) -> dict:
        """Get WebSocket manager statistics"""
        return {
            "total_connections": self.connection_count,
            "conversations_with_subscribers": len(self._conversation_subscriptions),
            "subscription_counts": self.conversation_subscription_counts
        }


# Global WebSocket manager instance
ws_manager = WebSocketManager()
