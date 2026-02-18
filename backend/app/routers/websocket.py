"""
WebSocket endpoint for real-time communication
All messages are encrypted blobs - server is a blind relay
"""

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.services.websocket import ws_manager
from app.services.telemetry import increment_counter
from app.dependencies.auth import verify_websocket_token, extract_ws_token
from app.database import get_pool
from app.security_limits import (
    IV_BYTES,
    MAX_MESSAGE_CIPHERTEXT_BYTES,
    MAX_WS_MESSAGES_PER_WINDOW,
    MAX_WS_SUBSCRIPTIONS_PER_CONNECTION,
    WS_RATE_WINDOW_SECONDS,
)
from app.services.authorization import (
    is_conversation_participant,
    require_conversation_participant,
)
from app.utils.payload_validation import decode_base64_field

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
    5. Server broadcasts to conversation subscribers

    Message types (client -> server):
    - {"type": "subscribe", "conversation_id": "..."}
    - {"type": "unsubscribe", "conversation_id": "..."}
    - {"type": "subscribe_user"}
    - {"type": "message", "conversation_id": "...", "recipient_id": "...", "ciphertext": "...", "iv": "..."}
    - {"type": "ping"}

    Message types (server -> client):
    - {"type": "subscribed", "conversation_id": "..."}
    - {"type": "unsubscribed", "conversation_id": "..."}
    - {"type": "user_subscribed", "conversation_count": N}
    - {"type": "message", "id": "...", "conversation_id": "...", "ciphertext": "...", "iv": "...", "created_at": "..."}
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
    """Handle conversation subscription request"""
    conversation_id = data.get("conversation_id")

    if not conversation_id:
        await ws_manager.send_personal(websocket, {
            "type": "error",
            "message": "Missing conversation_id"
        })
        return

    # Validate UUID format
    try:
        conversation_uuid = UUID(conversation_id)
    except ValueError:
        await ws_manager.send_personal(websocket, {
            "type": "error",
            "message": "Invalid conversation_id format"
        })
        return

    already_subscribed = await ws_manager.is_subscribed_to_conversation(websocket, conversation_id)
    if not already_subscribed:
        current = await ws_manager.get_subscription_count(websocket)
        if current >= MAX_WS_SUBSCRIPTIONS_PER_CONNECTION:
            await ws_manager.send_personal(websocket, {
                "type": "error",
                "message": "subscription_limit_reached"
            })
            return

    try:
        async with pool.acquire() as conn:
            await require_conversation_participant(conn, conversation_uuid, websocket.state.user_id)
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

    await ws_manager.subscribe_to_conversation(websocket, conversation_id)

    await ws_manager.send_personal(websocket, {
        "type": "subscribed",
        "conversation_id": conversation_id
    })


async def handle_unsubscribe(websocket: WebSocket, data: dict):
    """Handle conversation unsubscription request"""
    conversation_id = data.get("conversation_id")

    if not conversation_id:
        return

    await ws_manager.unsubscribe_from_conversation(websocket, conversation_id)

    await ws_manager.send_personal(websocket, {
        "type": "unsubscribed",
        "conversation_id": conversation_id
    })


