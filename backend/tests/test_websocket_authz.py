from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from app.dependencies.auth import extract_ws_token
from app.routers import websocket as ws_router
from app.security_limits import MAX_MESSAGE_CIPHERTEXT_BYTES


class FakeConnection:
    def __init__(self, *, fetchval_side_effect=None, rows=None, fetchrow_value=None):
        self._fetchval_side_effect = list(fetchval_side_effect or [])
        self._rows = rows or []
        self._fetchrow_value = fetchrow_value
        self.fetch_args = None

    async def fetchval(self, _query, *_args):
        if not self._fetchval_side_effect:
            return None
        return self._fetchval_side_effect.pop(0)

    async def fetch(self, _query, *args):
        self.fetch_args = args
        return self._rows

    async def fetchrow(self, _query, *_args):
        return self._fetchrow_value


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
        self.forced_subscription_count = None
        self.allow_messages = True

    async def send_personal(self, _websocket, message):
        self.personal.append(message)

    async def subscribe_to_thread(self, _websocket, thread_id):
        self.subscribed.append(thread_id)
        self.subscribed_set.add(thread_id)

    async def is_subscribed_to_thread(self, _websocket, thread_id):
        return thread_id in self.subscribed_set

    async def get_subscription_count(self, _websocket):
        if self.forced_subscription_count is not None:
            return self.forced_subscription_count
        return len(self.subscribed_set)

    async def allow_incoming_message(self, _websocket, **_kwargs):
        return self.allow_messages


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

    conn = FakeConnection(fetchval_side_effect=[True, False])  # thread exists, not participant
    pool = FakePool(conn)
    websocket = FakeWebSocket(user_id=uuid4())

    await ws_router.handle_subscribe(
        websocket,
        {"thread_id": str(uuid4())},
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
        rows=[{"thread_id": uuid4()}, {"thread_id": uuid4()}],
    )
    pool = FakePool(conn)
    websocket = FakeWebSocket(user_id=authenticated_user_id)

    await ws_router.handle_subscribe_user(websocket, pool)

    assert conn.fetch_args == (authenticated_user_id, authenticated_user_id)
    assert len(fake_manager.subscribed) == 2
    assert fake_manager.personal[-1] == {"type": "user_subscribed", "thread_count": 2}


@pytest.mark.asyncio
async def test_handle_subscribe_rejects_when_subscription_limit_reached(monkeypatch):
    fake_manager = FakeWsManager()
    fake_manager.forced_subscription_count = ws_router.MAX_WS_SUBSCRIPTIONS_PER_CONNECTION
    monkeypatch.setattr(ws_router, "ws_manager", fake_manager)

    conn = FakeConnection(fetchval_side_effect=[True, True])
    pool = FakePool(conn)
    websocket = FakeWebSocket(user_id=uuid4())

    await ws_router.handle_subscribe(
        websocket,
        {"thread_id": str(uuid4())},
        pool,
    )

    assert fake_manager.personal[-1] == {"type": "error", "message": "subscription_limit_reached"}
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
            "thread_id": str(uuid4()),
            "ciphertext": "Zm9v",  # "foo"
            "iv": "MTIzNDU2Nzg5MDEy",  # 12 bytes
        },
        pool,
    )

    assert fake_manager.personal[-1] == {"type": "error", "message": "rate_limited"}


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
            "thread_id": str(uuid4()),
            "ciphertext": "Zm9v",  # "foo"
            "iv": "YWJjZGVmZ2hpams=",  # "abcdefghijk" (11 bytes)
        },
        pool,
    )

    assert fake_manager.personal[-1] == {
        "type": "error",
        "message": "iv must decode to exactly 12 bytes",
    }


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
            "thread_id": str(uuid4()),
            "ciphertext": oversized_ciphertext,
            "iv": "MTIzNDU2Nzg5MDEy",
        },
        pool,
    )

    assert fake_manager.personal[-1] == {
        "type": "error",
        "message": "ciphertext exceeds maximum size",
    }
