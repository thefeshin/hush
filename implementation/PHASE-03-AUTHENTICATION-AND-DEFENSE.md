# PHASE 03: Authentication & Defense System

## Overview
This phase implements the authentication endpoint and the complete defense system including IP blocking, database wiping, and panic mode. Authentication is a knowledge gate only — it proves the client knows the 12 words but grants no decryption capability.

## Objectives
1. `/api/auth` endpoint with SHA-256 verification
2. JWT token issuance
3. Per-IP failure tracking
4. IP blocking (temporary and permanent)
5. Database wipe functionality
6. Panic mode implementation
7. Security middleware

---

## 1. Authentication Router

### File: `backend/app/routers/auth.py`

```python
"""
Authentication endpoint
Validates 12-word passphrase against stored hash
Issues JWT for WebSocket access
"""

import hashlib
import base64
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import jwt

from app.config import settings
from app.database import get_connection
from app.schemas.auth import AuthRequest, AuthResponse
from app.services.defense import DefenseService

router = APIRouter()


def normalize_words(words: str) -> str:
    """
    Normalize 12 words for consistent hashing
    - lowercase
    - trimmed
    - single spaces between words
    """
    word_list = words.lower().split()
    return ' '.join(word.strip() for word in word_list)


def hash_words(normalized: str) -> str:
    """
    SHA-256 hash of normalized words
    Returns base64-encoded hash
    """
    hash_bytes = hashlib.sha256(normalized.encode('utf-8')).digest()
    return base64.b64encode(hash_bytes).decode('ascii')


def create_jwt_token(expires_minutes: int = None) -> tuple[str, int]:
    """
    Create a short-lived JWT token
    Returns (token, expires_in_seconds)
    """
    if expires_minutes is None:
        expires_minutes = settings.JWT_EXPIRE_MINUTES

    expires_delta = timedelta(minutes=expires_minutes)
    expire = datetime.now(timezone.utc) + expires_delta

    payload = {
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access"
    }

    token = jwt.encode(
        payload,
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM
    )

    return token, int(expires_delta.total_seconds())


def get_client_ip(request: Request) -> str:
    """
    Extract client IP address
    Handles X-Forwarded-For from nginx
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # Take first IP (original client)
        return forwarded.split(",")[0].strip()
    return request.client.host


@router.post("/auth", response_model=AuthResponse)
async def authenticate(
    request: Request,
    auth_request: AuthRequest,
    conn=Depends(get_connection)
):
    """
    Authenticate with 12-word passphrase

    Flow:
    1. Check if IP is blocked
    2. Normalize and hash submitted words
    3. Compare with stored AUTH_HASH
    4. If valid: issue JWT, reset failure count
    5. If invalid: increment failures, trigger policy if threshold exceeded
    """
    client_ip = get_client_ip(request)
    defense = DefenseService(conn)

    # Check if IP is blocked
    block_status = await defense.check_ip_blocked(client_ip)
    if block_status["blocked"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "ip_blocked",
                "message": "Access denied",
                "expires_at": block_status.get("expires_at")
            }
        )

    # Normalize and hash
    normalized = normalize_words(auth_request.words)
    submitted_hash = hash_words(normalized)

    # Constant-time comparison to prevent timing attacks
    stored_hash = settings.AUTH_HASH
    is_valid = len(submitted_hash) == len(stored_hash) and \
               all(a == b for a, b in zip(submitted_hash, stored_hash))

    if is_valid:
        # Success: reset failure count and issue token
        await defense.reset_failures(client_ip)

        token, expires_in = create_jwt_token()

        return AuthResponse(
            token=token,
            kdf_salt=settings.KDF_SALT,
            expires_in=expires_in
        )
    else:
        # Failure: record and potentially trigger defense
        remaining = await defense.record_failure(client_ip)

        # Check if we need to trigger policy action
        if remaining <= 0:
            await defense.trigger_policy(client_ip)

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "invalid_credentials",
                "remaining_attempts": max(0, remaining)
            }
        )


@router.get("/auth/salt")
async def get_salt():
    """
    Get KDF salt for client-side key derivation
    This is public - salt is not secret
    """
    return {"kdf_salt": settings.KDF_SALT}
```

---

## 2. Defense Service

### File: `backend/app/services/defense.py`

```python
"""
Defense system implementation
Handles IP blocking, database wiping, and panic mode
"""

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from typing import Optional
import asyncpg

from app.config import settings


class DefenseService:
    """
    Implements the defense system based on deployment-time policy
    """

    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def check_ip_blocked(self, ip: str) -> dict:
        """
        Check if an IP address is blocked
        Returns: {"blocked": bool, "expires_at": Optional[datetime]}
        """
        row = await self.conn.fetchrow("""
            SELECT blocked_at, expires_at
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
                "expires_at": expires_at.isoformat()
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
            await self._execute_panic_mode()
            return 0  # Won't reach here

        # Upsert failure record
        await self.conn.execute("""
            INSERT INTO auth_failures (ip_address, failure_count, last_failure_at)
            VALUES ($1, 1, NOW())
            ON CONFLICT (ip_address) DO UPDATE SET
                failure_count = auth_failures.failure_count + 1,
                last_failure_at = NOW()
        """, ip)

        # Get current count
        current = await self.get_failure_count(ip)
        remaining = settings.MAX_AUTH_FAILURES - current

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

    async def _wipe_database(self):
        """
        Wipe all data from the database
        This is the nuclear option
        """
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
        # Log the shutdown (to container logs)
        print("[HUSH] SECURITY SHUTDOWN - Process terminating", flush=True)

        # Force exit - no graceful shutdown
        sys.exit(1)
```

