-- HUSH Database Schema
-- Zero-knowledge: server cannot read any content

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

-- Note: NO users table exists
-- User identity is client-side only, encrypted in IndexedDB
-- Server has zero knowledge of who is using the system
