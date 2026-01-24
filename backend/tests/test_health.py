"""
Tests for health check endpoints
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient):
    """Test basic health endpoint returns healthy status."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_health_db_endpoint_structure(client: AsyncClient):
    """Test /health/db endpoint returns expected structure."""
    response = await client.get("/health/db")
    # May fail if DB not available in CI, but structure should be correct
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "database" in data


@pytest.mark.asyncio
async def test_health_ready_endpoint_structure(client: AsyncClient):
    """Test /health/ready endpoint returns expected structure."""
    response = await client.get("/health/ready")
    # May return 503 if DB not available, but structure should be correct
    assert response.status_code in [200, 503]
    data = response.json()
    assert "status" in data
    assert "checks" in data
    assert "timestamp" in data
