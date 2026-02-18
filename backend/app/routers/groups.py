"""
Group conversation endpoints.
"""

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_connection
from app.dependencies.auth import AuthenticatedUser, get_current_user
from app.schemas.group import (
    GroupCreateRequest,
    GroupMemberAddRequest,
    GroupMemberResponse,
    GroupResponse,
    GroupStateResponse,
)
from app.services.authorization import require_group_admin, require_group_member
from app.services.websocket import ws_manager

router = APIRouter()


@router.post("/groups", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    payload: GroupCreateRequest,
    conn=Depends(get_connection),
    user: AuthenticatedUser = Depends(get_current_user),
):
    conversation_id = uuid4()

    async with conn.transaction():
        await conn.execute(
            """
            INSERT INTO conversations (id, kind, group_name)
            VALUES ($1, 'group', $2)
            """,
            conversation_id,
            payload.name.strip(),
        )

        await conn.execute(
            """
            INSERT INTO groups (id, created_by)
            VALUES ($1, $2)
            """,
            conversation_id,
            user.user_id,
        )

        await conn.execute(
            """
            INSERT INTO conversation_participants (conversation_id, user_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            """,
            conversation_id,
            user.user_id,
        )

        await conn.execute(
            """
            INSERT INTO group_members (group_id, user_id, role)
            VALUES ($1, $2, 'owner')
            ON CONFLICT (group_id, user_id)
            DO UPDATE SET role = EXCLUDED.role, removed_at = NULL
            """,
            conversation_id,
            user.user_id,
        )

        if payload.encrypted_key_envelope:
            await conn.execute(
                """
                INSERT INTO group_key_envelopes (group_id, user_id, epoch, encrypted_key_blob)
                VALUES ($1, $2, 1, $3)
                ON CONFLICT (group_id, user_id, epoch)
                DO UPDATE SET encrypted_key_blob = EXCLUDED.encrypted_key_blob
                """,
                conversation_id,
                user.user_id,
                payload.encrypted_key_envelope,
            )

        member_ids = [member_id for member_id in payload.member_ids if member_id != user.user_id]
        for member_id in member_ids:
            await conn.execute(
                """
                INSERT INTO conversation_participants (conversation_id, user_id)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
                """,
                conversation_id,
                member_id,
            )
            await conn.execute(
                """
                INSERT INTO group_members (group_id, user_id, role)
                VALUES ($1, $2, 'member')
                ON CONFLICT (group_id, user_id)
                DO UPDATE SET role = 'member', removed_at = NULL
                """,
                conversation_id,
                member_id,
            )

    row = await conn.fetchrow(
        """
        SELECT c.id, c.created_at, c.group_name, g.key_epoch
        FROM conversations c
        JOIN groups g ON g.id = c.id
        WHERE c.id = $1
        """,
        conversation_id,
    )

    group_event = {
        "type": "group_created",
        "conversation_id": str(conversation_id),
        "group_name": row["group_name"],
        "key_epoch": row["key_epoch"],
    }
    await ws_manager.broadcast_to_conversation(str(conversation_id), group_event)

    return GroupResponse(
        id=row["id"],
        conversation_id=row["id"],
        name=row["group_name"],
        key_epoch=row["key_epoch"],
        created_at=row["created_at"],
    )


