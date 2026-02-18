"""
Message schemas - server only sees encrypted blobs
"""

from pydantic import BaseModel, Field, field_validator
from uuid import UUID
from datetime import datetime
from typing import Optional

from app.security_limits import MAX_IV_B64_CHARS, MAX_MESSAGE_CIPHERTEXT_B64_CHARS


class MessageCreate(BaseModel):
    """Create a new message (encrypted content)"""
    conversation_id: UUID
    recipient_id: Optional[UUID] = None
    group_epoch: Optional[int] = Field(default=None, ge=1, le=1000000)
    expires_after_seen_sec: Optional[int] = Field(default=None, ge=15, le=60)
    ciphertext: str = Field(..., min_length=4, max_length=MAX_MESSAGE_CIPHERTEXT_B64_CHARS)
    iv: str = Field(..., min_length=16, max_length=MAX_IV_B64_CHARS)

    @field_validator("expires_after_seen_sec")
    @classmethod
    def validate_expires_after_seen_sec(cls, value: Optional[int]) -> Optional[int]:
        if value is None:
            return value
        if value not in {15, 30, 60}:
            raise ValueError("expires_after_seen_sec must be one of: 15, 30, 60")
        return value


class MessageResponse(BaseModel):
    """Message response (still encrypted)"""
    id: UUID
    conversation_id: UUID
    sender_id: UUID
    group_epoch: Optional[int] = None
    expires_after_seen_sec: Optional[int] = None
    seen_at: Optional[datetime] = None
    delete_after_seen_at: Optional[datetime] = None
    all_recipients_seen: Optional[bool] = None
    ciphertext: str
    iv: str
    created_at: datetime


class MessageQuery(BaseModel):
    """Query messages for a conversation"""
    conversation_id: UUID
    after: Optional[datetime] = None    # For pagination
    limit: int = Field(default=50, le=200)