---

## 3. JWT Verification Dependency

### File: `backend/app/dependencies/auth.py`

```python
"""
Authentication dependencies for protected routes
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status, WebSocket
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

from app.config import settings

# HTTP Bearer token extractor
security = HTTPBearer()


async def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """
    Verify JWT token from Authorization header
    Used for REST API endpoints
    """
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM]
        )

        # Verify token type
        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )

        return payload

    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )


async def verify_websocket_token(token: str) -> Optional[dict]:
    """
    Verify JWT token for WebSocket connections
    Returns payload if valid, None if invalid
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM]
        )

        if payload.get("type") != "access":
            return None

        return payload

    except JWTError:
        return None


def extract_ws_token(websocket: WebSocket) -> Optional[str]:
    """
    Extract token from WebSocket connection
    Supports query parameter: ?token=xxx
    """
    token = websocket.query_params.get("token")
    return token
```

---

## 4. Security Middleware

### File: `backend/app/middleware/security.py`

```python
"""
Security middleware for request filtering
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from datetime import datetime, timezone

from app.database import get_pool


class SecurityMiddleware(BaseHTTPMiddleware):
    """
    Middleware that runs before route handlers
    - Checks IP blocks
    - Adds security headers
    """

    # Paths that skip IP block check
    BYPASS_PATHS = {"/health", "/health/db"}

    async def dispatch(self, request: Request, call_next):
        # Skip check for health endpoints
        if request.url.path in self.BYPASS_PATHS:
            response = await call_next(request)
            return self._add_security_headers(response)

        # Check IP block
        client_ip = self._get_client_ip(request)

        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                blocked = await self._check_ip_blocked(conn, client_ip)

                if blocked:
                    return JSONResponse(
                        status_code=403,
                        content={"error": "ip_blocked", "message": "Access denied"}
                    )
        except RuntimeError:
            # Database not initialized yet
            pass

        response = await call_next(request)
        return self._add_security_headers(response)

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP from request"""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host

    async def _check_ip_blocked(self, conn, ip: str) -> bool:
        """Check if IP is blocked"""
        row = await conn.fetchrow("""
            SELECT expires_at FROM blocked_ips WHERE ip_address = $1
        """, ip)

        if row is None:
            return False

        expires_at = row["expires_at"]

        # Permanent block
        if expires_at is None:
            return True

        # Check expiry
        if expires_at > datetime.now(timezone.utc):
            return True

        # Expired - clean up
        await conn.execute("""
            DELETE FROM blocked_ips WHERE ip_address = $1
        """, ip)

        return False

    def _add_security_headers(self, response):
        """Add security headers to response"""
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        return response
```

---

## 5. Rate Limiting (Additional Layer)

### File: `backend/app/middleware/rate_limit.py`

```python
"""
In-memory rate limiting as additional defense layer
This is separate from auth failure tracking
"""

import time
from collections import defaultdict
from typing import Dict, Tuple
from dataclasses import dataclass
from threading import Lock


@dataclass
class RateLimitConfig:
    """Rate limit configuration"""
    requests_per_minute: int = 60
    burst_size: int = 10


class RateLimiter:
    """
    Token bucket rate limiter
    Per-IP tracking with automatic cleanup
    """

    def __init__(self, config: RateLimitConfig = None):
        self.config = config or RateLimitConfig()
        self._buckets: Dict[str, Tuple[float, float]] = defaultdict(
            lambda: (time.time(), float(self.config.burst_size))
        )
        self._lock = Lock()

    def is_allowed(self, ip: str) -> bool:
        """
        Check if request is allowed
        Returns True if allowed, False if rate limited
        """
        with self._lock:
            now = time.time()
            last_update, tokens = self._buckets[ip]

            # Replenish tokens based on time passed
            time_passed = now - last_update
            tokens_per_second = self.config.requests_per_minute / 60.0
            tokens = min(
                self.config.burst_size,
                tokens + time_passed * tokens_per_second
            )

            if tokens >= 1:
                # Allow request, consume token
                self._buckets[ip] = (now, tokens - 1)
                return True
            else:
                # Rate limited
                self._buckets[ip] = (now, tokens)
                return False

    def cleanup_old_entries(self, max_age_seconds: int = 3600):
        """Remove old entries to prevent memory leak"""
        with self._lock:
            now = time.time()
            to_remove = [
                ip for ip, (last_update, _) in self._buckets.items()
                if now - last_update > max_age_seconds
            ]
            for ip in to_remove:
                del self._buckets[ip]


# Global rate limiter instance
rate_limiter = RateLimiter()
```

