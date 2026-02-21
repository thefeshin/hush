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
        settings.DATABASE_URL, min_size=5, max_size=20, command_timeout=60
    )

    # Initialize schema
    async with _pool.acquire() as conn:
        await _init_schema(conn)


async def _init_schema(conn: asyncpg.Connection):
    """Create conversation-first schema from scratch."""
    await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS conversations (
            id UUID PRIMARY KEY,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """
    )

    await conn.execute(
        """
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'direct'
    """
    )

    await conn.execute(
        """
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS group_name VARCHAR(120)
    """
    )

    await conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_conversations_kind
            ON conversations(kind)
    """
    )

    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS blocked_ips (
            ip_address INET PRIMARY KEY,
            blocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            expires_at TIMESTAMP WITH TIME ZONE,
            reason VARCHAR(50) NOT NULL DEFAULT 'auth_failure'
        )
    """
    )

    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS auth_failures (
            ip_address INET PRIMARY KEY,
            failure_count INTEGER NOT NULL DEFAULT 0,
            first_failure_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_failure_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """
    )

    # Users table for multi-user authentication
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username VARCHAR(50) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_login TIMESTAMP WITH TIME ZONE
        )
    """
    )

    await conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_users_username
            ON users(username)
    """
    )

    # Refresh tokens table for session management
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash VARCHAR(255) NOT NULL,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            revoked BOOLEAN DEFAULT FALSE
        )
    """
    )

    await conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
            ON refresh_tokens(user_id)
    """
    )

    await conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash
            ON refresh_tokens(token_hash)
    """
    )

    await conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash_unique
            ON refresh_tokens(token_hash)
    """
    )

    # Conversation participants table for discovery and authorization
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS conversation_participants (
            conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            PRIMARY KEY (conversation_id, user_id)
        )
    """
    )

    await conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_conversation_participants_user
            ON conversation_participants(user_id)
    """
    )

    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            ciphertext BYTEA NOT NULL,
            iv BYTEA NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """
    )

    await conn.execute(
        """
        ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS group_epoch INTEGER
    """
    )

    await conn.execute(
        """
        ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS expires_after_seen_sec SMALLINT
    """
    )

    await conn.execute(
        """
        ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS sender_delete_after_seen_at TIMESTAMP WITH TIME ZONE
    """
    )

    await conn.execute(
        """
        ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS sender_deleted_at TIMESTAMP WITH TIME ZONE
    """
    )

    await conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
            ON messages(conversation_id)
    """
    )

    await conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_messages_created_at
            ON messages(conversation_id, created_at)
    """
    )

    await conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_messages_sender_delete_due
            ON messages(sender_delete_after_seen_at)
            WHERE sender_delete_after_seen_at IS NOT NULL AND sender_deleted_at IS NULL
    """
    )

    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS message_user_state (
            message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            is_sender BOOLEAN NOT NULL DEFAULT FALSE,
            seen_at TIMESTAMP WITH TIME ZONE,
            delete_after_seen_at TIMESTAMP WITH TIME ZONE,
            deleted_at TIMESTAMP WITH TIME ZONE,
            PRIMARY KEY (message_id, user_id)
        )
    """
    )

    await conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_message_user_state_due
            ON message_user_state(delete_after_seen_at)
            WHERE delete_after_seen_at IS NOT NULL AND deleted_at IS NULL AND is_sender = FALSE
    """
    )

    await conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_message_user_state_seen_by_user
            ON message_user_state(user_id, seen_at DESC)
    """
    )

    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS groups (
            id UUID PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
            created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            key_epoch INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """
    )

    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS group_members (
            group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role VARCHAR(20) NOT NULL DEFAULT 'member',
            joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            removed_at TIMESTAMP WITH TIME ZONE,
            PRIMARY KEY (group_id, user_id)
        )
    """
    )

    await conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_group_members_group_active
            ON group_members(group_id, user_id)
            WHERE removed_at IS NULL
    """
    )

    await conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_group_members_user_active
            ON group_members(user_id, group_id)
            WHERE removed_at IS NULL
    """
    )

    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS group_key_envelopes (
            group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            epoch INTEGER NOT NULL,
            encrypted_key_blob TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            PRIMARY KEY (group_id, user_id, epoch)
        )
    """
    )

    await conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_group_key_envelopes_lookup
            ON group_key_envelopes(group_id, user_id, epoch DESC)
    """
    )


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
