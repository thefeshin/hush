"""
Security middleware for request filtering
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from datetime import datetime, timezone

from app.config import settings
from app.database import get_pool
from app.middleware.rate_limit import rate_limiter
from app.logging_config import log_rate_limited, log_panic_mode


class SecurityMiddleware(BaseHTTPMiddleware):
    """
    Middleware that runs before route handlers
    - Checks IP blocks
    - Applies rate limiting
    - Adds security headers
    - Handles panic mode
    """

    # Paths that skip IP block check
    BYPASS_PATHS = {"/health", "/health/db"}

    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip check for health endpoints
        if request.url.path in self.BYPASS_PATHS:
            response = await call_next(request)
            return self._add_security_headers(response)

        client_ip = self._get_client_ip(request)

        # Check panic mode for auth endpoint
        if settings.PANIC_MODE and request.url.path == "/api/auth" and request.method == "POST":
            log_panic_mode()
            # Let the auth router handle panic mode for proper DB wipe
            pass

        # General rate limiting (separate from auth rate limiting)
        if not rate_limiter.is_allowed(client_ip):
            log_rate_limited(client_ip)
            return JSONResponse(
                status_code=429,
                content={"error": "rate_limited", "message": "Too many requests"}
            )

        # Check IP block
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                blocked = await self._check_ip_blocked(conn, client_ip)

                if blocked:
                    return JSONResponse(
                        status_code=403,
                        content={"error": "ip_blocked", "message": "Access denied"}
                    )

                # Periodically clean up expired blocks
                await self._cleanup_expired_blocks(conn)

        except RuntimeError:
            # Database not initialized yet
            pass
        except Exception:
            # Don't fail requests due to security check errors
            pass

        response = await call_next(request)
        return self._add_security_headers(response)

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP from request"""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        if request.client:
            return request.client.host
        return "unknown"

    async def _check_ip_blocked(self, conn, ip: str) -> bool:  # type: ignore[no-untyped-def]
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

        # Expired - will be cleaned up by periodic cleanup
        return False

    async def _cleanup_expired_blocks(self, conn) -> None:  # type: ignore[no-untyped-def]
        """Clean up expired IP blocks (runs periodically)"""
        # Only run cleanup occasionally to avoid overhead
        import random
        if random.random() < 0.01:  # 1% chance per request
            await conn.execute("""
                DELETE FROM blocked_ips
                WHERE expires_at IS NOT NULL AND expires_at < NOW()
            """)

    def _add_security_headers(self, response: Response) -> Response:
        """Add security headers to response"""
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        return response
