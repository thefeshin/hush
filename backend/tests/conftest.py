"""
Pytest fixtures for HUSH backend tests
"""

import os
import pytest
import asyncio
from typing import AsyncGenerator

# Set test environment before imports
os.environ.setdefault("AUTH_HASH", "test_hash_for_ci_testing")
os.environ.setdefault("KDF_SALT", "dGVzdF9zYWx0X2Zvcl9jaQ==")
os.environ.setdefault("JWT_SECRET", "test_jwt_secret_for_ci_testing_only")
os.environ.setdefault("DATABASE_URL", "postgresql://hush:hush@localhost:5432/hush")

from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP client for testing endpoints."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac


@pytest.fixture
def test_words() -> str:
    """Test 12-word passphrase (for testing only)."""
    return "test word one two three four five six seven eight nine ten"


@pytest.fixture
def valid_uuid() -> str:
    """A valid UUID for testing."""
    return "12345678-1234-1234-1234-123456789012"


@pytest.fixture
def valid_thread_id() -> str:
    """A valid thread ID (UUID format)."""
    return "abcdef12-3456-7890-abcd-ef1234567890"