async def handle_message(websocket: WebSocket, data: dict, pool):
    """
    Handle incoming message (encrypted blob)
    1. Validate required fields
    2. Persist to database
    3. Broadcast to conversation subscribers
    """
    conversation_id = data.get("conversation_id")
    recipient_id = data.get("recipient_id")
    client_message_id = data.get("client_message_id")
    group_epoch = data.get("group_epoch")
    ciphertext = data.get("ciphertext")
    iv = data.get("iv")

    def build_error(code: str, message: str) -> dict:
        payload = {
            "type": "error",
            "code": code,
            "message": message,
        }
        if client_message_id:
            payload["client_message_id"] = str(client_message_id)
        return payload

    # Validate required fields
    if not all([conversation_id, ciphertext, iv]):
        await ws_manager.send_personal(websocket, build_error(
            "invalid_request",
            "Missing required fields: conversation_id, ciphertext, iv",
        ))
        return

    conversation_id = str(conversation_id)
    ciphertext = str(ciphertext)
    iv = str(iv)
    normalized_group_epoch = None
    if group_epoch is not None:
        try:
            normalized_group_epoch = int(group_epoch)
        except (TypeError, ValueError):
            await ws_manager.send_personal(websocket, build_error("invalid_group_epoch", "Invalid group_epoch"))
            return
        if normalized_group_epoch < 1:
            await ws_manager.send_personal(websocket, build_error("invalid_group_epoch", "Invalid group_epoch"))
            return

    allowed = await ws_manager.allow_incoming_message(
        websocket,
        max_messages=MAX_WS_MESSAGES_PER_WINDOW,
        window_seconds=WS_RATE_WINDOW_SECONDS,
    )
    if not allowed:
        await ws_manager.send_personal(websocket, build_error("rate_limited", "rate_limited"))
        return

    # Validate UUID format
    try:
        conversation_uuid = UUID(conversation_id)
    except ValueError:
        await ws_manager.send_personal(websocket, build_error("invalid_conversation_id", "Invalid conversation_id format"))
        return

    recipient_uuid = None
    if recipient_id:
        try:
            recipient_uuid = UUID(recipient_id)
        except ValueError:
            await ws_manager.send_personal(websocket, build_error("invalid_recipient", "Invalid recipient_id format"))
            return

    try:
        ciphertext_bytes = decode_base64_field(
            ciphertext,
            field_name="ciphertext",
            max_bytes=MAX_MESSAGE_CIPHERTEXT_BYTES,
        )
        iv_bytes = decode_base64_field(
            iv,
            field_name="iv",
            max_bytes=IV_BYTES,
            exact_bytes=IV_BYTES,
        )
    except HTTPException as exc:
        detail = str(exc.detail)
        code = "conversation_not_found" if "Conversation not found" in detail else "invalid_payload"
        await ws_manager.send_personal(websocket, build_error(code, detail))
        return

    # Persist message to database
    try:
        async with pool.acquire() as conn:
            if not await is_conversation_participant(conn, conversation_uuid, websocket.state.user_id):
                if not recipient_uuid:
                    await require_conversation_participant(conn, conversation_uuid, websocket.state.user_id)
                else:
                    async with conn.transaction():
                        await conn.execute(
                            "INSERT INTO conversations (id) VALUES ($1) ON CONFLICT DO NOTHING",
                            conversation_uuid,
                        )
                        await conn.execute(
                            """
                            INSERT INTO conversation_participants (conversation_id, user_id)
                            VALUES ($1, $2), ($1, $3)
                            ON CONFLICT DO NOTHING
                            """,
                            conversation_uuid,
                            websocket.state.user_id,
                            recipient_uuid,
                        )

            conversation_kind = await conn.fetchval(
                "SELECT kind FROM conversations WHERE id = $1",
                conversation_uuid,
            )
            if conversation_kind == "group":
                current_epoch = await conn.fetchval(
                    "SELECT key_epoch FROM groups WHERE id = $1",
                    conversation_uuid,
                )
                if current_epoch is None:
                    increment_counter("group_not_found_total")
                    logger.warning("group_not_found conversation_id=%s user_id=%s", conversation_id, websocket.state.user_id)
                    await ws_manager.send_personal(websocket, build_error("group_not_found", "Group not found"))
                    return
                if normalized_group_epoch is None:
                    normalized_group_epoch = int(current_epoch)
                elif int(current_epoch) != int(normalized_group_epoch):
                    increment_counter("stale_group_epoch_total")
                    logger.warning(
                        "stale_group_epoch conversation_id=%s user_id=%s expected=%s actual=%s",
                        conversation_id,
                        websocket.state.user_id,
                        current_epoch,
                        normalized_group_epoch,
                    )
                    await ws_manager.send_personal(websocket, build_error("stale_group_epoch", "stale_group_epoch"))
                    return

            row = await conn.fetchrow("""
                INSERT INTO messages (conversation_id, sender_id, ciphertext, iv, group_epoch)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, created_at, group_epoch
            """, conversation_uuid, websocket.state.user_id, ciphertext_bytes, iv_bytes, normalized_group_epoch)

    except HTTPException as exc:
        detail = str(exc.detail)
        code = "conversation_not_found" if "Conversation not found" in detail else "forbidden"
        await ws_manager.send_personal(websocket, build_error(code, detail))
        return
    except Exception as exc:
        logger.error(f"Failed to persist message: {type(exc).__name__}")
        await ws_manager.send_personal(websocket, build_error("message_persist_failed", "Failed to save message"))
        return

    # Ensure recipient sockets are subscribed before broadcast so first-message
    # delivery happens via the same single broadcast path as normal messages.
    if recipient_uuid:
        recipient_user_id = str(recipient_uuid)
        await ws_manager.subscribe_user_connections_to_conversation(recipient_user_id, conversation_id)

    # Prepare broadcast message (include sender_id for auto-discovery)
    broadcast_msg = {
        "type": "message",
        "id": str(row["id"]),
        "conversation_id": conversation_id,
        "sender_id": str(websocket.state.user_id),  # Sender's user ID (plaintext)
        "client_message_id": str(client_message_id) if client_message_id else None,
        "group_epoch": row["group_epoch"],
        "ciphertext": ciphertext,
        "iv": iv,
        "created_at": row["created_at"].isoformat()
    }

    # Broadcast to all subscribers of this conversation
    await ws_manager.broadcast_to_conversation(conversation_id, broadcast_msg)

    # Explicit sender ACK so client can resolve quickly without depending on
    # subscription timing for conversation echoes.
    if client_message_id:
        await ws_manager.send_personal(websocket, {
            "type": "message_sent",
            "id": str(row["id"]),
            "conversation_id": conversation_id,
            "client_message_id": str(client_message_id),
            "created_at": row["created_at"].isoformat(),
        })

    # Recipient first-message delivery is handled by the broadcast above after
    # recipient socket auto-subscription, avoiding duplicate deliveries.


