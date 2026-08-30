"""Server-side retry policy with backoff (Fase 5 — UC 82)."""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

RETRY_INTERVAL_SECONDS = 3600  # hourly sweep
WINDOW_SECONDS = 24 * 3600
SWEEP_LOCK_PREFIX = "radas.retry_sweep"


def _store_path() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "retry_policy.json"
    except Exception:
        return Path("data") / "retry_policy.json"


def load() -> Dict[str, Any]:
    try:
        p = _store_path()
        if p.exists():
            d = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(d, dict):
                return d
    except Exception:
        pass
    return {}


DEFAULT_POLICY = {"max_retries": 0, "backoff_seconds": 300}


def get_policy(project_id: str, stack_name: Optional[str] = None) -> Dict[str, Any]:
    project_data = load().get(project_id) or {}
    project_policy = {
        "max_retries": project_data.get("max_retries", DEFAULT_POLICY["max_retries"]),
        "backoff_seconds": project_data.get("backoff_seconds", DEFAULT_POLICY["backoff_seconds"]),
    }
    if "updated_at" in project_data:
        project_policy["updated_at"] = project_data["updated_at"]
    if "stacks" in project_data:
        project_policy["stacks"] = project_data["stacks"]

    if stack_name:
        stack_policy = (project_data.get("stacks") or {}).get(stack_name)
        if stack_policy:
            return stack_policy
        return {
            "max_retries": project_policy["max_retries"],
            "backoff_seconds": project_policy["backoff_seconds"],
        }
    return project_policy


def save_policy(project_id: str, max_retries: int, backoff_seconds: int, stack_name: Optional[str] = None) -> Dict[str, Any]:
    data = load()
    pol = {"max_retries": max(0, int(max_retries)), "backoff_seconds": max(0, int(backoff_seconds)),
           "updated_at": time.time()}
    if stack_name:
        project = data.setdefault(project_id, {})
        project.setdefault("stacks", {})[stack_name] = pol
    else:
        data[project_id] = pol
    p = _store_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return pol


def _chain_depth(execution_id: str, project_id: str, depth: int = 0) -> int:
    try:
        from utils.project_paths import get_project_executions_dir
        p = get_project_executions_dir(project_id) / f"{execution_id}.json"
        if not p.exists() or depth > 10:
            return depth
        d = json.loads(p.read_text(encoding="utf-8"))
        parent = d.get("retry_of")
        if parent:
            return _chain_depth(parent, project_id, depth + 1)
    except Exception:
        pass
    return depth


def sweep_once() -> Dict[str, int]:
    """Re-queue failed executions per retry policy (backoff aware).

    Acquires a project-scoped advisory transaction lock per project so
    concurrent backend processes (multi-worker WSGI / replicas) cannot
    double-retry the same execution. The ``.retrying`` marker uses atomic
    ``O_CREAT|O_EXCL`` creation to close the TOCTOU window.
    """
    now = time.time()
    retried = {"retried": 0, "skipped_backoff": 0}
    try:
        from services.execution_retry import retry_execution
        from utils.project_paths import get_project_executions_dir
        from storage import pg

        for project_id, project_policy in load().items():
            policies = {"": project_policy}
            policies.update(project_policy.get("stacks") or {})

            # Per-project advisory lock: prevents two processes from
            # scanning the same project's failed executions concurrently.
            try:
                with pg.transaction() as conn:
                    conn.execute(
                        "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                        (SWEEP_LOCK_PREFIX + ":" + project_id,),
                    )
            except Exception as lock_err:
                logger.warning("[retry_policy] advisory lock failed for %s: %s", project_id, lock_err)
                continue

            for stack_name, pol in policies.items():
                max_retries = int(pol.get("max_retries") or 0)
                if max_retries <= 0:
                    continue
                backoff = int(pol.get("backoff_seconds") or 0)
                ed = get_project_executions_dir(project_id)
                if not ed.exists():
                    continue
                for f in ed.glob("*.json"):
                    try:
                        rec = json.loads(f.read_text(encoding="utf-8"))
                    except Exception:
                        continue
                    if str(rec.get("status", "")).upper() != "FAILED":
                        continue
                    record_stack = str((rec.get("runParams") or {}).get("stack_name") or "")
                    if stack_name and record_stack != stack_name:
                        continue
                    finished = rec.get("finishedAt") or rec.get("statusUpdatedAt") or rec.get("createdAt") or 0
                    if now - float(finished) > WINDOW_SECONDS:
                        continue
                    depth = _chain_depth(rec.get("id"), project_id)
                    if depth >= max_retries:
                        continue
                    wait = backoff * (depth + 1)
                    if now - float(finished) < wait:
                        retried["skipped_backoff"] += 1
                        continue
                    try:
                        # Atomic creation: O_CREAT|O_EXCL — if the file
                        # already exists this raises FileExistsError,
                        # closing the TOCTOU window that the previous
                        # exists()-then-write_text() pattern had.
                        marker = ed / f"{rec.get('id')}.retrying"
                        fd = os.open(str(marker), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                        os.write(fd, str(now).encode("utf-8"))
                        os.close(fd)
                        try:
                            retry_execution(rec.get("id"), project_id=project_id)
                            retried["retried"] += 1
                        except Exception:
                            marker.unlink(missing_ok=True)
                            raise
                    except FileExistsError:
                        continue
                    except Exception:
                        pass
    except Exception as e:
        logger.error(f"[retry_policy] sweep error: {e}")
    return retried


def _loop(interval: int = RETRY_INTERVAL_SECONDS) -> None:
    while True:
        try:
            sweep_once()
        except Exception as e:
            logger.error(f"[retry_policy] loop error: {e}")
        time.sleep(interval)


def start_retry_scheduler() -> None:
    t = threading.Thread(target=_loop, daemon=True)
    t.start()
    logger.info("Retry policy scheduler started (hourly)")
