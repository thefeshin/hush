"""
Thread schemas - server only sees encrypted blobs
"""

from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from typing import List, Optional


class ThreadCreate(BaseModel):
    """Create a new thread (encrypted metadata)"""
    id: UUID                    # Client-generated thread_id
    ciphertext: str             # Base64-encoded encrypted metadata
    iv: str                     # Base64-encoded IV
    # Participant UUIDs (plaintext, for thread discovery)
    # These are not secret - user IDs are shared for contact lookup
    participant_1: Optional[UUID] = None  # Lower UUID (sorted)
    participant_2: Optional[UUID] = None  # Higher UUID (sorted)


class ThreadResponse(BaseModel):
    """Thread response (still encrypted)"""
    id: UUID
    ciphertext: str
    iv: str
    created_at: datetime


class ThreadQuery(BaseModel):
    """Query for specific threads by ID"""
    thread_ids: List[UUID] = Field(..., max_length=100)
