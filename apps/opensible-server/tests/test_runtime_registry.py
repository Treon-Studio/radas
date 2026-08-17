"""Contract tests for the provider-neutral runtime adapter foundation."""
from __future__ import annotations

import pytest

from services.runtime_provider import (
    ProviderLogPage,
    ProviderResult,
    RuntimeProviderTimeoutError,
    UnsupportedCapabilityError,
    safe_runtime_error_code,
)
from services.runtime_providers.local_container import LocalContainerProvider
from services.runtime_providers.mock import MockRuntimeProvider
from services.runtime_registry import (
    DuplicateProviderError,
    ProviderRegistryError,
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


@pytest.mark.parametrize("code", [
    "UNSUPPORTED_IDEMPOTENCY", "IDEMPOTENCY_MISMATCH", "INVALID_PROVIDER_RESULT",
    "INVALID_PROVIDER_LOG", "INVALID_PROVIDER_VALIDATION", "PROVIDER_VALIDATION_ERROR",
])
def test_runtime_error_code_allowlist_preserves_legitimate_codes(code):
    assert safe_runtime_error_code(code) == code


@pytest.mark.parametrize("code", [
    "authorization=raw-secret", "SECRET_LEAK", "provider\ncode", "arbitrary-code", "",
])
def test_runtime_error_code_allowlist_rejects_unsafe_or_arbitrary_codes(code):
    assert safe_runtime_error_code(code) == "PROVIDER_ERROR"


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
    assert provider.TIMEOUT_ENFORCED is False
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


def test_unknown_provider_error_code_is_normalized_and_message_is_bounded():
    class UnknownCodeProvider(MockRuntimeProvider):
        def deploy(self, operation_id, spec, **kwargs):
            return ProviderResult.failed(
                "deploy", "authorization=raw-secret", "x" * 5000,
                details={"token": "raw-secret"}, provider_id=self.id,
            )

    result = RuntimeProviderRegistry([UnknownCodeProvider()]).deploy("mock", "op", {"name": "demo"})
    assert result.error["code"] == "PROVIDER_ERROR"
    assert len(result.error["message"]) <= 2000
    assert "raw-secret" not in str(result.to_dict())


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


def test_provider_result_semantics_are_validated_and_normalized():
    cases = [
        ProviderResult.ok("update"),
        ProviderResult(operation="deploy", status="unknown", success=True),
        ProviderResult(operation="deploy", status="succeeded", success=True, error={"code": "BAD", "message": "leak"}),
        ProviderResult(operation="deploy", status="failed", success=False, error={"message": "missing code"}),
        ProviderResult.ok("deploy", provider_id="other"),
        ProviderResult.ok("deploy", operation_id="different"),
    ]

    for malformed in cases:
        class MalformedProvider(MockRuntimeProvider):
            def deploy(self, operation_id, spec, **kwargs):
                return malformed

        result = RuntimeProviderRegistry([MalformedProvider()]).deploy("mock", "op", {"name": "demo"})
        assert result.success is False
        assert result.error["code"] == "INVALID_PROVIDER_RESULT"
        assert result.error["message"] == "runtime provider operation failed"
        assert "leak" not in str(result.to_dict())


def test_provider_messages_and_nested_validation_details_are_redacted():
    class LeakyProvider(MockRuntimeProvider):
        def deploy(self, operation_id, spec, **kwargs):
            return ProviderResult.failed(
                "deploy",
                "REMOTE_ERROR",
                "credential hunter2; password hunter2; token hunter2; private-key hunter2",
                details={"nested": [{"message": "credential hunter2", "private_key": "raw-key"}]},
            )

        def validate(self, spec):
            return [{
                "code": "INVALID_SPEC",
                "message": "password hunter2",
                "details": {"nested": {"token": "hunter2", "text": "private key hunter2"}},
            }]

        def logs(self, instance, cursor=None, **kwargs):
            return ProviderLogPage(entries=({
                "level": "error",
                "message": "credential hunter2",
                "error": {"code": "REMOTE_ERROR", "message": "private key hunter2", "details": {"password": "hunter2"}},
            },), provider_id=self.id, instance_id=instance["id"])

    registry = RuntimeProviderRegistry([LeakyProvider()])
    result = registry.deploy("mock", "op", {"name": "demo"})
    rendered = str(result.to_dict())
    assert result.error["message"] == "runtime provider operation failed"
    assert "hunter2" not in rendered
    assert result.error["details"]["nested"][0]["private_key"] == "[REDACTED]"

    validation = registry.validate("mock", {"name": "demo"})
    assert validation[0]["message"] == "password [REDACTED]"
    assert validation[0]["code"] == "INVALID_SPEC"
    assert "hunter2" not in str(validation)
    assert validation[0]["details"]["nested"]["token"] == "[REDACTED]"

    page = registry.logs("mock", {"id": "instance-1"})
    assert "hunter2" not in str(page.to_dict())
    assert page.entries[0]["error"]["message"] == "runtime provider log retrieval failed"


def test_validation_messages_and_non_mapping_details_are_safe_and_retained():
    class ValidationProvider(MockRuntimeProvider):
        def validate(self, spec):
            return [
                {"code": "BAD_SPEC", "message": "token=raw-token", "details": ["raw", {"password": "raw-password"}]},
                {"code": "MISSING_DETAILS", "message": "plain actionable message", "details": "raw-detail"},
                "not-a-validation-map",
            ]

    validation = RuntimeProviderRegistry([ValidationProvider()]).validate("mock", {})
    assert validation[0] == {
        "code": "BAD_SPEC",
        "message": "token=[REDACTED]",
        "details": ["raw", {"password": "[REDACTED]"}],
    }
    assert validation[1] == {
        "code": "MISSING_DETAILS",
        "message": "plain actionable message",
        "details": {"value": "raw-detail"},
    }
    assert validation[2]["message"] == "runtime provider validation failed"
    assert validation[2]["details"]["value"] == "not-a-validation-map"
    assert "raw-token" not in str(validation)
    assert "raw-password" not in str(validation)


@pytest.mark.parametrize("marker", ["true", 1])
def test_timeout_marker_must_be_actual_bool_and_contract_must_be_explicit(marker):
    class InvalidMarkerProvider(MockRuntimeProvider):
        TIMEOUT_ENFORCED = marker

    with pytest.raises(ProviderRegistryError, match="TIMEOUT_ENFORCED must be bool"):
        RuntimeProviderRegistry([InvalidMarkerProvider()])

    class KwargsOnlyProvider(MockRuntimeProvider):
        def enforce_timeout(self, timeout):
            pass

        def deploy(self, operation_id, spec, **kwargs):
            return ProviderResult.ok("deploy")

    # The explicit enforce_timeout hook makes **kwargs acceptable.
    RuntimeProviderRegistry([KwargsOnlyProvider()])

    class MissingContractProvider(MockRuntimeProvider):
        TIMEOUT_ENFORCED = True

        def enforce_timeout(self, timeout):
            pass

        def deploy(self, operation_id, spec):
            return ProviderResult.ok("deploy")

    with pytest.raises(ProviderRegistryError, match="cannot accept timeout"):
        RuntimeProviderRegistry([MissingContractProvider()])


def test_keyword_only_timeout_hook_is_invoked_with_keyword():
    class KeywordOnlyHookProvider(MockRuntimeProvider):
        def enforce_timeout(self, *, timeout):
            self.seen_timeout = timeout

    provider = KeywordOnlyHookProvider()
    result = RuntimeProviderRegistry([provider]).deploy("mock", "op", {"name": "demo"}, timeout=2.5)

    assert result.success is True
    assert provider.seen_timeout == 2.5


def test_positional_only_operation_timeout_is_rejected_at_registration():
    class PositionalOnlyTimeoutProvider(MockRuntimeProvider):
        def deploy(self, operation_id, spec, timeout=None, /):
            return ProviderResult.ok("deploy", provider_id=self.id, operation_id=operation_id)

    with pytest.raises(ProviderRegistryError, match="positional-only timeout"):
        RuntimeProviderRegistry([PositionalOnlyTimeoutProvider()])


def test_timeout_is_forwarded_or_rejected_for_legacy_adapters():
    provider = MockRuntimeProvider()
    registry = RuntimeProviderRegistry([provider])
    registry.status("mock", {"id": "instance-1"}, timeout=2.5)
    assert provider.calls[-1]["timeout"] == 2.5

    class SlowProvider(MockRuntimeProvider):
        def deploy(self, operation_id, spec, **kwargs):
            import time
            time.sleep(0.01)
            return ProviderResult.ok("deploy", provider_id=self.id, operation_id=operation_id)

    slow = RuntimeProviderRegistry([SlowProvider()]).deploy(
        "mock", "op", {"name": "demo"}, timeout=0.001
    )
    assert slow.error["code"] == "PROVIDER_TIMEOUT"

    class NoTimeoutProvider(MockRuntimeProvider):
        TIMEOUT_ENFORCED = False

        def deploy(self, operation_id, spec):
            return ProviderResult.ok("deploy")

    result = RuntimeProviderRegistry([NoTimeoutProvider()]).deploy(
        "mock", "op", {"name": "demo"}, timeout=1
    )
    assert result.error["code"] == "UNSUPPORTED_TIMEOUT"

    class LegacyProvider(MockRuntimeProvider):
        TIMEOUT_ENFORCED = False

        def logs(self, instance, cursor=None):
            return super().logs(instance, cursor)

    logs = RuntimeProviderRegistry([LegacyProvider()]).logs("mock", {"id": "instance-1"}, timeout=1)
    assert logs.entries[0]["error"]["code"] == "UNSUPPORTED_TIMEOUT"
    assert logs.entries[0]["error"]["message"] == "runtime provider log retrieval failed"


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
