"""
WebSocket endpoint for real-time communication
All messages are encrypted blobs - server is a blind relay
"""

import base64
import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.services.websocket import ws_manager
from app.dependencies.auth import verify_websocket_token, extract_ws_token
from app.database import get_pool
from app.services.authorization import require_thread_participant

router = APIRouter()
logger = logging.getLogger("hush.websocket")


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Main WebSocket endpoint

    Connection flow:
    1. Client connects with access_token cookie
    2. Server validates JWT
    3. Client sends subscribe/unsubscribe messages
    4. Client sends messages (encrypted blobs)
    5. Server broadcasts to thread subscribers

    Message types (client -> server):
    - {"type": "subscribe", "thread_id": "..."}
    - {"type": "unsubscribe", "thread_id": "..."}
    - {"type": "subscribe_user"}
    - {"type": "message", "thread_id": "...", "ciphertext": "...", "iv": "..."}
    - {"type": "ping"}

    Message types (server -> client):
    - {"type": "subscribed", "thread_id": "..."}
    - {"type": "unsubscribed", "thread_id": "..."}
    - {"type": "user_subscribed", "thread_count": N}
    - {"type": "message", "id": "...", "thread_id": "...", "ciphertext": "...", "iv": "...", "created_at": "..."}
    - {"type": "error", "message": "..."}
    - {"type": "pong"}
    - {"type": "heartbeat"}
    """

    # Extract and verify token from cookie
    token = extract_ws_token(websocket)
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    user = await verify_websocket_token(token)
    if not user:
        await websocket.close(code=4001, reason="Invalid token")
        return

    # user.user_id and user.username are available if needed
    # Store user_id in connection state for use in handlers
    websocket.state.user_id = user.user_id
    websocket.state.username = user.username

    # Accept connection
    await ws_manager.connect(websocket)
    logger.info(f"WebSocket connected for user {user.username}. Total: {ws_manager.connection_count}")

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
                await handle_subscribe(websocket, data, pool)

            elif msg_type == "unsubscribe":
                await handle_unsubscribe(websocket, data)

            elif msg_type == "subscribe_user":
                await handle_subscribe_user(websocket, pool)

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
    except Exception:
        # Log error but don't expose details
        logger.warning("WebSocket error")
    finally:
        await ws_manager.disconnect(websocket)
        logger.info(f"WebSocket cleaned up. Total: {ws_manager.connection_count}")


async def handle_subscribe(websocket: WebSocket, data: dict, pool):
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
        thread_uuid = UUID(thread_id)
    except ValueError:
        await ws_manager.send_personal(websocket, {
            "type": "error",
            "message": "Invalid thread_id format"
        })
        return

    try:
        async with pool.acquire() as conn:
            await require_thread_participant(conn, thread_uuid, websocket.state.user_id)
    except HTTPException as exc:
        await ws_manager.send_personal(websocket, {
            "type": "error",
            "message": str(exc.detail)
        })
        return
    except Exception as exc:
        logger.error(f"Failed subscribe auth check: {type(exc).__name__}")
        await ws_manager.send_personal(websocket, {
            "type": "error",
            "message": "Failed to subscribe"
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
            await require_thread_participant(conn, thread_uuid, websocket.state.user_id)

            row = await conn.fetchrow("""
                INSERT INTO messages (thread_id, ciphertext, iv)
                VALUES ($1, $2, $3)
                RETURNING id, created_at
            """, thread_uuid, ciphertext_bytes, iv_bytes)

    except HTTPException as exc:
        await ws_manager.send_personal(websocket, {
            "type": "error",
            "message": str(exc.detail)
        })
        return
    except Exception as exc:
        logger.error(f"Failed to persist message: {type(exc).__name__}")
        await ws_manager.send_personal(websocket, {
            "type": "error",
            "message": "Failed to save message"
        })
        return

    # Prepare broadcast message (include sender_id for auto-discovery)
    broadcast_msg = {
        "type": "message",
        "id": str(row["id"]),
        "thread_id": thread_id,
        "sender_id": str(websocket.state.user_id),  # Sender's user ID (plaintext)
        "ciphertext": ciphertext,
        "iv": iv,
        "created_at": row["created_at"].isoformat()
    }

    # Broadcast to all subscribers of this thread
    await ws_manager.broadcast_to_thread(thread_id, broadcast_msg)


async def handle_subscribe_user(websocket: WebSocket, pool):
    """
    Subscribe the connection to ALL threads involving this user.

    This enables users to automatically receive messages from unknown contacts.
    The server queries thread_participants table (plaintext metadata) to find
    all threads where the user is a participant.
    """
    user_id = websocket.state.user_id

    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT thread_id
                FROM thread_participants
                WHERE participant_1 = $1 OR participant_2 = $2
            """, user_id, user_id)

        # Subscribe to all discovered threads
        for row in rows:
            thread_id = str(row["thread_id"])
            await ws_manager.subscribe_to_thread(websocket, thread_id)

        await ws_manager.send_personal(websocket, {
            "type": "user_subscribed",
            "thread_count": len(rows)
        })

        logger.info(f"User {str(user_id)} subscribed to {len(rows)} threads")

    except Exception as exc:
        logger.error(f"Failed to subscribe user: {type(exc).__name__}")
        await ws_manager.send_personal(websocket, {
            "type": "error",
            "message": "Failed to subscribe to threads"
        })