async def handle_subscribe_user(websocket: WebSocket, pool):
    """
    Subscribe the connection to ALL conversations involving this user.

    This enables users to automatically receive messages from unknown contacts.
    The server queries conversation_participants metadata to find all
    conversations where the user is a participant.
    """
    user_id = websocket.state.user_id

    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT conversation_id
                FROM conversation_participants
                WHERE user_id = $1
            """, user_id)

        available_slots = MAX_WS_SUBSCRIPTIONS_PER_CONNECTION - await ws_manager.get_subscription_count(websocket)
        if available_slots <= 0:
            await ws_manager.send_personal(websocket, {
                "type": "error",
                "message": "subscription_limit_reached"
            })
            return

        subscribed_count = 0
        # Subscribe to discovered conversations up to per-connection cap.
        for row in rows:
            if subscribed_count >= available_slots:
                break
            conversation_id = str(row["conversation_id"])
            if await ws_manager.is_subscribed_to_conversation(websocket, conversation_id):
                continue
            await ws_manager.subscribe_to_conversation(websocket, conversation_id)
            subscribed_count += 1

        await ws_manager.send_personal(websocket, {
            "type": "user_subscribed",
            "conversation_count": subscribed_count
        })

        if subscribed_count < len(rows):
            await ws_manager.send_personal(websocket, {
                "type": "error",
                "message": "subscription_limit_reached"
            })

        logger.info(f"User {str(user_id)} subscribed to {subscribed_count} conversations")

    except Exception as exc:
        logger.error(f"Failed to subscribe user: {type(exc).__name__}")
        await ws_manager.send_personal(websocket, {
            "type": "error",
            "message": "Failed to subscribe to conversations"
        })
