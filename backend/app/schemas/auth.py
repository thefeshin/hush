"""
Authentication schemas
"""

from pydantic import BaseModel, Field
from typing import Optional


class AuthRequest(BaseModel):
    """Authentication request with 12 words"""
    words: str = Field(
        ...,
        description="Space-separated 12 words",
        min_length=20,  # Minimum reasonable length
        max_length=500  # Maximum reasonable length
    )


class AuthResponse(BaseModel):
    """Authentication response"""
    token: str
    kdf_salt: str               # Client needs this for key derivation
    expires_in: int             # Seconds until token expires


class AuthError(BaseModel):
    """Authentication error"""
    error: str
    remaining_attempts: Optional[int] = None
