"""
Validation helpers for base64-encoded encrypted payload fields.
"""

import base64
from typing import Optional

from fastapi import HTTPException, status

from app.security_limits import base64_max_length


def decode_base64_field(
    value: str,
    *,
    field_name: str,
    max_bytes: int,
    exact_bytes: Optional[int] = None,
) -> bytes:
    """
    Decode and validate a base64 field with size caps.

    Raises:
      HTTPException(400) for invalid encoding or size violations.
    """
    max_chars = base64_max_length(max_bytes)
    if len(value) > max_chars:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} exceeds maximum size",
        )

    try:
        decoded = base64.b64decode(value, validate=True)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} is not valid base64",
        )

    if exact_bytes is not None and len(decoded) != exact_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must decode to exactly {exact_bytes} bytes",
        )

    if len(decoded) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} exceeds maximum size",
        )

    return decoded
