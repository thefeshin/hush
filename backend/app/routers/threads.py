"""
Thread REST endpoints
All thread data is encrypted - server only stores blobs
"""

import base64
from uuid import UUID
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_connection
from app.dependencies.auth import get_current_user, AuthenticatedUser
from app.schemas.thread import ThreadCreate, ThreadResponse, ThreadQuery
from app.services.authorization import require_thread_participant

router = APIRouter()


@router.post(
    "/threads", response_model=ThreadResponse, status_code=status.HTTP_201_CREATED
)
async def create_thread(
    thread: ThreadCreate,
    conn=Depends(get_connection),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Create a new thread with encrypted metadata

    The client generates the thread_id as:
    thread_id = SHA-256(sort(uuid_a, uuid_b))

    This ensures:
    - Same thread_id for both participants
    - Deterministic - no duplicates
    - Server cannot read encrypted content

    Participant UUIDs are stored in plaintext (in thread_participants table)
    to enable thread discovery without decrypting metadata.
    """
    # Require deterministic participant ordering and membership.
    participants = [str(thread.participant_1), str(thread.participant_2)]
    if participants[0] == participants[1]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="participant_1 and participant_2 must be different",
        )
    if participants != sorted(participants):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Participants must be sorted lexicographically",
        )
    if str(user.user_id) not in participants:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: user must be one of the thread participants",
        )

    # Validate base64 encoding
    try:
        ciphertext_bytes = base64.b64decode(thread.ciphertext)
        iv_bytes = base64.b64decode(thread.iv)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid base64 encoding"
        )

    # Check if thread already exists
    existing = await conn.fetchrow(
        """
        SELECT id, ciphertext, iv, created_at
        FROM threads WHERE id = $1
    """,
        thread.id,
    )

    if existing:
        participant_row = await conn.fetchrow(
            """
            SELECT participant_1, participant_2
            FROM thread_participants
            WHERE thread_id = $1
            """,
            thread.id,
        )
        if not participant_row:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Thread metadata missing for existing thread",
            )

        stored_participants = sorted(
            [str(participant_row["participant_1"]), str(participant_row["participant_2"])]
        )
        if stored_participants != participants:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Thread participants mismatch for existing thread",
            )

        return ThreadResponse(
            id=existing["id"],
            ciphertext=base64.b64encode(existing["ciphertext"]).decode("ascii"),
            iv=base64.b64encode(existing["iv"]).decode("ascii"),
            created_at=existing["created_at"],
        )

    # Create new thread with participant record
    async with conn.transaction():
        row = await conn.fetchrow(
            """
            INSERT INTO threads (id, ciphertext, iv)
            VALUES ($1, $2, $3)
            RETURNING id, ciphertext, iv, created_at
        """,
            thread.id,
            ciphertext_bytes,
            iv_bytes,
        )

        await conn.execute(
            """
            INSERT INTO thread_participants (thread_id, participant_1, participant_2)
            VALUES ($1, $2, $3)
        """,
            thread.id,
            thread.participant_1,
            thread.participant_2,
        )

    return ThreadResponse(
        id=row["id"],
        ciphertext=base64.b64encode(row["ciphertext"]).decode("ascii"),
        iv=base64.b64encode(row["iv"]).decode("ascii"),
        created_at=row["created_at"],
    )


@router.post("/threads/query", response_model=List[ThreadResponse])
async def query_threads(
    query: ThreadQuery,
    conn=Depends(get_connection),
    user: AuthenticatedUser = Depends(get_current_user),
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

    rows = await conn.fetch(
        """
        SELECT t.id, t.ciphertext, t.iv, t.created_at
        FROM threads t
        JOIN thread_participants tp ON tp.thread_id = t.id
        WHERE t.id = ANY($1)
          AND (tp.participant_1 = $2 OR tp.participant_2 = $2)
        ORDER BY t.created_at DESC
    """,
        query.thread_ids,
        user.user_id,
    )

    return [
        ThreadResponse(
            id=row["id"],
            ciphertext=base64.b64encode(row["ciphertext"]).decode("ascii"),
            iv=base64.b64encode(row["iv"]).decode("ascii"),
            created_at=row["created_at"],
        )
        for row in rows
    ]


@router.get("/threads/discover")
async def discover_threads(
    user: AuthenticatedUser = Depends(get_current_user), conn=Depends(get_connection)
):
    """
    Discover all threads where the authenticated user is a participant.

    Returns thread_ids only - client must handle decryption/loading.
    This allows users to discover new threads from unknown contacts.
    """
    rows = await conn.fetch(
        """
        SELECT thread_id
        FROM thread_participants
        WHERE participant_1 = $1 OR participant_2 = $2
        ORDER BY created_at DESC
    """,
        user.user_id,
        user.user_id,
    )

    return {"thread_ids": [str(row["thread_id"]) for row in rows]}


@router.get("/threads/{thread_id}", response_model=ThreadResponse)
async def get_thread(
    thread_id: UUID,
    conn=Depends(get_connection),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Get a specific thread by ID"""
    await require_thread_participant(conn, thread_id, user.user_id)

    row = await conn.fetchrow(
        """
        SELECT id, ciphertext, iv, created_at
        FROM threads WHERE id = $1
    """,
        thread_id,
    )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found"
        )

    return ThreadResponse(
        id=row["id"],
        ciphertext=base64.b64encode(row["ciphertext"]).decode("ascii"),
        iv=base64.b64encode(row["iv"]).decode("ascii"),
        created_at=row["created_at"],
    )


@router.delete("/threads/{thread_id}")
async def delete_thread(
    thread_id: UUID,
    conn=Depends(get_connection),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Delete a thread and all its messages"""
    await require_thread_participant(conn, thread_id, user.user_id)

    async with conn.transaction():
        # Delete messages first
        await conn.execute("DELETE FROM messages WHERE thread_id = $1", thread_id)
        # Delete thread
        await conn.execute("DELETE FROM threads WHERE id = $1", thread_id)

    return {"status": "deleted"}
