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

    # Multi-user auth settings
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    VAULT_TOKEN_EXPIRE_MINUTES: int = 5
    PASSWORD_MIN_LENGTH: int = 8

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
    TRUST_PROXY_HEADERS: bool = True
    TRUSTED_PROXY_CIDRS_RAW: str = "127.0.0.1/32,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"

    @property
    def trusted_proxy_cidrs(self) -> list[str]:
        raw = self.TRUSTED_PROXY_CIDRS_RAW
        if not raw:
            return []
        return [item.strip() for item in str(raw).split(",") if item.strip()]

    class Config:
        env_file = _find_env_file()
        case_sensitive = True


ALLOWED_FAILURE_MODES = ("ip_temp", "ip_perm", "db_wipe", "db_wipe_shutdown")


def validate_security_settings(active_settings: Settings) -> None:
    """Validate deployment-critical security settings."""
    errors = []

    for field_name in ("AUTH_HASH", "KDF_SALT", "JWT_SECRET"):
        value = getattr(active_settings, field_name, "")
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{field_name} must be configured with a non-empty value")

    if active_settings.FAILURE_MODE not in ALLOWED_FAILURE_MODES:
        allowed = ", ".join(ALLOWED_FAILURE_MODES)
        errors.append(f"FAILURE_MODE must be one of: {allowed}")

    if active_settings.MAX_AUTH_FAILURES < 1:
        errors.append("MAX_AUTH_FAILURES must be >= 1")

    if active_settings.FAILURE_MODE == "ip_temp" and active_settings.IP_BLOCK_MINUTES < 1:
        errors.append("IP_BLOCK_MINUTES must be >= 1 when FAILURE_MODE=ip_temp")

    if errors:
        raise ValueError("Invalid security configuration:\n- " + "\n- ".join(errors))


@lru_cache()
def get_settings() -> Settings:
    """Cached settings instance"""
    return Settings()


settings = get_settings()
