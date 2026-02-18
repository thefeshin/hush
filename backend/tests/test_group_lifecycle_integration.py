from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from app.dependencies.auth import AuthenticatedUser
from app.routers import groups as groups_router
from app.routers import websocket as ws_router


class FakeTransaction:
    async def __aenter__(self):
        return self

    async def __aexit__(self, _exc_type, _exc, _tb):
        return False


class StatefulConn:
    def __init__(self):
        self.conversations = {}
        self.groups = {}
        self.conversation_participants = set()
        self.group_members = {}
        self.group_key_envelopes = {}
        self.messages = {}

    def transaction(self):
        return FakeTransaction()

    async def execute(self, query, *args):
        normalized = " ".join(query.lower().split())

        if "insert into conversations" in normalized and "kind" in normalized:
            conversation_id, group_name = args
            self.conversations[conversation_id] = {
                "id": conversation_id,
                "kind": "group",
                "group_name": group_name,
                "created_at": datetime.now(timezone.utc),
            }
            return "INSERT 0 1"

        if "insert into groups" in normalized:
            group_id, created_by = args
            self.groups[group_id] = {
                "id": group_id,
                "created_by": created_by,
                "key_epoch": 1,
                "created_at": datetime.now(timezone.utc),
            }
            return "INSERT 0 1"

        if "insert into conversation_participants" in normalized:
            conversation_id, user_id = args
            self.conversation_participants.add((conversation_id, user_id))
            return "INSERT 0 1"

        if "insert into group_members" in normalized:
            group_id, user_id = args[0], args[1]
            if len(args) == 2:
                role = "owner"
            else:
                role = args[2]
            existing = self.group_members.get((group_id, user_id))
            joined_at = existing["joined_at"] if existing else datetime.now(timezone.utc)
            self.group_members[(group_id, user_id)] = {
                "role": role,
                "joined_at": joined_at,
                "removed_at": None,
            }
            return "INSERT 0 1"

        if "insert into group_key_envelopes" in normalized:
            if len(args) == 3:
                group_id, user_id, encrypted_key_blob = args
                epoch = 1
            else:
                group_id, user_id, epoch, encrypted_key_blob = args
            self.group_key_envelopes[(group_id, user_id, int(epoch))] = encrypted_key_blob
            return "INSERT 0 1"

        if "update group_members" in normalized and "set removed_at = now()" in normalized:
            group_id, user_id = args
            key = (group_id, user_id)
            if key in self.group_members:
                self.group_members[key]["removed_at"] = datetime.now(timezone.utc)
            return "UPDATE 1"

        if "delete from conversation_participants" in normalized:
            conversation_id, user_id = args
            self.conversation_participants.discard((conversation_id, user_id))
            return "DELETE 1"

        return "OK"

    async def fetchrow(self, query, *args):
        normalized = " ".join(query.lower().split())

        if "select c.id, c.created_at, c.group_name, g.key_epoch" in normalized:
            conversation_id = args[0]
            conversation = self.conversations[conversation_id]
            group = self.groups[conversation_id]
            return {
                "id": conversation_id,
                "created_at": conversation["created_at"],
                "group_name": conversation["group_name"],
                "key_epoch": group["key_epoch"],
            }

        if "select c.id, c.group_name, g.created_by, g.key_epoch" in normalized:
            group_id = args[0]
            if group_id not in self.groups:
                return None
            conversation = self.conversations[group_id]
            group = self.groups[group_id]
            return {
                "id": group_id,
                "group_name": conversation["group_name"],
                "created_by": group["created_by"],
                "key_epoch": group["key_epoch"],
            }

        if "insert into messages" in normalized and "returning id, created_at, group_epoch" in normalized:
            conversation_id, sender_id, ciphertext, iv, group_epoch = args
            message_id = uuid4()
            created_at = datetime.now(timezone.utc)
            self.messages[message_id] = {
                "id": message_id,
                "conversation_id": conversation_id,
                "sender_id": sender_id,
                "ciphertext": ciphertext,
                "iv": iv,
                "group_epoch": group_epoch,
                "created_at": created_at,
            }
            return {
                "id": message_id,
                "created_at": created_at,
                "group_epoch": group_epoch,
            }

        return None

    async def fetch(self, query, *args):
        normalized = " ".join(query.lower().split())

        if "select user_id, role, joined_at from group_members" in normalized:
            group_id = args[0]
            rows = []
            for (row_group_id, user_id), member in self.group_members.items():
                if row_group_id != group_id:
                    continue
                if member["removed_at"] is not None:
                    continue
                rows.append(
                    {
                        "user_id": user_id,
                        "role": member["role"],
                        "joined_at": member["joined_at"],
                    }
                )
            rows.sort(key=lambda row: row["joined_at"])
            return rows

        return []

    async def fetchval(self, query, *args):
        normalized = " ".join(query.lower().split())

        if "select exists(select 1 from groups where id = $1)" in normalized:
            return args[0] in self.groups

        if "select exists(select 1 from conversations where id = $1)" in normalized:
            return args[0] in self.conversations

        if "select exists( select 1 from group_members" in normalized:
            group_id, user_id = args
            member = self.group_members.get((group_id, user_id))
            return bool(member and member["removed_at"] is None)

        if "select role from group_members" in normalized:
            group_id, user_id = args
            member = self.group_members.get((group_id, user_id))
            if not member or member["removed_at"] is not None:
                return None
            return member["role"]

        if "update groups set key_epoch = key_epoch + 1" in normalized:
            group_id = args[0]
            self.groups[group_id]["key_epoch"] += 1
            return self.groups[group_id]["key_epoch"]

        if "select count(*)" in normalized and "from group_members" in normalized:
            group_id = args[0]
            owners = [
                1
                for (row_group_id, _user_id), member in self.group_members.items()
                if row_group_id == group_id and member["role"] == "owner" and member["removed_at"] is None
            ]
            return len(owners)

        if "select encrypted_key_blob" in normalized:
            group_id, user_id, epoch = args
            return self.group_key_envelopes.get((group_id, user_id, int(epoch)))

        if "select exists( select 1 from conversation_participants" in normalized:
            conversation_id, user_id = args
            return (conversation_id, user_id) in self.conversation_participants

        if "select kind from conversations where id = $1" in normalized:
            conversation_id = args[0]
            conversation = self.conversations.get(conversation_id)
            return conversation["kind"] if conversation else None

        if "select key_epoch from groups where id = $1" in normalized:
            group_id = args[0]
            group = self.groups.get(group_id)
            return group["key_epoch"] if group else None

        return None


