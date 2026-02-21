from types import SimpleNamespace
from typing import Optional
from uuid import UUID, uuid4
from datetime import datetime, timezone

import pytest

from app.dependencies.auth import extract_ws_token
from app.dependencies.auth import AuthenticatedUser
from app.routers import messages as messages_router
from app.routers import websocket as ws_router
from app.security_limits import MAX_MESSAGE_CIPHERTEXT_BYTES


class FakeConnection:
    def __init__(
        self,
        *,
        fetchval_side_effect=None,
        rows=None,
        fetchrow_value=None,
        fetchrow_side_effect=None
    ):
        self._fetchval_side_effect = list(fetchval_side_effect or [])
        self._rows = rows or []
        self._fetchrow_value = fetchrow_value
        self._fetchrow_side_effect = list(fetchrow_side_effect or [])
        self.fetch_args = None
        self.execute_calls = []

    async def fetchval(self, _query, *_args):
        if not self._fetchval_side_effect:
            return None
        return self._fetchval_side_effect.pop(0)

    async def fetch(self, _query, *args):
        self.fetch_args = args
        return self._rows

    async def fetchrow(self, _query, *_args):
        if self._fetchrow_side_effect:
            return self._fetchrow_side_effect.pop(0)
        return self._fetchrow_value

    async def execute(self, _query, *_args):
        self.execute_calls.append((_query, _args))
        return "OK"


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
        self.subscribed = []
        self.subscribed_set = set()
        self.broadcasts = []
        self.user_deliveries = []
        self.user_auto_subscriptions = []
        self.forced_subscription_count: Optional[int] = None
        self.allow_messages = True

    async def send_personal(self, _websocket, message):
        self.personal.append(message)

    async def subscribe_to_conversation(self, _websocket, conversation_id):
        self.subscribed.append(conversation_id)
        self.subscribed_set.add(conversation_id)

    async def is_subscribed_to_conversation(self, _websocket, conversation_id):
        return conversation_id in self.subscribed_set

    async def unsubscribe_from_conversation(self, _websocket, _conversation_id):
        return None

    async def get_subscription_count(self, _websocket):
        if self.forced_subscription_count is not None:
            return self.forced_subscription_count
        return len(self.subscribed_set)

    async def allow_incoming_message(self, _websocket, **_kwargs):
        return self.allow_messages

    async def broadcast_to_conversation(self, conversation_id, message):
        self.broadcasts.append((conversation_id, message))

    async def subscribe_user_connections_to_conversation(
        self, user_id, conversation_id
    ):
        self.user_auto_subscriptions.append((user_id, conversation_id))

    async def send_to_user(self, user_id, message):
        self.user_deliveries.append((user_id, message))


class FakeWebSocket:
    def __init__(self, user_id: UUID):
        self.state = SimpleNamespace(user_id=user_id)


def test_extract_ws_token_cookie_only_ignores_query_param():
    websocket = SimpleNamespace(cookies={}, query_params={"token": "query-token"})
    assert extract_ws_token(websocket) is None

    cookie_websocket = SimpleNamespace(
        cookies={"access_token": "cookie-token"},
        query_params={},
    )
    assert extract_ws_token(cookie_websocket) == "cookie-token"


@pytest.mark.asyncio
async def test_handle_subscribe_blocks_non_participants(monkeypatch):
    fake_manager = FakeWsManager()
    monkeypatch.setattr(ws_router, "ws_manager", fake_manager)

    conn = FakeConnection(fetchval_side_effect=[True, False])
    pool = FakePool(conn)
    websocket = FakeWebSocket(user_id=uuid4())

    await ws_router.handle_subscribe(
        websocket,
        {"conversation_id": str(uuid4())},
        pool,
    )

    assert not fake_manager.subscribed
    assert fake_manager.personal[-1]["type"] == "error"


@pytest.mark.asyncio
async def test_handle_subscribe_user_uses_authenticated_user_id(monkeypatch):
    fake_manager = FakeWsManager()
    monkeypatch.setattr(ws_router, "ws_manager", fake_manager)

    authenticated_user_id = uuid4()
    conn = FakeConnection(
        rows=[{"conversation_id": uuid4()}, {"conversation_id": uuid4()}],
    )
    pool = FakePool(conn)
    websocket = FakeWebSocket(user_id=authenticated_user_id)

    await ws_router.handle_subscribe_user(websocket, pool)

    assert conn.fetch_args == (authenticated_user_id,)
    assert len(fake_manager.subscribed) == 2
    assert fake_manager.personal[-1] == {
        "type": "user_subscribed",
        "conversation_count": 2,
    }


