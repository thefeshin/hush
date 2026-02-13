"""
Authentication endpoints for multi-user system
Validates 12-word passphrase, manages user registration/login with cookies
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID
import asyncpg

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from jose import jwt, JWTError
from passlib.context import CryptContext

from app.config import settings
from app.database import get_connection
from app.schemas.auth import (
    VaultAccessRequest, VaultAccessResponse,
    RegisterRequest, LoginRequest,
    UserResponse, UserLookupResponse, AuthSuccess
)
from app.services.defense import DefenseService
from app.utils.crypto import constant_time_compare, hash_words
from app.logging_config import log_auth_success
from app.middleware.rate_limit import auth_rate_limiter, log_rate_limited
from app.utils.network import get_client_ip

router = APIRouter()

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_vault_token() -> tuple[str, int]:
    """Create a short-lived vault token for registration/login"""
    expires_delta = timedelta(minutes=settings.VAULT_TOKEN_EXPIRE_MINUTES)
    expire = datetime.now(timezone.utc) + expires_delta

    payload = {
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "vault"
    }

    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, int(expires_delta.total_seconds())


def verify_vault_token(token: str) -> bool:
    """Verify vault token is valid"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload.get("type") == "vault"
    except JWTError:
        return False


def create_access_token(user_id: UUID, username: str) -> tuple[str, int]:
    """Create access token (15 min)"""
    expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    expire = datetime.now(timezone.utc) + expires_delta

    payload = {
        "sub": str(user_id),
        "username": username,
        "type": "access",
        "exp": expire,
        "iat": datetime.now(timezone.utc)
    }

    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, int(expires_delta.total_seconds())


def create_refresh_token() -> str:
    """Create a random refresh token"""
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    """Hash refresh token for storage"""
    return hashlib.sha256(token.encode()).hexdigest()


def set_auth_cookies(response: Response, access_token: str, refresh_token: str, access_expires: int):
    """Set authentication cookies"""
    refresh_expires = settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60

    # Set access_token for API endpoints
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/api",
        max_age=access_expires
    )

    # Set access_token for WebSocket connections (/ws path)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/ws",
        max_age=access_expires
    )

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/api/auth/refresh",
        max_age=refresh_expires
    )


def clear_auth_cookies(response: Response):
    """Clear authentication cookies"""
    response.delete_cookie(key="access_token", path="/api")
    response.delete_cookie(key="access_token", path="/ws")
    response.delete_cookie(key="refresh_token", path="/api/auth/refresh")


@router.post("/auth/vault", response_model=VaultAccessResponse)
async def verify_vault(
    request: Request,
    vault_request: VaultAccessRequest,
    conn=Depends(get_connection)
):
    """
    Verify 12-word passphrase and return vault token for registration/login

    Flow:
    1. Check rate limit
    2. Check if IP is blocked
    3. Validate passphrase against AUTH_HASH
    4. If valid: return vault_token + kdf_salt
    5. If invalid: increment failures
    """
    client_ip = get_client_ip(request)
    defense = DefenseService(conn)

    # Check rate limit
    if not auth_rate_limiter.is_allowed(client_ip):
        log_rate_limited(client_ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"error": "rate_limited", "message": "Too many requests"}
        )

    # Check if IP is blocked
    block_status = await defense.check_ip_blocked(client_ip)
    if block_status["blocked"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "ip_blocked", "message": "Access denied"}
        )

    # Hash submitted words
    submitted_hash = hash_words(vault_request.words)

    # Constant-time comparison
    is_valid = constant_time_compare(submitted_hash, settings.AUTH_HASH)

    if is_valid:
        await defense.reset_failures(client_ip)
        log_auth_success(client_ip)

        vault_token, expires_in = create_vault_token()

        return VaultAccessResponse(
            vault_token=vault_token,
            kdf_salt=settings.KDF_SALT,
            expires_in=expires_in
        )
    else:
        remaining = await defense.record_failure(client_ip)
        if remaining <= 0:
            await defense.trigger_policy(client_ip)

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "invalid_credentials",
                "message": "Invalid passphrase",
                "remaining_attempts": max(0, remaining)
            }
        )


