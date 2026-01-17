"""
Cryptographically secure secret generation
Uses only system CSPRNG - no third-party randomness
"""

import secrets
import hashlib
import base64
from wordlist import BIP39_WORDLIST


class SecretGenerator:
    """Generates all deployment secrets"""

    def generate_all(self):
        """Generate all required secrets"""
        words = self._generate_words()
        kdf_salt = self._generate_kdf_salt()
        auth_hash = self._generate_auth_hash(words)
        jwt_secret = self._generate_jwt_secret()

        return {
            'words': words,
            'kdf_salt': kdf_salt,
            'auth_hash': auth_hash,
            'jwt_secret': jwt_secret
        }

    def _generate_words(self):
        """Generate 12 random words from BIP39 wordlist"""
        # Use cryptographically secure random selection
        return [secrets.choice(BIP39_WORDLIST) for _ in range(12)]

    def _generate_kdf_salt(self):
        """Generate 32-byte random salt, base64 encoded"""
        salt_bytes = secrets.token_bytes(32)
        return base64.b64encode(salt_bytes).decode('ascii')

    def _generate_auth_hash(self, words):
        """
        Generate SHA-256 hash of normalized words
        This is what the server stores for authentication
        """
        # Normalize: lowercase, trimmed, single spaces
        normalized = ' '.join(word.lower().strip() for word in words)

        # SHA-256 hash
        hash_bytes = hashlib.sha256(normalized.encode('utf-8')).digest()
        return base64.b64encode(hash_bytes).decode('ascii')

    def _generate_jwt_secret(self):
        """Generate 64-byte secret for JWT signing"""
        return secrets.token_urlsafe(64)
