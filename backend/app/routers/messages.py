"""
Message REST endpoints (conversation-first).
"""

import base64
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.database import get_connection
from app.dependencies.auth import AuthenticatedUser, get_current_user
from app.schemas.message import MessageCreate, MessageResponse
from app.security_limits import IV_BYTES, MAX_MESSAGE_CIPHERTEXT_BYTES
from app.services.authorization import (
    is_conversation_participant,
    require_conversation_participant,
    require_message_participant,
)
from app.services.websocket import ws_manager
from app.utils.payload_validation import decode_base64_field

router = APIRouter()


async def ensure_direct_conversation(
    conn,
    conversation_id: UUID,
    sender_id: UUID,
    recipient_id: Optional[UUID],
) -> None:
    if await is_conversation_participant(conn, conversation_id, sender_id):
        return

    if not recipient_id:
        await require_conversation_participant(conn, conversation_id, sender_id)
        return

    async with conn.transaction():
        await conn.execute(
            "INSERT INTO conversations (id) VALUES ($1) ON CONFLICT DO NOTHING",
            conversation_id,
        )

        await conn.execute(
            """
            INSERT INTO conversation_participants (conversation_id, user_id)
            VALUES ($1, $2), ($1, $3)
            ON CONFLICT DO NOTHING
            """,
            conversation_id,
            sender_id,
            recipient_id,
        )

    await require_conversation_participant(conn, conversation_id, sender_id)


@router.post("/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(
    message: MessageCreate,
    conn=Depends(get_connection),
    user: AuthenticatedUser = Depends(get_current_user),
):
    ciphertext_bytes = decode_base64_field(
        message.ciphertext,
        field_name="ciphertext",
        max_bytes=MAX_MESSAGE_CIPHERTEXT_BYTES,
    )
    iv_bytes = decode_base64_field(
        message.iv,
        field_name="iv",
        max_bytes=IV_BYTES,
        exact_bytes=IV_BYTES,
    )

    await ensure_direct_conversation(
        conn,
        message.conversation_id,
        user.user_id,
        message.recipient_id,
    )

    row = await conn.fetchrow(
        """
        INSERT INTO messages (conversation_id, sender_id, ciphertext, iv, group_epoch)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, conversation_id, sender_id, group_epoch, ciphertext, iv, created_at
        """,
        message.conversation_id,
        user.user_id,
        ciphertext_bytes,
        iv_bytes,
        message.group_epoch,
    )

    broadcast_msg = {
        "type": "message",
        "id": str(row["id"]),
        "conversation_id": str(row["conversation_id"]),
        "sender_id": str(row["sender_id"]),
        "group_epoch": row["group_epoch"],
        "ciphertext": base64.b64encode(row["ciphertext"]).decode("ascii"),
        "iv": base64.b64encode(row["iv"]).decode("ascii"),
        "created_at": row["created_at"].isoformat(),
    }

    await ws_manager.broadcast_to_conversation(str(row["conversation_id"]), broadcast_msg)

    if message.recipient_id:
        recipient_user_id = str(message.recipient_id)
        await ws_manager.subscribe_user_connections_to_conversation(
            recipient_user_id,
            str(row["conversation_id"]),
        )
        await ws_manager.send_to_user(recipient_user_id, broadcast_msg)

    return MessageResponse(
        id=row["id"],
        conversation_id=row["conversation_id"],
        sender_id=row["sender_id"],
        group_epoch=row["group_epoch"],
        ciphertext=base64.b64encode(row["ciphertext"]).decode("ascii"),
        iv=base64.b64encode(row["iv"]).decode("ascii"),
        created_at=row["created_at"],
    )


@router.get("/messages/{conversation_id}", response_model=List[MessageResponse])
async def get_messages(
    conversation_id: UUID,
    after: Optional[datetime] = Query(None, description="Get messages after this timestamp"),
    limit: int = Query(50, ge=1, le=200, description="Maximum messages to return"),
    conn=Depends(get_connection),
    user: AuthenticatedUser = Depends(get_current_user),
):
    await require_conversation_participant(conn, conversation_id, user.user_id)

    if after:
        rows = await conn.fetch(
            """
            SELECT id, conversation_id, sender_id, group_epoch, ciphertext, iv, created_at
            FROM messages
            WHERE conversation_id = $1 AND created_at > $2
            ORDER BY created_at ASC
            LIMIT $3
            """,
            conversation_id,
            after,
            limit,
        )
    else:
        rows = await conn.fetch(
            """
            SELECT id, conversation_id, sender_id, group_epoch, ciphertext, iv, created_at
            FROM messages
            WHERE conversation_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            """,
            conversation_id,
            limit,
        )
        rows = list(reversed(rows))

    return [
        MessageResponse(
            id=row["id"],
            conversation_id=row["conversation_id"],
            sender_id=row["sender_id"],
            group_epoch=row["group_epoch"],
            ciphertext=base64.b64encode(row["ciphertext"]).decode("ascii"),
            iv=base64.b64encode(row["iv"]).decode("ascii"),
            created_at=row["created_at"],
        )
        for row in rows
    ]


@router.get("/messages/{conversation_id}/count")
async def get_message_count(
    conversation_id: UUID,
    conn=Depends(get_connection),
    user: AuthenticatedUser = Depends(get_current_user),
):
    await require_conversation_participant(conn, conversation_id, user.user_id)
    count = await conn.fetchval(
        "SELECT COUNT(*) FROM messages WHERE conversation_id = $1",
        conversation_id,
    )
    return {"conversation_id": str(conversation_id), "count": count}


@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: UUID,
    conn=Depends(get_connection),
    user: AuthenticatedUser = Depends(get_current_user),
):
    await require_message_participant(conn, message_id, user.user_id)
    result = await conn.execute("DELETE FROM messages WHERE id = $1", message_id)
    if result == "DELETE 0":
        return {"status": "not_found"}
    return {"status": "deleted"}
