"""Server-side retry policy with backoff (Fase 5 — UC 82)."""
from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

RETRY_INTERVAL_SECONDS = 3600  # hourly sweep
WINDOW_SECONDS = 24 * 3600


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


def get_policy(project_id: str) -> Dict[str, Any]:
    return load().get(project_id, {"max_retries": 0, "backoff_seconds": 300})


def save_policy(project_id: str, max_retries: int, backoff_seconds: int) -> Dict[str, Any]:
    data = load()
    pol = {"max_retries": max(0, int(max_retries)), "backoff_seconds": max(0, int(backoff_seconds)),
           "updated_at": time.time()}
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
    """Re-queue failed executions per retry policy (backoff aware)."""
    now = time.time()
    retried = {"retried": 0, "skipped_backoff": 0}
    try:
        from services.execution_history import list_executions
        from services.execution_retry import retry_execution
        from utils.project_paths import get_project_executions_dir
        import glob as _glob
        for project_id, pol in load().items():
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
                    retry_execution(rec.get("id"), project_id=project_id)
                    retried["retried"] += 1
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
