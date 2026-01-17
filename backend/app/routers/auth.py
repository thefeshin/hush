"""
Authentication endpoint
Validates 12-word passphrase against stored hash
Issues JWT for WebSocket access
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import jwt

from app.config import settings
from app.database import get_connection
from app.schemas.auth import AuthRequest, AuthResponse
from app.services.defense import DefenseService
from app.utils.crypto import constant_time_compare, hash_words
from app.logging_config import log_auth_success
from app.middleware.rate_limit import auth_rate_limiter, log_rate_limited

router = APIRouter()


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
    if request.client:
        return request.client.host
    return "unknown"


@router.post("/auth", response_model=AuthResponse)
async def authenticate(
    request: Request,
    auth_request: AuthRequest,
    conn=Depends(get_connection)
):
    """
    Authenticate with 12-word passphrase

    Flow:
    1. Check rate limit
    2. Check if IP is blocked
    3. Normalize and hash submitted words
    4. Compare with stored AUTH_HASH (constant-time)
    5. If valid: issue JWT, reset failure count
    6. If invalid: increment failures, trigger policy if threshold exceeded
    """
    client_ip = get_client_ip(request)
    defense = DefenseService(conn)

    # Check rate limit first
    if not auth_rate_limiter.is_allowed(client_ip):
        log_rate_limited(client_ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "rate_limited",
                "message": "Too many requests. Please wait before trying again."
            }
        )

    # Check if IP is blocked
    block_status = await defense.check_ip_blocked(client_ip)
    if block_status["blocked"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "ip_blocked",
                "message": "Access denied",
                "expires_at": block_status.get("expires_at"),
                "permanent": block_status.get("permanent", False)
            }
        )

    # Hash submitted words
    submitted_hash = hash_words(auth_request.words)

    # Constant-time comparison to prevent timing attacks
    is_valid = constant_time_compare(submitted_hash, settings.AUTH_HASH)

    if is_valid:
        # Success: reset failure count and issue token
        await defense.reset_failures(client_ip)
        log_auth_success(client_ip)

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


@router.post("/auth/refresh", response_model=AuthResponse)
async def refresh_token(
    request: Request,
    conn=Depends(get_connection)
):
    """
    Refresh an existing valid token
    Requires valid Authorization header
    """
    from app.dependencies.auth import verify_token
    from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

    # Manual token extraction for refresh
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header"
        )

    token = auth_header.replace("Bearer ", "")

    try:
        from jose import jwt
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM]
        )

        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )

        # Issue new token
        new_token, expires_in = create_jwt_token()

        return AuthResponse(
            token=new_token,
            kdf_salt=settings.KDF_SALT,
            expires_in=expires_in
        )

    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
