"""
Tests for message endpoints
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_messages_require_auth(client: AsyncClient):
    """Test message creation requires authentication."""
    response = await client.post("/api/messages", json={})
    assert response.status_code in [401, 403]


@pytest.mark.asyncio
async def test_messages_get_require_auth(client: AsyncClient, valid_thread_id: str):
    """Test getting messages requires authentication."""
    response = await client.get(f"/api/messages/{valid_thread_id}")
    assert response.status_code in [401, 403]


@pytest.mark.asyncio
async def test_messages_count_require_auth(client: AsyncClient, valid_thread_id: str):
    """Test message count requires authentication."""
    response = await client.get(f"/api/messages/{valid_thread_id}/count")
    assert response.status_code in [401, 403]


@pytest.mark.asyncio
async def test_messages_delete_require_auth(client: AsyncClient, valid_uuid: str):
    """Test message deletion requires authentication."""
    response = await client.delete(f"/api/messages/{valid_uuid}")
    assert response.status_code in [401, 403]
