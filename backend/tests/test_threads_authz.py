from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.dependencies.auth import AuthenticatedUser
from app.routers.threads import create_thread
from app.schemas.thread import ThreadCreate


@pytest.mark.asyncio
async def test_create_thread_rejects_user_not_in_participants():
    user = AuthenticatedUser(user_id=uuid4(), username="alice")
    participant_1 = uuid4()
    participant_2 = uuid4()
    participants = sorted([participant_1, participant_2], key=lambda value: str(value))

    thread = ThreadCreate(
        id=uuid4(),
        ciphertext="Zm9v",  # "foo"
        iv="YmFy",  # "bar"
        participant_1=participants[0],
        participant_2=participants[1],
    )

    conn = AsyncMock()

    with pytest.raises(HTTPException) as exc:
        await create_thread(thread=thread, conn=conn, user=user)

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_create_thread_rejects_unsorted_participants():
    user_id = uuid4()
    user = AuthenticatedUser(user_id=user_id, username="alice")
    other_id = uuid4()
    sorted_participants = sorted([user_id, other_id], key=lambda value: str(value))
    unsorted_participants = list(reversed(sorted_participants))

    thread = ThreadCreate(
        id=uuid4(),
        ciphertext="Zm9v",  # "foo"
        iv="YmFy",  # "bar"
        participant_1=unsorted_participants[0],
        participant_2=unsorted_participants[1],
    )

    conn = AsyncMock()

    with pytest.raises(HTTPException) as exc:
        await create_thread(thread=thread, conn=conn, user=user)

    assert exc.value.status_code == 400
    assert exc.value.detail == "Participants must be sorted lexicographically"
