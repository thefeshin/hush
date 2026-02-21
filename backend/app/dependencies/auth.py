"""
Authentication dependencies for protected routes
Supports cookie-based authentication
"""

from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status, WebSocket
from jose import jwt, JWTError

from app.config import settings


class AuthenticatedUser:
    """Represents an authenticated user"""

    def __init__(self, user_id: UUID, username: str):
        self.user_id = user_id
        self.username = username


async def get_current_user(request: Request) -> AuthenticatedUser:
    """
    Get current user from access_token cookie
    Used for REST API endpoints
    """
    access_token = request.cookies.get("access_token")

    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "not_authenticated", "message": "No access token"},
        )

    try:
        payload = jwt.decode(
            access_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )

        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": "invalid_token", "message": "Invalid token type"},
            )

        user_id = UUID(payload["sub"])
        username = payload["username"]

        return AuthenticatedUser(user_id=user_id, username=username)

    except (JWTError, KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "message": "Invalid or expired token"},
        )


async def verify_websocket_token(token: str) -> Optional[AuthenticatedUser]:
    """
    Verify JWT token for WebSocket connections
    Returns AuthenticatedUser if valid, None if invalid
    """
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )

        if payload.get("type") != "access":
            return None

        user_id = UUID(payload["sub"])
        username = payload["username"]

        return AuthenticatedUser(user_id=user_id, username=username)

    except (JWTError, KeyError, ValueError, TypeError):
        return None


def extract_ws_token(websocket: WebSocket) -> Optional[str]:
    """
    Extract token from WebSocket connection
    Cookie-only authentication for browser WebSocket clients.
    """
    return websocket.cookies.get("access_token")


async def require_ws_auth(websocket: WebSocket) -> AuthenticatedUser:
    """
    Require authentication for WebSocket connection
    Closes connection if invalid
    """
    token = extract_ws_token(websocket)

    if not token:
        await websocket.close(code=4001, reason="Missing authentication token")
        raise HTTPException(status_code=401, detail="Missing token")

    user = await verify_websocket_token(token)

    if not user:
        await websocket.close(code=4001, reason="Invalid or expired token")
        raise HTTPException(status_code=401, detail="Invalid token")

    return user


# Legacy compatibility - verify_token that works with the old pattern
async def verify_token(request: Request) -> dict:
    """
    Legacy: Verify JWT token
    Returns payload dict for backward compatibility
    """
    user = await get_current_user(request)
    return {"sub": str(user.user_id), "username": user.username, "type": "access"}
