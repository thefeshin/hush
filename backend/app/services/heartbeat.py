"""
WebSocket heartbeat to detect dead connections
"""

import asyncio
import logging
from starlette.websockets import WebSocketState

from app.services.websocket import ws_manager

logger = logging.getLogger("hush.heartbeat")


async def send_heartbeats(interval_seconds: int = 30):
    """
    Send periodic pings to all connections
    Dead connections are cleaned up
    """
    while True:
        await asyncio.sleep(interval_seconds)

        try:
            async with ws_manager._lock:
                connections = list(ws_manager._connections.keys())

            if not connections:
                continue

            dead = []
            for ws in connections:
                try:
                    if ws.client_state == WebSocketState.CONNECTED:
                        await ws.send_json({"type": "heartbeat"})
                    else:
                        dead.append(ws)
                except Exception:
                    dead.append(ws)

            if dead:
                logger.info(f"Removing {len(dead)} dead connections")

            for ws in dead:
                await ws_manager.disconnect(ws)

        except Exception as e:
            logger.error(f"Heartbeat task error: {type(e).__name__}")


async def start_heartbeat_task():
    """Start the heartbeat background task"""
    asyncio.create_task(send_heartbeats())
    logger.info("Heartbeat task started")
