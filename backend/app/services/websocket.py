"""
WebSocket connection manager
Handles connection pool and message broadcasting
"""

import asyncio
from typing import Dict, Set
from dataclasses import dataclass, field
from datetime import datetime, timezone

from fastapi import WebSocket
from starlette.websockets import WebSocketState


@dataclass
class Connection:
    """Represents an active WebSocket connection"""
    websocket: WebSocket
    connected_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    subscribed_threads: Set[str] = field(default_factory=set)
    last_activity: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class WebSocketManager:
    """
    Manages WebSocket connections and message broadcasting

    Key design decisions:
    - No user identification (zero-knowledge)
    - Connections subscribe to thread_ids
    - Messages broadcast to thread subscribers only
    - Server never inspects message content
    """

    def __init__(self):
        # All active connections
        self._connections: Dict[WebSocket, Connection] = {}
        # Thread ID -> Set of connections subscribed to it
        self._thread_subscriptions: Dict[str, Set[WebSocket]] = {}
        # Lock for thread-safe operations
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
                # Remove from all thread subscriptions
                for thread_id in connection.subscribed_threads:
                    if thread_id in self._thread_subscriptions:
                        self._thread_subscriptions[thread_id].discard(websocket)
                        # Clean up empty sets
                        if not self._thread_subscriptions[thread_id]:
                            del self._thread_subscriptions[thread_id]

    async def subscribe_to_thread(self, websocket: WebSocket, thread_id: str):
        """Subscribe a connection to a thread"""
        async with self._lock:
            connection = self._connections.get(websocket)
            if not connection:
                return

            connection.subscribed_threads.add(thread_id)
            connection.last_activity = datetime.now(timezone.utc)

            if thread_id not in self._thread_subscriptions:
                self._thread_subscriptions[thread_id] = set()
            self._thread_subscriptions[thread_id].add(websocket)

    async def unsubscribe_from_thread(self, websocket: WebSocket, thread_id: str):
        """Unsubscribe a connection from a thread"""
        async with self._lock:
            connection = self._connections.get(websocket)
            if not connection:
                return

            connection.subscribed_threads.discard(thread_id)
            connection.last_activity = datetime.now(timezone.utc)

            if thread_id in self._thread_subscriptions:
                self._thread_subscriptions[thread_id].discard(websocket)
                if not self._thread_subscriptions[thread_id]:
                    del self._thread_subscriptions[thread_id]

    async def broadcast_to_thread(self, thread_id: str, message: dict):
        """
        Broadcast a message to all connections subscribed to a thread
        Message is sent as-is (encrypted blob from client)
        """
        async with self._lock:
            subscribers = self._thread_subscriptions.get(thread_id, set()).copy()

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

    @property
    def connection_count(self) -> int:
        """Get total number of active connections"""
        return len(self._connections)

    @property
    def thread_subscription_counts(self) -> Dict[str, int]:
        """Get subscription count per thread"""
        return {
            thread_id: len(subs)
            for thread_id, subs in self._thread_subscriptions.items()
        }

    def get_stats(self) -> dict:
        """Get WebSocket manager statistics"""
        return {
            "total_connections": self.connection_count,
            "threads_with_subscribers": len(self._thread_subscriptions),
            "subscription_counts": self.thread_subscription_counts
        }


# Global WebSocket manager instance
ws_manager = WebSocketManager()
