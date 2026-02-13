"""
Shared authorization helpers for conversation/message access control.
"""

from uuid import UUID

from fastapi import HTTPException, status


async def is_conversation_participant(conn, conversation_id: UUID, user_id: UUID) -> bool:
    return await conn.fetchval(
        """
        SELECT EXISTS(
            SELECT 1
            FROM conversation_participants
            WHERE conversation_id = $1 AND user_id = $2
        )
        """,
        conversation_id,
        user_id,
    )


async def require_conversation_participant(conn, conversation_id: UUID, user_id: UUID) -> None:
    conversation_exists = await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM conversations WHERE id = $1)",
        conversation_id,
    )
    if not conversation_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    if not await is_conversation_participant(conn, conversation_id, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: not a participant in this conversation",
        )


async def require_message_participant(conn, message_id: UUID, user_id: UUID) -> UUID:
    conversation_id = await conn.fetchval(
        "SELECT conversation_id FROM messages WHERE id = $1",
        message_id,
    )
    if not conversation_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )

    await require_conversation_participant(conn, conversation_id, user_id)
    return conversation_id
