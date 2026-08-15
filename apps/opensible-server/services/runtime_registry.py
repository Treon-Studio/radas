"""Deterministic runtime-provider registration and capability dispatch."""
from __future__ import annotations

import inspect
import math
import time
from collections.abc import Iterable
from typing import Any

from .runtime_provider import (
    ProviderLogPage,
    ProviderResult,
    RuntimeProvider,
    RuntimeProviderError,
    RuntimeProviderTimeoutError,
    UnsupportedCapabilityError,
    UnsupportedTimeoutError,
    PUBLIC_PROVIDER_ERROR,
    PUBLIC_PROVIDER_LOG_ERROR,
    redact,
)


class ProviderRegistryError(ValueError):
    """Base class for invalid provider registry operations."""


class DuplicateProviderError(ProviderRegistryError):
    """Raised when a provider ID is registered more than once."""


class ProviderNotFoundError(ProviderRegistryError):
    """Raised when a provider ID is not registered."""


_OPERATION_NAMES = ("deploy", "update", "start", "stop", "restart", "destroy", "status", "logs")


class RuntimeProviderRegistry:
    """An explicit, deterministic registry for first-party runtime adapters.

    The registry never discovers providers from imports or entry points.  The
    caller supplies providers in a known order, while lookup is by normalized
    immutable ID.  This avoids configuration-dependent provider selection.
    """

    def __init__(self, providers: Iterable[RuntimeProvider] | None = None):
        self._providers: dict[str, RuntimeProvider] = {}
        for provider in providers or ():
            self.register(provider)

    def register(self, provider: RuntimeProvider) -> RuntimeProvider:
        provider_id = str(getattr(provider, "id", "")).strip()
        if not provider_id:
            raise ProviderRegistryError("provider id must be a non-empty string")
        if provider_id != getattr(provider, "id", None):
            raise ProviderRegistryError("provider id must be normalized and stable")
        if provider_id in self._providers:
            raise DuplicateProviderError(f"provider '{provider_id}' is already registered")
        if not callable(getattr(provider, "capabilities", None)):
            raise ProviderRegistryError(f"provider '{provider_id}' is missing capabilities()")
        self._providers[provider_id] = provider
        return provider

    def unregister(self, provider_id: str) -> RuntimeProvider:
        try:
            return self._providers.pop(provider_id)
        except KeyError as exc:
            raise ProviderNotFoundError(f"provider '{provider_id}' is not registered") from exc

    def get(self, provider_id: str) -> RuntimeProvider | None:
        return self._providers.get(provider_id)

    def require(self, provider_id: str) -> RuntimeProvider:
        provider = self.get(provider_id)
        if provider is None:
            raise ProviderNotFoundError(f"provider '{provider_id}' is not registered")
        return provider

    def ids(self) -> tuple[str, ...]:
        """Return provider IDs in deterministic lexical order."""
        return tuple(sorted(self._providers))

    def providers(self) -> tuple[RuntimeProvider, ...]:
        return tuple(self._providers[provider_id] for provider_id in self.ids())

    def capabilities(self, provider_id: str) -> dict[str, bool]:
        provider = self.require(provider_id)
        raw = provider.capabilities()
        return {name: bool(raw.get(name, False)) for name in sorted(raw)}

    def negotiate(self, provider_id: str, required: Iterable[str] | dict[str, Any]) -> dict[str, bool]:
        """Return supported capabilities or raise for the first missing one."""
        available = self.capabilities(provider_id)
        required_names = required.keys() if isinstance(required, dict) else required
        for capability in sorted({str(item) for item in required_names}):
            if not available.get(capability, False):
                raise UnsupportedCapabilityError(provider_id, capability)
        return {capability: available[capability] for capability in sorted(available)}

    def supports(self, provider_id: str, capability: str) -> bool:
        return bool(self.capabilities(provider_id).get(capability, False))

    def _check_capability(self, provider_id: str, operation: str) -> RuntimeProvider:
        provider = self.require(provider_id)
        if not self.supports(provider_id, operation):
            raise UnsupportedCapabilityError(provider_id, operation)
        method = getattr(provider, operation, None)
        if not callable(method):
            raise UnsupportedCapabilityError(provider_id, operation)
        return provider

    @staticmethod
    def _failure(
        provider_id: str,
        operation: str,
        exc: Exception,
        *,
        operation_id: str | None = None,
        idempotency_key: str | None = None,
        message: str = PUBLIC_PROVIDER_ERROR,
    ) -> ProviderResult:
        if isinstance(exc, (TimeoutError, RuntimeProviderTimeoutError)):
            code = "PROVIDER_TIMEOUT"
            message = "runtime provider operation timed out"
        elif isinstance(exc, RuntimeProviderError):
            code = exc.code
            message = exc.message if exc.code in {"UNSUPPORTED_CAPABILITY", "UNSUPPORTED_TIMEOUT"} else message
        else:
            code = "PROVIDER_ERROR"
        details = redact(getattr(exc, "details", {}))
        return ProviderResult.failed(
            operation,
            code,
            message,
            details=details,
            provider_id=provider_id,
            operation_id=operation_id,
            idempotency_key=idempotency_key,
        )

    @staticmethod
    def _validate_timeout(timeout: float | None) -> float | None:
        if timeout is None:
            return None
        if isinstance(timeout, bool) or not isinstance(timeout, (int, float)):
            raise ValueError("timeout must be a finite, non-negative number")
        if not math.isfinite(float(timeout)) or timeout < 0:
            raise ValueError("timeout must be a finite, non-negative number")
        return float(timeout)

    @staticmethod
    def _enforce_elapsed_timeout(started: float, timeout: float | None) -> None:
        if timeout is not None and time.monotonic() - started > timeout:
            raise RuntimeProviderTimeoutError()

    @staticmethod
    def _call(method: Any, *args: Any, idempotency_key: str | None, timeout: float | None) -> Any:
        """Call an adapter using the normalized keyword contract.

        Extensible adapters may declare either named keywords or ``**kwargs``.
        A requested timeout is rejected when the adapter cannot receive it;
        silently dropping it would violate the synchronous timeout contract.
        """
        try:
            parameters = inspect.signature(method).parameters
        except (TypeError, ValueError) as exc:
            if timeout is not None:
                raise UnsupportedTimeoutError(getattr(method, "__name__", "operation")) from exc
            if idempotency_key is not None:
                raise RuntimeProviderError(
                    "UNSUPPORTED_IDEMPOTENCY",
                    "runtime provider adapter cannot honor idempotency key",
                ) from exc
            return method(*args)
        has_kwargs = any(parameter.kind is inspect.Parameter.VAR_KEYWORD for parameter in parameters.values())
        def accepts_keyword(name: str) -> bool:
            parameter = parameters.get(name)
            return parameter is not None and parameter.kind in {
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
                inspect.Parameter.KEYWORD_ONLY,
            }
        kwargs: dict[str, Any] = {}
        if accepts_keyword("idempotency_key") or has_kwargs:
            kwargs["idempotency_key"] = idempotency_key
        elif idempotency_key is not None:
            raise RuntimeProviderError("UNSUPPORTED_IDEMPOTENCY", "runtime provider adapter cannot honor idempotency key")
        if accepts_keyword("timeout") or has_kwargs:
            kwargs["timeout"] = timeout
        elif timeout is not None:
            raise UnsupportedTimeoutError(getattr(method, "__name__", "operation"))
        return method(*args, **kwargs)

    def invoke(
        self,
        provider_id: str,
        operation: str,
        *args: Any,
        idempotency_key: str | None = None,
        timeout: float | None = None,
    ) -> ProviderResult:
        """Dispatch an operation and normalize provider failures."""
        if operation not in _OPERATION_NAMES or operation == "logs":
            raise UnsupportedCapabilityError(provider_id, operation)
        provider = self._check_capability(provider_id, operation)
        operation_id = args[0] if args and operation not in {"status"} else None
        try:
            normalized_timeout = self._validate_timeout(timeout)
            started = time.monotonic()
            result = self._call(
                getattr(provider, operation), *args,
                idempotency_key=idempotency_key,
                timeout=normalized_timeout,
            )
            self._enforce_elapsed_timeout(started, normalized_timeout)
            if not isinstance(result, ProviderResult):
                raise RuntimeProviderError("INVALID_PROVIDER_RESULT", "provider returned an invalid result")
            if idempotency_key is not None and result.idempotency_key not in {None, idempotency_key}:
                raise RuntimeProviderError(
                    "IDEMPOTENCY_MISMATCH",
                    "provider returned an idempotency key that differs from the requested key",
                    details={"mismatch": True},
                )
            return ProviderResult(
                operation=result.operation,
                status=result.status,
                success=result.success,
                data=result.data,
                error=result.error,
                provider_id=result.provider_id or provider_id,
                operation_id=result.operation_id or operation_id,
                idempotency_key=idempotency_key if idempotency_key is not None else result.idempotency_key,
            )
        except Exception as exc:
            return self._failure(
                provider_id, operation, exc,
                operation_id=operation_id,
                idempotency_key=idempotency_key,
            )

    def logs(
        self,
        provider_id: str,
        instance: dict[str, Any],
        cursor: str | None = None,
        *,
        timeout: float | None = None,
    ) -> ProviderLogPage:
        provider = self._check_capability(provider_id, "logs")
        try:
            normalized_timeout = self._validate_timeout(timeout)
            started = time.monotonic()
            result = self._call(provider.logs, instance, cursor, idempotency_key=None, timeout=normalized_timeout)
            self._enforce_elapsed_timeout(started, normalized_timeout)
            if not isinstance(result, ProviderLogPage):
                raise RuntimeProviderError("INVALID_PROVIDER_RESULT", "provider returned invalid logs")
            return result
        except Exception as exc:
            # Logs have no ProviderResult return type; expose a structured,
            # redacted error page rather than leaking an adapter exception.
            failure = self._failure(provider_id, "logs", exc)
            error = dict(failure.to_dict()["error"])
            error["message"] = PUBLIC_PROVIDER_LOG_ERROR
            return ProviderLogPage(
                entries=({"level": "error", "error": error},),
                provider_id=provider_id,
                instance_id=str(instance.get("id")) if instance.get("id") is not None else None,
            )

    def validate(self, provider_id: str, spec: dict[str, Any]) -> list[dict[str, Any]]:
        provider = self.require(provider_id)
        try:
            return redact(list(provider.validate(spec)))
        except Exception as exc:
            return [{"code": "PROVIDER_ERROR", "message": PUBLIC_PROVIDER_ERROR, "details": redact(getattr(exc, "details", {}))}]

    def deploy(self, provider_id: str, operation_id: str, spec: dict[str, Any], **kwargs: Any) -> ProviderResult:
        return self.invoke(provider_id, "deploy", operation_id, spec, **kwargs)

    def update(self, provider_id: str, operation_id: str, spec: dict[str, Any], **kwargs: Any) -> ProviderResult:
        return self.invoke(provider_id, "update", operation_id, spec, **kwargs)

    def start(self, provider_id: str, operation_id: str, instance: dict[str, Any], **kwargs: Any) -> ProviderResult:
        return self.invoke(provider_id, "start", operation_id, instance, **kwargs)

    def stop(self, provider_id: str, operation_id: str, instance: dict[str, Any], **kwargs: Any) -> ProviderResult:
        return self.invoke(provider_id, "stop", operation_id, instance, **kwargs)

    def restart(self, provider_id: str, operation_id: str, instance: dict[str, Any], **kwargs: Any) -> ProviderResult:
        return self.invoke(provider_id, "restart", operation_id, instance, **kwargs)

    def destroy(self, provider_id: str, operation_id: str, instance: dict[str, Any], **kwargs: Any) -> ProviderResult:
        return self.invoke(provider_id, "destroy", operation_id, instance, **kwargs)

    def status(self, provider_id: str, instance: dict[str, Any], **kwargs: Any) -> ProviderResult:
        return self.invoke(provider_id, "status", instance, **kwargs)


def build_default_registry(*, enable_local_container: bool = False, local_config: dict[str, Any] | None = None) -> RuntimeProviderRegistry:
    """Build only explicitly requested first-party providers.

    Imports are intentionally local so importing the registry has no runtime
    side effects and no container executable is probed or launched.
    """
    from .runtime_providers.local_container import LocalContainerProvider
    from .runtime_providers.mock import MockRuntimeProvider

    providers: list[RuntimeProvider] = [MockRuntimeProvider()]
    if enable_local_container:
        providers.append(LocalContainerProvider(config=local_config or {}, enabled=True))
    return RuntimeProviderRegistry(providers)
