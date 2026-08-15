"""Contract tests for the provider-neutral runtime adapter foundation."""
from __future__ import annotations

import pytest

from services.runtime_provider import RuntimeProviderTimeoutError, UnsupportedCapabilityError
from services.runtime_providers.local_container import LocalContainerProvider
from services.runtime_providers.mock import MockRuntimeProvider
from services.runtime_registry import (
    DuplicateProviderError,
    RuntimeProviderRegistry,
    build_default_registry,
)


def test_registration_is_deterministic_and_duplicate_ids_are_rejected():
    second = MockRuntimeProvider(id="z-provider")
    first = MockRuntimeProvider(id="a-provider")
    registry = RuntimeProviderRegistry([second, first])

    assert registry.ids() == ("a-provider", "z-provider")
    assert registry.providers() == (first, second)
    with pytest.raises(DuplicateProviderError):
        registry.register(MockRuntimeProvider(id="a-provider"))


def test_capability_negotiation_and_unsupported_operation():
    provider = MockRuntimeProvider()
    registry = RuntimeProviderRegistry([provider])

    assert registry.supports("mock", "deploy")
    assert registry.negotiate("mock", {"deploy": True, "logs": True})["deploy"] is True
    with pytest.raises(UnsupportedCapabilityError, match="does not support 'unsupported'"):
        registry.negotiate("mock", ["unsupported"])

    provider.capabilities = lambda: {"deploy": True}  # type: ignore[method-assign]
    with pytest.raises(UnsupportedCapabilityError, match="does not support 'logs'"):
        registry.logs("mock", {"id": "instance-1"})


def test_mock_lifecycle_status_and_logs():
    provider = MockRuntimeProvider()
    registry = RuntimeProviderRegistry([provider])
    spec = {"id": "instance-1", "name": "demo", "client_secret": "do-not-leak"}

    deployed = registry.deploy("mock", "op-deploy", spec, idempotency_key="idem-1", timeout=3)
    assert deployed.success is True
    assert deployed.data["instance"]["status"] == "running"
    assert deployed.data["instance"]["client_secret"] == "[REDACTED]"
    assert provider.calls[-1]["idempotency_key"] == "idem-1"

    assert registry.stop("mock", "op-stop", {"id": "instance-1"}).data["instance"]["status"] == "stopped"
    assert registry.start("mock", "op-start", {"id": "instance-1"}).data["instance"]["status"] == "running"
    assert registry.restart("mock", "op-restart", {"id": "instance-1"}).success
    assert registry.status("mock", {"id": "instance-1"}).data["instance"]["status"] == "running"
    assert registry.destroy("mock", "op-destroy", {"id": "instance-1"}).data["instance"]["status"] == "destroyed"

    page = registry.logs("mock", {"id": "instance-1"})
    assert page.entries[0]["message"] == "mock runtime ready"
    assert page.provider_id == "mock"


def test_failure_normalization_timeout_and_secret_redaction():
    provider = MockRuntimeProvider(failure=RuntimeProviderTimeoutError("token=top-secret timeout"))
    registry = RuntimeProviderRegistry([provider])

    result = registry.deploy(
        "mock",
        "op-fail",
        {"id": "instance-1", "password": "raw-password"},
        idempotency_key="idem-secret",
    )
    body = result.to_dict()
    assert result.success is False
    assert body["error"]["code"] == "PROVIDER_TIMEOUT"
    assert "top-secret" not in str(body)
    assert result.idempotency_key == "idem-secret"

    provider.configure_failure({
        "code": "REMOTE_ERROR",
        "message": "authorization=raw-auth",
        "details": {"access_token": "raw-token"},
    })
    failed = registry.update("mock", "op-error", {"id": "instance-1"})
    assert failed.error["code"] == "REMOTE_ERROR"
    assert "raw-auth" not in str(failed.to_dict())
    assert failed.error["details"]["access_token"] == "[REDACTED]"


def test_idempotency_key_is_forwarded_to_provider():
    provider = MockRuntimeProvider()
    registry = RuntimeProviderRegistry([provider])

    registry.update("mock", "op-1", {"id": "instance-1"}, idempotency_key="same-key")
    call = provider.calls[-1]
    assert call["operation"] == "update"
    assert call["idempotency_key"] == "same-key"


def test_local_provider_disabled_without_runtime_invocation():
    provider = LocalContainerProvider(config={"runtime": "docker"}, enabled=False)
    assert all(value is False for value in provider.capabilities().values())
    assert provider.validate({})[0]["code"] == "PROVIDER_DISABLED"
    result = provider.deploy("op-1", {"name": "demo"})
    assert result.error["code"] == "PROVIDER_DISABLED"
    assert provider.logs({"id": "instance-1"}).entries[0]["error"]["code"] == "PROVIDER_DISABLED"

    registry = build_default_registry()
    assert registry.ids() == ("mock",)
    enabled = build_default_registry(enable_local_container=True)
    assert enabled.ids() == ("local-container", "mock")
    assert enabled.get("local-container").capabilities()["deploy"] is False
