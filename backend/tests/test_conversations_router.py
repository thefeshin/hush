from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.dependencies.auth import AuthenticatedUser
from app.routers.conversations import discover_conversations


@pytest.mark.asyncio
async def test_discover_conversations_returns_other_username_and_legacy_ids():
    user = AuthenticatedUser(user_id=uuid4(), username="alice")

    conversation_one = uuid4()
    conversation_two = uuid4()
    other_user_one = uuid4()
    other_user_two = uuid4()

    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=[
        {
            "conversation_id": conversation_one,
            "other_user_id": other_user_one,
            "other_username": "bob",
        },
        {
            "conversation_id": conversation_two,
            "other_user_id": other_user_two,
            "other_username": "charlie",
        },
    ])

    response = await discover_conversations(user=user, conn=conn)

    query = conn.fetch.call_args.args[0]
    assert "MIN(" not in query
    assert "ROW_NUMBER()" in query

    assert response["conversations"] == [
        {
            "conversation_id": str(conversation_one),
            "other_user_id": str(other_user_one),
            "other_username": "bob",
        },
        {
            "conversation_id": str(conversation_two),
            "other_user_id": str(other_user_two),
            "other_username": "charlie",
        },
    ]
    assert response["conversation_ids"] == [str(conversation_one), str(conversation_two)]


@pytest.mark.asyncio
async def test_discover_conversations_returns_empty_payload_when_none_found():
    user = AuthenticatedUser(user_id=uuid4(), username="alice")

    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=[])

    response = await discover_conversations(user=user, conn=conn)

    assert response == {"conversations": [], "conversation_ids": []}
