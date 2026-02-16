"""
Conversation REST endpoints.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends

from app.database import get_connection
from app.dependencies.auth import AuthenticatedUser, get_current_user
from app.schemas.conversation import ConversationQuery, ConversationResponse
from app.services.authorization import require_conversation_participant

router = APIRouter()


@router.post("/conversations/query", response_model=List[ConversationResponse])
async def query_conversations(
    query: ConversationQuery,
    conn=Depends(get_connection),
    user: AuthenticatedUser = Depends(get_current_user),
):
    if not query.conversation_ids:
        return []

    rows = await conn.fetch(
        """
        SELECT c.id, c.created_at
        FROM conversations c
        JOIN conversation_participants cp ON cp.conversation_id = c.id
        WHERE c.id = ANY($1) AND cp.user_id = $2
        ORDER BY c.created_at DESC
        """,
        query.conversation_ids,
        user.user_id,
    )

    return [ConversationResponse(id=row["id"], created_at=row["created_at"]) for row in rows]


@router.get("/conversations/discover")
async def discover_conversations(
    user: AuthenticatedUser = Depends(get_current_user),
    conn=Depends(get_connection),
):
    rows = await conn.fetch(
        """
        WITH ranked AS (
            SELECT
                cp.conversation_id,
                other.user_id AS other_user_id,
                other_user.username AS other_username,
                cp.created_at AS last_seen_at,
                ROW_NUMBER() OVER (
                    PARTITION BY cp.conversation_id
                    ORDER BY cp.created_at DESC, other.user_id ASC
                ) AS row_rank
            FROM conversation_participants cp
            JOIN conversation_participants other
              ON other.conversation_id = cp.conversation_id
             AND other.user_id <> cp.user_id
            JOIN users other_user
              ON other_user.id = other.user_id
            WHERE cp.user_id = $1
        )
        SELECT conversation_id, other_user_id, other_username, last_seen_at
        FROM ranked
        WHERE row_rank = 1
        ORDER BY last_seen_at DESC, conversation_id ASC
        """,
        user.user_id,
    )

    conversations = [
        {
            "conversation_id": str(row["conversation_id"]),
            "other_user_id": str(row["other_user_id"]),
            "other_username": row["other_username"],
        }
        for row in rows
    ]

    # Keep legacy shape for backward compatibility.
    return {
        "conversations": conversations,
        "conversation_ids": [item["conversation_id"] for item in conversations],
    }


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: UUID,
    conn=Depends(get_connection),
    user: AuthenticatedUser = Depends(get_current_user),
):
    await require_conversation_participant(conn, conversation_id, user.user_id)
    row = await conn.fetchrow(
        "SELECT id, created_at FROM conversations WHERE id = $1",
        conversation_id,
    )
    return ConversationResponse(id=row["id"], created_at=row["created_at"])


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: UUID,
    conn=Depends(get_connection),
    user: AuthenticatedUser = Depends(get_current_user),
):
    await require_conversation_participant(conn, conversation_id, user.user_id)
    await conn.execute("DELETE FROM conversations WHERE id = $1", conversation_id)
    return {"status": "deleted"}
