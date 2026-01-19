# PHASE 04: WebSocket & Message Relay

## Overview
This phase implements the real-time WebSocket communication layer and the REST endpoints for threads and messages. The backend acts as a stateless relay — it stores and broadcasts encrypted blobs without any knowledge of their content.

## Objectives
1. WebSocket connection handling with JWT authentication
2. Thread CRUD operations (encrypted blobs)
3. Message CRUD operations (encrypted blobs)
4. Real-time message broadcasting by thread_id
5. Connection pool management
6. Reconnection handling

---

## 1. WebSocket Manager

### File: `backend/app/services/websocket.py`

```python
"""
WebSocket connection manager
Handles connection pool and message broadcasting
"""

import asyncio
from typing import Dict, Set, Optional
from dataclasses import dataclass, field
from datetime import datetime, timezone
import json

from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState


@dataclass
class Connection:
    """Represents an active WebSocket connection"""
    websocket: WebSocket
    connected_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    subscribed_threads: Set[str] = field(default_factory=set)


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


# Global WebSocket manager instance
ws_manager = WebSocketManager()
```

---

## 2. WebSocket Router

### File: `backend/app/routers/websocket.py`

```python
"""
WebSocket endpoint for real-time communication
All messages are encrypted blobs - server is a blind relay
"""

import json
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends

from app.services.websocket import ws_manager
from app.dependencies.auth import verify_websocket_token, extract_ws_token
from app.database import get_pool

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Main WebSocket endpoint

    Connection flow:
    1. Client connects with ?token=JWT
    2. Server validates JWT
    3. Client sends subscribe/unsubscribe messages
    4. Client sends messages (encrypted blobs)
    5. Server broadcasts to thread subscribers

    Message types (client -> server):
    - {"type": "subscribe", "thread_id": "..."}
    - {"type": "unsubscribe", "thread_id": "..."}
    - {"type": "message", "thread_id": "...", "ciphertext": "...", "iv": "..."}

    Message types (server -> client):
    - {"type": "subscribed", "thread_id": "..."}
    - {"type": "unsubscribed", "thread_id": "..."}
    - {"type": "message", "id": "...", "thread_id": "...", "ciphertext": "...", "iv": "...", "created_at": "..."}
    - {"type": "error", "message": "..."}
    """

    # Extract and verify token
    token = extract_ws_token(websocket)
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    payload = await verify_websocket_token(token)
    if not payload:
        await websocket.close(code=4001, reason="Invalid token")
        return

    # Accept connection
    connection = await ws_manager.connect(websocket)

    try:
        # Get database pool for message persistence
        pool = await get_pool()

        while True:
            # Receive message
            data = await websocket.receive_json()

            msg_type = data.get("type")

            if msg_type == "subscribe":
                await handle_subscribe(websocket, data)

            elif msg_type == "unsubscribe":
                await handle_unsubscribe(websocket, data)

            elif msg_type == "message":
                await handle_message(websocket, data, pool)

            elif msg_type == "ping":
                await ws_manager.send_personal(websocket, {"type": "pong"})

            else:
                await ws_manager.send_personal(websocket, {
                    "type": "error",
                    "message": f"Unknown message type: {msg_type}"
                })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        # Log error but don't expose details
        print(f"WebSocket error: {type(e).__name__}")
    finally:
        await ws_manager.disconnect(websocket)


async def handle_subscribe(websocket: WebSocket, data: dict):
    """Handle thread subscription request"""
    thread_id = data.get("thread_id")

    if not thread_id:
        await ws_manager.send_personal(websocket, {
            "type": "error",
            "message": "Missing thread_id"
        })
        return

    # Validate UUID format
    try:
        UUID(thread_id)
    except ValueError:
        await ws_manager.send_personal(websocket, {
            "type": "error",
            "message": "Invalid thread_id format"
        })
        return

    await ws_manager.subscribe_to_thread(websocket, thread_id)

    await ws_manager.send_personal(websocket, {
        "type": "subscribed",
        "thread_id": thread_id
    })


async def handle_unsubscribe(websocket: WebSocket, data: dict):
    """Handle thread unsubscription request"""
    thread_id = data.get("thread_id")

    if not thread_id:
        return

    await ws_manager.unsubscribe_from_thread(websocket, thread_id)

    await ws_manager.send_personal(websocket, {
        "type": "unsubscribed",
        "thread_id": thread_id
    })


async def handle_message(websocket: WebSocket, data: dict, pool):
    """
    Handle incoming message (encrypted blob)
    1. Validate required fields
    2. Persist to database
    3. Broadcast to thread subscribers
    """
    thread_id = data.get("thread_id")
    ciphertext = data.get("ciphertext")
    iv = data.get("iv")

    # Validate required fields
    if not all([thread_id, ciphertext, iv]):
        await ws_manager.send_personal(websocket, {
            "type": "error",
            "message": "Missing required fields: thread_id, ciphertext, iv"
        })
        return

    # Validate UUID format
    try:
        thread_uuid = UUID(thread_id)
    except ValueError:
        await ws_manager.send_personal(websocket, {
            "type": "error",
            "message": "Invalid thread_id format"
        })
        return

    # Persist message to database
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            INSERT INTO messages (thread_id, ciphertext, iv)
            VALUES ($1, $2, $3)
            RETURNING id, created_at
        """, thread_uuid, ciphertext.encode(), iv.encode())

    # Prepare broadcast message
    broadcast_msg = {
        "type": "message",
        "id": str(row["id"]),
        "thread_id": thread_id,
        "ciphertext": ciphertext,
        "iv": iv,
        "created_at": row["created_at"].isoformat()
    }

    # Broadcast to all subscribers of this thread
    await ws_manager.broadcast_to_thread(thread_id, broadcast_msg)
```