@router.post("/auth/register", response_model=AuthSuccess)
async def register(
    request: Request,
    response: Response,
    register_request: RegisterRequest,
    conn=Depends(get_connection)
):
    """
    Register a new user (requires valid vault token)

    Flow:
    1. Verify vault token
    2. Check username availability
    3. Hash password and create user
    4. Create tokens and set cookies
    """
    # Verify vault token
    if not verify_vault_token(register_request.vault_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_vault_token", "message": "Invalid or expired vault token"}
        )

    # Check password length
    if len(register_request.password) < settings.PASSWORD_MIN_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "password_too_short", "message": f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters"}
        )

    username = register_request.username.lower().strip()

    # Check if username already exists
    existing = await conn.fetchval(
        "SELECT id FROM users WHERE username = $1",
        username
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "username_taken", "message": "Username already taken"}
        )

    # Hash password
    password_hash = pwd_context.hash(register_request.password)

    # Create user
    try:
        user = await conn.fetchrow(
            """
            INSERT INTO users (username, password_hash)
            VALUES ($1, $2)
            RETURNING id, username, created_at
            """,
            username,
            password_hash
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "username_taken", "message": "Username already taken"}
        )

    user_id = user["id"]
    user_username = user["username"]

    # Create tokens
    access_token, access_expires = create_access_token(user_id, user_username)
    refresh_token = create_refresh_token()
    refresh_token_hash = hash_refresh_token(refresh_token)

    # Store refresh token
    refresh_expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await conn.execute(
        """
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
        """,
        user_id,
        refresh_token_hash,
        refresh_expires_at
    )

    # Set cookies
    set_auth_cookies(response, access_token, refresh_token, access_expires)

    return AuthSuccess(
        user=UserResponse(id=user_id, username=user_username),
        message="Registration successful"
    )


@router.post("/auth/login", response_model=AuthSuccess)
async def login(
    request: Request,
    response: Response,
    login_request: LoginRequest,
    conn=Depends(get_connection)
):
    """
    Login an existing user (requires valid vault token)

    Flow:
    1. Verify vault token
    2. Verify username/password
    3. Create tokens and set cookies
    """
    client_ip = get_client_ip(request)
    defense = DefenseService(conn)

    # Verify vault token
    if not verify_vault_token(login_request.vault_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_vault_token", "message": "Invalid or expired vault token"}
        )

    username = login_request.username.lower().strip()

    if not auth_rate_limiter.is_allowed(client_ip) or not auth_rate_limiter.is_allowed(f"{client_ip}:{username}"):
        log_rate_limited(client_ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"error": "rate_limited", "message": "Too many login attempts"}
        )

    block_status = await defense.check_ip_blocked(client_ip)
    if block_status["blocked"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "ip_blocked", "message": "Access denied"}
        )

    # Get user
    user = await conn.fetchrow(
        "SELECT id, username, password_hash FROM users WHERE username = $1",
        username
    )

    if not user:
        remaining = await defense.record_failure(client_ip)
        if remaining <= 0:
            await defense.trigger_policy(client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_credentials", "message": "Invalid username or password"}
        )

    # Verify password
    if not pwd_context.verify(login_request.password, user["password_hash"]):
        remaining = await defense.record_failure(client_ip)
        if remaining <= 0:
            await defense.trigger_policy(client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_credentials", "message": "Invalid username or password"}
        )

    user_id = user["id"]
    user_username = user["username"]

    # Update last login
    await defense.reset_failures(client_ip)

    await conn.execute(
        "UPDATE users SET last_login = NOW() WHERE id = $1",
        user_id
    )

    # Create tokens
    access_token, access_expires = create_access_token(user_id, user_username)
    refresh_token = create_refresh_token()
    refresh_token_hash = hash_refresh_token(refresh_token)

    # Store refresh token
    refresh_expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await conn.execute(
        """
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
        """,
        user_id,
        refresh_token_hash,
        refresh_expires_at
    )

    # Set cookies
    set_auth_cookies(response, access_token, refresh_token, access_expires)

    return AuthSuccess(
        user=UserResponse(id=user_id, username=user_username),
        message="Login successful"
    )


