"""Explicitly gated local Docker/Podman provider contract.

Phase 1 intentionally does not execute a container runtime.  The provider is
registered only when enabled by the caller, and even then remains a contract
stub unless a future task supplies an explicit execution implementation.
"""
from __future__ import annotations

from typing import Any

from ..runtime_provider import ProviderLogPage, ProviderResult


class LocalContainerProvider:
    id = "local-container"

    def __init__(self, *, config: dict[str, Any] | None = None, enabled: bool = False):
        self.config = dict(config or {})
        # Keep the configuration gate for observability, but do not treat it as
        # an implementation gate: Phase 1 has no subprocess execution.
        self.requested_enabled = bool(enabled and self.config.get("allow_execution", False))
        self.enabled = False
        self.runtime = str(self.config.get("runtime", "docker"))

    def capabilities(self) -> dict[str, bool]:
        # ``allow_execution`` is only a future configuration gate.  This
        # adapter has no subprocess implementation yet, so it must not claim
        # any operation, health check, or endpoint capability.
        return {
            "deploy": False,
            "update": False,
            "start": False,
            "stop": False,
            "restart": False,
            "destroy": False,
            "logs": False,
            "status": False,
            "healthcheck": False,
            "public_endpoint": False,
        }

    def validate(self, spec: dict[str, Any]) -> list[dict[str, Any]]:
        if not self.enabled:
            return [{"code": "PROVIDER_DISABLED", "message": "local container provider is disabled"}]
        if self.runtime not in {"docker", "podman"}:
            return [{"code": "INVALID_RUNTIME", "message": "runtime must be docker or podman"}]
        return []

    def _disabled(self, operation: str, operation_id: str | None = None, idempotency_key: str | None = None) -> ProviderResult:
        return ProviderResult.failed(
            operation,
            "PROVIDER_DISABLED",
            "local container provider is disabled",
            provider_id=self.id,
            operation_id=operation_id,
            idempotency_key=idempotency_key,
        )

    def deploy(self, operation_id: str, spec: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        return self._disabled("deploy", operation_id, idempotency_key)

    def update(self, operation_id: str, spec: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        return self._disabled("update", operation_id, idempotency_key)

    def start(self, operation_id: str, instance: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        return self._disabled("start", operation_id, idempotency_key)

    def stop(self, operation_id: str, instance: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        return self._disabled("stop", operation_id, idempotency_key)

    def restart(self, operation_id: str, instance: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        return self._disabled("restart", operation_id, idempotency_key)

    def destroy(self, operation_id: str, instance: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        return self._disabled("destroy", operation_id, idempotency_key)

    def status(self, instance: dict[str, Any], *, timeout: float | None = None) -> ProviderResult:
        return self._disabled("status")

    def logs(self, instance: dict[str, Any], cursor: str | None = None, *, timeout: float | None = None) -> ProviderLogPage:
        return ProviderLogPage(
            entries=({"level": "error", "error": {"code": "PROVIDER_DISABLED", "message": "local container provider is disabled"}},),
            provider_id=self.id,
            instance_id=str(instance.get("id")) if instance.get("id") is not None else None,
        )
