"""
Background task for cleaning up stale connections
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.services.websocket import ws_manager

logger = logging.getLogger("hush.cleanup")


async def cleanup_stale_connections(max_idle_hours: int = 24):
    """
    Periodically clean up connections that have been idle too long
    Runs as a background task
    """
    while True:
        await asyncio.sleep(3600)  # Run every hour

        try:
            cutoff = datetime.now(timezone.utc) - timedelta(hours=max_idle_hours)

            async with ws_manager._lock:
                stale = [
                    ws for ws, conn in ws_manager._connections.items()
                    if conn.last_activity < cutoff
                ]

            if stale:
                logger.info(f"Cleaning up {len(stale)} stale connections")

            for ws in stale:
                try:
                    await ws.close(code=4002, reason="Connection timeout")
                except Exception:
                    pass
                await ws_manager.disconnect(ws)

        except Exception as e:
            logger.error(f"Cleanup task error: {type(e).__name__}")


async def start_cleanup_task():
    """Start the cleanup background task"""
    asyncio.create_task(cleanup_stale_connections())
    logger.info("Connection cleanup task started")
