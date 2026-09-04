"""Shared error type for the RADAS 9Router module."""
from __future__ import annotations


class GatewayError(RuntimeError):
    """An upstream failure that may be eligible for ordered fallback."""

    def __init__(self, message: str, *, status: int | None = None, retryable: bool = False):
        super().__init__(message)
        self.status = status
        self.retryable = retryable
