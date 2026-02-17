from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.services.authorization import require_group_admin, require_group_member


@pytest.mark.asyncio
async def test_require_group_member_returns_404_when_group_missing():
    conn = AsyncMock()
    # group exists check -> False
    conn.fetchval = AsyncMock(side_effect=[False])

    with pytest.raises(HTTPException) as exc:
        await require_group_member(conn, uuid4(), uuid4())

    assert exc.value.status_code == 404
    assert exc.value.detail == "Group not found"


@pytest.mark.asyncio
async def test_require_group_member_returns_403_for_non_member():
    conn = AsyncMock()
    # group exists -> True, membership exists -> False
    conn.fetchval = AsyncMock(side_effect=[True, False])

    with pytest.raises(HTTPException) as exc:
        await require_group_member(conn, uuid4(), uuid4())

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_require_group_admin_returns_403_for_non_admin_member():
    conn = AsyncMock()
    # require_group_member path: exists True, member True
    # then role query => member
    conn.fetchval = AsyncMock(side_effect=[True, True, "member"])

    with pytest.raises(HTTPException) as exc:
        await require_group_admin(conn, uuid4(), uuid4())

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_require_group_admin_allows_admin_role():
    conn = AsyncMock()
    # require_group_member path: exists True, member True
    # then role query => admin
    conn.fetchval = AsyncMock(side_effect=[True, True, "admin"])

    await require_group_admin(conn, uuid4(), uuid4())


@pytest.mark.asyncio
async def test_require_group_admin_allows_owner_role():
    conn = AsyncMock()
    # require_group_member path: exists True, member True
    # then role query => owner
    conn.fetchval = AsyncMock(side_effect=[True, True, "owner"])

    await require_group_admin(conn, uuid4(), uuid4())
