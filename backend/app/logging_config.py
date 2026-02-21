"""
Logging configuration
Security events are logged but never include sensitive data
"""

import logging
import sys
from typing import Set


class SecurityFilter(logging.Filter):
    """Filter that redacts sensitive information"""

    SENSITIVE_KEYS: Set[str] = {
        "password",
        "token",
        "secret",
        "words",
        "key",
        "auth",
        "credential",
    }

    def filter(self, record: logging.LogRecord) -> bool:
        # Ensure we never log sensitive data
        if hasattr(record, "msg"):
            msg = str(record.msg).lower()
            for key in self.SENSITIVE_KEYS:
                if key in msg and "=" in str(record.msg):
                    # Likely contains sensitive value assignment
                    record.msg = "[REDACTED - Sensitive data filtered]"
                    break
        return True


def setup_logging():
    """Configure application logging"""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    )
    handler.addFilter(SecurityFilter())

    # Root logger
    root = logging.getLogger()
    root.setLevel(logging.INFO)

    # Clear existing handlers to avoid duplicates
    root.handlers = []
    root.addHandler(handler)

    # Reduce noise from libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("asyncpg").setLevel(logging.WARNING)


# Security event logger
security_logger = logging.getLogger("hush.security")


def log_auth_success(ip: str):
    """Log successful authentication (no sensitive data)"""
    security_logger.info(f"Auth success from {ip}")


def log_auth_failure(ip: str, remaining: int):
    """Log authentication failure (no sensitive data)"""
    security_logger.warning(f"Auth failure from {ip} - {remaining} attempts remaining")


def log_ip_blocked(ip: str, permanent: bool):
    """Log IP block event"""
    block_type = "permanent" if permanent else "temporary"
    security_logger.warning(f"IP {ip} blocked ({block_type})")


def log_ip_unblocked(ip: str):
    """Log IP unblock event"""
    security_logger.info(f"IP {ip} block expired")


def log_db_wipe():
    """Log database wipe event"""
    security_logger.critical("DATABASE WIPED - Security policy triggered")


def log_shutdown():
    """Log security shutdown"""
    security_logger.critical("SECURITY SHUTDOWN INITIATED")


def log_rate_limited(ip: str):
    """Log rate limit event"""
    security_logger.warning(f"Rate limit exceeded for {ip}")


def log_panic_mode():
    """Log panic mode activation"""
    security_logger.critical("PANIC MODE ACTIVATED - Immediate destruction")
