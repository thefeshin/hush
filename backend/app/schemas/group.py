"""
Group schemas.
"""

from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


GroupRole = Literal["owner", "admin", "member"]


class GroupCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    member_ids: List[UUID] = Field(default_factory=list, max_length=250)
    encrypted_key_envelope: Optional[str] = Field(default=None, max_length=10000)


class GroupMemberAddRequest(BaseModel):
    user_id: UUID
    role: GroupRole = "member"
    encrypted_key_envelope: Optional[str] = Field(default=None, max_length=10000)


class GroupMemberResponse(BaseModel):
    user_id: UUID
    role: GroupRole
    joined_at: datetime


class GroupStateResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    name: str
    created_by: UUID
    key_epoch: int
    members: List[GroupMemberResponse]
    my_encrypted_key_envelope: Optional[str] = None


class GroupResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    name: str
    key_epoch: int
    created_at: datetime