---

## 3. Thread Router (REST)

### File: `backend/app/routers/threads.py`

```python
"""
Thread REST endpoints
All thread data is encrypted - server only stores blobs
"""

import base64
from uuid import UUID
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_connection
from app.dependencies.auth import verify_token
from app.schemas.thread import ThreadCreate, ThreadResponse, ThreadQuery

router = APIRouter()


@router.post("/threads", response_model=ThreadResponse, status_code=status.HTTP_201_CREATED)
async def create_thread(
    thread: ThreadCreate,
    conn=Depends(get_connection),
    _=Depends(verify_token)
):
    """
    Create a new thread with encrypted metadata

    The client generates the thread_id as:
    thread_id = SHA-256(sort(uuid_a, uuid_b))

    This ensures:
    - Same thread_id for both participants
    - Deterministic - no duplicates
    - Server cannot determine participants
    """
    # Check if thread already exists
    existing = await conn.fetchval("""
        SELECT id FROM threads WHERE id = $1
    """, thread.id)

    if existing:
        # Thread exists - just return it (idempotent)
        row = await conn.fetchrow("""
            SELECT id, ciphertext, iv, created_at
            FROM threads WHERE id = $1
        """, thread.id)

        return ThreadResponse(
            id=row["id"],
            ciphertext=row["ciphertext"].decode() if isinstance(row["ciphertext"], bytes) else row["ciphertext"],
            iv=row["iv"].decode() if isinstance(row["iv"], bytes) else row["iv"],
            created_at=row["created_at"]
        )

    # Create new thread
    row = await conn.fetchrow("""
        INSERT INTO threads (id, ciphertext, iv)
        VALUES ($1, $2, $3)
        RETURNING id, ciphertext, iv, created_at
    """, thread.id, thread.ciphertext.encode(), thread.iv.encode())

    return ThreadResponse(
        id=row["id"],
        ciphertext=row["ciphertext"].decode() if isinstance(row["ciphertext"], bytes) else row["ciphertext"],
        iv=row["iv"].decode() if isinstance(row["iv"], bytes) else row["iv"],
        created_at=row["created_at"]
    )


@router.post("/threads/query", response_model=List[ThreadResponse])
async def query_threads(
    query: ThreadQuery,
    conn=Depends(get_connection),
    _=Depends(verify_token)
):
    """
    Query threads by their IDs

    Client computes thread_ids for all known contacts
    and queries for those specific threads.
    This maintains zero-knowledge - server doesn't know
    which threads belong to which users.
    """
    if not query.thread_ids:
        return []

    rows = await conn.fetch("""
        SELECT id, ciphertext, iv, created_at
        FROM threads
        WHERE id = ANY($1)
        ORDER BY created_at DESC
    """, query.thread_ids)

    return [
        ThreadResponse(
            id=row["id"],
            ciphertext=row["ciphertext"].decode() if isinstance(row["ciphertext"], bytes) else row["ciphertext"],
            iv=row["iv"].decode() if isinstance(row["iv"], bytes) else row["iv"],
            created_at=row["created_at"]
        )
        for row in rows
    ]


@router.get("/threads/{thread_id}", response_model=ThreadResponse)
async def get_thread(
    thread_id: UUID,
    conn=Depends(get_connection),
    _=Depends(verify_token)
):
    """Get a specific thread by ID"""
    row = await conn.fetchrow("""
        SELECT id, ciphertext, iv, created_at
        FROM threads WHERE id = $1
    """, thread_id)

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thread not found"
        )

    return ThreadResponse(
        id=row["id"],
        ciphertext=row["ciphertext"].decode() if isinstance(row["ciphertext"], bytes) else row["ciphertext"],
        iv=row["iv"].decode() if isinstance(row["iv"], bytes) else row["iv"],
        created_at=row["created_at"]
    )
```

