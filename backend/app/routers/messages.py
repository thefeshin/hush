"""
Message REST endpoints
All message content is encrypted - server only stores blobs
"""

import base64
from uuid import UUID
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query

from app.database import get_connection
from app.dependencies.auth import get_current_user, AuthenticatedUser
from app.security_limits import IV_BYTES, MAX_MESSAGE_CIPHERTEXT_BYTES
from app.schemas.message import MessageCreate, MessageResponse
from app.services.authorization import require_message_participant, require_thread_participant
from app.utils.payload_validation import decode_base64_field

router = APIRouter()


@router.post("/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(
    message: MessageCreate,
    conn=Depends(get_connection),
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Create a new message (encrypted blob)

    Note: For real-time, prefer WebSocket.
    This endpoint exists for:
    - Offline message queue sync
    - Fallback when WebSocket unavailable
    """
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

    await require_thread_participant(conn, message.thread_id, user.user_id)

    row = await conn.fetchrow("""
        INSERT INTO messages (thread_id, ciphertext, iv)
        VALUES ($1, $2, $3)
        RETURNING id, thread_id, ciphertext, iv, created_at
    """, message.thread_id, ciphertext_bytes, iv_bytes)

    return MessageResponse(
        id=row["id"],
        thread_id=row["thread_id"],
        ciphertext=base64.b64encode(row["ciphertext"]).decode('ascii'),
        iv=base64.b64encode(row["iv"]).decode('ascii'),
        created_at=row["created_at"]
    )


@router.get("/messages/{thread_id}", response_model=List[MessageResponse])
async def get_messages(
    thread_id: UUID,
    after: Optional[datetime] = Query(None, description="Get messages after this timestamp"),
    limit: int = Query(50, le=200, description="Maximum messages to return"),
    conn=Depends(get_connection),
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Get messages for a thread

    Pagination:
    - Use 'after' param with last message's created_at for cursor pagination
    - Default limit is 50, max is 200
    """
    await require_thread_participant(conn, thread_id, user.user_id)

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
            ciphertext=base64.b64encode(row["ciphertext"]).decode('ascii'),
            iv=base64.b64encode(row["iv"]).decode('ascii'),
            created_at=row["created_at"]
        )
        for row in rows
    ]


@router.get("/messages/{thread_id}/count")
async def get_message_count(
    thread_id: UUID,
    conn=Depends(get_connection),
    user: AuthenticatedUser = Depends(get_current_user)
):
    """Get total message count for a thread"""
    await require_thread_participant(conn, thread_id, user.user_id)

    count = await conn.fetchval("""
        SELECT COUNT(*) FROM messages WHERE thread_id = $1
    """, thread_id)

    return {"thread_id": str(thread_id), "count": count}


@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: UUID,
    conn=Depends(get_connection),
    user: AuthenticatedUser = Depends(get_current_user)
):
    """Delete a specific message"""
    await require_message_participant(conn, message_id, user.user_id)

    result = await conn.execute(
        "DELETE FROM messages WHERE id = $1",
        message_id
    )

    if result == "DELETE 0":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found"
        )

    return {"status": "deleted"}
