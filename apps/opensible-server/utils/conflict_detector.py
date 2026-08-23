"""Unique key constraint enforcer and 409 Conflict detector (UC459)."""
from __future__ import annotations

from typing import List, Optional


class KeyConflictError(Exception):
    """Raised when an entity with duplicate key or name is created (HTTP 409)."""

    def __init__(self, message: str, key: str = "", scope: str = "", status_code: int = 409):
        super().__init__(message)
        self.message = message
        self.key = key
        self.scope = scope
        self.status_code = status_code


def ensure_unique_key(scope: str, key: str, existing_keys: List[str], case_sensitive: bool = False) -> None:
    """Ensure key does not already exist in the scope; raise KeyConflictError if duplicate (UC459)."""
    check_key = key.strip() if case_sensitive else key.strip().lower()

    for item in existing_keys:
        curr = str(item).strip() if case_sensitive else str(item).strip().lower()
        if curr == check_key:
            raise KeyConflictError(
                f"Duplicate {scope} key '{key}' already exists",
                key=key,
                scope=scope,
                status_code=409,
            )
