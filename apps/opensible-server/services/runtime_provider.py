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
from typing import Any, ClassVar, Mapping, Protocol, Sequence, runtime_checkable


_REDACTED = "[REDACTED]"
PUBLIC_PROVIDER_ERROR = "runtime provider operation failed"
PUBLIC_PROVIDER_LOG_ERROR = "runtime provider log retrieval failed"
PUBLIC_PROVIDER_VALIDATION_ERROR = "runtime provider validation failed"
_PUBLIC_ERROR_MESSAGES = {
    "PROVIDER_DISABLED": "runtime provider is disabled",
    "INVALID_RUNTIME": "runtime provider configuration is invalid",
    "UNSUPPORTED_CAPABILITY": "runtime provider capability is unsupported",
    "UNSUPPORTED_TIMEOUT": "runtime provider adapter cannot honor operation timeout",
    "PROVIDER_TIMEOUT": "runtime provider operation timed out",
}
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
    r"(?P<prefix>\b(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|authorization|password|secret|credential|credentials|token|private[_ -]?key)\s*[=:]\s*)(?P<quote>[\"']?)(?P<value>[^\s,;\"']+)(?P=quote)",
    re.IGNORECASE,
)
_NATURAL_LANGUAGE_SECRET = re.compile(
    r"(?P<prefix>\b(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|authorization|password|secret|credential|token|private[_ -]?key)"
    r"\s+(?:(?:is|was|equals|equal to)\s+|:\s*)?)(?P<quote>[\"']?)(?P<value>[^\s,;.\"']+)(?P=quote)",
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


def _public_provider_error(error: Mapping[str, Any] | None) -> dict[str, Any]:
    """Return a safe public provider error envelope."""
    safe = redact(dict(error or {}))
    code = safe.get("code")
    if not isinstance(code, str) or not code:
        code = "PROVIDER_ERROR"
    message = _PUBLIC_ERROR_MESSAGES.get(code, PUBLIC_PROVIDER_ERROR)
    details = safe.get("details", {})
    if not isinstance(details, Mapping):
        details = {"value": details}
    return {"code": code, "message": message, "details": redact(dict(details))}


def _public_details(value: Any) -> dict[str, Any] | list[Any]:
    """Normalize details without allowing arbitrary provider objects through."""
    if isinstance(value, Mapping):
        return redact(dict(value))
    if isinstance(value, list):
        return redact(value)
    return {"value": redact(value)}


def _public_validation_error(value: Any) -> dict[str, Any]:
    """Normalize one provider validation item while retaining its safe message."""
    if isinstance(value, Mapping):
        safe = redact(dict(value))
        code = safe.get("code")
        if not isinstance(code, str) or not code:
            code = "PROVIDER_VALIDATION_ERROR"
        message = safe.get("message")
        if not isinstance(message, str) or not message:
            message = PUBLIC_PROVIDER_VALIDATION_ERROR
        return {"code": code, "message": message, "details": _public_details(safe.get("details", {}))}
    return {
        "code": "PROVIDER_VALIDATION_ERROR",
        "message": PUBLIC_PROVIDER_VALIDATION_ERROR,
        "details": {"value": redact(value)},
    }


@dataclass(frozen=True)
class ProviderResult:
    """Normalized result for every mutating or state operation.

    ``operation`` and ``status`` are part of the wire contract, not advisory
    provider metadata.  The registry validates them against the requested
    operation before exposing a result.  Provider adapters must return
    ``status`` as ``succeeded`` or ``failed`` and keep ``success`` and
    ``error`` consistent with that status.
    """

    ALLOWED_STATUSES: ClassVar[frozenset[str]] = frozenset({"succeeded", "failed"})

    operation: str
    status: str
    success: bool
    data: Mapping[str, Any] = field(default_factory=dict)
    error: Mapping[str, Any] | None = None
    provider_id: str | None = None
    operation_id: str | None = None
    idempotency_key: str | None = None

    def __post_init__(self) -> None:
        # Keep construction lossless enough for the registry to inspect and
        # normalize malformed adapter results instead of letting constructor
        # errors escape from a provider call.  The registry is the semantic
        # boundary; these fields are still redacted at construction time.
        object.__setattr__(self, "data", redact(dict(self.data)) if isinstance(self.data, Mapping) else copy.deepcopy(self.data))
        if isinstance(self.error, Mapping):
            object.__setattr__(self, "error", redact(dict(self.error)))
        elif self.error is not None:
            object.__setattr__(self, "error", copy.deepcopy(self.error))

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
        normalized: list[Mapping[str, Any]] = []
        for entry in self.entries:
            if not isinstance(entry, Mapping):
                normalized.append({"level": "error", "error": {"code": "INVALID_PROVIDER_LOG", "message": PUBLIC_PROVIDER_LOG_ERROR, "details": {}}})
                continue
            safe = redact(dict(entry))
            error = safe.get("error")
            if isinstance(error, Mapping):
                safe["error"] = {
                    "code": error.get("code") if isinstance(error.get("code"), str) and error.get("code") else "PROVIDER_ERROR",
                    "message": PUBLIC_PROVIDER_LOG_ERROR,
                    "details": redact(dict(error.get("details", {}))) if isinstance(error.get("details", {}), Mapping) else {"value": redact(error.get("details"))},
                }
            normalized.append(safe)
        object.__setattr__(self, "entries", tuple(normalized))

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
    """The provider contract shared by all RADAS-owned runtime adapters.

    Adapter calls are synchronous.  The registry never runs arbitrary Python
    calls in a worker/future and therefore cannot interrupt a blocked call.
    Every adapter that accepts a timeout must set ``TIMEOUT_ENFORCED = True``
    (the value must be the actual bool ``True``) and enforce that deadline in
    its own I/O/subprocess implementation.  An adapter with ``**kwargs`` must
    also expose an explicit ``enforce_timeout(timeout)`` contract; ``**kwargs``
    alone is not proof that a timeout is handled.  An adapter without that
    declaration is rejected before invocation when a timeout is requested.
    The elapsed-time check after a call is only a guard for late completion; it
    reports a timeout but cannot interrupt a blocked adapter call.
    """

    id: str
    TIMEOUT_ENFORCED: ClassVar[bool]

    def capabilities(self) -> dict[str, bool]: ...

    def enforce_timeout(self, timeout: float) -> None: ...

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
