"""
Authentication schemas for multi-user system
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional
from uuid import UUID
import re


class VaultAccessRequest(BaseModel):
    """Request to verify 12-word passphrase and get vault token"""
    words: str = Field(
        ...,
        description="Space-separated 12 words",
        min_length=20,
        max_length=500
    )


class VaultAccessResponse(BaseModel):
    """Response with vault token for registration/login"""
    vault_token: str
    kdf_salt: str
    expires_in: int  # Seconds until vault_token expires


class RegisterRequest(BaseModel):
    """Request to register a new user"""
    vault_token: str = Field(..., description="Token from /auth/vault")
    username: str = Field(
        ...,
        min_length=3,
        max_length=50,
        description="Username (alphanumeric + underscore only)"
    )
    password: str = Field(..., min_length=8, description="Password (min 8 chars)")

    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.lower().strip()
        if not re.match(r'^[a-z0-9_]+$', v):
            raise ValueError('Username must contain only lowercase letters, numbers, and underscores')
        if v.startswith('_') or v.endswith('_'):
            raise ValueError('Username cannot start or end with underscore')
        return v


class LoginRequest(BaseModel):
    """Request to login an existing user"""
    vault_token: str = Field(..., description="Token from /auth/vault")
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=1)


class UserResponse(BaseModel):
    """User information response"""
    id: UUID
    username: str


class UserLookupResponse(BaseModel):
    """Response for user lookup by username"""
    found: bool
    user: Optional[UserResponse] = None


class AuthSuccess(BaseModel):
    """Successful authentication response"""
    user: UserResponse
    message: str = "Authentication successful"


class AuthError(BaseModel):
    """Authentication error"""
    error: str
    message: str
    remaining_attempts: Optional[int] = None


# Legacy schemas for backward compatibility during migration
class AuthRequest(BaseModel):
    """Legacy: Authentication request with 12 words"""
    words: str = Field(
        ...,
        description="Space-separated 12 words",
        min_length=20,
        max_length=500
    )


class AuthResponse(BaseModel):
    """Legacy: Authentication response"""
    token: str
    kdf_salt: str
    expires_in: int
