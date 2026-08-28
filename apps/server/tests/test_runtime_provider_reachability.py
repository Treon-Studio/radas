"""Reachability and safety tests for the local container runtime provider.

Task 1.1 (flow gap closure): one configuration source for the local container
provider, shared by the operation runner and observability, stable
PROVIDER_DISABLED / RUNTIME_UNAVAILABLE statuses, spec validation before any
subprocess, timeout cleanup, and redacted command arguments.

All tests are mock-based: ``shutil.which`` and ``subprocess`` are patched and
no Docker/Podman daemon is required.
"""
from __future__ import annotations

import subprocess
from typing import Any

import pytest

from services import runtime_registry, service_observability, service_operation_runner
from services.runtime_providers import local_container as local_container_module
from services.runtime_providers.local_container import LocalContainerProvider
from services.runtime_registry import RuntimeConfigError, load_runtime_config

ENABLED_ENV = {
    "RADAS_ENABLE_LOCAL_CONTAINER": "1",
    "RADAS_CONTAINER_RUNTIME": "podman",
    "RADAS_CONTAINER_SOCKET": "/tmp/podman.sock",
    "RADAS_CONTAINER_NETWORK": "radas-net",
    "RADAS_CONTAINER_COMMAND_TIMEOUT": "90",
}

VALID_SPEC = {
    "name": "Exec Demo",
    "image": "example/exec-demo:1.0",
    "ports": [8080],
    "env": {"MODE": "safe"},
    "volumes": ["/srv/data:/data:ro"],
    "labels": {"team": "platform"},
}


class _FakeProcess:
    def __init__(self, *, stdout: str = "", stderr: str = "", returncode: int = 0, timeout: bool = False):
        self._stdout = stdout
        self._stderr = stderr
        self.returncode = returncode
        self._timeout = timeout
        self.kill_called = False
        self.communicate_timeouts: list[float | None] = []

    def communicate(self, timeout: float | None = None) -> tuple[str, str]:
        self.communicate_timeouts.append(timeout)
        if self._timeout and len(self.communicate_timeouts) == 1:
            raise subprocess.TimeoutExpired(cmd="runtime", timeout=timeout)
        return self._stdout, self._stderr

    def kill(self) -> None:
        self.kill_called = True


@pytest.fixture
def process_recorder(monkeypatch):
    """Patch subprocess.Popen in the local container module; record every call."""
    calls: list[dict[str, Any]] = []
    processes: list[_FakeProcess] = []

    def _popen(argv, **kwargs):
        calls.append({"argv": list(argv), **kwargs})
        process = _FakeProcess()
        processes.append(process)
        return process

    monkeypatch.setattr(local_container_module.subprocess, "Popen", _popen)
    recorder = {"calls": calls, "processes": processes}
    return recorder


def _fake_binary(monkeypatch) -> None:
    monkeypatch.setattr(local_container_module.shutil, "which", lambda name: f"/usr/bin/{name}")


def _active_provider(**overrides: Any) -> LocalContainerProvider:
    config = load_runtime_config({**ENABLED_ENV, **overrides}).provider_config()
    return LocalContainerProvider(config=config, enabled=True)


# ---------------------------------------------------------------------------
# One configuration source
# ---------------------------------------------------------------------------


def test_local_runtime_config_defaults_are_explicit():
    config = load_runtime_config({})

    assert config.enable_local_container is False
    assert config.runtime == "docker"
    assert config.socket is None
    assert config.network is None
    assert config.command_timeout == 120.0
    assert config.provider_config()["allow_execution"] is False


def test_local_runtime_config_is_the_single_environment_source():
    config = load_runtime_config(ENABLED_ENV)

    assert config.enable_local_container is True
    assert config.runtime == "podman"
    assert config.socket == "/tmp/podman.sock"
    assert config.network == "radas-net"
    assert config.command_timeout == 90.0
    assert config.provider_config() == {
        "runtime": "podman",
        "socket": "/tmp/podman.sock",
        "network": "radas-net",
        "command_timeout": 90.0,
        "allow_execution": True,
    }


@pytest.mark.parametrize("overrides", [
    {"RADAS_CONTAINER_RUNTIME": "nc"},
    {"RADAS_ENABLE_LOCAL_CONTAINER": "maybe"},
    {"RADAS_CONTAINER_COMMAND_TIMEOUT": "not-a-number"},
    {"RADAS_CONTAINER_COMMAND_TIMEOUT": "-5"},
    {"RADAS_CONTAINER_COMMAND_TIMEOUT": "0"},
])
def test_local_runtime_config_rejects_unsafe_values(overrides):
    with pytest.raises(RuntimeConfigError):
        load_runtime_config({**ENABLED_ENV, **overrides})


