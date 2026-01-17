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
