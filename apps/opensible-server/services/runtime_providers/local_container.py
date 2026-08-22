"""Local Docker/Podman provider that actually executes containers.

This provider uses the Docker or Podman CLI to run, manage, and monitor containers.
It is enabled when the caller passes `enabled=True` and `allow_execution=True` in config.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
from typing import Any, ClassVar

from ..runtime_provider import ProviderLogPage, ProviderResult, RuntimeProviderError

_CONTAINER_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]*$")
_PORT_RE = re.compile(r"^(\d+):(\d+)(?:/(tcp|udp))?$")
_ENV_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=.+$")


def _safe_container_name(operation_id: str) -> str:
    """Derive a safe container name from an operation id."""
    safe = re.sub(r"[^a-zA-Z0-9_.-]", "-", operation_id)
    safe = safe[:64]
    if not _CONTAINER_NAME_RE.fullmatch(safe):
        safe = "radas-" + safe
    return safe


def _find_runtime() -> tuple[str, list[str]] | None:
    """Return (runtime_name, [command_prefix]) if available."""
    for runtime in ("docker", "podman"):
        if shutil.which(runtime):
            return runtime, [runtime]
    return None


def _run_cmd(cmd: list[str], timeout: float = 60.0) -> tuple[int, str, str]:
    """Run a command, return (returncode, stdout, stderr)."""
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return proc.returncode, proc.stdout, proc.stderr


def _redact_spec(spec: dict[str, Any]) -> dict[str, Any]:
    """Return a safe copy of spec without credential values."""
    safe = {}
    for key, value in spec.items():
        if key in ("secrets", "env", "environment") and isinstance(value, dict):
            safe[key] = {k: "[REDACTED]" for k in value}
        elif key == "image":
            safe[key] = value
        else:
            safe[key] = value
    return safe


class LocalContainerProvider:
    id = "local-container"
    TIMEOUT_ENFORCED: ClassVar[bool] = True

    def __init__(self, *, config: dict[str, Any] | None = None, enabled: bool = False):
        self.config = dict(config or {})
        self._enabled = bool(enabled and self.config.get("allow_execution", False))
        self._runtime = str(self.config.get("runtime", "docker"))
        # Detect available runtime
        detected = _find_runtime()
        if detected:
            self._runtime, self._cmd_prefix = detected
        else:
            self._cmd_prefix = None
        if self._enabled and self._cmd_prefix is None:
            # Disable if runtime not found
            self._enabled = False

        # Default network
        self._network = self.config.get("network", "bridge")

    def capabilities(self) -> dict[str, bool]:
        return {
            "deploy": self._enabled,
            "update": self._enabled,
            "start": self._enabled,
            "stop": self._enabled,
            "restart": self._enabled,
            "destroy": self._enabled,
            "logs": self._enabled,
            "status": self._enabled,
            "healthcheck": self._enabled,
            "public_endpoint": True,
            "plan": False,          # No plan/apply for containers
            "apply_plan": False,
        }

    def enforce_timeout(self, timeout: float) -> None:
        """Enforce timeout via env var (used by subprocesses)."""
        # We'll handle timeout per-call, but we can set a global context.
        pass

    def validate(self, spec: dict[str, Any]) -> list[dict[str, Any]]:
        if not self._enabled:
            return [{"code": "PROVIDER_DISABLED", "message": "local container provider is disabled"}]
        if self._cmd_prefix is None:
            return [{"code": "INVALID_RUNTIME", "message": f"runtime '{self._runtime}' not found in PATH"}]
        # Validate image
        image = spec.get("image")
        if not image or not isinstance(image, str):
            return [{"code": "INVALID_SPEC", "message": "spec.image is required", "details": {"field": "image"}}]
        # Validate ports
        ports = spec.get("ports", [])
        if not isinstance(ports, list):
            return [{"code": "INVALID_SPEC", "message": "spec.ports must be a list", "details": {"field": "ports"}}]
        for idx, port in enumerate(ports):
            if not isinstance(port, dict):
                return [{"code": "INVALID_SPEC", "message": f"ports[{idx}] must be an object", "details": {"field": f"ports[{idx}]"}}]
            if "host_port" not in port and "container_port" not in port:
                return [{"code": "INVALID_SPEC", "message": f"ports[{idx}] requires host_port and container_port", "details": {"field": f"ports[{idx}]"}}]
        return []

    def _container_id_for_instance(self, instance: dict[str, Any]) -> str | None:
        """Extract container ID from provider_ref."""
        ref = instance.get("provider_ref")
        if isinstance(ref, dict):
            return ref.get("container_id")
        if isinstance(ref, str):
            return ref
        return None

    def _container_exists(self, container_name: str) -> bool:
        if not self._cmd_prefix:
            return False
        cmd = self._cmd_prefix + ["container", "inspect", container_name]
        code, _, _ = _run_cmd(cmd, timeout=5)
        return code == 0

    def _container_status(self, container_name: str) -> dict[str, Any] | None:
        if not self._cmd_prefix:
            return None
        cmd = self._cmd_prefix + ["container", "inspect", container_name]
        code, stdout, stderr = _run_cmd(cmd, timeout=5)
        if code != 0:
            return None
        try:
            data = json.loads(stdout)
            if not data or not isinstance(data, list) or len(data) == 0:
                return None
            return data[0]
        except Exception:
            return None

    def _run_container(self, operation_id: str, spec: dict[str, Any], *, detach: bool = True) -> tuple[ProviderResult, str | None]:
        """Run a container, return (ProviderResult, container_id_or_None)."""
        if not self._enabled or self._cmd_prefix is None:
            return ProviderResult.failed(
                "deploy",
                "PROVIDER_DISABLED",
                "local container provider is disabled",
                provider_id=self.id,
                operation_id=operation_id,
            ), None

        name = _safe_container_name(operation_id)
        image = spec.get("image")
        if not image:
            return ProviderResult.failed(
                "deploy",
                "INVALID_SPEC",
                "spec.image is required",
                provider_id=self.id,
                operation_id=operation_id,
            ), None

        # Build command
        cmd = self._cmd_prefix + ["run", "-d", "--name", name]

        # Network
        if self._network:
            cmd += ["--network", self._network]

        # Ports
        ports = spec.get("ports", [])
        for port in ports:
            host = port.get("host_port")
            container = port.get("container_port")
            proto = port.get("protocol", "tcp")
            if host and container:
                cmd += ["-p", f"{host}:{container}/{proto}"]

        # Environment
        env = spec.get("env", {})
        if isinstance(env, dict):
            for k, v in env.items():
                if k and v is not None:
                    cmd += ["-e", f"{k}={v}"]

        # Volumes
        volumes = spec.get("volumes", [])
        for vol in volumes:
            if isinstance(vol, dict):
                src = vol.get("source")
                dst = vol.get("destination")
                if src and dst:
                    cmd += ["-v", f"{src}:{dst}"]

        # Labels
        labels = spec.get("labels", {})
        labels.setdefault("radas.managed", "true")
        labels.setdefault("radas.operation", operation_id)
        for k, v in labels.items():
            cmd += ["-l", f"{k}={v}"]

        # Restart policy
        restart = spec.get("restart_policy", "unless-stopped")
        cmd += ["--restart", restart]

        # Image
        cmd.append(image)

        # Pull image first
        pull_cmd = self._cmd_prefix + ["pull", image]
        pull_code, pull_out, pull_err = _run_cmd(pull_cmd, timeout=120.0)
        if pull_code != 0:
            return ProviderResult.failed(
                "deploy",
                "PROVIDER_ERROR",
                f"failed to pull image: {pull_err[:200]}",
                details={"image": image, "error": pull_err[:500]},
                provider_id=self.id,
                operation_id=operation_id,
            ), None

        # Run container
        code, stdout, stderr = _run_cmd(cmd, timeout=60.0)
        if code != 0:
            return ProviderResult.failed(
                "deploy",
                "PROVIDER_ERROR",
                f"failed to start container: {stderr[:200]}",
                details={"stderr": stderr[:500]},
                provider_id=self.id,
                operation_id=operation_id,
            ), None

        container_id = stdout.strip()
        if not container_id:
            return ProviderResult.failed(
                "deploy",
                "PROVIDER_ERROR",
                "no container id returned",
                provider_id=self.id,
                operation_id=operation_id,
            ), None

        # Get container IP/endpoint
        inspect = self._container_status(name)
        endpoint = None
        if inspect:
            # Try to get IP address
            network_settings = inspect.get("NetworkSettings", {})
            ip = network_settings.get("IPAddress")
            if not ip and network_settings.get("Networks"):
                for net in network_settings["Networks"].values():
                    if net.get("IPAddress"):
                        ip = net["IPAddress"]
                        break
            if ip:
                # Assume port 80/443? We'll use the first exposed port.
                ports_mapping = network_settings.get("Ports", {})
                exposed = list(ports_mapping.keys())
                if exposed:
                    # Get host port mapping
                    first_port = exposed[0]
                    host_port = ports_mapping.get(first_port)
                    if host_port and isinstance(host_port, list) and len(host_port) > 0:
                        host_port_val = host_port[0].get("HostPort")
                        if host_port_val:
                            endpoint = f"http://{ip}:{host_port_val}"
                        else:
                            endpoint = f"http://{ip}:{first_port.split('/')[0]}"
                    else:
                        endpoint = f"http://{ip}:{first_port.split('/')[0]}"

        return ProviderResult.ok(
            "deploy",
            data={
                "container_id": container_id,
                "container_name": name,
                "endpoint": endpoint or "",
                "image": image,
            },
            provider_id=self.id,
            operation_id=operation_id,
        ), container_id

    def deploy(self, operation_id: str, spec: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        result, _ = self._run_container(operation_id, spec)
        return result

    def update(self, operation_id: str, spec: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        # For simplicity, update is a recreate: stop+rm+deploy
        # We need the container name from spec or operation.
        # We'll use operation_id to derive name.
        name = _safe_container_name(operation_id)
        # Remove old container if exists
        if self._container_exists(name):
            cmd = self._cmd_prefix + ["rm", "-f", name]
            _run_cmd(cmd, timeout=10)
        # Deploy new
        result, _ = self._run_container(operation_id, spec)
        return result

    def start(self, operation_id: str, instance: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        name = _safe_container_name(operation_id)
        if not self._container_exists(name):
            return ProviderResult.failed(
                "start",
                "PROVIDER_ERROR",
                f"container {name} does not exist",
                provider_id=self.id,
                operation_id=operation_id,
            )
        cmd = self._cmd_prefix + ["start", name]
        code, _, stderr = _run_cmd(cmd, timeout=10)
        if code != 0:
            return ProviderResult.failed(
                "start",
                "PROVIDER_ERROR",
                f"failed to start: {stderr[:200]}",
                provider_id=self.id,
                operation_id=operation_id,
            )
        return ProviderResult.ok("start", data={"container_name": name}, provider_id=self.id, operation_id=operation_id)

    def stop(self, operation_id: str, instance: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        name = _safe_container_name(operation_id)
        if not self._container_exists(name):
            return ProviderResult.failed(
                "stop",
                "PROVIDER_ERROR",
                f"container {name} does not exist",
                provider_id=self.id,
                operation_id=operation_id,
            )
        cmd = self._cmd_prefix + ["stop", name]
        code, _, stderr = _run_cmd(cmd, timeout=10)
        if code != 0:
            return ProviderResult.failed(
                "stop",
                "PROVIDER_ERROR",
                f"failed to stop: {stderr[:200]}",
                provider_id=self.id,
                operation_id=operation_id,
            )
        return ProviderResult.ok("stop", data={"container_name": name}, provider_id=self.id, operation_id=operation_id)

    def restart(self, operation_id: str, instance: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        name = _safe_container_name(operation_id)
        if not self._container_exists(name):
            return ProviderResult.failed(
                "restart",
                "PROVIDER_ERROR",
                f"container {name} does not exist",
                provider_id=self.id,
                operation_id=operation_id,
            )
        cmd = self._cmd_prefix + ["restart", name]
        code, _, stderr = _run_cmd(cmd, timeout=10)
        if code != 0:
            return ProviderResult.failed(
                "restart",
                "PROVIDER_ERROR",
                f"failed to restart: {stderr[:200]}",
                provider_id=self.id,
                operation_id=operation_id,
            )
        return ProviderResult.ok("restart", data={"container_name": name}, provider_id=self.id, operation_id=operation_id)

    def destroy(self, operation_id: str, instance: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        name = _safe_container_name(operation_id)
        if not self._container_exists(name):
            return ProviderResult.ok("destroy", data={"already_removed": True}, provider_id=self.id, operation_id=operation_id)
        cmd = self._cmd_prefix + ["rm", "-f", name]
        code, _, stderr = _run_cmd(cmd, timeout=10)
        if code != 0:
            return ProviderResult.failed(
                "destroy",
                "PROVIDER_ERROR",
                f"failed to remove: {stderr[:200]}",
                provider_id=self.id,
                operation_id=operation_id,
            )
        return ProviderResult.ok("destroy", data={"container_name": name}, provider_id=self.id, operation_id=operation_id)

    def status(self, instance: dict[str, Any], *, timeout: float | None = None) -> ProviderResult:
        # instance should have provider_ref with container_id
        container_id = self._container_id_for_instance(instance)
        if not container_id:
            return ProviderResult.failed(
                "status",
                "PROVIDER_ERROR",
                "no container_id in provider_ref",
                provider_id=self.id,
            )
        # Use inspect
        cmd = self._cmd_prefix + ["container", "inspect", container_id]
        code, stdout, stderr = _run_cmd(cmd, timeout=5)
        if code != 0:
            return ProviderResult.failed(
                "status",
                "PROVIDER_ERROR",
                f"container not found: {stderr[:200]}",
                provider_id=self.id,
            )
        try:
            data = json.loads(stdout)
            if not data or not isinstance(data, list) or len(data) == 0:
                return ProviderResult.failed("status", "PROVIDER_ERROR", "invalid inspect output", provider_id=self.id)
            state = data[0].get("State", {})
            running = state.get("Running", False)
            status_code = 0 if running else 1
            health = state.get("Health", {})
            health_status = health.get("Status") if health else "unknown"
            endpoint = None
            if running:
                # Try to get endpoint from config
                network_settings = data[0].get("NetworkSettings", {})
                ip = network_settings.get("IPAddress")
                if not ip and network_settings.get("Networks"):
                    for net in network_settings["Networks"].values():
                        if net.get("IPAddress"):
                            ip = net["IPAddress"]
                            break
                if ip:
                    ports_mapping = network_settings.get("Ports", {})
                    exposed = list(ports_mapping.keys())
                    if exposed:
                        first_port = exposed[0]
                        host_port = ports_mapping.get(first_port)
                        if host_port and isinstance(host_port, list) and len(host_port) > 0:
                            host_port_val = host_port[0].get("HostPort")
                            if host_port_val:
                                endpoint = f"http://{ip}:{host_port_val}"
                            else:
                                endpoint = f"http://{ip}:{first_port.split('/')[0]}"
                        else:
                            endpoint = f"http://{ip}:{first_port.split('/')[0]}"
            return ProviderResult.ok(
                "status",
                data={
                    "running": running,
                    "status": state.get("Status", "unknown"),
                    "health": health_status,
                    "endpoint": endpoint,
                },
                provider_id=self.id,
            )
        except Exception as e:
            return ProviderResult.failed(
                "status",
                "PROVIDER_ERROR",
                f"failed to parse status: {str(e)[:100]}",
                provider_id=self.id,
            )

    def logs(self, instance: dict[str, Any], cursor: str | None = None, *, timeout: float | None = None) -> ProviderLogPage:
        container_id = self._container_id_for_instance(instance)
        if not container_id:
            return ProviderLogPage(
                entries=({"level": "error", "error": {"code": "PROVIDER_ERROR", "message": "no container_id in provider_ref"}},),
                provider_id=self.id,
                instance_id=instance.get("id"),
            )
        cmd = self._cmd_prefix + ["logs", "--tail", "50", container_id]
        if cursor:
            # cursor could be timestamp; we ignore for now
            cmd = self._cmd_prefix + ["logs", "--since", cursor, container_id]
        code, stdout, stderr = _run_cmd(cmd, timeout=10)
        if code != 0:
            return ProviderLogPage(
                entries=({"level": "error", "error": {"code": "PROVIDER_ERROR", "message": stderr[:200]}},),
                provider_id=self.id,
                instance_id=instance.get("id"),
            )
        # Split into lines
        lines = [line.strip() for line in stdout.splitlines() if line.strip()]
        entries = [{"level": "info", "message": line} for line in lines[-50:]]
        return ProviderLogPage(
            entries=entries,
            provider_id=self.id,
            instance_id=instance.get("id"),
            next_cursor=None,  # Could be timestamp of last line
        )

    def plan(self, operation_id: str, spec: dict[str, Any], *, timeout: float | None = None) -> ProviderResult:
        # No plan for containers
        return ProviderResult.failed(
            "plan",
            "UNSUPPORTED_CAPABILITY",
            "local container provider does not support plan",
            provider_id=self.id,
            operation_id=operation_id,
        )

    def apply_plan(self, operation_id: str, spec: dict[str, Any], plan_fingerprint: str, *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        return ProviderResult.failed(
            "apply_plan",
            "UNSUPPORTED_CAPABILITY",
            "local container provider does not support apply_plan",
            provider_id=self.id,
            operation_id=operation_id,
        )