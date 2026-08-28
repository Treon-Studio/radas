"""Shared v2 schema definitions.

``contracts`` holds the stable envelope schemas every v2 operation shares
(success, structured error, async operation). Domain-specific request/response
schemas belong to their blueprint modules (or future per-domain contract
modules) — do not grow this package into a dumping ground.
"""
from .contracts import (
    ErrorBody,
    ErrorEnvelope,
    Operation,
    OperationEnvelope,
    SuccessEnvelope,
)

__all__ = [
    "ErrorBody",
    "ErrorEnvelope",
    "Operation",
    "OperationEnvelope",
    "SuccessEnvelope",
]
