import base64
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.dependencies.auth import AuthenticatedUser
from app.routers.messages import create_message
from app.schemas.message import MessageCreate
from app.security_limits import (
    MAX_MESSAGE_CIPHERTEXT_B64_CHARS,
)

VALID_IV_B64 = base64.b64encode(b"123456789012").decode("ascii")
INVALID_IV_11_BYTES_B64 = base64.b64encode(b"abcdefghijk").decode("ascii")


@pytest.mark.asyncio
async def test_create_message_rejects_invalid_base64_ciphertext():
    user = AuthenticatedUser(user_id=uuid4(), username="alice")
    conn = AsyncMock()
    message = MessageCreate(
        conversation_id=uuid4(),
        ciphertext="@@@@",
        iv=VALID_IV_B64,
    )

    with pytest.raises(HTTPException) as exc:
        await create_message(message=message, conn=conn, user=user)

    assert exc.value.status_code == 400
    assert exc.value.detail == "ciphertext is not valid base64"


@pytest.mark.asyncio
async def test_create_message_rejects_invalid_iv_length():
    user = AuthenticatedUser(user_id=uuid4(), username="alice")
    conn = AsyncMock()
    message = MessageCreate(
        conversation_id=uuid4(),
        ciphertext=base64.b64encode(b"hello").decode("ascii"),
        iv=INVALID_IV_11_BYTES_B64,
    )

    with pytest.raises(HTTPException) as exc:
        await create_message(message=message, conn=conn, user=user)

    assert exc.value.status_code == 400
    assert exc.value.detail == "iv must decode to exactly 12 bytes"


def test_message_schema_enforces_ciphertext_length_cap():
    too_long_ciphertext = "A" * (MAX_MESSAGE_CIPHERTEXT_B64_CHARS + 1)

    with pytest.raises(ValidationError):
        MessageCreate(
            conversation_id=uuid4(),
            ciphertext=too_long_ciphertext,
            iv=VALID_IV_B64,
        )


def test_message_schema_rejects_invalid_group_epoch_low():
    with pytest.raises(ValidationError):
        MessageCreate(
            conversation_id=uuid4(),
            group_epoch=0,
            ciphertext=base64.b64encode(b"hello").decode("ascii"),
            iv=VALID_IV_B64,
        )


def test_message_schema_accepts_valid_group_epoch():
    message = MessageCreate(
        conversation_id=uuid4(),
        group_epoch=7,
        ciphertext=base64.b64encode(b"hello").decode("ascii"),
        iv=VALID_IV_B64,
    )
    assert message.group_epoch == 7


def test_message_schema_accepts_valid_expires_after_seen():
    message = MessageCreate(
        conversation_id=uuid4(),
        expires_after_seen_sec=30,
        ciphertext=base64.b64encode(b"hello").decode("ascii"),
        iv=VALID_IV_B64,
    )
    assert message.expires_after_seen_sec == 30


def test_message_schema_rejects_invalid_expires_after_seen():
    with pytest.raises(ValidationError):
        MessageCreate(
            conversation_id=uuid4(),
            expires_after_seen_sec=20,
            ciphertext=base64.b64encode(b"hello").decode("ascii"),
            iv=VALID_IV_B64,
        )