---

## 6. Timing Attack Prevention

### File: `backend/app/utils/crypto.py`

```python
"""
Cryptographic utilities with timing attack prevention
"""

import hmac
import hashlib
import base64


def constant_time_compare(a: str, b: str) -> bool:
    """
    Compare two strings in constant time
    Prevents timing attacks on hash comparison
    """
    if len(a) != len(b):
        # Still do comparison to maintain constant time
        # but ensure we return False
        hmac.compare_digest(a, a)
        return False

    return hmac.compare_digest(a.encode(), b.encode())


def secure_hash(data: str) -> str:
    """
    Compute SHA-256 hash of data
    Returns base64-encoded hash
    """
    hash_bytes = hashlib.sha256(data.encode('utf-8')).digest()
    return base64.b64encode(hash_bytes).decode('ascii')
```

---

## 7. Updated Auth Router with Constant-Time Comparison

Update the auth router to use the secure comparison:

```python
# In backend/app/routers/auth.py

from app.utils.crypto import constant_time_compare

# Replace the comparison in authenticate():
is_valid = constant_time_compare(submitted_hash, settings.AUTH_HASH)
```

---

## 8. Logging Configuration

### File: `backend/app/logging_config.py`

```python
"""
Logging configuration
Security events are logged but never include sensitive data
"""

import logging
import sys
from datetime import datetime


class SecurityFilter(logging.Filter):
    """Filter that redacts sensitive information"""

    SENSITIVE_KEYS = {'password', 'token', 'secret', 'words', 'key', 'auth'}

    def filter(self, record):
        # Ensure we never log sensitive data
        if hasattr(record, 'msg'):
            msg = str(record.msg).lower()
            for key in self.SENSITIVE_KEYS:
                if key in msg:
                    record.msg = "[REDACTED - Sensitive data filtered]"
                    break
        return True


def setup_logging():
    """Configure application logging"""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    ))
    handler.addFilter(SecurityFilter())

    # Root logger
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.addHandler(handler)

    # Reduce noise from libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("asyncpg").setLevel(logging.WARNING)


# Security event logging
security_logger = logging.getLogger("hush.security")


def log_auth_failure(ip: str, remaining: int):
    """Log authentication failure (no sensitive data)"""
    security_logger.warning(
        f"Auth failure from {ip} - {remaining} attempts remaining"
    )


def log_ip_blocked(ip: str, permanent: bool):
    """Log IP block event"""
    block_type = "permanent" if permanent else "temporary"
    security_logger.warning(f"IP {ip} blocked ({block_type})")


def log_db_wipe():
    """Log database wipe event"""
    security_logger.critical("DATABASE WIPED - Security policy triggered")


def log_shutdown():
    """Log security shutdown"""
    security_logger.critical("SECURITY SHUTDOWN INITIATED")
```

---

## 9. Security Considerations

### Timing Attack Prevention
- All hash comparisons use `hmac.compare_digest()`
- Response times are consistent regardless of which character fails

### Rate Limiting Layers
1. Nginx rate limiting (edge)
2. Application rate limiter (per-IP token bucket)
3. Auth failure tracking (persistent)

### Panic Mode Safety
- Requires explicit "CONFIRM" during deployment
- Any single auth failure triggers immediate wipe
- No recovery possible

### IP Block Persistence
- Blocks survive container restarts
- Stored in PostgreSQL
- Automatic cleanup of expired blocks

### Logging Security
- Never logs passwords, tokens, or words
- Security filter redacts sensitive patterns
- Only logs IP addresses and event types

---

## 10. Verification Checklist

After implementing this phase, verify:

- [ ] `/api/auth` returns 401 for wrong words
- [ ] `/api/auth` returns JWT for correct words
- [ ] KDF salt is included in auth response
- [ ] Failure count increments on failures
- [ ] IP block triggers after max failures
- [ ] Temporary blocks expire correctly
- [ ] Permanent blocks persist
- [ ] Database wipe removes all data
- [ ] Panic mode triggers on first failure
- [ ] Security headers are present
- [ ] No sensitive data in logs

---

## 11. Test Commands

```bash
# Test auth with wrong words
curl -X POST http://localhost:8000/api/auth \
  -H "Content-Type: application/json" \
  -d '{"words": "wrong words here that will not work at all ever"}'

# Test auth with correct words (use actual words from deploy)
curl -X POST http://localhost:8000/api/auth \
  -H "Content-Type: application/json" \
  -d '{"words": "actual twelve words here..."}'

# Get salt
curl http://localhost:8000/api/auth/salt

# Check if IP is blocked (after failures)
curl http://localhost:8000/health

# Verify security headers
curl -I http://localhost:8000/health
```
