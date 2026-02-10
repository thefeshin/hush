from uuid import uuid4
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.services.authorization import (
    require_message_participant,
    require_thread_participant,
)


@pytest.mark.asyncio
async def test_require_thread_participant_returns_404_for_missing_thread():
    conn = AsyncMock()
    conn.fetchval = AsyncMock(side_effect=[False])

    with pytest.raises(HTTPException) as exc:
        await require_thread_participant(conn, uuid4(), uuid4())

    assert exc.value.status_code == 404
    assert exc.value.detail == "Thread not found"


@pytest.mark.asyncio
async def test_require_thread_participant_returns_403_for_non_participant():
    conn = AsyncMock()
    conn.fetchval = AsyncMock(side_effect=[True, False])

    with pytest.raises(HTTPException) as exc:
        await require_thread_participant(conn, uuid4(), uuid4())

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_require_message_participant_returns_403_for_non_participant():
    message_id = uuid4()
    thread_id = uuid4()
    user_id = uuid4()

    conn = AsyncMock()
    # require_message_participant:
    # 1) fetch message thread_id
    # 2) require_thread_participant -> thread exists
    # 3) require_thread_participant -> participant exists
    conn.fetchval = AsyncMock(side_effect=[thread_id, True, False])

    with pytest.raises(HTTPException) as exc:
        await require_message_participant(conn, message_id, user_id)

    assert exc.value.status_code == 403
