"""Explicitly gated local Docker/Podman provider with subprocess execution.

The provider is registered for every runtime consumer through
``runtime_registry.registry_from_environment``.  Execution requires the
explicit ``allow_execution`` configuration gate *and* a bounded command
timeout; without both, the adapter stays a status stub that reports the
stable ``PROVIDER_DISABLED`` result for every operation.

Every command argument is validated before a subprocess is spawned, child
processes are killed and reaped on timeout, and command arguments are
redacted before they can reach results, logs, or persisted details.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
from typing import Any, ClassVar

from ..runtime_provider import (
    ProviderLogPage,
    ProviderResult,
    RuntimeProviderError,
    RuntimeProviderTimeoutError,
    redact,
)

_IMAGE_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,255}$")
_CONTAINER_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,126}$")
_ENV_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_LABEL_KEY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
_VOLUME_MODES = frozenset({"ro", "rw"})
_NAMED_VOLUME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
_MANAGED_LABEL = "radas.managed=true"
_LOG_TAIL = 200
_REAP_TIMEOUT = 5.0


def _scalar_text(value: Any) -> str | None:
    """Return a safe string form for scalar values; reject nested data."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (str, int, float)):
        return str(value)
    return None


def _validate_ports(ports: Any, errors: list[dict[str, str]]) -> None:
    if ports is None:
        return
    if not isinstance(ports, (list, tuple)):
        errors.append({"code": "INVALID_SPEC", "message": "ports must be a list"})
        return
    for port in ports:
        value = port.get("port") if isinstance(port, dict) else port
        if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 65535:
            errors.append({"code": "INVALID_SPEC", "message": "ports must be integers between 1 and 65535"})
            return


def _validate_env(env: Any, errors: list[dict[str, str]]) -> None:
    if env is None:
        return
    if not isinstance(env, dict):
        errors.append({"code": "INVALID_SPEC", "message": "env must be an object"})
        return
    for key, value in env.items():
        if not isinstance(key, str) or not _ENV_KEY_RE.fullmatch(key):
            errors.append({"code": "INVALID_SPEC", "message": "env keys must be valid environment variable names"})
            return
        if _scalar_text(value) is None:
            errors.append({"code": "INVALID_SPEC", "message": "env values must be scalar"})
            return


def _validate_volumes(volumes: Any, errors: list[dict[str, str]]) -> None:
    if volumes is None:
        return
    if not isinstance(volumes, (list, tuple)):
        errors.append({"code": "INVALID_SPEC", "message": "volumes must be a list"})
        return
    for volume in volumes:
        if not isinstance(volume, str) or not volume or any(character.isspace() for character in volume):
            errors.append({"code": "INVALID_SPEC", "message": "volumes must be 'source:destination[:mode]' without whitespace"})
            return
        parts = volume.split(":")
        if len(parts) not in {2, 3} or not all(parts):
            errors.append({"code": "INVALID_SPEC", "message": "volumes must be 'source:destination[:mode]'"})
            return
        source, destination = parts[0], parts[1]
        source_is_path = source.startswith("/")
        source_is_named_volume = bool(_NAMED_VOLUME_RE.fullmatch(source))
        if not destination.startswith("/") or not (source_is_path or source_is_named_volume):
            errors.append({"code": "INVALID_SPEC", "message": "volume destination must be an absolute path"})
            return
        if len(parts) == 3 and parts[2] not in _VOLUME_MODES:
            errors.append({"code": "INVALID_SPEC", "message": "volume mode must be 'ro' or 'rw'"})
            return


def _validate_labels(labels: Any, errors: list[dict[str, str]]) -> None:
    if labels is None:
        return
    if not isinstance(labels, dict):
        errors.append({"code": "INVALID_SPEC", "message": "labels must be an object"})
        return
    for key, value in labels.items():
        if not isinstance(key, str) or not _LABEL_KEY_RE.fullmatch(key):
            errors.append({"code": "INVALID_SPEC", "message": "label keys must not contain whitespace or separators"})
            return
        if _scalar_text(value) is None:
            errors.append({"code": "INVALID_SPEC", "message": "label values must be scalar"})
            return