def test_registry_from_environment_keeps_disabled_provider_with_stable_status():
    registry = runtime_registry.registry_from_environment({})

    assert registry.ids() == ("local-container", "mock")
    provider = registry.get("local-container")
    assert provider is not None
    assert provider.capabilities()["deploy"] is False
    result = registry.deploy("local-container", "op-1", dict(VALID_SPEC))
    assert result.success is False
    assert result.error["code"] == "PROVIDER_DISABLED"


def test_registry_from_environment_activates_local_provider_from_config():
    registry = runtime_registry.registry_from_environment(ENABLED_ENV)

    provider = registry.get("local-container")
    assert provider is not None
    assert registry.ids() == ("local-container", "mock")
    assert provider.capabilities()["deploy"] is True
    assert provider.capabilities()["healthcheck"] is False
    assert provider.capabilities()["public_endpoint"] is False
    assert provider.TIMEOUT_ENFORCED is True
    assert provider.runtime == "podman"
    assert provider.config["allow_execution"] is True


# ---------------------------------------------------------------------------
# Runner and observability share one registry source
# ---------------------------------------------------------------------------


def test_operation_runner_and_observability_share_one_registry_source(monkeypatch):
    for key, value in ENABLED_ENV.items():
        monkeypatch.setenv(key, value)

    runner_registry = service_operation_runner.default_registry()
    assert runner_registry.ids() == ("local-container", "mock")
    observed = service_observability._get_provider("local-container")
    assert observed is not None
    assert observed.runtime == "podman"
    assert observed.config == runner_registry.get("local-container").config

    for key in ENABLED_ENV:
        monkeypatch.delenv(key, raising=False)
    disabled = service_observability._get_provider("local-container")
    assert disabled is not None
    assert disabled.capabilities()["deploy"] is False


def test_observability_health_reports_stable_provider_status(data_dir, monkeypatch):
    import time

    from psycopg.types.json import Jsonb

    from services import service_instances
    from storage import pg

    now = time.time()
    pg.execute("INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)", ("obs-org", "obs-org", "owner", now))
    pg.execute(
        "INSERT INTO projects (id,org_id,owner_id,name,description,is_archived,created_at,updated_at) "
        "VALUES (%s,%s,%s,%s,%s,0,%s,%s)", ("obs-project", "obs-org", "owner", "obs-project", "", now, now),
    )
    pg.execute("INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)", ("obs-org", "owner", "owner", now))
    instance = service_instances.create_instance(
        "obs-project", "obs-service", "static-web", "1.0.0", "development", "local-container",
        {"name": "obs-service", "image": "example/obs:1"},
        created_by="owner", actor_id="owner",
    )

    # Disabled: stable PROVIDER_DISABLED, never a false healthy provider.
    for key in ENABLED_ENV:
        monkeypatch.delenv(key, raising=False)
    disabled = service_observability.health("obs-project", instance["id"], "owner")
    assert disabled["provider"] == {"available": False, "status": "PROVIDER_DISABLED"}

    # Enabled but binary missing: stable RUNTIME_UNAVAILABLE.
    for key, value in ENABLED_ENV.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setattr(local_container_module.shutil, "which", lambda name: None)
    unavailable = service_observability.health("obs-project", instance["id"], "owner")
    assert unavailable["provider"] == {"available": False, "status": "RUNTIME_UNAVAILABLE"}

    # Enabled and binary present: live provider state is surfaced for an
    # instance that carries a container reference.
    pg.execute(
        "UPDATE service_instances SET provider_ref=%s WHERE id=%s",
        (Jsonb({"container_id": "abc123def"}), instance["id"]),
    )
    monkeypatch.setattr(local_container_module.shutil, "which", lambda name: f"/usr/bin/{name}")

    def _popen(argv, **kwargs):
        assert "inspect" in argv
        return _FakeProcess(stdout="running\n", returncode=0)

    monkeypatch.setattr(local_container_module.subprocess, "Popen", _popen)
    live = service_observability.health("obs-project", instance["id"], "owner")
    assert live["provider"] == {"available": True, "state": "running"}


# ---------------------------------------------------------------------------
# Stable statuses through a real service operation
# ---------------------------------------------------------------------------


def _seed_operation(project_id: str, org_id: str, runtime_id: str, spec: dict[str, Any]):
    import time

    from services import service_instances, service_operations
    from storage import pg

    now = time.time()
    pg.execute("INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)", (org_id, org_id, "owner", now))
    pg.execute(
        "INSERT INTO projects (id,org_id,owner_id,name,description,is_archived,created_at,updated_at) "
        "VALUES (%s,%s,%s,%s,%s,0,%s,%s)", (project_id, org_id, "owner", project_id, "", now, now),
    )
    pg.execute("INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)", (org_id, "owner", "owner", now))
    instance = service_instances.create_instance(
        project_id, "runtime-service", "static-web", "1.0.0", "development", runtime_id, spec,
        created_by="owner", actor_id="owner",
    )
    operation = service_operations.create_operation(
        project_id, "service.deploy", f"{project_id}-key",
        {"operation": "deploy", "desired_revision_id": instance["desired_revision_id"]},
        instance_id=instance["id"], requested_by="owner", actor_id="owner", initial_status="queued",
    )
    return instance, operation


