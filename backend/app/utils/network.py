"""
Network helper utilities for safe client IP extraction.
"""

from ipaddress import ip_address, ip_network
from typing import Optional

from starlette.requests import Request

from app.config import settings


def _parse_ip(value: str) -> Optional[str]:
    try:
        return str(ip_address(value.strip()))
    except ValueError:
        return None


def _is_trusted_proxy(proxy_ip: str) -> bool:
    for cidr in settings.trusted_proxy_cidrs:
        try:
            if ip_address(proxy_ip) in ip_network(cidr.strip(), strict=False):
                return True
        except ValueError:
            continue
    return False


def get_client_ip(request: Request) -> str:
    """
    Extract client IP safely.

    X-Forwarded-For is accepted only when proxy headers are enabled and
    the immediate remote host is in TRUSTED_PROXY_CIDRS.
    """
    remote_host = request.client.host if request.client else ""
    normalized_remote = _parse_ip(remote_host)

    if (
        settings.TRUST_PROXY_HEADERS
        and normalized_remote
        and _is_trusted_proxy(normalized_remote)
    ):
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            candidate = _parse_ip(forwarded.split(",")[0])
            if candidate:
                return candidate

    if normalized_remote:
        return normalized_remote

    return "0.0.0.0"
