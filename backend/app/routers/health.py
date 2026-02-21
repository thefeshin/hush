"""
Health check endpoints
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from app.database import get_connection

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health")
async def health_check():
    """Basic health check"""
    return {"status": "healthy"}


@router.get("/health/db")
async def db_health_check(conn=Depends(get_connection)):
    """Database connectivity check"""
    try:
        await conn.fetchval("SELECT 1")
    except Exception:
        logger.warning("Database health check failed", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"status": "unhealthy", "database": "unavailable"},
        )

    return {"status": "healthy", "database": "connected"}
