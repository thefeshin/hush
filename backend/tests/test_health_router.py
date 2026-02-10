from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException, status

from app.routers.health import db_health_check, health_check


@pytest.mark.asyncio
async def test_health_check_reports_healthy():
    response = await health_check()
    assert response == {"status": "healthy"}


@pytest.mark.asyncio
async def test_db_health_check_reports_connected():
    conn = AsyncMock()
    conn.fetchval = AsyncMock(return_value=1)

    response = await db_health_check(conn=conn)
    assert response == {"status": "healthy", "database": "connected"}


@pytest.mark.asyncio
async def test_db_health_check_sanitizes_database_errors():
    conn = AsyncMock()
    conn.fetchval = AsyncMock(side_effect=RuntimeError("sensitive database details"))

    with pytest.raises(HTTPException) as exc:
        await db_health_check(conn=conn)

    assert exc.value.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert exc.value.detail == {"status": "unhealthy", "database": "unavailable"}
