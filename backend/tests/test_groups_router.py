from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.dependencies.auth import AuthenticatedUser
from app.routers import groups as groups_router
from app.schemas.group import GroupStateResponse


class FakeTransaction:
    async def __aenter__(self):
        return self

    async def __aexit__(self, _exc_type, _exc, _tb):
        return False


class FakeWsManager:
    def __init__(self):
        self.broadcasts = []

    async def broadcast_to_conversation(self, conversation_id, message):
        self.broadcasts.append((conversation_id, message))


def make_conn():
    return SimpleNamespace(
        transaction=lambda: FakeTransaction(),
        execute=AsyncMock(return_value="OK"),
        fetchrow=AsyncMock(return_value=None),
        fetch=AsyncMock(return_value=[]),
        fetchval=AsyncMock(return_value=None),
    )


def make_user(user_id=None):
    return AuthenticatedUser(user_id=user_id or uuid4(), username="alice")


@pytest.mark.asyncio
async def test_create_group_inserts_conversation_and_members_and_broadcasts(monkeypatch):
    fake_manager = FakeWsManager()
    monkeypatch.setattr(groups_router, "ws_manager", fake_manager)

    conversation_id = uuid4()
    member_a = uuid4()
    member_b = uuid4()
    created_at = datetime.now(timezone.utc)

    monkeypatch.setattr(groups_router, "uuid4", lambda: conversation_id)

    conn = make_conn()
    conn.fetchrow = AsyncMock(return_value={
        "id": conversation_id,
        "created_at": created_at,
        "group_name": "Ops Team",
        "key_epoch": 1,
    })

    payload = groups_router.GroupCreateRequest(
        name=" Ops Team ",
        member_ids=[member_a, member_b],
        encrypted_key_envelope="owner-envelope",
    )
    user = make_user()

    response = await groups_router.create_group(payload, conn=conn, user=user)

    assert str(response.id) == str(conversation_id)
    assert response.name == "Ops Team"
    assert response.key_epoch == 1

    executed = [call.args[0] for call in conn.execute.call_args_list]
    assert any("INSERT INTO conversations" in query for query in executed)
    assert any("INSERT INTO groups" in query for query in executed)
    assert any("INSERT INTO group_members" in query for query in executed)
    assert any("INSERT INTO group_key_envelopes" in query for query in executed)

    assert len(fake_manager.broadcasts) == 1
    _, event = fake_manager.broadcasts[0]
    assert event["type"] == "group_created"
    assert event["conversation_id"] == str(conversation_id)


@pytest.mark.asyncio
async def test_create_group_does_not_duplicate_creator_member_row(monkeypatch):
    fake_manager = FakeWsManager()
    monkeypatch.setattr(groups_router, "ws_manager", fake_manager)

    conversation_id = uuid4()
    monkeypatch.setattr(groups_router, "uuid4", lambda: conversation_id)

    conn = make_conn()
    conn.fetchrow = AsyncMock(return_value={
        "id": conversation_id,
        "created_at": datetime.now(timezone.utc),
        "group_name": "Core",
        "key_epoch": 1,
    })

    user = make_user()
    payload = groups_router.GroupCreateRequest(name="Core", member_ids=[user.user_id])

    await groups_router.create_group(payload, conn=conn, user=user)

    participant_inserts = [
        call.args for call in conn.execute.call_args_list
        if "INSERT INTO conversation_participants" in call.args[0]
    ]
    # One participant insert for creator only; no duplicate pass through member list.
    creator_inserts = [args for args in participant_inserts if args[2] == user.user_id]
    assert len(creator_inserts) == 1


