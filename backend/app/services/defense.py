"""
Defense system implementation
Handles IP blocking, database wiping, and panic mode
"""

import sys
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import asyncpg

from app.config import settings
from app.logging_config import (
    log_auth_failure,
    log_ip_blocked,
    log_db_wipe,
    log_shutdown
)


class DefenseService:
    """
    Implements the defense system based on deployment-time policy

    Failure modes:
    - ip_temp: Temporary IP block for configured duration
    - ip_perm: Permanent IP block
    - db_wipe: Wipe all data from database
    - db_wipe_shutdown: Wipe database and terminate process

    Panic mode: Any single auth failure triggers immediate wipe + shutdown
    """

    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def check_ip_blocked(self, ip: str) -> Dict[str, Any]:
        """
        Check if an IP address is blocked
        Returns: {"blocked": bool, "expires_at": Optional[str], "permanent": Optional[bool]}
        """
        row = await self.conn.fetchrow("""
            SELECT blocked_at, expires_at, reason
            FROM blocked_ips
            WHERE ip_address = $1
        """, ip)

        if row is None:
            return {"blocked": False}

        expires_at = row["expires_at"]

        # Permanent block (no expiry)
        if expires_at is None:
            return {"blocked": True, "permanent": True}

        # Check if temporary block has expired
        if expires_at > datetime.now(timezone.utc):
            return {
                "blocked": True,
                "expires_at": expires_at.isoformat(),
                "permanent": False
            }

        # Block expired - remove it
        await self.conn.execute("""
            DELETE FROM blocked_ips WHERE ip_address = $1
        """, ip)

        return {"blocked": False}

    async def get_failure_count(self, ip: str) -> int:
        """Get current failure count for an IP"""
        row = await self.conn.fetchrow("""
            SELECT failure_count
            FROM auth_failures
            WHERE ip_address = $1
        """, ip)

        return row["failure_count"] if row else 0

    async def record_failure(self, ip: str) -> int:
        """
        Record an authentication failure
        Returns remaining attempts before policy triggers
        """
        # Check for panic mode first
        if settings.PANIC_MODE:
            log_auth_failure(ip, 0)
            await self._execute_panic_mode()
            return 0  # Won't reach here

        # Upsert failure record
        await self.conn.execute("""
            INSERT INTO auth_failures (ip_address, failure_count, first_failure_at, last_failure_at)
            VALUES ($1, 1, NOW(), NOW())
            ON CONFLICT (ip_address) DO UPDATE SET
                failure_count = auth_failures.failure_count + 1,
                last_failure_at = NOW()
        """, ip)

        # Get current count
        current = await self.get_failure_count(ip)
        remaining = settings.MAX_AUTH_FAILURES - current

        log_auth_failure(ip, remaining)

        return remaining

    async def reset_failures(self, ip: str):
        """Reset failure count on successful auth"""
        await self.conn.execute("""
            DELETE FROM auth_failures WHERE ip_address = $1
        """, ip)

    async def trigger_policy(self, ip: str):
        """
        Trigger the configured failure policy
        Called when failure threshold is exceeded
        """
        mode = settings.FAILURE_MODE

        if mode == "ip_temp":
            await self._block_ip_temporary(ip)
        elif mode == "ip_perm":
            await self._block_ip_permanent(ip)
        elif mode == "db_wipe":
            await self._wipe_database()
        elif mode == "db_wipe_shutdown":
            await self._wipe_database()
            self._shutdown()

    async def _block_ip_temporary(self, ip: str):
        """Block IP temporarily"""
        expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=settings.IP_BLOCK_MINUTES
        )

        await self.conn.execute("""
            INSERT INTO blocked_ips (ip_address, expires_at, reason)
            VALUES ($1, $2, 'auth_failure_threshold')
            ON CONFLICT (ip_address) DO UPDATE SET
                expires_at = $2,
                blocked_at = NOW()
        """, ip, expires_at)

        # Clear failure count
        await self.reset_failures(ip)

        log_ip_blocked(ip, permanent=False)

    async def _block_ip_permanent(self, ip: str):
        """Block IP permanently"""
        await self.conn.execute("""
            INSERT INTO blocked_ips (ip_address, expires_at, reason)
            VALUES ($1, NULL, 'auth_failure_threshold')
            ON CONFLICT (ip_address) DO UPDATE SET
                expires_at = NULL,
                blocked_at = NOW()
        """, ip)

        # Clear failure count
        await self.reset_failures(ip)

        log_ip_blocked(ip, permanent=True)

    async def _wipe_database(self):
        """
        Wipe all data from the database
        This is the nuclear option
        """
        log_db_wipe()

        # Drop all user data
        await self.conn.execute("TRUNCATE TABLE messages CASCADE")
        await self.conn.execute("TRUNCATE TABLE threads CASCADE")

        # Optionally clear security tables too
        await self.conn.execute("TRUNCATE TABLE blocked_ips")
        await self.conn.execute("TRUNCATE TABLE auth_failures")

    async def _execute_panic_mode(self):
        """
        PANIC MODE: Immediate wipe and shutdown
        Any auth failure triggers this
        """
        await self._wipe_database()
        self._shutdown()

    def _shutdown(self):
        """
        Immediately terminate the process
        Used after critical security events
        """
        log_shutdown()

        # Force exit - no graceful shutdown
        sys.exit(1)


async def cleanup_expired_blocks(conn: asyncpg.Connection):
    """
    Utility function to clean up expired IP blocks
    Can be called periodically or on startup
    """
    await conn.execute("""
        DELETE FROM blocked_ips
        WHERE expires_at IS NOT NULL AND expires_at < NOW()
    """)