class FakeAcquire:
    def __init__(self, conn):
        self.conn = conn

    async def __aenter__(self):
        return self.conn

    async def __aexit__(self, _exc_type, _exc, _tb):
        return False


class FakePool:
    def __init__(self, conn):
        self.conn = conn

    def acquire(self):
        return FakeAcquire(self.conn)


class FakeWsManager:
    def __init__(self):
        self.personal = []
        self.broadcasts = []
        self.user_deliveries = []
        self.user_auto_subscriptions = []

    async def send_personal(self, _websocket, message):
        self.personal.append(message)

    async def broadcast_to_conversation(self, conversation_id, message):
        self.broadcasts.append((conversation_id, message))

    async def subscribe_user_connections_to_conversation(self, user_id, conversation_id):
        self.user_auto_subscriptions.append((user_id, conversation_id))

    async def send_to_user(self, user_id, message):
        self.user_deliveries.append((user_id, message))

    async def allow_incoming_message(self, _websocket, **_kwargs):
        return True


class FakeWebSocket:
    def __init__(self, user_id: UUID):
        self.state = SimpleNamespace(user_id=user_id)


@pytest.mark.asyncio
async def test_group_lifecycle_message_epoch_enforcement(monkeypatch):
    conn = StatefulConn()
    pool = FakePool(conn)
    ws_manager = FakeWsManager()

    monkeypatch.setattr(groups_router, "ws_manager", ws_manager)
    monkeypatch.setattr(ws_router, "ws_manager", ws_manager)

    owner_id = uuid4()
    member_one_id = uuid4()
    member_two_id = uuid4()

    owner = AuthenticatedUser(user_id=owner_id, username="owner")

    create_response = await groups_router.create_group(
        groups_router.GroupCreateRequest(
            name="Blue Team",
            member_ids=[member_one_id],
            encrypted_key_envelope="owner-envelope-v1",
        ),
        conn=conn,
        user=owner,
    )
    group_id = create_response.id

    assert conn.groups[group_id]["key_epoch"] == 1

    await groups_router.add_group_member(
        group_id,
        groups_router.GroupMemberAddRequest(
            user_id=member_two_id,
            role="member",
            encrypted_key_envelope="member-two-envelope-v2",
        ),
        conn=conn,
        user=owner,
    )
    assert conn.groups[group_id]["key_epoch"] == 2

    websocket_owner = FakeWebSocket(owner_id)
    await ws_router.handle_message(
        websocket_owner,
        {
            "conversation_id": str(group_id),
            "group_epoch": 2,
            "client_message_id": "epoch-2-ok",
            "ciphertext": "Zm9v",
            "iv": "MTIzNDU2Nzg5MDEy",
        },
        pool,
    )
    assert any(
        msg.get("type") == "message_sent" and msg.get("client_message_id") == "epoch-2-ok"
        for msg in ws_manager.personal
    )

    await groups_router.remove_group_member(
        group_id,
        member_one_id,
        conn=conn,
        user=owner,
    )
    assert conn.groups[group_id]["key_epoch"] == 3

    await ws_router.handle_message(
        websocket_owner,
        {
            "conversation_id": str(group_id),
            "group_epoch": 2,
            "client_message_id": "epoch-2-stale",
            "ciphertext": "Zm9v",
            "iv": "MTIzNDU2Nzg5MDEy",
        },
        pool,
    )
    assert any(
        msg.get("type") == "error" and msg.get("code") == "stale_group_epoch"
        and msg.get("client_message_id") == "epoch-2-stale"
        for msg in ws_manager.personal
    )

    await ws_router.handle_message(
        websocket_owner,
        {
            "conversation_id": str(group_id),
            "group_epoch": 3,
            "client_message_id": "epoch-3-ok",
            "ciphertext": "Zm9v",
            "iv": "MTIzNDU2Nzg5MDEy",
        },
        pool,
    )
    assert any(
        msg.get("type") == "message_sent" and msg.get("client_message_id") == "epoch-3-ok"
        for msg in ws_manager.personal
    )

    # Removed member should no longer be an active participant and cannot fetch group state.
    with pytest.raises(HTTPException) as exc:
        await groups_router.get_group_state(
            group_id,
            conn=conn,
            user=AuthenticatedUser(user_id=member_one_id, username="removed"),
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_removed_member_cannot_send_group_message_over_websocket(monkeypatch):
    conn = StatefulConn()
    pool = FakePool(conn)
    ws_manager = FakeWsManager()

    monkeypatch.setattr(groups_router, "ws_manager", ws_manager)
    monkeypatch.setattr(ws_router, "ws_manager", ws_manager)

    owner_id = uuid4()
    removed_member_id = uuid4()
    owner = AuthenticatedUser(user_id=owner_id, username="owner")

    create_response = await groups_router.create_group(
        groups_router.GroupCreateRequest(
            name="Purple Team",
            member_ids=[removed_member_id],
            encrypted_key_envelope="owner-envelope-v1",
        ),
        conn=conn,
        user=owner,
    )
    group_id = create_response.id

    await groups_router.remove_group_member(
        group_id,
        removed_member_id,
        conn=conn,
        user=owner,
    )

    websocket_removed = FakeWebSocket(removed_member_id)
    await ws_router.handle_message(
        websocket_removed,
        {
            "conversation_id": str(group_id),
            "group_epoch": conn.groups[group_id]["key_epoch"],
            "client_message_id": "removed-member-send",
            "ciphertext": "Zm9v",
            "iv": "MTIzNDU2Nzg5MDEy",
        },
        pool,
    )

    assert any(
        msg.get("type") == "error"
        and msg.get("code") == "forbidden"
        and msg.get("client_message_id") == "removed-member-send"
        for msg in ws_manager.personal
    )

    assert not any(
        payload.get("client_message_id") == "removed-member-send"
        for _conversation_id, payload in ws_manager.broadcasts
    )
