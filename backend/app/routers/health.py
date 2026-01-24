"""
Health check endpoints
"""

import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from app.database import get_connection

router = APIRouter()


@router.get("/health")
async def health_check():
    """Basic liveness probe - returns healthy if the service is running"""
    return {"status": "healthy"}


@router.get("/health/db")
async def db_health_check(conn=Depends(get_connection)):
    """Database connectivity check"""
    try:
        await conn.fetchval("SELECT 1")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": str(e)}


@router.get("/health/ready")
async def readiness_check(conn=Depends(get_connection)):
    """
    Kubernetes-style readiness probe.
    Returns 200 if all dependencies are healthy, 503 otherwise.
    """
    checks = {}
    all_healthy = True

    # Database check with timeout
    try:
        await asyncio.wait_for(conn.fetchval("SELECT 1"), timeout=5.0)
        checks["database"] = "healthy"
    except asyncio.TimeoutError:
        checks["database"] = "timeout"
        all_healthy = False
    except Exception as e:
        checks["database"] = f"unhealthy: {str(e)}"
        all_healthy = False

    response_data = {
        "status": "healthy" if all_healthy else "unhealthy",
        "checks": checks,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    if all_healthy:
        return response_data
    else:
        return JSONResponse(status_code=503, content=response_data)
