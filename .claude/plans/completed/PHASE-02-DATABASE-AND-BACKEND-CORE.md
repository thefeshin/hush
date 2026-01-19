# PHASE 02: Database Schema & Backend Core

## Overview
This phase establishes the PostgreSQL database schema and FastAPI backend foundation. The database stores ONLY encrypted blobs and UUIDs — it has zero knowledge of message content, user identities, or thread metadata.

## Objectives
1. PostgreSQL schema design (zero-knowledge)
2. FastAPI application structure
3. Database connection management
4. Pydantic models and schemas
5. Health check endpoints
6. Configuration loading from environment

---

## 1. Database Schema

### Design Principles
- Server stores encrypted blobs only
- No plaintext anywhere
- UUIDs for identification (opaque to server)
- Timestamps for ordering only
- No foreign key constraints to users (users don't exist server-side)

### File: `backend/app/models/schema.sql`

```sql
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
```

---

## 2. FastAPI Application Structure

### File: `backend/app/main.py`

```python
"""
HUSH Backend - Zero-Knowledge Message Relay
The server never decrypts anything.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db, close_db
from app.routers import auth, threads, messages, health
from app.middleware.security import SecurityMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    # Startup
    await init_db()
    yield
    # Shutdown
    await close_db()


def create_app() -> FastAPI:
    """Application factory"""
    app = FastAPI(
        title="HUSH",
        description="Zero-Knowledge Encrypted Chat Vault",
        version="1.0.0",
        docs_url=None,      # Disable Swagger in production
        redoc_url=None,     # Disable ReDoc in production
        openapi_url=None,   # Disable OpenAPI schema
        lifespan=lifespan
    )

    # Security middleware (IP blocking, rate limiting)
    app.add_middleware(SecurityMiddleware)

    # CORS - restrictive
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.FRONTEND_URL],
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    # Register routers
    app.include_router(health.router, tags=["health"])
    app.include_router(auth.router, prefix="/api", tags=["auth"])
    app.include_router(threads.router, prefix="/api", tags=["threads"])
    app.include_router(messages.router, prefix="/api", tags=["messages"])

    return app


app = create_app()
```

---

## 3. Configuration Management

### File: `backend/app/config.py`

```python
"""
Configuration loaded from environment variables
All sensitive values come from .env (generated at deploy time)
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings from environment"""

    # Database
    DATABASE_URL: str

    # Authentication
    AUTH_HASH: str          # SHA-256 hash of 12 words
    KDF_SALT: str           # Base64-encoded salt (sent to client)
    JWT_SECRET: str         # Secret for signing JWTs
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60

    # Security Policy (set at deployment)
    MAX_AUTH_FAILURES: int = 5
    FAILURE_MODE: str = "ip_temp"  # ip_temp, ip_perm, db_wipe, db_wipe_shutdown
    IP_BLOCK_MINUTES: int = 60
    PANIC_MODE: bool = False

    # Application
    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8000
    FRONTEND_URL: str = "https://localhost"

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Cached settings instance"""
    return Settings()


settings = get_settings()
```

---

## 4. Database Connection

### File: `backend/app/database.py`

```python
"""
Async database connection management using asyncpg
"""

import asyncpg
from typing import Optional
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


async def get_connection():
    """Dependency for getting a database connection"""
    pool = await get_pool()
    async with pool.acquire() as connection:
        yield connection
```

---

## 5. Pydantic Schemas

### File: `backend/app/schemas/thread.py`

```python
"""
Thread schemas - server only sees encrypted blobs
"""

from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from typing import Optional


class ThreadCreate(BaseModel):
    """Create a new thread (encrypted metadata)"""
    id: UUID                    # Client-generated thread_id
    ciphertext: str             # Base64-encoded encrypted metadata
    iv: str                     # Base64-encoded IV


class ThreadResponse(BaseModel):
    """Thread response (still encrypted)"""
    id: UUID
    ciphertext: str
    iv: str
    created_at: datetime


class ThreadQuery(BaseModel):
    """Query for specific threads by ID"""
    thread_ids: list[UUID] = Field(..., max_length=100)
```

### File: `backend/app/schemas/message.py`

```python
"""
Message schemas - server only sees encrypted blobs
"""

from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from typing import Optional


class MessageCreate(BaseModel):
    """Create a new message (encrypted content)"""
    thread_id: UUID
    ciphertext: str             # Base64-encoded encrypted message
    iv: str                     # Base64-encoded IV


class MessageResponse(BaseModel):
    """Message response (still encrypted)"""
    id: UUID
    thread_id: UUID
    ciphertext: str
    iv: str
    created_at: datetime


class MessageQuery(BaseModel):
    """Query messages for a thread"""
    thread_id: UUID
    after: Optional[datetime] = None    # For pagination
    limit: int = Field(default=50, le=200)
```

### File: `backend/app/schemas/auth.py`

```python
"""
Authentication schemas
"""

from pydantic import BaseModel, Field


class AuthRequest(BaseModel):
    """Authentication request with 12 words"""
    words: str = Field(
        ...,
        description="Space-separated 12 words",
        min_length=20,  # Minimum reasonable length
        max_length=500  # Maximum reasonable length
    )


class AuthResponse(BaseModel):
    """Authentication response"""
    token: str
    kdf_salt: str               # Client needs this for key derivation
    expires_in: int             # Seconds until token expires


class AuthError(BaseModel):
    """Authentication error"""
    error: str
    remaining_attempts: Optional[int] = None
```

---

## 6. Health Check Router

### File: `backend/app/routers/health.py`

```python
"""
Health check endpoints
"""

from fastapi import APIRouter, Depends
from app.database import get_connection

router = APIRouter()


@router.get("/health")
async def health_check():
    """Basic health check"""
    return {"status": "healthy"}


@router.get("/health/db")
async def db_health_check(conn=Depends(get_connection)):
    """Database connectivity check"""
    try:
        await conn.fetchval("SELECT 1")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": str(e)}
```

---

## 7. Requirements

### File: `backend/requirements.txt`

```
# Web framework
fastapi==0.109.0
uvicorn[standard]==0.27.0

# Database
asyncpg==0.29.0

# Settings management
pydantic-settings==2.1.0

# Authentication
python-jose[cryptography]==3.3.0
passlib==1.7.4

# WebSocket support (included in uvicorn[standard])
websockets==12.0

# Security
python-multipart==0.0.6

# For running
gunicorn==21.2.0
```

---

## 8. Dockerfile

### File: `backend/Dockerfile`

```dockerfile
FROM python:3.12-slim

# Security: run as non-root user
RUN useradd -m -u 1000 hush

WORKDIR /app

# Install dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Switch to non-root user
USER hush

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

# Run with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## 9. Docker Compose (Database + Backend)

### File: `docker-compose.yml` (partial - database section)

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: hush
      POSTGRES_PASSWORD: hush
      POSTGRES_DB: hush
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hush -d hush"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - hush_network
    # No port exposure - only accessible within docker network

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    env_file:
      - .env
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - hush_network
    # No port exposure - only nginx accesses backend

volumes:
  postgres_data:

networks:
  hush_network:
    driver: bridge
```

---

## 10. Security Considerations

### Database Security
- PostgreSQL runs without external port exposure
- Only accessible within Docker network
- Credentials in `.env` (not committed)
- Connection pool limits prevent exhaustion

### Backend Security
- No Swagger/OpenAPI in production (disabled)
- CORS restricted to frontend URL only
- Runs as non-root user in container
- Health checks don't expose sensitive info

### Zero-Knowledge Architecture
- No `users` table exists
- Server never sees plaintext
- Thread IDs are opaque SHA-256 hashes
- Messages are pure encrypted blobs

---

## 11. Verification Checklist

After implementing this phase, verify:

- [ ] PostgreSQL container starts successfully
- [ ] Backend container starts and connects to DB
- [ ] Health check endpoints return 200
- [ ] Database tables are created on startup
- [ ] Connection pool works correctly
- [ ] Settings load from .env properly
- [ ] No sensitive data in logs
- [ ] Container runs as non-root

---

## 12. Test Commands

```bash
# Start database only
docker-compose up -d postgres

# Check database is ready
docker-compose exec postgres pg_isready -U hush

# Start backend
docker-compose up -d backend

# Check health
curl http://localhost:8000/health
curl http://localhost:8000/health/db

# Check tables exist
docker-compose exec postgres psql -U hush -d hush -c "\dt"
```
