"""
Message schemas - server only sees encrypted blobs
"""

from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from typing import Optional


class MessageCreate(BaseModel):
    """Create a new message (encrypted content)"""
    thread_id: UUID
    ciphertext: str             # Base64-encoded encrypted message
    iv: str                     # Base64-encoded IV


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
