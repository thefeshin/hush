"""
Message schemas - server only sees encrypted blobs
"""

from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from typing import Optional

from app.security_limits import MAX_IV_B64_CHARS, MAX_MESSAGE_CIPHERTEXT_B64_CHARS


class MessageCreate(BaseModel):
    """Create a new message (encrypted content)"""
    thread_id: UUID
    ciphertext: str = Field(..., min_length=4, max_length=MAX_MESSAGE_CIPHERTEXT_B64_CHARS)
    iv: str = Field(..., min_length=16, max_length=MAX_IV_B64_CHARS)


class MessageResponse(BaseModel):
    """Message response (still encrypted)"""
    id: UUID
    thread_id: UUID
    ciphertext: str
    iv: str
    created_at: datetime


class MessageQuery(BaseModel):
    """Query messages for a thread"""
    thread_id: UUID
    after: Optional[datetime] = None    # For pagination
    limit: int = Field(default=50, le=200)
