"""
Thread schemas - server only sees encrypted blobs
"""

from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from typing import List

from app.security_limits import MAX_IV_B64_CHARS, MAX_THREAD_CIPHERTEXT_B64_CHARS


class ThreadCreate(BaseModel):
    """Create a new thread (encrypted metadata)"""
    id: UUID                    # Client-generated thread_id
    ciphertext: str = Field(..., min_length=4, max_length=MAX_THREAD_CIPHERTEXT_B64_CHARS)
    iv: str = Field(..., min_length=16, max_length=MAX_IV_B64_CHARS)
    # Participant UUIDs (plaintext, for thread discovery)
    # These are not secret - user IDs are shared for contact lookup
    participant_1: UUID  # Lower UUID (sorted)
    participant_2: UUID  # Higher UUID (sorted)


class ThreadResponse(BaseModel):
    """Thread response (still encrypted)"""
    id: UUID
    ciphertext: str
    iv: str
    created_at: datetime


class ThreadQuery(BaseModel):
    """Query for specific threads by ID"""
    thread_ids: List[UUID] = Field(..., max_length=100)
