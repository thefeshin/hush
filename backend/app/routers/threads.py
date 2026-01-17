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
    # Validate base64 encoding
    try:
        ciphertext_bytes = base64.b64decode(thread.ciphertext)
        iv_bytes = base64.b64decode(thread.iv)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid base64 encoding"
        )

    # Check if thread already exists
    existing = await conn.fetchrow("""
        SELECT id, ciphertext, iv, created_at
        FROM threads WHERE id = $1
    """, thread.id)

    if existing:
        # Thread exists - just return it (idempotent)
        return ThreadResponse(
            id=existing["id"],
            ciphertext=base64.b64encode(existing["ciphertext"]).decode('ascii'),
            iv=base64.b64encode(existing["iv"]).decode('ascii'),
            created_at=existing["created_at"]
        )

    # Create new thread
    row = await conn.fetchrow("""
        INSERT INTO threads (id, ciphertext, iv)
        VALUES ($1, $2, $3)
        RETURNING id, ciphertext, iv, created_at
    """, thread.id, ciphertext_bytes, iv_bytes)

    return ThreadResponse(
        id=row["id"],
        ciphertext=base64.b64encode(row["ciphertext"]).decode('ascii'),
        iv=base64.b64encode(row["iv"]).decode('ascii'),
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
            ciphertext=base64.b64encode(row["ciphertext"]).decode('ascii'),
            iv=base64.b64encode(row["iv"]).decode('ascii'),
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
        ciphertext=base64.b64encode(row["ciphertext"]).decode('ascii'),
        iv=base64.b64encode(row["iv"]).decode('ascii'),
        created_at=row["created_at"]
    )


@router.delete("/threads/{thread_id}")
async def delete_thread(
    thread_id: UUID,
    conn=Depends(get_connection),
    _=Depends(verify_token)
):
    """Delete a thread and all its messages"""
    async with conn.transaction():
        # Delete messages first
        await conn.execute(
            "DELETE FROM messages WHERE thread_id = $1",
            thread_id
        )
        # Delete thread
        result = await conn.execute(
            "DELETE FROM threads WHERE id = $1",
            thread_id
        )

    if result == "DELETE 0":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thread not found"
        )

    return {"status": "deleted"}
