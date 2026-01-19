"""
Configuration loaded from environment variables
All sensitive values come from .env (generated at deploy time)
"""

from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional
from pathlib import Path


# Find .env file - could be in current dir, parent (project root), or set via env
def _find_env_file() -> str:
    """Find .env file in current or parent directory"""
    # Check current directory first
    if Path(".env").exists():
        return ".env"
    # Check parent directory (when running from backend/)
    parent_env = Path(__file__).parent.parent.parent / ".env"
    if parent_env.exists():
        return str(parent_env)
    # Default to current directory
    return ".env"


class Settings(BaseSettings):
    """Application settings from environment"""

    # Database
    DATABASE_URL: str = "postgresql://hush:hush@localhost:5432/hush"

    # Authentication
    AUTH_HASH: str = ""         # SHA-256 hash of 12 words
    KDF_SALT: str = ""          # Base64-encoded salt (sent to client)
    JWT_SECRET: str = ""        # Secret for signing JWTs
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60

    # Security Policy (set at deployment)
    MAX_AUTH_FAILURES: int = 5
    FAILURE_MODE: str = "ip_temp"  # ip_temp, ip_perm, db_wipe, db_wipe_shutdown
    IP_BLOCK_MINUTES: int = 60
    PANIC_MODE: bool = False
    PERSIST_VAULT: bool = False

    # Application
    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8000
    FRONTEND_URL: str = "https://localhost"

    class Config:
        env_file = _find_env_file()
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Cached settings instance"""
    return Settings()


settings = get_settings()
