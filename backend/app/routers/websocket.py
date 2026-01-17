"""
WebSocket endpoint for real-time communication
All messages are encrypted blobs - server is a blind relay
"""

import base64
import logging
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.websocket import ws_manager
from app.dependencies.auth import verify_websocket_token, extract_ws_token
from app.database import get_pool

router = APIRouter()
logger = logging.getLogger("hush.websocket")


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
    - {"type": "ping"}

    Message types (server -> client):
    - {"type": "subscribed", "thread_id": "..."}
    - {"type": "unsubscribed", "thread_id": "..."}
    - {"type": "message", "id": "...", "thread_id": "...", "ciphertext": "...", "iv": "...", "created_at": "..."}
    - {"type": "error", "message": "..."}
    - {"type": "pong"}
    - {"type": "heartbeat"}
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
    logger.info(f"WebSocket connected. Total: {ws_manager.connection_count}")

    try:
        # Get database pool for message persistence
        pool = await get_pool()

        while True:
            # Receive message
            data = await websocket.receive_json()

            # Update activity timestamp
            await ws_manager.update_activity(websocket)

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
        logger.info("WebSocket disconnected normally")
    except Exception as e:
        # Log error but don't expose details
        logger.warning(f"WebSocket error: {type(e).__name__}")
    finally:
        await ws_manager.disconnect(websocket)
        logger.info(f"WebSocket cleaned up. Total: {ws_manager.connection_count}")


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

    # Validate base64 encoding
    try:
        ciphertext_bytes = base64.b64decode(ciphertext)
        iv_bytes = base64.b64decode(iv)
    except Exception:
        await ws_manager.send_personal(websocket, {
            "type": "error",
            "message": "Invalid base64 encoding"
        })
        return

    # Persist message to database
    try:
        async with pool.acquire() as conn:
            # Verify thread exists
            thread_exists = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM threads WHERE id = $1)",
                thread_uuid
            )

            if not thread_exists:
                await ws_manager.send_personal(websocket, {
                    "type": "error",
                    "message": "Thread not found"
                })
                return

            row = await conn.fetchrow("""
                INSERT INTO messages (thread_id, ciphertext, iv)
                VALUES ($1, $2, $3)
                RETURNING id, created_at
            """, thread_uuid, ciphertext_bytes, iv_bytes)

    except Exception as e:
        logger.error(f"Failed to persist message: {type(e).__name__}")
        await ws_manager.send_personal(websocket, {
            "type": "error",
            "message": "Failed to save message"
        })
        return

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
