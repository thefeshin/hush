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
        SELECT conversation_id
        FROM conversation_participants
        WHERE user_id = $1
        ORDER BY created_at DESC
        """,
        user.user_id,
    )

    return {"conversation_ids": [str(row["conversation_id"]) for row in rows]}


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