@router.post("/groups/{group_id}/members", response_model=GroupStateResponse)
async def add_group_member(
    group_id: UUID,
    payload: GroupMemberAddRequest,
    conn=Depends(get_connection),
    user: AuthenticatedUser = Depends(get_current_user),
):
    await require_group_admin(conn, group_id, user.user_id)

    async with conn.transaction():
        await conn.execute(
            """
            INSERT INTO conversation_participants (conversation_id, user_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            """,
            group_id,
            payload.user_id,
        )

        await conn.execute(
            """
            INSERT INTO group_members (group_id, user_id, role)
            VALUES ($1, $2, $3)
            ON CONFLICT (group_id, user_id)
            DO UPDATE SET role = EXCLUDED.role, removed_at = NULL
            """,
            group_id,
            payload.user_id,
            payload.role,
        )

        new_epoch = await conn.fetchval(
            "UPDATE groups SET key_epoch = key_epoch + 1 WHERE id = $1 RETURNING key_epoch",
            group_id,
        )

        if payload.encrypted_key_envelope:
            await conn.execute(
                """
                INSERT INTO group_key_envelopes (group_id, user_id, epoch, encrypted_key_blob)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (group_id, user_id, epoch)
                DO UPDATE SET encrypted_key_blob = EXCLUDED.encrypted_key_blob
                """,
                group_id,
                payload.user_id,
                new_epoch,
                payload.encrypted_key_envelope,
            )

    await ws_manager.broadcast_to_conversation(
        str(group_id),
        {
            "type": "group_member_added",
            "conversation_id": str(group_id),
            "user_id": str(payload.user_id),
            "role": payload.role,
            "key_epoch": int(new_epoch),
        },
    )
    await ws_manager.broadcast_to_conversation(
        str(group_id),
        {
            "type": "group_key_rotated",
            "conversation_id": str(group_id),
            "key_epoch": int(new_epoch),
        },
    )

    return await get_group_state(group_id, conn, user)


@router.delete("/groups/{group_id}/members/{member_id}", response_model=GroupStateResponse)
async def remove_group_member(
    group_id: UUID,
    member_id: UUID,
    conn=Depends(get_connection),
    user: AuthenticatedUser = Depends(get_current_user),
):
    await require_group_admin(conn, group_id, user.user_id)

    if member_id == user.user_id:
        owner_count = await conn.fetchval(
            """
            SELECT COUNT(*)
            FROM group_members
            WHERE group_id = $1 AND role = 'owner' AND removed_at IS NULL
            """,
            group_id,
        )
        if owner_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove the last owner",
            )

    async with conn.transaction():
        await conn.execute(
            """
            UPDATE group_members
            SET removed_at = NOW()
            WHERE group_id = $1 AND user_id = $2 AND removed_at IS NULL
            """,
            group_id,
            member_id,
        )

        await conn.execute(
            """
            DELETE FROM conversation_participants
            WHERE conversation_id = $1 AND user_id = $2
            """,
            group_id,
            member_id,
        )

        new_epoch = await conn.fetchval(
            "UPDATE groups SET key_epoch = key_epoch + 1 WHERE id = $1 RETURNING key_epoch",
            group_id,
        )

    await ws_manager.broadcast_to_conversation(
        str(group_id),
        {
            "type": "group_member_removed",
            "conversation_id": str(group_id),
            "user_id": str(member_id),
            "key_epoch": int(new_epoch),
        },
    )
    await ws_manager.broadcast_to_conversation(
        str(group_id),
        {
            "type": "group_key_rotated",
            "conversation_id": str(group_id),
            "key_epoch": int(new_epoch),
        },
    )

    return await get_group_state(group_id, conn, user)


@router.get("/groups/{group_id}/state", response_model=GroupStateResponse)
async def get_group_state(
    group_id: UUID,
    conn=Depends(get_connection),
    user: AuthenticatedUser = Depends(get_current_user),
):
    await require_group_member(conn, group_id, user.user_id)

    group_row = await conn.fetchrow(
        """
        SELECT c.id, c.group_name, g.created_by, g.key_epoch
        FROM groups g
        JOIN conversations c ON c.id = g.id
        WHERE g.id = $1
        """,
        group_id,
    )
    if not group_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    member_rows = await conn.fetch(
        """
        SELECT user_id, role, joined_at
        FROM group_members
        WHERE group_id = $1 AND removed_at IS NULL
        ORDER BY joined_at ASC
        """,
        group_id,
    )

    envelope = await conn.fetchval(
        """
        SELECT encrypted_key_blob
        FROM group_key_envelopes
        WHERE group_id = $1
          AND user_id = $2
          AND epoch = $3
        """,
        group_id,
        user.user_id,
        group_row["key_epoch"],
    )

    return GroupStateResponse(
        id=group_row["id"],
        conversation_id=group_row["id"],
        name=group_row["group_name"] or "Unnamed Group",
        created_by=group_row["created_by"],
        key_epoch=group_row["key_epoch"],
        members=[
            GroupMemberResponse(
                user_id=row["user_id"],
                role=row["role"],
                joined_at=row["joined_at"],
            )
            for row in member_rows
        ],
        my_encrypted_key_envelope=envelope,
    )
