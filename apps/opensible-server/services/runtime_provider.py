"""Provider-neutral runtime adapter contracts.

The service operation runner depends on this module rather than on Docker,
Podman, or any other provider's response objects.  Provider implementations
must return :class:`ProviderResult` and :class:`ProviderLogPage`; both classes
redact data at their boundary so provider errors and metadata are safe to
persist or expose to callers.
"""
from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field
from typing import Any, Mapping, Protocol, Sequence, runtime_checkable


_REDACTED = "[REDACTED]"
PUBLIC_PROVIDER_ERROR = "runtime provider operation failed"
PUBLIC_PROVIDER_LOG_ERROR = "runtime provider log retrieval failed"
_SENSITIVE_KEY = re.compile(
    r"(?:secret|password|credential|token|private.?key|api.?key|access.?key|authorization|bearer)",
    re.IGNORECASE,
)
_PRIVATE_KEY = re.compile(
    r"-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----",
    re.IGNORECASE | re.DOTALL,
)
_BEARER = re.compile(r"\bBearer\s+[^\s,;]+", re.IGNORECASE)
_SENSITIVE_VALUE = re.compile(
    r"(?P<prefix>\b(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|authorization|password|secret|token)\s*[=:]\s*)(?P<quote>[\"']?)(?P<value>[^\s,;\"']+)(?P=quote)",
    re.IGNORECASE,
)
_NATURAL_LANGUAGE_SECRET = re.compile(
    r"(?P<prefix>\b(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|authorization|password|secret|token|private[_ -]?key)"
    r"\s+(?:is|was|equals|:)[ ]*)(?P<quote>[\"']?)(?P<value>[^\s,;.\"']+)(?P=quote)",
    re.IGNORECASE,
)


def _redact_text(value: str) -> str:
    result = _PRIVATE_KEY.sub(_REDACTED, value)
    result = _BEARER.sub("Bearer " + _REDACTED, result)
    result = _SENSITIVE_VALUE.sub(
        lambda match: match.group("prefix") + match.group("quote") + _REDACTED + match.group("quote"),
        result,
    )
    return _NATURAL_LANGUAGE_SECRET.sub(
        lambda match: match.group("prefix") + match.group("quote") + _REDACTED + match.group("quote"),
        result,
    )


def redact(value: Any) -> Any:
    """Return a deep copy with credential-like keys and inline values removed."""
    if isinstance(value, Mapping):
        return {
            key: _REDACTED if _SENSITIVE_KEY.search(str(key)) else redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, tuple):
        return tuple(redact(item) for item in value)
    if isinstance(value, set):
        return {redact(item) for item in value}
    if isinstance(value, str):
        return _redact_text(value)
    return copy.deepcopy(value)


@dataclass(frozen=True)
class ProviderResult:
    """Normalized result for every mutating or state operation."""

    operation: str
    status: str
    success: bool
    data: Mapping[str, Any] = field(default_factory=dict)
    error: Mapping[str, Any] | None = None
    provider_id: str | None = None
    operation_id: str | None = None
    idempotency_key: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "data", redact(dict(self.data or {})))
        if self.error is not None:
            object.__setattr__(self, "error", redact(dict(self.error)))

    @classmethod
    def ok(
        cls,
        operation: str,
        data: Mapping[str, Any] | None = None,
        *,
        provider_id: str | None = None,
        operation_id: str | None = None,
        idempotency_key: str | None = None,
        status: str = "succeeded",
    ) -> "ProviderResult":
        return cls(
            operation=operation,
            status=status,
            success=True,
            data=data or {},
            provider_id=provider_id,
            operation_id=operation_id,
            idempotency_key=idempotency_key,
        )

    @classmethod
    def failed(
        cls,
        operation: str,
        code: str,
        message: str,
        *,
        details: Mapping[str, Any] | None = None,
        provider_id: str | None = None,
        operation_id: str | None = None,
        idempotency_key: str | None = None,
        status: str = "failed",
    ) -> "ProviderResult":
        return cls(
            operation=operation,
            status=status,
            success=False,
            error={"code": code, "message": message, "details": details or {}},
            provider_id=provider_id,
            operation_id=operation_id,
            idempotency_key=idempotency_key,
        )

    @property
    def ok_result(self) -> bool:
        """Compatibility alias for callers that use ``ok`` as a property."""
        return self.success

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "operation": self.operation,
            "status": self.status,
            "success": self.success,
            "data": redact(self.data),
        }
        if self.error is not None:
            result["error"] = redact(self.error)
        if self.provider_id is not None:
            result["provider_id"] = self.provider_id
        if self.operation_id is not None:
            result["operation_id"] = self.operation_id
        if self.idempotency_key is not None:
            result["idempotency_key"] = self.idempotency_key
        return result


@dataclass(frozen=True)
class ProviderLogPage:
    """Normalized, cursor-based provider logs."""

    entries: Sequence[Mapping[str, Any]] = field(default_factory=tuple)
    next_cursor: str | None = None
    provider_id: str | None = None
    instance_id: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "entries", tuple(redact(dict(entry)) for entry in self.entries))

    @property
    def has_more(self) -> bool:
        return self.next_cursor is not None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "entries": [redact(entry) for entry in self.entries],
            "next_cursor": self.next_cursor,
            "has_more": self.has_more,
        }
        if self.provider_id is not None:
            result["provider_id"] = self.provider_id
        if self.instance_id is not None:
            result["instance_id"] = self.instance_id
        return result


class RuntimeProviderError(Exception):
    """A provider failure that can be represented by a stable error envelope."""

    def __init__(self, code: str, message: str, *, details: Mapping[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = dict(details or {})


class UnsupportedCapabilityError(RuntimeProviderError):
    """Raised when a provider does not advertise a requested operation."""

    def __init__(self, provider_id: str, capability: str):
        super().__init__(
            "UNSUPPORTED_CAPABILITY",
            f"provider '{provider_id}' does not support '{capability}'",
            details={"provider_id": provider_id, "capability": capability},
        )


class RuntimeProviderTimeoutError(RuntimeProviderError):
    """Raised or normalized when an adapter exceeds its operation timeout."""

    def __init__(self, message: str = "runtime provider operation timed out"):
        super().__init__("PROVIDER_TIMEOUT", message)


class UnsupportedTimeoutError(RuntimeProviderError):
    """Raised when an adapter cannot honor the normalized timeout contract."""

    def __init__(self, operation: str):
        super().__init__(
            "UNSUPPORTED_TIMEOUT",
            "runtime provider adapter cannot honor operation timeout",
            details={"operation": operation},
        )


@runtime_checkable
class RuntimeProvider(Protocol):
    """The provider contract shared by all RADAS-owned runtime adapters."""

    id: str

    def capabilities(self) -> dict[str, bool]: ...

    def validate(self, spec: dict[str, Any]) -> list[dict[str, Any]]: ...

    def deploy(
        self, operation_id: str, spec: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None
    ) -> ProviderResult: ...

    def update(
        self, operation_id: str, spec: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None
    ) -> ProviderResult: ...

    def start(
        self, operation_id: str, instance: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None
    ) -> ProviderResult: ...

    def stop(
        self, operation_id: str, instance: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None
    ) -> ProviderResult: ...

    def restart(
        self, operation_id: str, instance: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None
    ) -> ProviderResult: ...

    def destroy(
        self, operation_id: str, instance: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None
    ) -> ProviderResult: ...

    def status(self, instance: dict[str, Any], *, timeout: float | None = None) -> ProviderResult: ...

    def logs(
        self, instance: dict[str, Any], cursor: str | None = None, *, timeout: float | None = None
    ) -> ProviderLogPage: ...
