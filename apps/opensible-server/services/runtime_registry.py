"""Deterministic runtime-provider registration and capability dispatch."""
from __future__ import annotations

import inspect
import math
import time
from collections.abc import Iterable, Mapping
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
    PUBLIC_PROVIDER_VALIDATION_ERROR,
    safe_runtime_error_code,
    _public_details,
    _public_provider_error,
    _public_validation_error,
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
        timeout_marker = getattr(provider, "TIMEOUT_ENFORCED", False)
        if not isinstance(timeout_marker, bool):
            raise ProviderRegistryError(f"provider '{provider_id}' TIMEOUT_ENFORCED must be bool")
        if timeout_marker:
            enforce_timeout = getattr(provider, "enforce_timeout", None)
            if not callable(enforce_timeout):
                raise ProviderRegistryError(
                    f"provider '{provider_id}' claims timeout support but is missing enforce_timeout(timeout)"
                )
            try:
                enforce_parameters = inspect.signature(enforce_timeout).parameters
            except (TypeError, ValueError) as exc:
                raise ProviderRegistryError(
                    f"provider '{provider_id}' timeout contract has no inspectable signature"
                ) from exc
            timeout_parameter = enforce_parameters.get("timeout")
            if timeout_parameter is None or timeout_parameter.kind not in {
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
                inspect.Parameter.KEYWORD_ONLY,
            }:
                raise ProviderRegistryError(
                    f"provider '{provider_id}' timeout contract must accept enforce_timeout(timeout=...)"
                )
            for operation in _OPERATION_NAMES:
                method = getattr(provider, operation, None)
                if not callable(method):
                    continue
                try:
                    parameters = inspect.signature(method).parameters
                except (TypeError, ValueError) as exc:
                    raise ProviderRegistryError(
                        f"provider '{provider_id}' timeout-capable method '{operation}' has no inspectable signature"
                    ) from exc
                has_timeout = parameters.get("timeout")
                if has_timeout is not None and has_timeout.kind is inspect.Parameter.POSITIONAL_ONLY:
                    raise ProviderRegistryError(
                        f"provider '{provider_id}' timeout-capable method '{operation}' has positional-only timeout"
                    )
                has_kwargs = any(parameter.kind is inspect.Parameter.VAR_KEYWORD for parameter in parameters.values())
                if has_timeout is None and not has_kwargs:
                    raise ProviderRegistryError(
                        f"provider '{provider_id}' timeout-capable method '{operation}' cannot accept timeout"
                    )
                if has_kwargs and has_timeout is None:
                    # **kwargs is not proof that the adapter consumes timeout;
                    # enforce_timeout is the explicit capability contract.
                    continue
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
            code = safe_runtime_error_code(exc.code)
            message = exc.message if code in {
                "UNSUPPORTED_CAPABILITY", "UNSUPPORTED_TIMEOUT", "UNSUPPORTED_IDEMPOTENCY", "IDEMPOTENCY_MISMATCH",
            } else message
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
        """Apply a post-call guard; this reports lateness but cannot interrupt."""
        if timeout is not None and time.monotonic() - started > timeout:
            raise RuntimeProviderTimeoutError()

    @staticmethod
    def _validate_provider_result(
        result: Any,
        requested_operation: str,
        provider_id: str,
        operation_id: str | None,
        idempotency_key: str | None,
    ) -> ProviderResult:
        """Validate and normalize an adapter result at the registry boundary."""
        if not isinstance(result, ProviderResult):
            raise RuntimeProviderError("INVALID_PROVIDER_RESULT", "provider returned an invalid result")
        if result.operation != requested_operation:
            raise RuntimeProviderError("INVALID_PROVIDER_RESULT", "provider returned a mismatched operation")
        if result.status not in ProviderResult.ALLOWED_STATUSES:
            raise RuntimeProviderError("INVALID_PROVIDER_RESULT", "provider returned an invalid status")
        if not isinstance(result.success, bool) or result.success != (result.status == "succeeded"):
            raise RuntimeProviderError("INVALID_PROVIDER_RESULT", "provider returned inconsistent success state")
        if not isinstance(result.data, dict | Mapping):
            raise RuntimeProviderError("INVALID_PROVIDER_RESULT", "provider returned invalid result data")
        if result.success:
            if result.error is not None:
                raise RuntimeProviderError("INVALID_PROVIDER_RESULT", "successful provider result contains an error")
        elif (
            not isinstance(result.error, Mapping)
            or not isinstance(result.error.get("code"), str)
            or not result.error.get("code")
            or not isinstance(result.error.get("message"), str)
            or not result.error.get("message")
        ):
            raise RuntimeProviderError("INVALID_PROVIDER_RESULT", "failed provider result has an invalid error")
        for name, value in (("provider_id", result.provider_id), ("operation_id", result.operation_id), ("idempotency_key", result.idempotency_key)):
            if value is not None and (not isinstance(value, str) or not value.strip()):
                raise RuntimeProviderError("INVALID_PROVIDER_RESULT", f"provider returned invalid {name}")
        if result.provider_id not in {None, provider_id}:
            raise RuntimeProviderError("INVALID_PROVIDER_RESULT", "provider returned a mismatched provider ID")
        if operation_id is not None and result.operation_id not in {None, operation_id}:
            raise RuntimeProviderError("INVALID_PROVIDER_RESULT", "provider returned a mismatched operation ID")
        if idempotency_key is not None and result.idempotency_key not in {None, idempotency_key}:
            raise RuntimeProviderError(
                "IDEMPOTENCY_MISMATCH",
                "provider returned an idempotency key that differs from the requested key",
                details={"mismatch": True},
            )
        return ProviderResult(
            operation=requested_operation,
            status=result.status,
            success=result.success,
            data=result.data,
            error=_public_provider_error(result.error) if result.error is not None else None,
            provider_id=result.provider_id or provider_id,
            operation_id=result.operation_id or operation_id,
            idempotency_key=idempotency_key if idempotency_key is not None else result.idempotency_key,
        )

    @staticmethod
    def _call(method: Any, *args: Any, idempotency_key: str | None, timeout: float | None, timeout_enforced: bool) -> Any:
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
            timeout_enforced = getattr(provider, "TIMEOUT_ENFORCED", False) is True
            if normalized_timeout is not None and not timeout_enforced:
                raise UnsupportedTimeoutError(operation)
            if normalized_timeout is not None:
                provider.enforce_timeout(timeout=normalized_timeout)
            started = time.monotonic()
            result = self._call(
                getattr(provider, operation), *args,
                idempotency_key=idempotency_key,
                timeout=normalized_timeout,
                timeout_enforced=timeout_enforced,
            )
            self._enforce_elapsed_timeout(started, normalized_timeout)
            return self._validate_provider_result(result, operation, provider_id, operation_id, idempotency_key)
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
            timeout_enforced = getattr(provider, "TIMEOUT_ENFORCED", False) is True
            if normalized_timeout is not None and not timeout_enforced:
                raise UnsupportedTimeoutError("logs")
            if normalized_timeout is not None:
                provider.enforce_timeout(timeout=normalized_timeout)
            result = self._call(
                provider.logs,
                instance,
                cursor,
                idempotency_key=None,
                timeout=normalized_timeout,
                timeout_enforced=timeout_enforced,
            )
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
            raw = provider.validate(spec)
            if not isinstance(raw, list):
                raise RuntimeProviderError("INVALID_PROVIDER_VALIDATION", "provider returned invalid validation details")
            return [_public_validation_error(item) for item in raw]
        except Exception as exc:
            code = safe_runtime_error_code(getattr(exc, "code", "PROVIDER_ERROR"))
            if code == "PROVIDER_ERROR" and isinstance(exc, RuntimeProviderError):
                code = "PROVIDER_VALIDATION_ERROR"
            message = redact(getattr(exc, "message", str(exc)))
            if not isinstance(message, str) or not message:
                message = PUBLIC_PROVIDER_VALIDATION_ERROR
            return [{"code": code, "message": message[:2000], "details": _public_details(getattr(exc, "details", {}))}]

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
