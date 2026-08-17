from __future__ import annotations

from services.runtime_registry import RuntimeProviderRegistry
from services.runtime_providers.local_container import LocalContainerProvider
from services.runtime_providers.mock import MockRuntimeProvider


def test_mock_plan_is_deterministic_and_apply_is_redacted():
    registry = RuntimeProviderRegistry([MockRuntimeProvider()])
    spec = {"name": "demo", "token": "do-not-leak"}
    first = registry.plan("mock", "plan-1", spec)
    second = registry.plan("mock", "plan-2", spec)
    assert first.success and second.success
    assert first.data["fingerprint"] == second.data["fingerprint"]
    assert "do-not-leak" not in str(first.to_dict())
    applied = registry.apply_plan("mock", "apply-1", spec, first.data["fingerprint"], idempotency_key="apply-1")
    assert applied.success
    assert "do-not-leak" not in str(applied.to_dict())


def test_local_container_fails_closed_and_does_not_claim_execution():
    provider = LocalContainerProvider(config={"runtime": "docker", "allow_execution": True}, enabled=True)
    assert provider.capabilities()["deploy"] is False
    assert provider.capabilities()["plan"] is False
    result = provider.deploy("op", {"name": "demo"})
    assert result.error["code"] == "PROVIDER_DISABLED"