@pytest.mark.asyncio
async def test_add_group_member_rotates_epoch_and_broadcasts_events(monkeypatch):
    fake_manager = FakeWsManager()
    monkeypatch.setattr(groups_router, "ws_manager", fake_manager)

    async def fake_require_group_admin(_conn, _group_id, _user_id):
        return None

    async def fake_get_group_state(group_id, conn, user):
        return GroupStateResponse(
            id=group_id,
            conversation_id=group_id,
            name="Ops",
            created_by=user.user_id,
            key_epoch=5,
            members=[],
            my_encrypted_key_envelope=None,
        )

    monkeypatch.setattr(groups_router, "require_group_admin", fake_require_group_admin)
    monkeypatch.setattr(groups_router, "get_group_state", fake_get_group_state)

    group_id = uuid4()
    member_id = uuid4()

    conn = make_conn()
    conn.fetchval = AsyncMock(return_value=5)

    user = make_user()
    payload = groups_router.GroupMemberAddRequest(
        user_id=member_id,
        role="member",
        encrypted_key_envelope="member-envelope",
    )

    result = await groups_router.add_group_member(group_id, payload, conn=conn, user=user)

    assert isinstance(result, GroupStateResponse)
    assert result.key_epoch == 5

    assert len(fake_manager.broadcasts) == 2
    assert fake_manager.broadcasts[0][1]["type"] == "group_member_added"
    assert fake_manager.broadcasts[1][1]["type"] == "group_key_rotated"
    assert fake_manager.broadcasts[1][1]["key_epoch"] == 5


@pytest.mark.asyncio
async def test_remove_group_member_rejects_last_owner(monkeypatch):
    async def fake_require_group_admin(_conn, _group_id, _user_id):
        return None

    monkeypatch.setattr(groups_router, "require_group_admin", fake_require_group_admin)

    group_id = uuid4()
    user = make_user()

    conn = make_conn()
    conn.fetchval = AsyncMock(return_value=1)

    with pytest.raises(HTTPException) as exc:
        await groups_router.remove_group_member(group_id, user.user_id, conn=conn, user=user)

    assert exc.value.status_code == 400
    assert "last owner" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_remove_group_member_rotates_epoch_and_broadcasts(monkeypatch):
    fake_manager = FakeWsManager()
    monkeypatch.setattr(groups_router, "ws_manager", fake_manager)

    async def fake_require_group_admin(_conn, _group_id, _user_id):
        return None

    async def fake_get_group_state(group_id, conn, user):
        return GroupStateResponse(
            id=group_id,
            conversation_id=group_id,
            name="Ops",
            created_by=user.user_id,
            key_epoch=9,
            members=[],
            my_encrypted_key_envelope=None,
        )

    monkeypatch.setattr(groups_router, "require_group_admin", fake_require_group_admin)
    monkeypatch.setattr(groups_router, "get_group_state", fake_get_group_state)

    group_id = uuid4()
    member_id = uuid4()
    user = make_user()

    conn = make_conn()
    conn.fetchval = AsyncMock(return_value=9)

    result = await groups_router.remove_group_member(group_id, member_id, conn=conn, user=user)

    assert result.key_epoch == 9
    assert len(fake_manager.broadcasts) == 2
    assert fake_manager.broadcasts[0][1]["type"] == "group_member_removed"
    assert fake_manager.broadcasts[1][1]["type"] == "group_key_rotated"
    assert fake_manager.broadcasts[1][1]["key_epoch"] == 9


@pytest.mark.asyncio
async def test_get_group_state_requires_membership(monkeypatch):
    async def fake_require_group_member(_conn, _group_id, _user_id):
        raise HTTPException(status_code=403, detail="Forbidden")

    monkeypatch.setattr(groups_router, "require_group_member", fake_require_group_member)

    conn = make_conn()
    user = make_user()

    with pytest.raises(HTTPException) as exc:
        await groups_router.get_group_state(uuid4(), conn=conn, user=user)

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_get_group_state_returns_envelope_for_current_epoch(monkeypatch):
    async def fake_require_group_member(_conn, _group_id, _user_id):
        return None

    monkeypatch.setattr(groups_router, "require_group_member", fake_require_group_member)

    group_id = uuid4()
    user = make_user()

    conn = make_conn()
    conn.fetchrow = AsyncMock(return_value={
        "id": group_id,
        "group_name": "Platform",
        "created_by": user.user_id,
        "key_epoch": 4,
    })
    conn.fetch = AsyncMock(return_value=[
        {
            "user_id": user.user_id,
            "role": "owner",
            "joined_at": datetime.now(timezone.utc),
        },
    ])
    conn.fetchval = AsyncMock(return_value="encrypted-envelope-v4")

    response = await groups_router.get_group_state(group_id, conn=conn, user=user)

    assert response.key_epoch == 4
    assert response.my_encrypted_key_envelope == "encrypted-envelope-v4"
    assert len(response.members) == 1
    assert str(response.members[0].user_id) == str(user.user_id)