def test_disabled_local_provider_never_reports_false_success_through_service_operation(pg_db, monkeypatch):
    for key in ENABLED_ENV:
        monkeypatch.delenv(key, raising=False)
    _fake_binary(monkeypatch)  # even a present binary must not bypass the disabled gate
    from storage import pg

    instance, operation = _seed_operation(
        "reach-project", "reach-org", "local-container",
        {"name": "runtime-service", "image": "example/svc:1"},
    )

    claim = service_operation_runner.claim_next_operation("worker-a")
    assert claim["operation_id"] == operation["id"]
    done = service_operation_runner.execute_claimed(operation["id"], "worker-a")

    assert done["status"] == "failed"
    assert done["error_code"] == "PROVIDER_DISABLED"
    # A failed deploy is never a successful one: the draft instance moves to
    # the failed observed state and the provider result is not a success.
    current = pg.query_one("SELECT status FROM service_instances WHERE id=%s", (instance["id"],))
    assert current["status"] == "failed"


def test_enabled_local_provider_is_selected_by_real_service_operation(pg_db, monkeypatch):
    for key, value in ENABLED_ENV.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("RADAS_CONTAINER_RUNTIME", "docker")
    _fake_binary(monkeypatch)
    from storage import pg

    instance, operation = _seed_operation(
        "reach-project", "reach-org", "local-container",
        {"name": "runtime-service", "image": "example/svc:1", "ports": [8080], "env": {"MODE": "safe"}},
    )
    deploy_calls: list[dict[str, Any]] = []

    def _popen(argv, **kwargs):
        deploy_calls.append({"argv": list(argv), **kwargs})
        return _FakeProcess(stdout="abc123def\n", returncode=0)

    monkeypatch.setattr(local_container_module.subprocess, "Popen", _popen)

    claim = service_operation_runner.claim_next_operation("worker-a")
    assert claim["operation_id"] == operation["id"]
    done = service_operation_runner.execute_claimed(operation["id"], "worker-a")

    assert done["status"] == "succeeded", done
    provider_result = done.get("provider_result") or {}
    assert provider_result.get("provider_id") == "local-container"
    assert provider_result["data"]["provider_ref"]["container_id"] == "abc123def"
    current = pg.query_one("SELECT status FROM service_instances WHERE id=%s", (instance["id"],))
    assert current["status"] == "running"

    deploy_call = deploy_calls[0]
    argv = deploy_call["argv"]
    assert argv[0] == "docker"
    assert argv[1] == "run"
    assert "--name" in argv and "radas-runtime-service" in argv
    assert "-p" in argv and "8080:8080" in argv
    assert "-e" in argv and "MODE=safe" in argv
    assert argv[-1] == "example/svc:1"


# ---------------------------------------------------------------------------
# Binary availability and pre-subprocess validation
# ---------------------------------------------------------------------------


def test_missing_runtime_binary_reports_stable_runtime_unavailable(monkeypatch, process_recorder):
    monkeypatch.setattr(local_container_module.shutil, "which", lambda name: None)
    provider = _active_provider()

    result = provider.deploy("op-1", dict(VALID_SPEC))
    assert result.success is False
    assert result.error["code"] == "RUNTIME_UNAVAILABLE"
    assert process_recorder["calls"] == []

    registry = runtime_registry.RuntimeProviderRegistry([provider])
    normalized = registry.deploy("local-container", "op-1", dict(VALID_SPEC))
    assert normalized.success is False
    assert normalized.error["code"] == "RUNTIME_UNAVAILABLE"
    assert normalized.error["message"] == "runtime provider is currently unavailable"


