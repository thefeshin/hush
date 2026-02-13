"""
Conversation schemas.
"""

from datetime import datetime
from typing import List
from uuid import UUID

from pydantic import BaseModel, Field


class ConversationResponse(BaseModel):
    id: UUID
    created_at: datetime


class ConversationQuery(BaseModel):
    conversation_ids: List[UUID] = Field(..., max_length=200)


class ConversationAutoCreate(BaseModel):
    recipient_id: UUID
