-- HUSH Database Schema
-- Zero-knowledge: server cannot read any content

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Threads table
-- Stores encrypted thread metadata (participants, title, etc.)
CREATE TABLE IF NOT EXISTS threads (
    id UUID PRIMARY KEY,
    ciphertext BYTEA NOT NULL,
    iv BYTEA NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages table
-- Stores encrypted message content
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL,
    ciphertext BYTEA NOT NULL,
    iv BYTEA NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fetching messages by thread
CREATE INDEX IF NOT EXISTS idx_messages_thread_id
    ON messages(thread_id);

-- Index for ordering messages by time
CREATE INDEX IF NOT EXISTS idx_messages_created_at
    ON messages(thread_id, created_at);

-- IP blocking table (for defense system)
CREATE TABLE IF NOT EXISTS blocked_ips (
    ip_address INET PRIMARY KEY,
    blocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,  -- NULL = permanent
    reason VARCHAR(50) NOT NULL DEFAULT 'auth_failure'
);

-- Auth failure tracking (persistent across restarts)
CREATE TABLE IF NOT EXISTS auth_failures (
    ip_address INET PRIMARY KEY,
    failure_count INTEGER NOT NULL DEFAULT 0,
    first_failure_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_failure_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table
-- Stores registered users with hashed passwords
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE
);

-- Refresh tokens table
-- Stores hashed refresh tokens for secure session management
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked BOOLEAN DEFAULT FALSE
);

-- Indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Indexes for refresh tokens
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash_unique ON refresh_tokens(token_hash);

-- Thread participants table
-- Stores plaintext participant UUIDs for thread discovery
-- This allows users to discover all threads they're part of without decrypting metadata
CREATE TABLE IF NOT EXISTS thread_participants (
    thread_id UUID PRIMARY KEY REFERENCES threads(id) ON DELETE CASCADE,
    participant_1 UUID NOT NULL,  -- Lower UUID (sorted)
    participant_2 UUID NOT NULL,  -- Higher UUID (sorted)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for looking up threads by user ID
CREATE INDEX IF NOT EXISTS idx_thread_participants_p1
    ON thread_participants(participant_1)
    WHERE participant_1 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_thread_participants_p2
    ON thread_participants(participant_2)
    WHERE participant_2 IS NOT NULL;
