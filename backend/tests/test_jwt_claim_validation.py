from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.dependencies import auth as auth_deps


@pytest.mark.asyncio
async def test_get_current_user_rejects_missing_subject_claim(monkeypatch):
    request = SimpleNamespace(cookies={"access_token": "token"})

    monkeypatch.setattr(
        auth_deps.jwt,
        "decode",
        lambda *_args, **_kwargs: {"type": "access", "username": "alice"},
    )

    with pytest.raises(HTTPException) as exc:
        await auth_deps.get_current_user(request)

    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_verify_websocket_token_rejects_invalid_uuid_claim(monkeypatch):
    monkeypatch.setattr(
        auth_deps.jwt,
        "decode",
        lambda *_args, **_kwargs: {
            "type": "access",
            "sub": "not-a-uuid",
            "username": "alice",
        },
    )

    user = await auth_deps.verify_websocket_token("token")
    assert user is None