@pytest.mark.asyncio
async def test_handle_subscribe_rejects_when_subscription_limit_reached(monkeypatch):
    fake_manager = FakeWsManager()
    fake_manager.forced_subscription_count = (
        ws_router.MAX_WS_SUBSCRIPTIONS_PER_CONNECTION
    )
    monkeypatch.setattr(ws_router, "ws_manager", fake_manager)

    conn = FakeConnection(fetchval_side_effect=[True, True])
    pool = FakePool(conn)
    websocket = FakeWebSocket(user_id=uuid4())

    await ws_router.handle_subscribe(
        websocket,
        {"conversation_id": str(uuid4())},
        pool,
    )

    assert fake_manager.personal[-1] == {
        "type": "error",
        "message": "subscription_limit_reached",
    }
    assert not fake_manager.subscribed


@pytest.mark.asyncio
async def test_handle_message_rejects_rate_limited_connection(monkeypatch):
    fake_manager = FakeWsManager()
    fake_manager.allow_messages = False
    monkeypatch.setattr(ws_router, "ws_manager", fake_manager)

    conn = FakeConnection()
    pool = FakePool(conn)
    websocket = FakeWebSocket(user_id=uuid4())

    await ws_router.handle_message(
        websocket,
        {
            "conversation_id": str(uuid4()),
            "ciphertext": "Zm9v",  # "foo"
            "iv": "MTIzNDU2Nzg5MDEy",  # 12 bytes
        },
        pool,
    )

    assert fake_manager.personal[-1]["type"] == "error"
    assert fake_manager.personal[-1]["code"] == "rate_limited"
    assert fake_manager.personal[-1]["message"] == "rate_limited"


@pytest.mark.asyncio
async def test_handle_message_rejects_invalid_iv_size(monkeypatch):
    fake_manager = FakeWsManager()
    monkeypatch.setattr(ws_router, "ws_manager", fake_manager)

    conn = FakeConnection()
    pool = FakePool(conn)
    websocket = FakeWebSocket(user_id=uuid4())

    await ws_router.handle_message(
        websocket,
        {
            "conversation_id": str(uuid4()),
            "ciphertext": "Zm9v",  # "foo"
            "iv": "YWJjZGVmZ2hpams=",  # "abcdefghijk" (11 bytes)
        },
        pool,
    )

    assert fake_manager.personal[-1]["type"] == "error"
    assert fake_manager.personal[-1]["code"] == "invalid_payload"
    assert fake_manager.personal[-1]["message"] == "iv must decode to exactly 12 bytes"


