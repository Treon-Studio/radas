"""Deterministic runtime-provider registration and capability dispatch."""
from __future__ import annotations

import inspect
from collections.abc import Iterable
from typing import Any

from .runtime_provider import (
    ProviderLogPage,
    ProviderResult,
    RuntimeProvider,
    RuntimeProviderError,
    RuntimeProviderTimeoutError,
    UnsupportedCapabilityError,
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
        exc: BaseException,
        *,
        operation_id: str | None = None,
        idempotency_key: str | None = None,
    ) -> ProviderResult:
        if isinstance(exc, (TimeoutError, RuntimeProviderTimeoutError)):
            code = "PROVIDER_TIMEOUT"
        elif isinstance(exc, RuntimeProviderError):
            code = exc.code
        else:
            code = "PROVIDER_ERROR"
        details = getattr(exc, "details", {})
        return ProviderResult.failed(
            operation,
            code,
            str(exc),
            details=details,
            provider_id=provider_id,
            operation_id=operation_id,
            idempotency_key=idempotency_key,
        )

    @staticmethod
    def _call(method: Any, *args: Any, idempotency_key: str | None, timeout: float | None) -> Any:
        """Call an adapter while keeping the normalized keyword contract.

        The signature check makes adapters written against the minimal plan
        interface (without optional keywords) usable during the migration,
        while first-party adapters receive both values whenever supported.
        """
        try:
            parameters = inspect.signature(method).parameters
        except (TypeError, ValueError):
            parameters = {}
        kwargs: dict[str, Any] = {}
        if "idempotency_key" in parameters:
            kwargs["idempotency_key"] = idempotency_key
        if "timeout" in parameters:
            kwargs["timeout"] = timeout
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
            result = self._call(
                getattr(provider, operation), *args,
                idempotency_key=idempotency_key,
                timeout=timeout,
            )
            if not isinstance(result, ProviderResult):
                raise RuntimeProviderError("INVALID_PROVIDER_RESULT", "provider returned an invalid result")
            if result.provider_id is None or result.idempotency_key != idempotency_key:
                return ProviderResult(
                    operation=result.operation,
                    status=result.status,
                    success=result.success,
                    data=result.data,
                    error=result.error,
                    provider_id=result.provider_id or provider_id,
                    operation_id=result.operation_id or operation_id,
                    idempotency_key=result.idempotency_key if result.idempotency_key is not None else idempotency_key,
                )
            return result
        except BaseException as exc:
            if isinstance(exc, (KeyboardInterrupt, SystemExit)):
                raise
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
            result = self._call(provider.logs, instance, cursor, idempotency_key=None, timeout=timeout)
            if not isinstance(result, ProviderLogPage):
                raise RuntimeProviderError("INVALID_PROVIDER_RESULT", "provider returned invalid logs")
            return result
        except BaseException as exc:
            if isinstance(exc, (KeyboardInterrupt, SystemExit)):
                raise
            # Logs have no ProviderResult return type; expose a structured,
            # redacted error page rather than leaking an adapter exception.
            return ProviderLogPage(
                entries=({"level": "error", "error": self._failure(provider_id, "logs", exc).to_dict()["error"]},),
                provider_id=provider_id,
                instance_id=str(instance.get("id")) if instance.get("id") is not None else None,
            )

    def validate(self, provider_id: str, spec: dict[str, Any]) -> list[dict[str, Any]]:
        provider = self.require(provider_id)
        try:
            return redact(list(provider.validate(spec)))
        except BaseException as exc:
            if isinstance(exc, (KeyboardInterrupt, SystemExit)):
                raise
            return [{"code": "PROVIDER_ERROR", "message": redact(str(exc)), "details": {}}]

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
