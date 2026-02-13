from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.dependencies.auth import AuthenticatedUser
from app.routers.threads import query_threads
from app.schemas.thread import ThreadQuery


@pytest.mark.asyncio
async def test_query_threads_scopes_lookup_to_authenticated_participant():
    user = AuthenticatedUser(user_id=uuid4(), username="alice")
    thread_id = uuid4()
    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=[])

    await query_threads(
        query=ThreadQuery(thread_ids=[thread_id]),
        conn=conn,
        user=user,
    )

    fetch_args = conn.fetch.call_args.args
    assert fetch_args[1] == [thread_id]
    assert fetch_args[2] == user.user_id
