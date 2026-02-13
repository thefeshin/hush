"""
Shared authorization helpers for thread/message access control.
"""

from uuid import UUID

from fastapi import HTTPException, status


async def is_thread_participant(conn, thread_id: UUID, user_id: UUID) -> bool:
    """Return True if user participates in thread."""
    return await conn.fetchval(
        """
        SELECT EXISTS(
            SELECT 1
            FROM thread_participants
            WHERE thread_id = $1
              AND (participant_1 = $2 OR participant_2 = $2)
        )
        """,
        thread_id,
        user_id,
    )


async def require_thread_participant(conn, thread_id: UUID, user_id: UUID) -> None:
    """
    Require that the thread exists and the user is one of its participants.

    Raises:
      404 if thread does not exist
      403 if user is not a participant
    """
    thread_exists = await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM threads WHERE id = $1)",
        thread_id,
    )
    if not thread_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thread not found",
        )

    if not await is_thread_participant(conn, thread_id, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: not a participant in this thread",
        )


async def require_message_participant(conn, message_id: UUID, user_id: UUID) -> UUID:
    """
    Require that message exists and user can access its thread.

    Returns:
      message thread_id when authorized
    """
    thread_id = await conn.fetchval(
        "SELECT thread_id FROM messages WHERE id = $1",
        message_id,
    )
    if not thread_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )

    await require_thread_participant(conn, thread_id, user_id)
    return thread_id
