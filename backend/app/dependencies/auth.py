"""
Authentication dependencies for protected routes
"""

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
                detail="Invalid token type",
                headers={"WWW-Authenticate": "Bearer"}
            )

        return payload

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"}
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


async def require_ws_auth(websocket: WebSocket) -> dict:
    """
    Require authentication for WebSocket connection
    Closes connection if invalid
    """
    token = extract_ws_token(websocket)

    if not token:
        await websocket.close(code=4001, reason="Missing authentication token")
        raise HTTPException(status_code=401, detail="Missing token")

    payload = await verify_websocket_token(token)

    if not payload:
        await websocket.close(code=4001, reason="Invalid or expired token")
        raise HTTPException(status_code=401, detail="Invalid token")

    return payload