@router.post("/auth/refresh", response_model=AuthSuccess)
async def refresh_tokens(
    request: Request,
    response: Response,
    conn=Depends(get_connection)
):
    """
    Refresh tokens using refresh_token cookie

    Flow:
    1. Get refresh token from cookie
    2. Verify token exists in DB and not expired/revoked
    3. Revoke old token
    4. Create new tokens
    5. Set new cookies
    """
    refresh_token = request.cookies.get("refresh_token")

    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "missing_token", "message": "No refresh token"}
        )

    token_hash = hash_refresh_token(refresh_token)

    # Find token in DB
    async with conn.transaction():
        token_record = await conn.fetchrow(
            """
            UPDATE refresh_tokens rt
            SET revoked = TRUE
            FROM users u
            WHERE rt.token_hash = $1
              AND rt.user_id = u.id
              AND rt.revoked = FALSE
              AND rt.expires_at > NOW()
            RETURNING rt.user_id, u.username
            """,
            token_hash,
        )

        if not token_record:
            clear_auth_cookies(response)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": "invalid_token", "message": "Invalid refresh token"},
            )

        user_id = token_record["user_id"]
        username = token_record["username"]

        access_token, access_expires = create_access_token(user_id, username)
        new_refresh_token = create_refresh_token()
        new_refresh_hash = hash_refresh_token(new_refresh_token)

        refresh_expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        await conn.execute(
            """
            INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
            VALUES ($1, $2, $3)
            """,
            user_id,
            new_refresh_hash,
            refresh_expires_at,
        )

    # Set new cookies
    set_auth_cookies(response, access_token, new_refresh_token, access_expires)

    return AuthSuccess(
        user=UserResponse(id=user_id, username=username),
        message="Tokens refreshed"
    )


@router.post("/auth/logout")
async def logout(
    request: Request,
    response: Response,
    conn=Depends(get_connection)
):
    """
    Logout user - revoke refresh token and clear cookies
    """
    refresh_token = request.cookies.get("refresh_token")

    if refresh_token:
        token_hash = hash_refresh_token(refresh_token)
        await conn.execute(
            "UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1",
            token_hash
        )

    clear_auth_cookies(response)

    return {"message": "Logged out successfully"}


@router.get("/auth/me", response_model=UserResponse)
async def get_current_user(
    request: Request,
    conn=Depends(get_connection)
):
    """
    Get current authenticated user from access_token cookie
    """
    access_token = request.cookies.get("access_token")

    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "not_authenticated", "message": "No access token"}
        )

    try:
        payload = jwt.decode(
            access_token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM]
        )

        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": "invalid_token", "message": "Invalid token type"}
            )

        user_id = UUID(payload["sub"])
        username = payload["username"]

        return UserResponse(id=user_id, username=username)

    except (JWTError, KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "message": "Invalid or expired token"}
        )


@router.get("/users/lookup", response_model=UserLookupResponse)
async def lookup_user(
    request: Request,
    username: str,
    conn=Depends(get_connection)
):
    """
    Lookup user by username (requires authentication)
    """
    # Verify caller is authenticated
    access_token = request.cookies.get("access_token")
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "not_authenticated", "message": "Authentication required"}
        )

    try:
        payload = jwt.decode(
            access_token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM]
        )
        if payload.get("type") != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    except (JWTError, KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "message": "Invalid or expired token"}
        )

    # Lookup user
    username_lower = username.lower().strip()
    user = await conn.fetchrow(
        "SELECT id, username FROM users WHERE username = $1",
        username_lower
    )

    if user:
        return UserLookupResponse(
            found=True,
            user=UserResponse(id=user["id"], username=user["username"])
        )
    else:
        return UserLookupResponse(found=False, user=None)


@router.get("/auth/salt")
async def get_salt():
    """
    Get KDF salt for client-side key derivation
    This is public - salt is not secret
    """
    return {"kdf_salt": settings.KDF_SALT}
