"""Deterministic in-memory runtime provider for contract and unit tests."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping

from ..runtime_provider import ProviderLogPage, ProviderResult, RuntimeProviderTimeoutError, redact


@dataclass
class MockRuntimeProvider:
    """A predictable provider with no filesystem, network, or subprocess use."""

    id: str = "mock"
    failure: BaseException | Mapping[str, Any] | None = None
    state: dict[str, dict[str, Any]] = field(default_factory=dict)
    logs_by_instance: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    calls: list[dict[str, Any]] = field(default_factory=list)

    def capabilities(self) -> dict[str, bool]:
        return {
            "deploy": True,
            "update": True,
            "start": True,
            "stop": True,
            "restart": True,
            "destroy": True,
            "logs": True,
            "status": True,
            "healthcheck": True,
            "public_endpoint": True,
        }

    def configure_failure(self, failure: BaseException | Mapping[str, Any] | None) -> None:
        self.failure = failure

    def validate(self, spec: dict[str, Any]) -> list[dict[str, Any]]:
        errors: list[dict[str, Any]] = []
        if not isinstance(spec, dict):
            errors.append({"code": "INVALID_SPEC", "message": "spec must be an object"})
        elif not spec.get("name"):
            errors.append({"code": "INVALID_SPEC", "message": "name is required"})
        return errors

    def _call(
        self,
        operation: str,
        operation_id: str,
        payload: Mapping[str, Any],
        *,
        idempotency_key: str | None,
        timeout: float | None,
    ) -> ProviderResult:
        self.calls.append({
            "operation": operation,
            "operation_id": operation_id,
            "idempotency_key": idempotency_key,
            "timeout": timeout,
            "payload": redact(dict(payload)),
        })
        if isinstance(self.failure, BaseException):
            raise self.failure
        if isinstance(self.failure, Mapping):
            return ProviderResult.failed(
                operation,
                str(self.failure.get("code", "PROVIDER_ERROR")),
                str(self.failure.get("message", "mock provider failure")),
                details=self.failure.get("details", {}),
                provider_id=self.id,
                operation_id=operation_id,
                idempotency_key=idempotency_key,
            )
        instance_id = str(payload.get("id") or payload.get("instance_id") or payload.get("name") or operation_id)
        if operation in {"deploy", "update"}:
            self.state[instance_id] = {**dict(payload), "id": instance_id, "status": "running"}
        elif operation == "start":
            self.state.setdefault(instance_id, {"id": instance_id})["status"] = "running"
        elif operation == "stop":
            self.state.setdefault(instance_id, {"id": instance_id})["status"] = "stopped"
        elif operation == "restart":
            self.state.setdefault(instance_id, {"id": instance_id})["status"] = "running"
        elif operation == "destroy":
            self.state.setdefault(instance_id, {"id": instance_id})["status"] = "destroyed"
        current = self.state.get(instance_id, {"id": instance_id, "status": "unknown"})
        return ProviderResult.ok(
            operation,
            {"instance": current},
            provider_id=self.id,
            operation_id=operation_id,
            idempotency_key=idempotency_key,
        )

    def deploy(self, operation_id: str, spec: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        return self._call("deploy", operation_id, spec, idempotency_key=idempotency_key, timeout=timeout)

    def update(self, operation_id: str, spec: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        return self._call("update", operation_id, spec, idempotency_key=idempotency_key, timeout=timeout)

    def start(self, operation_id: str, instance: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        return self._call("start", operation_id, instance, idempotency_key=idempotency_key, timeout=timeout)

    def stop(self, operation_id: str, instance: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        return self._call("stop", operation_id, instance, idempotency_key=idempotency_key, timeout=timeout)

    def restart(self, operation_id: str, instance: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        return self._call("restart", operation_id, instance, idempotency_key=idempotency_key, timeout=timeout)

    def destroy(self, operation_id: str, instance: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        return self._call("destroy", operation_id, instance, idempotency_key=idempotency_key, timeout=timeout)

    def status(self, instance: dict[str, Any], *, timeout: float | None = None) -> ProviderResult:
        instance_id = str(instance.get("id") or instance.get("instance_id") or "unknown")
        self.calls.append({"operation": "status", "instance_id": instance_id, "timeout": timeout})
        if isinstance(self.failure, BaseException):
            raise self.failure
        if isinstance(self.failure, Mapping):
            return ProviderResult.failed("status", str(self.failure.get("code", "PROVIDER_ERROR")), str(self.failure.get("message", "mock provider failure")), details=self.failure.get("details", {}), provider_id=self.id)
        return ProviderResult.ok("status", {"instance": self.state.get(instance_id, {"id": instance_id, "status": "unknown"})}, provider_id=self.id)

    def logs(self, instance: dict[str, Any], cursor: str | None = None, *, timeout: float | None = None) -> ProviderLogPage:
        instance_id = str(instance.get("id") or instance.get("instance_id") or "unknown")
        self.calls.append({"operation": "logs", "instance_id": instance_id, "cursor": cursor, "timeout": timeout})
        if isinstance(self.failure, BaseException):
            raise self.failure
        if isinstance(self.failure, Mapping):
            return ProviderLogPage(entries=({"level": "error", "error": redact(dict(self.failure))},), provider_id=self.id, instance_id=instance_id)
        entries = self.logs_by_instance.get(instance_id, [{"level": "info", "message": "mock runtime ready"}])
        start = int(cursor or "0") if (cursor or "0").isdigit() else 0
        page = entries[start:start + 50]
        next_cursor = str(start + len(page)) if start + len(page) < len(entries) else None
        return ProviderLogPage(entries=page, next_cursor=next_cursor, provider_id=self.id, instance_id=instance_id)