---

## 4. Message Router (REST)

### File: `backend/app/routers/messages.py`

```python
"""
Message REST endpoints
All message content is encrypted - server only stores blobs
"""

from uuid import UUID
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query

from app.database import get_connection
from app.dependencies.auth import verify_token
from app.schemas.message import MessageCreate, MessageResponse, MessageQuery

router = APIRouter()


@router.post("/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(
    message: MessageCreate,
    conn=Depends(get_connection),
    _=Depends(verify_token)
):
    """
    Create a new message (encrypted blob)

    Note: For real-time, prefer WebSocket.
    This endpoint exists for:
    - Offline message queue sync
    - Fallback when WebSocket unavailable
    """
    # Verify thread exists
    thread_exists = await conn.fetchval("""
        SELECT EXISTS(SELECT 1 FROM threads WHERE id = $1)
    """, message.thread_id)

    if not thread_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thread not found"
        )

    row = await conn.fetchrow("""
        INSERT INTO messages (thread_id, ciphertext, iv)
        VALUES ($1, $2, $3)
        RETURNING id, thread_id, ciphertext, iv, created_at
    """, message.thread_id, message.ciphertext.encode(), message.iv.encode())

    return MessageResponse(
        id=row["id"],
        thread_id=row["thread_id"],
        ciphertext=row["ciphertext"].decode() if isinstance(row["ciphertext"], bytes) else row["ciphertext"],
        iv=row["iv"].decode() if isinstance(row["iv"], bytes) else row["iv"],
        created_at=row["created_at"]
    )


@router.get("/messages/{thread_id}", response_model=List[MessageResponse])
async def get_messages(
    thread_id: UUID,
    after: Optional[datetime] = Query(None, description="Get messages after this timestamp"),
    limit: int = Query(50, le=200, description="Maximum messages to return"),
    conn=Depends(get_connection),
    _=Depends(verify_token)
):
    """
    Get messages for a thread

    Pagination:
    - Use 'after' param with last message's created_at for cursor pagination
    - Default limit is 50, max is 200
    """
    if after:
        rows = await conn.fetch("""
            SELECT id, thread_id, ciphertext, iv, created_at
            FROM messages
            WHERE thread_id = $1 AND created_at > $2
            ORDER BY created_at ASC
            LIMIT $3
        """, thread_id, after, limit)
    else:
        # Get most recent messages
        rows = await conn.fetch("""
            SELECT id, thread_id, ciphertext, iv, created_at
            FROM messages
            WHERE thread_id = $1
            ORDER BY created_at DESC
            LIMIT $2
        """, thread_id, limit)
        # Reverse to chronological order
        rows = list(reversed(rows))

    return [
        MessageResponse(
            id=row["id"],
            thread_id=row["thread_id"],
            ciphertext=row["ciphertext"].decode() if isinstance(row["ciphertext"], bytes) else row["ciphertext"],
            iv=row["iv"].decode() if isinstance(row["iv"], bytes) else row["iv"],
            created_at=row["created_at"]
        )
        for row in rows
    ]


@router.get("/messages/{thread_id}/count")
async def get_message_count(
    thread_id: UUID,
    conn=Depends(get_connection),
    _=Depends(verify_token)
):
    """Get total message count for a thread"""
    count = await conn.fetchval("""
        SELECT COUNT(*) FROM messages WHERE thread_id = $1
    """, thread_id)

    return {"thread_id": str(thread_id), "count": count}
```

