"""
Security and payload size limits used by REST and WebSocket handlers.
"""

# Decoded payload limits.
MAX_THREAD_CIPHERTEXT_BYTES = 16 * 1024
MAX_MESSAGE_CIPHERTEXT_BYTES = 64 * 1024
IV_BYTES = 12

# WebSocket limits.
MAX_WS_SUBSCRIPTIONS_PER_CONNECTION = 500
MAX_WS_MESSAGES_PER_WINDOW = 30
WS_RATE_WINDOW_SECONDS = 10


def base64_max_length(byte_limit: int) -> int:
    """Return the largest padded base64 string length for byte_limit bytes."""
    return ((byte_limit + 2) // 3) * 4


MAX_THREAD_CIPHERTEXT_B64_CHARS = base64_max_length(MAX_THREAD_CIPHERTEXT_BYTES)
MAX_MESSAGE_CIPHERTEXT_B64_CHARS = base64_max_length(MAX_MESSAGE_CIPHERTEXT_BYTES)
MAX_IV_B64_CHARS = base64_max_length(IV_BYTES)
