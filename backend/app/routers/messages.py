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
from app.dependencies.auth import verify_token
from app.schemas.message import MessageCreate, MessageResponse

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
    # Validate base64 encoding
    try:
        ciphertext_bytes = base64.b64decode(message.ciphertext)
        iv_bytes = base64.b64decode(message.iv)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid base64 encoding"
        )

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
    _=Depends(verify_token)
):
    """
    Get messages for a thread

    Pagination:
    - Use 'after' param with last message's created_at for cursor pagination
    - Default limit is 50, max is 200
    """
    # Verify thread exists
    thread_exists = await conn.fetchval("""
        SELECT EXISTS(SELECT 1 FROM threads WHERE id = $1)
    """, thread_id)

    if not thread_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thread not found"
        )

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
    _=Depends(verify_token)
):
    """Get total message count for a thread"""
    count = await conn.fetchval("""
        SELECT COUNT(*) FROM messages WHERE thread_id = $1
    """, thread_id)

    return {"thread_id": str(thread_id), "count": count}


@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: UUID,
    conn=Depends(get_connection),
    _=Depends(verify_token)
):
    """Delete a specific message"""
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