---

## 5. Register WebSocket Router

### Update: `backend/app/main.py`

```python
# Add to imports
from app.routers import auth, threads, messages, health, websocket

# Add to router registration (inside create_app)
app.include_router(websocket.router, tags=["websocket"])
```

---

## 6. Connection Health & Cleanup

### File: `backend/app/services/connection_cleanup.py`

```python
"""
Background task for cleaning up stale connections
"""

import asyncio
from datetime import datetime, timedelta, timezone

from app.services.websocket import ws_manager


async def cleanup_stale_connections(max_age_hours: int = 24):
    """
    Periodically clean up connections that have been idle too long
    Runs as a background task
    """
    while True:
        await asyncio.sleep(3600)  # Run every hour

        cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)

        async with ws_manager._lock:
            stale = [
                ws for ws, conn in ws_manager._connections.items()
                if conn.connected_at < cutoff
            ]

        for ws in stale:
            try:
                await ws.close(code=4002, reason="Connection timeout")
            except Exception:
                pass
            await ws_manager.disconnect(ws)


async def start_cleanup_task():
    """Start the cleanup background task"""
    asyncio.create_task(cleanup_stale_connections())
```

---

## 7. WebSocket Heartbeat

### File: `backend/app/services/heartbeat.py`

```python
"""
WebSocket heartbeat to detect dead connections
"""

import asyncio
from starlette.websockets import WebSocketState

from app.services.websocket import ws_manager


async def send_heartbeats(interval_seconds: int = 30):
    """
    Send periodic pings to all connections
    Dead connections are cleaned up
    """
    while True:
        await asyncio.sleep(interval_seconds)

        async with ws_manager._lock:
            connections = list(ws_manager._connections.keys())

        dead = []
        for ws in connections:
            try:
                if ws.client_state == WebSocketState.CONNECTED:
                    await ws.send_json({"type": "heartbeat"})
                else:
                    dead.append(ws)
            except Exception:
                dead.append(ws)

        for ws in dead:
            await ws_manager.disconnect(ws)


async def start_heartbeat_task():
    """Start the heartbeat background task"""
    asyncio.create_task(send_heartbeats())
```

---

## 8. Startup Event Updates

### Update: `backend/app/main.py`

```python
from app.services.connection_cleanup import start_cleanup_task
from app.services.heartbeat import start_heartbeat_task

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    # Startup
    await init_db()
    await start_cleanup_task()
    await start_heartbeat_task()
    yield
    # Shutdown
    await close_db()
```

---

## 9. Security Considerations

### WebSocket Authentication
- JWT required in query parameter
- Token validated before connection accepted
- Invalid token = immediate close (code 4001)

### Message Validation
- All UUIDs validated for format
- Required fields checked before processing
- No content inspection (zero-knowledge)

### Connection Limits
- Heartbeat detects dead connections
- Stale connections cleaned after 24 hours
- Connection pool prevents resource exhaustion

### Broadcast Security
- Messages only sent to thread subscribers
- Server cannot determine message content
- No message modification

---

## 10. Verification Checklist

After implementing this phase, verify:

- [ ] WebSocket connects with valid JWT
- [ ] WebSocket rejects without/invalid JWT
- [ ] Subscribe/unsubscribe works correctly
- [ ] Messages persist to database
- [ ] Messages broadcast to subscribers only
- [ ] REST endpoints require JWT
- [ ] Thread creation is idempotent
- [ ] Message pagination works
- [ ] Heartbeat pings are sent
- [ ] Stale connections are cleaned

---

## 11. Test Commands

```bash
# Test WebSocket with wscat
npm install -g wscat

# Connect (use token from /api/auth)
wscat -c "ws://localhost:8000/ws?token=YOUR_JWT_TOKEN"

# In wscat, subscribe to thread:
{"type": "subscribe", "thread_id": "550e8400-e29b-41d4-a716-446655440000"}

# Send message:
{"type": "message", "thread_id": "550e8400-e29b-41d4-a716-446655440000", "ciphertext": "base64...", "iv": "base64..."}

# Test REST endpoints
curl -X POST http://localhost:8000/api/threads \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"id": "550e8400-e29b-41d4-a716-446655440000", "ciphertext": "...", "iv": "..."}'

curl http://localhost:8000/api/messages/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer YOUR_JWT"
```
