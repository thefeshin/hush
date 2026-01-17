"""
In-memory rate limiting as additional defense layer
This is separate from auth failure tracking
"""

import time
from collections import defaultdict
from typing import Dict, Tuple
from dataclasses import dataclass
from threading import Lock


@dataclass
class RateLimitConfig:
    """Rate limit configuration"""
    requests_per_minute: int = 60
    burst_size: int = 10


class RateLimiter:
    """
    Token bucket rate limiter
    Per-IP tracking with automatic cleanup
    """

    def __init__(self, config: RateLimitConfig = None):
        self.config = config or RateLimitConfig()
        self._buckets: Dict[str, Tuple[float, float]] = {}
        self._lock = Lock()

    def _get_bucket(self, ip: str) -> Tuple[float, float]:
        """Get or create bucket for IP"""
        if ip not in self._buckets:
            self._buckets[ip] = (time.time(), float(self.config.burst_size))
        return self._buckets[ip]

    def is_allowed(self, ip: str) -> bool:
        """
        Check if request is allowed
        Returns True if allowed, False if rate limited
        """
        with self._lock:
            now = time.time()
            last_update, tokens = self._get_bucket(ip)

            # Replenish tokens based on time passed
            time_passed = now - last_update
            tokens_per_second = self.config.requests_per_minute / 60.0
            tokens = min(
                self.config.burst_size,
                tokens + time_passed * tokens_per_second
            )

            if tokens >= 1:
                # Allow request, consume token
                self._buckets[ip] = (now, tokens - 1)
                return True
            else:
                # Rate limited
                self._buckets[ip] = (now, tokens)
                return False

    def cleanup_old_entries(self, max_age_seconds: int = 3600):
        """Remove old entries to prevent memory leak"""
        with self._lock:
            now = time.time()
            to_remove = [
                ip for ip, (last_update, _) in self._buckets.items()
                if now - last_update > max_age_seconds
            ]
            for ip in to_remove:
                del self._buckets[ip]

    def get_stats(self) -> dict:
        """Get rate limiter statistics"""
        with self._lock:
            return {
                "tracked_ips": len(self._buckets),
                "config": {
                    "requests_per_minute": self.config.requests_per_minute,
                    "burst_size": self.config.burst_size
                }
            }


# Global rate limiter instance
rate_limiter = RateLimiter()

# Stricter rate limiter for auth endpoints
auth_rate_limiter = RateLimiter(RateLimitConfig(
    requests_per_minute=10,  # Very limited auth attempts
    burst_size=3
))
