"""Contract tests for the provider-neutral runtime adapter foundation."""
from __future__ import annotations

import pytest

from services.runtime_provider import (
    ProviderResult,
    RuntimeProviderTimeoutError,
    UnsupportedCapabilityError,
)
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
    enabled_without_implementation = LocalContainerProvider(
        config={"runtime": "docker", "allow_execution": True}, enabled=True
    )
    assert all(value is False for value in enabled_without_implementation.capabilities().values())
    assert provider.validate({})[0]["code"] == "PROVIDER_DISABLED"
    result = provider.deploy("op-1", {"name": "demo"})
    assert result.error["code"] == "PROVIDER_DISABLED"
    assert provider.logs({"id": "instance-1"}).entries[0]["error"]["code"] == "PROVIDER_DISABLED"

    registry = build_default_registry()
    assert registry.ids() == ("mock",)
    enabled = build_default_registry(enable_local_container=True)
    assert enabled.ids() == ("local-container", "mock")
    assert all(value is False for value in enabled.get("local-container").capabilities().values())


def test_natural_language_provider_error_and_log_failure_are_safe():
    provider = MockRuntimeProvider(
        failure=RuntimeError("authentication failed because password is hunter2 and token is abc123")
    )
    registry = RuntimeProviderRegistry([provider])
    result = registry.deploy("mock", "op-secret", {"name": "demo"})
    rendered = str(result.to_dict())
    assert result.error["message"] == "runtime provider operation failed"
    assert "hunter2" not in rendered
    assert "abc123" not in rendered

    page = registry.logs("mock", {"id": "instance-1"})
    rendered_logs = str(page.to_dict())
    assert "hunter2" not in rendered_logs
    assert "abc123" not in rendered_logs
    assert page.entries[0]["error"]["message"] == "runtime provider log retrieval failed"


def test_invalid_result_and_mismatched_idempotency_are_normalized():
    class InvalidProvider(MockRuntimeProvider):
        def deploy(self, operation_id, spec, **kwargs):
            return object()

    invalid = RuntimeProviderRegistry([InvalidProvider()]).deploy("mock", "op", {"name": "demo"})
    assert invalid.error["code"] == "INVALID_PROVIDER_RESULT"

    class MismatchProvider(MockRuntimeProvider):
        def deploy(self, operation_id, spec, **kwargs):
            return ProviderResult.ok("deploy", provider_id=self.id, idempotency_key="other")

    mismatch = RuntimeProviderRegistry([MismatchProvider()]).deploy(
        "mock", "op", {"name": "demo"}, idempotency_key="requested"
    )
    assert mismatch.error["code"] == "IDEMPOTENCY_MISMATCH"


def test_timeout_is_forwarded_or_rejected_for_legacy_adapters():
    provider = MockRuntimeProvider()
    registry = RuntimeProviderRegistry([provider])
    registry.status("mock", {"id": "instance-1"}, timeout=2.5)
    assert provider.calls[-1]["timeout"] == 2.5

    class SlowProvider(MockRuntimeProvider):
        def deploy(self, operation_id, spec, **kwargs):
            import time
            time.sleep(0.01)
            return ProviderResult.ok("deploy")

    slow = RuntimeProviderRegistry([SlowProvider()]).deploy(
        "mock", "op", {"name": "demo"}, timeout=0.001
    )
    assert slow.error["code"] == "PROVIDER_TIMEOUT"

    class NoTimeoutProvider(MockRuntimeProvider):
        def deploy(self, operation_id, spec):
            return ProviderResult.ok("deploy")

    result = RuntimeProviderRegistry([NoTimeoutProvider()]).deploy(
        "mock", "op", {"name": "demo"}, timeout=1
    )
    assert result.error["code"] == "UNSUPPORTED_TIMEOUT"


def test_cancellation_like_base_exception_propagates():
    class CancelProvider(MockRuntimeProvider):
        def deploy(self, operation_id, spec, **kwargs):
            raise KeyboardInterrupt()

    with pytest.raises(KeyboardInterrupt):
        RuntimeProviderRegistry([CancelProvider()]).deploy("mock", "op", {"name": "demo"})


def test_healthcheck_and_public_endpoint_capabilities_are_explicit():
    mock = MockRuntimeProvider()
    assert mock.capabilities()["healthcheck"] is True
    assert mock.capabilities()["public_endpoint"] is True
    local = LocalContainerProvider(config={"allow_execution": True}, enabled=True)
    assert local.capabilities()["healthcheck"] is False
    assert local.capabilities()["public_endpoint"] is False


def test_repeated_lifecycle_operations_after_destroy_are_deterministic():
    provider = MockRuntimeProvider()
    registry = RuntimeProviderRegistry([provider])
    instance = {"id": "instance-1"}
    registry.deploy("mock", "deploy", {**instance, "name": "demo"})
    first = registry.destroy("mock", "destroy-1", instance)
    second = registry.destroy("mock", "destroy-2", instance)
    after = registry.status("mock", instance)
    assert first.success and second.success
    assert after.data["instance"]["status"] == "destroyed"