@pytest.mark.asyncio
async def test_handle_message_rejects_oversized_ciphertext(monkeypatch):
    fake_manager = FakeWsManager()
    monkeypatch.setattr(ws_router, "ws_manager", fake_manager)

    oversized_ciphertext = "A" * (((MAX_MESSAGE_CIPHERTEXT_BYTES + 1 + 2) // 3) * 4)
    conn = FakeConnection()
    pool = FakePool(conn)
    websocket = FakeWebSocket(user_id=uuid4())

    await ws_router.handle_message(
        websocket,
        {
            "conversation_id": str(uuid4()),
            "ciphertext": oversized_ciphertext,
            "iv": "MTIzNDU2Nzg5MDEy",
        },
        pool,
    )

    assert fake_manager.personal[-1]["type"] == "error"
    assert fake_manager.personal[-1]["code"] == "invalid_payload"
    assert fake_manager.personal[-1]["message"] == "ciphertext exceeds maximum size"


@pytest.mark.asyncio
async def test_handle_message_delivers_to_recipient_without_existing_subscription(
    monkeypatch,
):
    fake_manager = FakeWsManager()
    monkeypatch.setattr(ws_router, "ws_manager", fake_manager)

    conversation_id = uuid4()
    sender_id = uuid4()
    recipient_id = uuid4()
    persisted_message_id = uuid4()

    conn = FakeConnection(
        fetchval_side_effect=[True],
        fetchrow_value={
            "id": persisted_message_id,
            "created_at": datetime.now(timezone.utc),
            "group_epoch": None,
        },
    )
    pool = FakePool(conn)
    websocket = FakeWebSocket(user_id=sender_id)

    await ws_router.handle_message(
        websocket,
        {
            "conversation_id": str(conversation_id),
            "recipient_id": str(recipient_id),
            "client_message_id": "client-123",
            "ciphertext": "Zm9v",
            "iv": "MTIzNDU2Nzg5MDEy",
        },
        pool,
    )

    assert len(fake_manager.broadcasts) == 1
    broadcast_conversation_id, broadcast_payload = fake_manager.broadcasts[0]
    assert broadcast_conversation_id == str(conversation_id)
    assert broadcast_payload["id"] == str(persisted_message_id)
    assert broadcast_payload["conversation_id"] == str(conversation_id)
    assert broadcast_payload["sender_id"] == str(sender_id)
    assert broadcast_payload["client_message_id"] == "client-123"
    assert broadcast_payload["group_epoch"] is None

    assert len(fake_manager.personal) == 1
    assert fake_manager.personal[0]["type"] == "message_sent"
    assert fake_manager.personal[0]["id"] == str(persisted_message_id)
    assert fake_manager.personal[0]["conversation_id"] == str(conversation_id)
    assert fake_manager.personal[0]["client_message_id"] == "client-123"

    assert fake_manager.user_auto_subscriptions == [
        (str(sender_id), str(conversation_id)),
        (str(recipient_id), str(conversation_id)),
    ]
    assert fake_manager.user_deliveries == []


@pytest.mark.asyncio
async def test_create_message_rest_delivers_realtime_to_recipient(monkeypatch):
    fake_manager = FakeWsManager()
    monkeypatch.setattr(messages_router, "ws_manager", fake_manager)

    async def no_op_ensure_direct_conversation(*_args, **_kwargs):
        return None

    monkeypatch.setattr(
        messages_router,
        "ensure_direct_conversation",
        no_op_ensure_direct_conversation,
    )

    conversation_id = uuid4()
    sender_id = uuid4()
    recipient_id = uuid4()
    persisted_message_id = uuid4()
    created_at = datetime.now(timezone.utc)

    conn = FakeConnection(
        fetchrow_value={
            "id": persisted_message_id,
            "conversation_id": conversation_id,
            "sender_id": sender_id,
            "group_epoch": None,
            "ciphertext": b"foo",
            "iv": b"123456789012",
            "created_at": created_at,
        }
    )

    message = messages_router.MessageCreate(
        conversation_id=conversation_id,
        recipient_id=recipient_id,
        ciphertext="Zm9v",
        iv="MTIzNDU2Nzg5MDEy",
    )

    response = await messages_router.create_message(
        message,
        conn=conn,
        user=AuthenticatedUser(user_id=sender_id, username="sender"),
    )

    assert str(response.id) == str(persisted_message_id)
    assert str(response.conversation_id) == str(conversation_id)
    assert str(response.sender_id) == str(sender_id)
    assert response.group_epoch is None

    assert len(fake_manager.broadcasts) == 1
    broadcast_conversation_id, broadcast_payload = fake_manager.broadcasts[0]
    assert broadcast_conversation_id == str(conversation_id)
    assert broadcast_payload["id"] == str(persisted_message_id)
    assert broadcast_payload["conversation_id"] == str(conversation_id)
    assert broadcast_payload["sender_id"] == str(sender_id)
    assert broadcast_payload["group_epoch"] is None
    assert broadcast_payload["ciphertext"] == "Zm9v"
    assert broadcast_payload["iv"] == "MTIzNDU2Nzg5MDEy"

    assert fake_manager.user_auto_subscriptions == [
        (str(recipient_id), str(conversation_id))
    ]
    assert len(fake_manager.user_deliveries) == 1
    delivered_user_id, delivered_payload = fake_manager.user_deliveries[0]
    assert delivered_user_id == str(recipient_id)
    assert delivered_payload == broadcast_payload


@pytest.mark.asyncio
async def test_handle_message_rejects_invalid_group_epoch(monkeypatch):
    fake_manager = FakeWsManager()
    monkeypatch.setattr(ws_router, "ws_manager", fake_manager)

    conn = FakeConnection()
    pool = FakePool(conn)
    websocket = FakeWebSocket(user_id=uuid4())

    await ws_router.handle_message(
        websocket,
        {
            "conversation_id": str(uuid4()),
            "group_epoch": "not-an-int",
            "ciphertext": "Zm9v",
            "iv": "MTIzNDU2Nzg5MDEy",
        },
        pool,
    )

    assert fake_manager.personal[-1]["type"] == "error"
    assert fake_manager.personal[-1]["code"] == "invalid_group_epoch"


@pytest.mark.asyncio
async def test_handle_message_rejects_stale_group_epoch(monkeypatch):
    fake_manager = FakeWsManager()
    monkeypatch.setattr(ws_router, "ws_manager", fake_manager)

    conversation_id = uuid4()
    conn = FakeConnection(fetchval_side_effect=[True, "group", 3])
    pool = FakePool(conn)
    websocket = FakeWebSocket(user_id=uuid4())

    await ws_router.handle_message(
        websocket,
        {
            "conversation_id": str(conversation_id),
            "group_epoch": 2,
            "ciphertext": "Zm9v",
            "iv": "MTIzNDU2Nzg5MDEy",
        },
        pool,
    )

    assert fake_manager.personal[-1]["type"] == "error"
    assert fake_manager.personal[-1]["code"] == "stale_group_epoch"


@pytest.mark.asyncio
async def test_handle_message_accepts_group_epoch_and_broadcasts(monkeypatch):
    fake_manager = FakeWsManager()
    monkeypatch.setattr(ws_router, "ws_manager", fake_manager)

    conversation_id = uuid4()
    persisted_message_id = uuid4()
    conn = FakeConnection(
        fetchval_side_effect=[True, "group", 4],
        fetchrow_value={
            "id": persisted_message_id,
            "created_at": datetime.now(timezone.utc),
            "group_epoch": 4,
        },
    )
    pool = FakePool(conn)
    websocket = FakeWebSocket(user_id=uuid4())

    await ws_router.handle_message(
        websocket,
        {
            "conversation_id": str(conversation_id),
            "group_epoch": 4,
            "client_message_id": "c-1",
            "ciphertext": "Zm9v",
            "iv": "MTIzNDU2Nzg5MDEy",
        },
        pool,
    )

    assert len(fake_manager.broadcasts) == 1
    _, broadcast_payload = fake_manager.broadcasts[0]
    assert broadcast_payload["id"] == str(persisted_message_id)
    assert broadcast_payload["group_epoch"] == 4


@pytest.mark.asyncio
async def test_handle_message_seen_marks_seen_and_broadcasts(monkeypatch):
    fake_manager = FakeWsManager()
    monkeypatch.setattr(ws_router, "ws_manager", fake_manager)

    conversation_id = uuid4()
    message_id = uuid4()
    sender_id = uuid4()
    recipient_id = uuid4()
    seen_at = datetime.now(timezone.utc)

    conn = FakeConnection(
        fetchrow_side_effect=[
            {"id": message_id, "sender_id": sender_id, "expires_after_seen_sec": 30},
            {"seen_at": seen_at},
            {"seen_count": 1, "total_recipients": 1, "all_recipients_seen": True},
        ],
        fetchval_side_effect=[True, True, True, None],
    )
    pool = FakePool(conn)
    websocket = FakeWebSocket(user_id=recipient_id)

    await ws_router.handle_message_seen(
        websocket,
        {
            "conversation_id": str(conversation_id),
            "message_id": str(message_id),
        },
        pool,
    )

    assert len(fake_manager.broadcasts) == 1
    _, payload = fake_manager.broadcasts[0]
    assert payload["type"] == "message_seen"
    assert payload["message_id"] == str(message_id)
    assert payload["seen_by"] == str(recipient_id)
    assert payload["seen_count"] == 1
    assert payload["total_recipients"] == 1
    assert payload["all_recipients_seen"] is True
    assert len(fake_manager.user_deliveries) == 1
    delivered_user_id, delivered_payload = fake_manager.user_deliveries[0]
    assert delivered_user_id == str(sender_id)
    assert delivered_payload["type"] == "message_seen"
    assert delivered_payload["message_id"] == str(message_id)


@pytest.mark.asyncio
async def test_handle_message_seen_rejects_sender_self_seen(monkeypatch):
    fake_manager = FakeWsManager()
    monkeypatch.setattr(ws_router, "ws_manager", fake_manager)

    conversation_id = uuid4()
    message_id = uuid4()
    sender_id = uuid4()

    conn = FakeConnection(
        fetchrow_side_effect=[
            {"id": message_id, "sender_id": sender_id, "expires_after_seen_sec": None},
        ],
        fetchval_side_effect=[True, True],
    )
    pool = FakePool(conn)
    websocket = FakeWebSocket(user_id=sender_id)

    await ws_router.handle_message_seen(
        websocket,
        {
            "conversation_id": str(conversation_id),
            "message_id": str(message_id),
        },
        pool,
    )

    assert fake_manager.personal[-1]["type"] == "error"
    assert fake_manager.personal[-1]["code"] == "invalid_seen_actor"
