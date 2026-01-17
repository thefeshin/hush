"""
Async database connection management using asyncpg
"""

import asyncpg
from typing import Optional, AsyncGenerator
from app.config import settings

# Global connection pool
_pool: Optional[asyncpg.Pool] = None


async def init_db():
    """Initialize database connection pool and schema"""
    global _pool

    _pool = await asyncpg.create_pool(
        settings.DATABASE_URL,
        min_size=5,
        max_size=20,
        command_timeout=60
    )

    # Initialize schema
    async with _pool.acquire() as conn:
        await _init_schema(conn)


async def _init_schema(conn: asyncpg.Connection):
    """Create tables if they don't exist"""
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS threads (
            id UUID PRIMARY KEY,
            ciphertext BYTEA NOT NULL,
            iv BYTEA NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)

    await conn.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            thread_id UUID NOT NULL,
            ciphertext BYTEA NOT NULL,
            iv BYTEA NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)

    await conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_messages_thread_id
            ON messages(thread_id)
    """)

    await conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_messages_created_at
            ON messages(thread_id, created_at)
    """)

    await conn.execute("""
        CREATE TABLE IF NOT EXISTS blocked_ips (
            ip_address INET PRIMARY KEY,
            blocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            expires_at TIMESTAMP WITH TIME ZONE,
            reason VARCHAR(50) NOT NULL DEFAULT 'auth_failure'
        )
    """)

    await conn.execute("""
        CREATE TABLE IF NOT EXISTS auth_failures (
            ip_address INET PRIMARY KEY,
            failure_count INTEGER NOT NULL DEFAULT 0,
            first_failure_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_failure_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)


async def close_db():
    """Close database connection pool"""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


async def get_pool() -> asyncpg.Pool:
    """Get database connection pool"""
    if _pool is None:
        raise RuntimeError("Database not initialized")
    return _pool


async def get_connection() -> AsyncGenerator[asyncpg.Connection, None]:
    """Dependency for getting a database connection"""
    pool = await get_pool()
    async with pool.acquire() as connection:
        yield connection