def _container_name(spec: dict[str, Any]) -> str:
    """Derive the deterministic managed container name from the spec name."""
    raw = str(spec.get("name") or "").strip().lower()
    slug = re.sub(r"[^a-z0-9_.-]+", "-", raw).strip("-._")
    return f"radas-{slug}" if slug else ""


def _validate_spec(spec: dict[str, Any]) -> list[dict[str, str]]:
    """Validate every value that would reach a command line. No side effects."""
    errors: list[dict[str, str]] = []
    if not isinstance(spec, dict):
        return [{"code": "INVALID_SPEC", "message": "spec must be an object"}]
    image = spec.get("image")
    if not isinstance(image, str) or not _IMAGE_RE.fullmatch(image):
        errors.append({"code": "INVALID_SPEC", "message": "image is required and must not contain whitespace or leading dashes"})
    if not _CONTAINER_NAME_RE.fullmatch(_container_name(spec)):
        errors.append({"code": "INVALID_SPEC", "message": "name must resolve to a valid container name"})
    _validate_ports(spec.get("ports"), errors)
    _validate_env(spec.get("env"), errors)
    _validate_volumes(spec.get("volumes"), errors)
    _validate_labels(spec.get("labels"), errors)
    return errors


class LocalContainerProvider:
    id = "local-container"
    # Class-level default; the instance value reflects the execution gate.
    TIMEOUT_ENFORCED: ClassVar[bool] = False

    def __init__(self, *, config: dict[str, Any] | None = None, enabled: bool = False):
        self.config = dict(config or {})
        self.requested_enabled = bool(enabled and self.config.get("allow_execution", False))
        raw_timeout = self.config.get("command_timeout")
        if isinstance(raw_timeout, bool) or not isinstance(raw_timeout, (int, float)) or float(raw_timeout) <= 0:
            timeout: float | None = None
        else:
            timeout = float(raw_timeout)
        self.command_timeout = timeout
        # Execution requires the explicit allow_execution gate AND a bounded
        # command timeout; without both the adapter remains a status stub.
        self.execution_active = bool(self.requested_enabled and timeout is not None)
        self.enabled = self.execution_active
        self.TIMEOUT_ENFORCED = self.execution_active
        runtime = str(self.config.get("runtime", "docker")).strip().lower() or "docker"
        self.runtime = runtime
        socket = self.config.get("socket")
        self.socket = str(socket).strip() if isinstance(socket, str) and socket.strip() else None
        network = self.config.get("network")
        self.network = str(network).strip() if isinstance(network, str) and network.strip() else None

    # ------------------------------------------------------------------
    # Contract surface
    # ------------------------------------------------------------------

    def capabilities(self) -> dict[str, bool]:
        active = self.execution_active and self.runtime in {"docker", "podman"}
        return {
            "deploy": active,
            "update": active,
            "start": active,
            "stop": active,
            "restart": active,
            "destroy": active,
            "logs": active,
            "status": active,
            "healthcheck": False,
            "public_endpoint": False,
            "plan": False,
            "apply_plan": False,
        }

    def validate(self, spec: dict[str, Any]) -> list[dict[str, Any]]:
        if not self.enabled:
            return [{"code": "PROVIDER_DISABLED", "message": "local container provider is disabled"}]
        if self.runtime not in {"docker", "podman"}:
            return [{"code": "INVALID_RUNTIME", "message": "runtime must be docker or podman"}]
        return _validate_spec(spec)

    def enforce_timeout(self, timeout: float) -> None:
        if not self.execution_active:
            raise RuntimeProviderError(
                "UNSUPPORTED_TIMEOUT",
                "runtime provider adapter cannot honor operation timeout",
            )
        if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or float(timeout) < 0:
            raise ValueError("timeout must be a finite, non-negative number")

    def gate_result(self, operation: str, *, operation_id: str | None = None, idempotency_key: str | None = None) -> ProviderResult | None:
        """Registry contract: stable terminal status while execution is gated.

        The registry consults this when an operation is not advertised because
        the provider is disabled by configuration, so targeting a disabled
        local runtime yields ``PROVIDER_DISABLED`` instead of a generic
        capability error.  Returns ``None`` when the provider is active.
        """
        if not self.execution_active:
            return self._disabled(operation, operation_id, idempotency_key)
        return None

    # ------------------------------------------------------------------
    # Operations
    # ------------------------------------------------------------------

    def _gate(self, operation: str, operation_id: str | None = None, idempotency_key: str | None = None) -> ProviderResult | None:
        """Return a terminal failure result when the adapter may not execute."""
        if not self.execution_active:
            return self._disabled(operation, operation_id, idempotency_key)
        if self.runtime not in {"docker", "podman"}:
            return ProviderResult.failed(
                operation, "INVALID_RUNTIME", "runtime provider configuration is invalid",
                provider_id=self.id, operation_id=operation_id, idempotency_key=idempotency_key,
            )
        return None

    def _unavailable(self, operation: str, operation_id: str | None, idempotency_key: str | None) -> ProviderResult:
        return ProviderResult.failed(
            operation, "RUNTIME_UNAVAILABLE", "local container runtime binary is not available",
            provider_id=self.id, operation_id=operation_id, idempotency_key=idempotency_key,
        )

    def _invalid_spec(self, operation: str, operation_id: str | None, idempotency_key: str | None, errors: list[dict[str, str]]) -> ProviderResult:
        return ProviderResult.failed(
            operation, "INVALID_SPEC", "local container spec is invalid",
            details={"errors": errors[:20]},
            provider_id=self.id, operation_id=operation_id, idempotency_key=idempotency_key,
        )

    def _subprocess_env(self) -> dict[str, str]:
        env = dict(os.environ)
        if self.socket:
            env["DOCKER_HOST"] = self.socket if self.socket.startswith("unix://") else f"unix://{self.socket}"
        return env

    def _run(self, argv: list[str], timeout: float | None) -> str:
        """Run one validated command; kill and reap the child on timeout.

        Raises ``RuntimeProviderError`` with redacted arguments on failure so
        no raw secret-bearing argument can leak into persisted details.
        """
        effective = float(timeout) if timeout is not None else (self.command_timeout or 120.0)
        try:
            process = subprocess.Popen(
                argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                env=self._subprocess_env(),
            )
        except OSError as exc:
            raise RuntimeProviderError(
                "RUNTIME_UNAVAILABLE",
                "local container runtime binary is not available",
                details={"reason": type(exc).__name__},
            ) from None
        try:
            stdout, stderr = process.communicate(timeout=effective)
        except subprocess.TimeoutExpired:
            process.kill()
            try:
                process.communicate(timeout=_REAP_TIMEOUT)
            except Exception:  # pragma: no cover - reap is best effort
                pass
            raise RuntimeProviderTimeoutError() from None
        if process.returncode != 0:
            raise RuntimeProviderError(
                "REMOTE_ERROR",
                "local container runtime command failed",
                details={"argv": redact(list(argv)), "stderr": redact(str(stderr or ""))[:2000]},
            )
        return stdout or ""

    def _command_result(
        self, operation: str, operation_id: str | None, idempotency_key: str | None,
        argv: list[str], timeout: float | None,
    ) -> str | ProviderResult:
        try:
            return self._run(argv, timeout)
        except RuntimeProviderTimeoutError:
            return ProviderResult.failed(
                operation, "PROVIDER_TIMEOUT", "local container command timed out",
                details={"argv": redact(list(argv))},
                provider_id=self.id, operation_id=operation_id, idempotency_key=idempotency_key,
            )
        except RuntimeProviderError as exc:
            return ProviderResult.failed(
                operation, exc.code, exc.message, details=exc.details,
                provider_id=self.id, operation_id=operation_id, idempotency_key=idempotency_key,
            )

    def _deploy_argv(self, spec: dict[str, Any]) -> list[str]:
        name = _container_name(spec)
        argv = [self.runtime, "run", "-d", "--name", name, "--label", _MANAGED_LABEL]
        for key in sorted(spec.get("labels") or {}):
            argv.extend(["--label", f"{key}={_scalar_text(spec['labels'][key])}"])
        for port in spec.get("ports") or []:
            value = port.get("port") if isinstance(port, dict) else port
            argv.extend(["-p", f"{int(value)}:{int(value)}"])
        for key in sorted(spec.get("env") or {}):
            argv.extend(["-e", f"{key}={_scalar_text(spec['env'][key])}"])
        for volume in spec.get("volumes") or []:
            argv.extend(["-v", volume])
        if self.network:
            argv.extend(["--network", self.network])
        argv.append(str(spec["image"]))
        return argv

    def _deploy(self, operation: str, operation_id: str | None, idempotency_key: str | None, spec: dict[str, Any], timeout: float | None) -> ProviderResult:
        errors = _validate_spec(spec)
        if errors:
            return self._invalid_spec(operation, operation_id, idempotency_key, errors)
        if shutil.which(self.runtime) is None:
            return self._unavailable(operation, operation_id, idempotency_key)
        outcome = self._command_result(operation, operation_id, idempotency_key, self._deploy_argv(spec), timeout)
        if isinstance(outcome, ProviderResult):
            return outcome
        container_id = outcome.strip().splitlines()[-1] if outcome.strip() else ""
        return ProviderResult.ok(
            operation,
            data={"provider_ref": {
                "runtime": self.runtime,
                "container_id": container_id,
                "container_name": _container_name(spec),
            }},
            provider_id=self.id, operation_id=operation_id, idempotency_key=idempotency_key,
        )

    def _container_ref(self, instance: dict[str, Any]) -> str | None:
        ref = instance.get("provider_ref") if isinstance(instance, dict) else None
        if isinstance(ref, dict):
            ref = ref.get("container_id") or ref.get("containerId") or ref.get("id")
        if isinstance(ref, str):
            candidate = ref.strip()
            if _CONTAINER_NAME_RE.fullmatch(candidate):
                return candidate
        return None

    def _lifecycle(self, operation: str, operation_id: str | None, idempotency_key: str | None, instance: dict[str, Any], args: list[str], state: str, timeout: float | None) -> ProviderResult:
        container = self._container_ref(instance)
        if container is None:
            return ProviderResult.failed(
                operation, "INVALID_SPEC", "instance has no local container reference",
                provider_id=self.id, operation_id=operation_id, idempotency_key=idempotency_key,
            )
        if shutil.which(self.runtime) is None:
            return self._unavailable(operation, operation_id, idempotency_key)
        outcome = self._command_result(operation, operation_id, idempotency_key, [self.runtime, *args, container], timeout)
        if isinstance(outcome, ProviderResult):
            return outcome
        return ProviderResult.ok(
            operation,
            data={"provider_ref": {"runtime": self.runtime, "container_id": container}, "state": state},
            provider_id=self.id, operation_id=operation_id, idempotency_key=idempotency_key,
        )

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
        gate = self._gate("deploy", operation_id, idempotency_key)
        if gate:
            return gate
        return self._deploy("deploy", operation_id, idempotency_key, spec, timeout)

    def update(self, operation_id: str, spec: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        gate = self._gate("update", operation_id, idempotency_key)
        if gate:
            return gate
        # Recreate semantics: best-effort removal of the previous container,
        # then a fresh deploy of the desired spec under the same name.
        name = _container_name(spec)
        if name and shutil.which(self.runtime) is not None:
            try:
                self._run([self.runtime, "rm", "-f", name], timeout)
            except RuntimeProviderError:
                pass
        return self._deploy("update", operation_id, idempotency_key, spec, timeout)

    def start(self, operation_id: str, instance: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        gate = self._gate("start", operation_id, idempotency_key)
        if gate:
            return gate
        return self._lifecycle("start", operation_id, idempotency_key, instance, ["start"], "running", timeout)

    def stop(self, operation_id: str, instance: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        gate = self._gate("stop", operation_id, idempotency_key)
        if gate:
            return gate
        return self._lifecycle("stop", operation_id, idempotency_key, instance, ["stop"], "stopped", timeout)

    def restart(self, operation_id: str, instance: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        gate = self._gate("restart", operation_id, idempotency_key)
        if gate:
            return gate
        return self._lifecycle("restart", operation_id, idempotency_key, instance, ["restart"], "running", timeout)

    def destroy(self, operation_id: str, instance: dict[str, Any], *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        gate = self._gate("destroy", operation_id, idempotency_key)
        if gate:
            return gate
        return self._lifecycle("destroy", operation_id, idempotency_key, instance, ["rm", "-f"], "destroyed", timeout)

    def status(self, instance: dict[str, Any], *, timeout: float | None = None) -> ProviderResult:
        gate = self._gate("status")
        if gate:
            return gate
        if shutil.which(self.runtime) is None:
            return self._unavailable("status", None, None)
        container = self._container_ref(instance)
        if container is None:
            return ProviderResult.failed(
                "status", "INVALID_SPEC", "instance has no local container reference",
                provider_id=self.id,
            )
        try:
            stdout = self._run([self.runtime, "inspect", "-f", "{{.State.Status}}", container], timeout)
        except RuntimeProviderTimeoutError:
            return ProviderResult.failed("status", "PROVIDER_TIMEOUT", "local container command timed out", provider_id=self.id)
        except RuntimeProviderError as exc:
            return ProviderResult.failed("status", exc.code, exc.message, details=exc.details, provider_id=self.id)
        state = stdout.strip().splitlines()[-1] if stdout.strip() else "unknown"
        return ProviderResult.ok(
            "status",
            data={"provider_ref": {"runtime": self.runtime, "container_id": container}, "state": state},
            provider_id=self.id,
        )

    def logs(self, instance: dict[str, Any], cursor: str | None = None, *, timeout: float | None = None) -> ProviderLogPage:
        if not self.execution_active:
            return ProviderLogPage(
                entries=({"level": "error", "error": {"code": "PROVIDER_DISABLED", "message": "local container provider is disabled"}},),
                provider_id=self.id,
                instance_id=str(instance.get("id")) if instance.get("id") is not None else None,
            )
        container = self._container_ref(instance)
        if container is None or shutil.which(self.runtime) is None:
            return ProviderLogPage(
                entries=({"level": "error", "error": {"code": "RUNTIME_UNAVAILABLE", "message": "local container runtime is unavailable"}},),
                provider_id=self.id,
                instance_id=str(instance.get("id")) if instance.get("id") is not None else None,
            )
        try:
            stdout = self._run([self.runtime, "logs", "--tail", str(_LOG_TAIL), container], timeout)
        except RuntimeProviderTimeoutError:
            return ProviderLogPage(
                entries=({"level": "error", "error": {"code": "PROVIDER_TIMEOUT", "message": "local container command timed out"}},),
                provider_id=self.id,
                instance_id=str(instance.get("id")) if instance.get("id") is not None else None,
            )
        except RuntimeProviderError as exc:
            return ProviderLogPage(
                entries=({"level": "error", "error": {"code": exc.code, "message": exc.message, "details": exc.details}},),
                provider_id=self.id,
                instance_id=str(instance.get("id")) if instance.get("id") is not None else None,
            )
        lines = [line for line in stdout.splitlines() if line.strip()][-_LOG_TAIL:]
        return ProviderLogPage(
            entries=tuple({"level": "info", "message": line} for line in lines),
            provider_id=self.id,
            instance_id=str(instance.get("id")) if instance.get("id") is not None else None,
        )

    def plan(self, operation_id: str, spec: dict[str, Any], *, timeout: float | None = None) -> ProviderResult:
        return self._disabled("plan", operation_id)

    def apply_plan(self, operation_id: str, spec: dict[str, Any], plan_fingerprint: str, *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
        return self._disabled("apply_plan", operation_id, idempotency_key)
