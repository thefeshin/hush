"""Lightweight in-process telemetry counters."""

from collections import Counter
from threading import Lock
from typing import Dict

_COUNTERS = Counter()
_LOCK = Lock()


def increment_counter(name: str, value: int = 1) -> None:
    with _LOCK:
        _COUNTERS[name] += value


def get_counters_snapshot() -> Dict[str, int]:
    with _LOCK:
        return dict(_COUNTERS)
