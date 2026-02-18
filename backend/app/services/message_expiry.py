"""Background worker for seen-based message expiration."""

import asyncio
import logging

from app.database import get_pool
from app.services.telemetry import increment_counter
from app.services.websocket import ws_manager

logger = logging.getLogger("hush.message_expiry")


async def process_due_message_expiry() -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        recipient_rows = await conn.fetch(
            """
            WITH due AS (
                UPDATE message_user_state mus
                SET deleted_at = NOW()
                FROM messages m
                WHERE mus.message_id = m.id
                  AND mus.is_sender = FALSE
                  AND mus.deleted_at IS NULL
                  AND mus.delete_after_seen_at IS NOT NULL
                  AND mus.delete_after_seen_at <= NOW()
                RETURNING mus.message_id, mus.user_id, m.conversation_id
            )
            SELECT * FROM due
            """
        )

        for row in recipient_rows:
            await ws_manager.send_to_user(
                str(row["user_id"]),
                {
                    "type": "message_deleted_for_user",
                    "message_id": str(row["message_id"]),
                    "conversation_id": str(row["conversation_id"]),
                    "reason": "expired_after_seen",
                },
            )
        if recipient_rows:
            increment_counter("messages_expired_recipient_total", len(recipient_rows))

        sender_rows = await conn.fetch(
            """
            WITH due AS (
                UPDATE messages m
                SET sender_deleted_at = NOW()
                WHERE m.sender_deleted_at IS NULL
                  AND m.sender_delete_after_seen_at IS NOT NULL
                  AND m.sender_delete_after_seen_at <= NOW()
                RETURNING m.id, m.sender_id, m.conversation_id
            ), sender_state AS (
                UPDATE message_user_state mus
                SET deleted_at = NOW()
                FROM due
                WHERE mus.message_id = due.id
                  AND mus.is_sender = TRUE
                  AND mus.deleted_at IS NULL
                RETURNING due.id AS message_id, due.sender_id, due.conversation_id
            )
            SELECT * FROM sender_state
            """
        )

        for row in sender_rows:
            await ws_manager.send_to_user(
                str(row["sender_id"]),
                {
                    "type": "message_deleted_for_sender",
                    "message_id": str(row["message_id"]),
                    "conversation_id": str(row["conversation_id"]),
                    "reason": "all_seen_then_expired",
                },
            )
        if sender_rows:
            increment_counter("messages_expired_sender_total", len(sender_rows))

        deleted = await conn.execute(
            """
            DELETE FROM messages m
            WHERE m.sender_deleted_at IS NOT NULL
              AND NOT EXISTS (
                    SELECT 1
                    FROM message_user_state mus
                    WHERE mus.message_id = m.id
                      AND mus.deleted_at IS NULL
              )
            """
        )
        if deleted and deleted.startswith("DELETE "):
            try:
                count = int(deleted.split()[1])
            except Exception:
                count = 0
            if count:
                increment_counter("messages_deleted_hard_total", count)


async def expiry_worker(interval_seconds: int = 2) -> None:
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await process_due_message_expiry()
        except Exception as exc:
            logger.error("message_expiry_worker_failed type=%s", type(exc).__name__)
            increment_counter("message_expiry_worker_failures_total")


async def start_message_expiry_task() -> None:
    asyncio.create_task(expiry_worker())
    logger.info("Message expiry task started")