@pytest.mark.parametrize("spec", [
    {"name": "svc"},
    {"name": "svc", "image": "example image"},
    {"name": "svc", "image": "--privileged"},
    {"name": "svc", "image": "example/svc:1\nrm -rf /"},
    {"name": "svc", "image": "example/svc:1", "ports": [70000]},
    {"name": "svc", "image": "example/svc:1", "ports": ["8080"]},
    {"name": "svc", "image": "example/svc:1", "env": {"BAD KEY": "value"}},
    {"name": "svc", "image": "example/svc:1", "env": {"MODE": {"nested": 1}}},
    {"name": "svc", "image": "example/svc:1", "volumes": ["/data:relative"]},
    {"name": "svc", "image": "example/svc:1", "volumes": ["/srv/data:/data with space"]},
    {"name": "svc", "image": "example/svc:1", "labels": {"bad key": "value"}},
    {"name": "", "image": "example/svc:1"},
    {"name": "   ", "image": "example/svc:1"},
])
def test_invalid_spec_is_rejected_before_any_subprocess(monkeypatch, process_recorder, spec):
    _fake_binary(monkeypatch)
    provider = _active_provider()

    issues = provider.validate(dict(spec))
    assert issues
    assert all(item["code"] == "INVALID_SPEC" for item in issues)

    result = provider.deploy("op-1", dict(spec))
    assert result.success is False
    assert result.error["code"] == "INVALID_SPEC"
    assert process_recorder["calls"] == []


def test_validate_accepts_well_formed_spec(monkeypatch, process_recorder):
    _fake_binary(monkeypatch)
    provider = _active_provider()

    assert provider.validate(dict(VALID_SPEC)) == []
    result = provider.deploy("op-1", dict(VALID_SPEC))
    assert result.success is True
    assert len(process_recorder["calls"]) == 1


# ---------------------------------------------------------------------------
# Subprocess timeout cleanup and redaction
# ---------------------------------------------------------------------------


def test_subprocess_timeout_kills_child_and_reports_timeout(monkeypatch):
    _fake_binary(monkeypatch)
    provider = _active_provider()
    process = _FakeProcess(timeout=True)
    monkeypatch.setattr(local_container_module.subprocess, "Popen", lambda argv, **kwargs: process)

    result = provider.deploy("op-1", dict(VALID_SPEC))

    assert result.success is False
    assert result.error["code"] == "PROVIDER_TIMEOUT"
    assert process.kill_called is True
    assert len(process.communicate_timeouts) == 2  # timed wait, then reap after kill


def test_timeout_through_registry_is_stable_and_redacted(monkeypatch):
    _fake_binary(monkeypatch)
    provider = _active_provider()
    process = _FakeProcess(timeout=True)
    monkeypatch.setattr(local_container_module.subprocess, "Popen", lambda argv, **kwargs: process)

    result = runtime_registry.RuntimeProviderRegistry([provider]).deploy(
        "local-container", "op-1", dict(VALID_SPEC),
    )
    assert result.success is False
    assert result.error["code"] == "PROVIDER_TIMEOUT"
    assert process.kill_called is True


def test_failed_command_details_are_redacted(monkeypatch):
    _fake_binary(monkeypatch)
    provider = _active_provider(runtime="docker")
    process = _FakeProcess(
        returncode=1,
        stderr="pull failed: token=raw-secret password=raw-password",
    )
    monkeypatch.setattr(local_container_module.subprocess, "Popen", lambda argv, **kwargs: process)

    spec = {**VALID_SPEC, "env": {"API_KEY": "raw-key-value", "MODE": "safe"}}
    result = provider.deploy("op-1", spec)
    assert result.success is False

    body = str(result.to_dict())
    for secret in ("raw-secret", "raw-password", "raw-key-value"):
        assert secret not in body
    details = result.error["details"]
    argv = details["argv"]
    assert "MODE=safe" in argv
    assert "API_KEY=[REDACTED]" in argv
    assert "[REDACTED]" in details["stderr"]


def test_runtime_socket_and_network_flow_into_commands(monkeypatch):
    _fake_binary(monkeypatch)
    provider = _active_provider()  # podman + socket + network from ENABLED_ENV
    captured: dict[str, Any] = {}

    def _popen(argv, **kwargs):
        captured["argv"] = list(argv)
        captured["env"] = kwargs.get("env")
        return _FakeProcess(stdout="container-id\n", returncode=0)

    monkeypatch.setattr(local_container_module.subprocess, "Popen", _popen)

    result = provider.deploy("op-1", dict(VALID_SPEC))
    assert result.success is True
    assert "--network" in captured["argv"]
    assert captured["argv"][captured["argv"].index("--network") + 1] == "radas-net"
    assert captured["env"]["DOCKER_HOST"] == "unix:///tmp/podman.sock"


def test_provider_logs_are_redacted(monkeypatch):
    _fake_binary(monkeypatch)
    provider = _active_provider(runtime="docker")
    monkeypatch.setattr(
        local_container_module.subprocess,
        "Popen",
        lambda argv, **kwargs: _FakeProcess(stdout="started\npassword=raw-password\n", returncode=0),
    )

    page = provider.logs({"id": "instance-1", "provider_ref": {"container_id": "abc123def"}})
    rendered = str(page.to_dict())
    assert "raw-password" not in rendered
    assert page.provider_id == "local-container"
    assert page.instance_id == "instance-1"
    assert any("started" in str(entry.get("message", "")) for entry in page.entries)
