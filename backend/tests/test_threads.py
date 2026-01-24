"""
Tests for thread endpoints
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_threads_require_auth(client: AsyncClient):
    """Test thread endpoints require authentication."""
    response = await client.post("/api/threads", json={})
    assert response.status_code in [401, 403]


@pytest.mark.asyncio
async def test_threads_query_require_auth(client: AsyncClient):
    """Test thread query endpoint requires authentication."""
    response = await client.post("/api/threads/query", json={"thread_ids": []})
    assert response.status_code in [401, 403]


@pytest.mark.asyncio
async def test_threads_get_require_auth(client: AsyncClient, valid_thread_id: str):
    """Test getting a specific thread requires authentication."""
    response = await client.get(f"/api/threads/{valid_thread_id}")
    assert response.status_code in [401, 403]


@pytest.mark.asyncio
async def test_threads_delete_require_auth(client: AsyncClient, valid_thread_id: str):
    """Test deleting a thread requires authentication."""
    response = await client.delete(f"/api/threads/{valid_thread_id}")
    assert response.status_code in [401, 403]
