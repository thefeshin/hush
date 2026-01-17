"""
Cryptographic utilities with timing attack prevention
"""

import hmac
import hashlib
import base64


def constant_time_compare(a: str, b: str) -> bool:
    """
    Compare two strings in constant time
    Prevents timing attacks on hash comparison
    """
    if len(a) != len(b):
        # Still do comparison to maintain constant time
        # but ensure we return False
        hmac.compare_digest(a, a)
        return False

    return hmac.compare_digest(a.encode(), b.encode())


def secure_hash(data: str) -> str:
    """
    Compute SHA-256 hash of data
    Returns base64-encoded hash
    """
    hash_bytes = hashlib.sha256(data.encode('utf-8')).digest()
    return base64.b64encode(hash_bytes).decode('ascii')


def normalize_words(words: str) -> str:
    """
    Normalize 12 words for consistent hashing
    - lowercase
    - trimmed
    - single spaces between words
    """
    word_list = words.lower().split()
    return ' '.join(word.strip() for word in word_list)


def hash_words(words: str) -> str:
    """
    Hash normalized words using SHA-256
    Returns base64-encoded hash
    """
    normalized = normalize_words(words)
    return secure_hash(normalized)
