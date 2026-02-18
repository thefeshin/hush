from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.services import message_expiry


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


class FakeConn:
    def __init__(self, recipient_rows, sender_rows, delete_result="DELETE 0"):
        self._recipient_rows = recipient_rows
        self._sender_rows = sender_rows
        self._delete_result = delete_result
        self.fetch_calls = []
        self.execute_calls = []

    async def fetch(self, query, *_args):
        self.fetch_calls.append(query)
        normalized = " ".join(query.lower().split())
        if "mus.is_sender = false" in normalized:
            return self._recipient_rows
        if "mus.is_sender = true" in normalized:
            return self._sender_rows
        return []

    async def execute(self, query, *_args):
        self.execute_calls.append(query)
        return self._delete_result


class FakeWsManager:
    def __init__(self):
        self.user_messages = []

    async def send_to_user(self, user_id, message):
        self.user_messages.append((user_id, message))


@pytest.mark.asyncio
async def test_process_due_message_expiry_marks_recipient_and_sender_and_hard_deletes(monkeypatch):
    recipient_user = uuid4()
    sender_user = uuid4()
    conversation_id = uuid4()
    message_id = uuid4()

    conn = FakeConn(
        recipient_rows=[
            {
                "message_id": message_id,
                "user_id": recipient_user,
                "conversation_id": conversation_id,
            }
        ],
        sender_rows=[
            {
                "message_id": message_id,
                "sender_id": sender_user,
                "conversation_id": conversation_id,
            }
        ],
        delete_result="DELETE 1",
    )

    fake_ws = FakeWsManager()
    counters = {}

    def fake_increment_counter(name, value=1):
        counters[name] = counters.get(name, 0) + value

    async def fake_get_pool():
        return FakePool(conn)

    monkeypatch.setattr(message_expiry, "get_pool", fake_get_pool)
    monkeypatch.setattr(message_expiry, "ws_manager", fake_ws)
    monkeypatch.setattr(message_expiry, "increment_counter", fake_increment_counter)

    await message_expiry.process_due_message_expiry()

    assert len(fake_ws.user_messages) == 2
    assert fake_ws.user_messages[0][0] == str(recipient_user)
    assert fake_ws.user_messages[0][1]["type"] == "message_deleted_for_user"
    assert fake_ws.user_messages[1][0] == str(sender_user)
    assert fake_ws.user_messages[1][1]["type"] == "message_deleted_for_sender"

    assert counters["messages_expired_recipient_total"] == 1
    assert counters["messages_expired_sender_total"] == 1
    assert counters["messages_deleted_hard_total"] == 1

    sender_query = "\n".join(conn.fetch_calls)
    assert "mus.is_sender = TRUE" in sender_query or "mus.is_sender = true" in sender_query


@pytest.mark.asyncio
async def test_process_due_message_expiry_noop_when_nothing_due(monkeypatch):
    conn = FakeConn(recipient_rows=[], sender_rows=[], delete_result="DELETE 0")
    fake_ws = FakeWsManager()
    counters = {}

    def fake_increment_counter(name, value=1):
        counters[name] = counters.get(name, 0) + value

    async def fake_get_pool():
        return FakePool(conn)

    monkeypatch.setattr(message_expiry, "get_pool", fake_get_pool)
    monkeypatch.setattr(message_expiry, "ws_manager", fake_ws)
    monkeypatch.setattr(message_expiry, "increment_counter", fake_increment_counter)

    await message_expiry.process_due_message_expiry()

    assert fake_ws.user_messages == []
    assert counters == {}
