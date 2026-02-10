from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from app.dependencies.auth import extract_ws_token
from app.routers import websocket as ws_router


class FakeConnection:
    def __init__(self, *, fetchval_side_effect=None, rows=None):
        self._fetchval_side_effect = list(fetchval_side_effect or [])
        self._rows = rows or []
        self.fetch_args = None

    async def fetchval(self, _query, *_args):
        if not self._fetchval_side_effect:
            return None
        return self._fetchval_side_effect.pop(0)

    async def fetch(self, _query, *args):
        self.fetch_args = args
        return self._rows


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

    async def send_personal(self, _websocket, message):
        self.personal.append(message)

    async def subscribe_to_thread(self, _websocket, thread_id):
        self.subscribed.append(thread_id)


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
