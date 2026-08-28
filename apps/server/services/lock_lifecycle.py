"""Execution-scoped lock lifecycle helpers (Phase 5 — Task 5.3).

Every mutating TOFU_RUN acquires a project lock (UC373) and, when the stack
uses a remote backend, a remote-state lock (UC331). Both lock IDs travel on
the execution record (runParams["lock_ids"]) so every terminal path releases
by exact lease ID instead of reconstructing backend identity.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from services import project_lock, remote_state_lock

_REMOTE_KEY_FALLBACK = "cloud-provisioning/{stack}.tfstate"


def acquire_for_execution(
    project_id: str,
    stack: str,
    action: str,
    *,
    actor: str,
    run_id: Optional[str] = None,
    backend_config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Acquire the project lock and (for remote backends) the remote-state lock.

    Returns {"project": <acquire result>, "remote": <result or None>}.
    If the project lock cannot be acquired the remote lock is not attempted.
    """
    project = project_lock.acquire(
        project_id, actor=actor, operation=action, run_id=run_id
    )
    if not project.get("ok"):
        return {"project": project, "remote": None}

    remote: Optional[Dict[str, Any]] = None
    backend = backend_config or {}
    if backend.get("backend_type") not in (None, "", "local"):
        backend_type = str(backend["backend_type"])
        backend_key = str(
            (backend.get("values") or {}).get("key")
            or _REMOTE_KEY_FALLBACK.format(stack=stack)
        )
        remote = remote_state_lock.acquire(
            stack, backend_type, backend_key,
            actor=actor, operation=action, run_id=run_id,
        )
    return {"project": project, "remote": remote}


def release_for_acquisition(
    acquisition: Dict[str, Any],
    *,
    stack: str,
    project_id: str,
) -> int:
    """Release locks returned by acquire_for_execution (enqueue-failure path)."""
    released = 0
    project = (acquisition or {}).get("project") or {}
    if project.get("ok") and project.get("lock", {}).get("id"):
        result = project_lock.release(
            project_id, lock_id=project["lock"]["id"], force=True
        )
        released += 1 if result.get("released") else 0
    remote = (acquisition or {}).get("remote")
    if remote and remote.get("ok") and remote.get("lock", {}).get("id"):
        lock = remote["lock"]
        result = remote_state_lock.release(
            stack, lock["backend_type"], lock["backend_key"],
            lock_id=lock["id"], force=True,
        )
        released += 1 if result.get("released") else 0
    return released


def lock_ids_from_acquisition(acquisition: Dict[str, Any]) -> Dict[str, Any]:
    """Project the acquisition result onto the stable runParams["lock_ids"] shape."""
    ids: Dict[str, Any] = {}
    project = (acquisition or {}).get("project") or {}
    if project.get("ok"):
        ids["project_lock_id"] = project["lock"]["id"]
    remote = (acquisition or {}).get("remote")
    if remote and remote.get("ok"):
        lock = remote["lock"]
        ids["remote_state_lock_id"] = lock["id"]
        ids["remote_state"] = {
            "stack": lock["stack"],
            "backend_type": lock["backend_type"],
            "backend_key": lock["backend_key"],
        }
    return ids


def release_for_execution(execution: Dict[str, Any]) -> Dict[str, Any]:
    """Release all locks recorded on an execution. Idempotent.

    Reads runParams["lock_ids"]; executions without stored IDs (legacy or
    non-mutating) release nothing. Falls back to project-level release only
    when a project lock ID is absent but the run was a mutating TOFU_RUN.
    """
    released = 0
    run_params = execution.get("runParams") or {}
    lock_ids = run_params.get("lock_ids") if isinstance(run_params, dict) else None
    lock_ids = lock_ids if isinstance(lock_ids, dict) else {}
    project_id = str(execution.get("projectId") or "")

    project_lock_id = lock_ids.get("project_lock_id")
    if project_lock_id and project_id:
        result = project_lock.release(project_id, lock_id=str(project_lock_id))
        released += 1 if result.get("released") else 0

    remote_id = lock_ids.get("remote_state_lock_id")
    remote = lock_ids.get("remote_state") or {}
    if remote_id and remote.get("stack") and remote.get("backend_type") and remote.get("backend_key"):
        result = remote_state_lock.release(
            str(remote["stack"]),
            str(remote["backend_type"]),
            str(remote["backend_key"]),
            lock_id=str(remote_id),
        )
        released += 1 if result.get("released") else 0

    return {"released": released}


def cleanup_all() -> Dict[str, int]:
    """Expire stale leases so dead workers never permanently consume capacity."""
    return {
        "project": project_lock.cleanup_expired(),
        "remote": remote_state_lock.cleanup_expired(),
    }
