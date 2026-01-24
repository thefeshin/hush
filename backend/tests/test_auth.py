"""
Tests for authentication endpoints
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_auth_missing_words(client: AsyncClient):
    """Test auth endpoint rejects request without words."""
    response = await client.post("/api/auth", json={})
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_auth_empty_words(client: AsyncClient):
    """Test auth endpoint rejects empty words."""
    response = await client.post("/api/auth", json={"words": ""})
    assert response.status_code == 422  # Validation error - too short


@pytest.mark.asyncio
async def test_auth_invalid_words(client: AsyncClient):
    """Test auth endpoint rejects invalid words (wrong hash)."""
    response = await client.post(
        "/api/auth",
        json={"words": "wrong words that will not match the hash"}
    )
    # Should return 401 (invalid) or 429 (rate limited)
    assert response.status_code in [401, 429]


@pytest.mark.asyncio
async def test_auth_salt_endpoint(client: AsyncClient):
    """Test KDF salt endpoint returns salt."""
    response = await client.get("/api/auth/salt")
    assert response.status_code == 200
    data = response.json()
    assert "kdf_salt" in data
    assert len(data["kdf_salt"]) > 0


@pytest.mark.asyncio
async def test_auth_response_structure(client: AsyncClient):
    """Test auth error response has expected structure."""
    response = await client.post(
        "/api/auth",
        json={"words": "test words that are long enough to pass validation"}
    )
    # Will fail auth but response structure should be correct
    if response.status_code == 401:
        data = response.json()
        assert "error" in data
