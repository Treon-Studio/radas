"""PostgreSQL-backed worker/execution index (Fase 7 — ported from SQLite).

Replaces the legacy SQLite ``index.db`` optimization for the hot worker
paths (claim queue, running ownership, token lookup). JSON execution files
remain the source of truth; this module is an index with a fast fallback to
file scans when Postgres is unreachable.

Public API (unchanged from the SQLite version):

    is_ready() -> bool
    add_queued_execution / remove_queued_execution / list_queued / queued_count
    upsert_execution_location / find_execution_project
    mark_running_execution / remove_running_execution
    running_count_for_worker / list_running_for_worker
    prune_stale_running_for_worker
    upsert_worker_token / remove_worker_token
    find_worker_by_token_hash / all_worker_salts / worker_token_count
    backfill_if_empty(projects_dir, workers_dir)
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

_READY = False


def _data_dir() -> Path:
    import os
    env_dir = os.environ.get("DATA_DIR")
    if env_dir:
        return Path(env_dir)
    return Path(__file__).resolve().parent.parent.parent / "data"


def _check_ready() -> bool:
    global _READY
    try:
        from storage import pg
        pg.ping()
        _READY = True
    except Exception as e:  # pragma: no cover - defensive
        logger.warning("index_db unavailable, falling back to JSON scans: %s", e)
        _READY = False
    return _READY


def is_ready() -> bool:
    return _READY


# ---------------------------------------------------------------------------
# Queued executions
# ---------------------------------------------------------------------------

def add_queued_execution(
    execution_id: str,
    project_id: str,
    queued_at: float,
    requirements: Optional[dict] = None,
) -> None:
    from storage import pg
    if not execution_id or not project_id:
        return
    try:
        pg.execute(
            "INSERT INTO queued_executions "
            "(execution_id, project_id, queued_at, requirements) VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (execution_id) DO UPDATE SET "
            "project_id = EXCLUDED.project_id, queued_at = EXCLUDED.queued_at, "
            "requirements = EXCLUDED.requirements",
            (execution_id, project_id, float(queued_at or time.time()),
             json.dumps(requirements or {}, ensure_ascii=False)),
        )
    except Exception as e:
        logger.warning("add_queued_execution failed for %s: %s", execution_id, e)


def remove_queued_execution(execution_id: str) -> None:
    from storage import pg
    if not execution_id:
        return
    try:
        pg.execute("DELETE FROM queued_executions WHERE execution_id = %s", (execution_id,))
    except Exception as e:
        logger.warning("remove_queued_execution failed for %s: %s", execution_id, e)


def upsert_execution_location(
    execution_id: str,
    project_id: str,
    status: Optional[str] = None,
    worker_id: Optional[str] = None,
    updated_at: Optional[float] = None,
) -> None:
    from storage import pg
    if not execution_id or not project_id:
        return
    try:
        pg.execute(
            "INSERT INTO execution_locations "
            "(execution_id, project_id, status, worker_id, updated_at) VALUES (%s, %s, %s, %s, %s) "
            "ON CONFLICT (execution_id) DO UPDATE SET "
            "project_id = EXCLUDED.project_id, status = EXCLUDED.status, "
            "worker_id = EXCLUDED.worker_id, updated_at = EXCLUDED.updated_at",
            (execution_id, project_id, status, worker_id, float(updated_at or time.time())),
        )
    except Exception as e:
        logger.warning("upsert_execution_location failed for %s: %s", execution_id, e)


def find_execution_project(execution_id: str) -> Optional[str]:
    from storage import pg
    if not execution_id:
        return None
    try:
        row = pg.query_one(
            "SELECT project_id FROM execution_locations WHERE execution_id = %s",
            (execution_id,),
        )
        return row["project_id"] if row else None
    except Exception as e:
        logger.warning("find_execution_project failed for %s: %s", execution_id, e)
        return None


def mark_running_execution(
    execution_id: str,
    project_id: str,
    worker_id: str,
    started_at: Optional[float] = None,
) -> None:
    if not execution_id or not project_id or not worker_id:
        return
    ts = float(started_at or time.time())
    try:
        from storage import pg
        pg.execute(
            "INSERT INTO running_executions "
            "(execution_id, project_id, worker_id, started_at) VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (execution_id) DO UPDATE SET "
            "project_id = EXCLUDED.project_id, worker_id = EXCLUDED.worker_id, "
            "started_at = EXCLUDED.started_at",
            (execution_id, project_id, worker_id, ts),
        )
        remove_queued_execution(execution_id)
        upsert_execution_location(execution_id, project_id, "RUNNING", worker_id, ts)
    except Exception as e:
        logger.warning("mark_running_execution failed for %s: %s", execution_id, e)


def remove_running_execution(execution_id: str) -> None:
    from storage import pg
    if not execution_id:
        return
    try:
        pg.execute("DELETE FROM running_executions WHERE execution_id = %s", (execution_id,))
    except Exception as e:
        logger.warning("remove_running_execution failed for %s: %s", execution_id, e)


def running_count_for_worker(worker_id: str) -> Optional[int]:
    from storage import pg
    if not worker_id:
        return None
    try:
        row = pg.query_one(
            "SELECT COUNT(*) AS n FROM running_executions WHERE worker_id = %s",
            (worker_id,),
        )
        return int(row["n"]) if row else 0
    except Exception as e:
        logger.warning("running_count_for_worker failed for %s: %s", worker_id, e)
        return None


def list_running_for_worker(worker_id: str) -> List[Tuple[str, str, float]]:
    """Return list of (execution_id, project_id, started_at) rows for a worker."""
    from storage import pg
    if not worker_id:
        return []
    try:
        rows = pg.query_all(
            "SELECT execution_id, project_id, started_at FROM running_executions "
            "WHERE worker_id = %s", (worker_id,),
        )
        return [(r["execution_id"], r["project_id"], float(r["started_at"] or 0)) for r in rows]
    except Exception as e:
        logger.warning("list_running_for_worker failed for %s: %s", worker_id, e)
        return []


def prune_stale_running_for_worker(
    worker_id: str,
    projects_dir: Path,
    current_execution_id: Optional[str] = None,
    mark_orphaned_failed: bool = False,
) -> int:
    """Cross-check RUNNING index rows against on-disk execution JSON. Any row
    whose file no longer exists or is no longer RUNNING is removed. Returns
    the number of rows pruned. Used to self-heal after a worker crash/SIGTERM
    that left orphan RUNNING entries blocking future claims."""
    pruned = 0
    now = time.time()
    for exec_id, proj_id, started in list_running_for_worker(worker_id):
        exec_file = projects_dir / proj_id / "history" / "executions" / f"{exec_id}.json"
        if not exec_file.exists():
            exec_file = projects_dir / proj_id / "executions" / f"{exec_id}.json"
        stale = False
        orphaned_running = False
        if not exec_file.exists():
            stale = True
        else:
            try:
                with open(exec_file, "r+", encoding="utf-8") as fh:
                    data = json.load(fh)
                status = data.get("status")
                owner = data.get("workerId")
                if status != "RUNNING" or (owner and owner != worker_id):
                    stale = True
                elif current_execution_id != exec_id and mark_orphaned_failed:
                    # Only an explicit recovery pass may infer that a same-worker
                    # RUNNING row is orphaned. Ordinary claim polling can have
                    # multiple live executions and must preserve those rows.
                    orphaned_running = True
                    stale = True
            except Exception:
                stale = True
        if stale:
            if orphaned_running and mark_orphaned_failed and exec_file.exists():
                try:
                    with open(exec_file, "r+", encoding="utf-8") as fh:
                        data = json.load(fh)
                        if data.get("status") == "RUNNING":
                            started_at = float(data.get("startedAt") or started or now)
                            data["status"] = "FAILED"
                            data["finishedAt"] = now
                            data["statusUpdatedAt"] = now
                            data["duration"] = max(0, int(now - started_at))
                            data["error"] = data.get("error") or "Worker restarted before reporting completion"
                            fh.seek(0)
                            fh.truncate()
                            json.dump(data, fh, indent=2, ensure_ascii=False)
                            try:
                                log_dir = projects_dir / proj_id / "history" / "logs"
                                log_dir.mkdir(parents=True, exist_ok=True)
                                with open(log_dir / f"{exec_id}.log", "a", encoding="utf-8") as log_fh:
                                    log_fh.write("\n[recovery] Worker restarted before reporting completion; marked as FAILED and unblocked the queue.\n")
                            except Exception:
                                pass
                            upsert_execution_location(exec_id, proj_id, "FAILED", worker_id, now)
                except Exception as e:
                    logger.warning("failed to mark orphan RUNNING execution %s as FAILED: %s", exec_id, e)
            remove_running_execution(exec_id)
            pruned += 1
    if pruned:
        logger.info("index_db pruned %d stale RUNNING rows for worker %s", pruned, worker_id)
    return pruned


def list_queued(
    project_id: Optional[str] = None, limit: int = 50
) -> List[Tuple[str, str, float]]:
    """Return oldest-first list of (execution_id, project_id, queued_at)."""
    from storage import pg
    try:
        if project_id:
            rows = pg.query_all(
                "SELECT execution_id, project_id, queued_at FROM queued_executions "
                "WHERE project_id = %s ORDER BY queued_at ASC LIMIT %s",
                (project_id, int(limit)),
            )
        else:
            rows = pg.query_all(
                "SELECT execution_id, project_id, queued_at FROM queued_executions "
                "ORDER BY queued_at ASC LIMIT %s",
                (int(limit),),
            )
        return [(r["execution_id"], r["project_id"], r["queued_at"]) for r in rows]
    except Exception as e:
        logger.warning("list_queued failed: %s", e)
        return []


def queued_count() -> int:
    from storage import pg
    try:
        row = pg.query_one("SELECT COUNT(*) AS n FROM queued_executions")
        return int(row["n"]) if row else 0
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# Worker tokens
# ---------------------------------------------------------------------------

def upsert_worker_token(worker_id: str, token_hash: str, salt: str) -> None:
    from storage import pg
    if not worker_id or not token_hash or not salt:
        return
    try:
        # A worker only has one active token at a time; drop any prior rows for it.
        pg.execute("DELETE FROM worker_tokens WHERE worker_id = %s", (worker_id,))
        pg.execute(
            "INSERT INTO worker_tokens (token_hash, worker_id, salt) "
            "VALUES (%s, %s, %s) ON CONFLICT (token_hash) DO NOTHING",
            (token_hash, worker_id, salt),
        )
    except Exception as e:
        logger.warning("upsert_worker_token failed for %s: %s", worker_id, e)


def remove_worker_token(worker_id: str) -> None:
    from storage import pg
    if not worker_id:
        return
    try:
        pg.execute("DELETE FROM worker_tokens WHERE worker_id = %s", (worker_id,))
    except Exception as e:
        logger.warning("remove_worker_token failed for %s: %s", worker_id, e)


def find_worker_by_token_hash(token_hash: str) -> Optional[Tuple[str, str]]:
    """Return (worker_id, salt) matching a full token hash, or None."""
    from storage import pg
    if not token_hash:
        return None
    try:
        row = pg.query_one(
            "SELECT worker_id, salt FROM worker_tokens WHERE token_hash = %s",
            (token_hash,),
        )
        if row:
            return (row["worker_id"], row["salt"])
    except Exception as e:
        logger.warning("find_worker_by_token_hash failed: %s", e)
    return None


def all_worker_salts() -> List[Tuple[str, str, str]]:
    """Return list of (worker_id, salt, token_hash) — used for slow-path token verify."""
    from storage import pg
    try:
        rows = pg.query_all("SELECT worker_id, salt, token_hash FROM worker_tokens")
        return [(r["worker_id"], r["salt"], r["token_hash"]) for r in rows]
    except Exception:
        return []


def worker_token_count() -> int:
    from storage import pg
    try:
        row = pg.query_one("SELECT COUNT(*) AS n FROM worker_tokens")
        return int(row["n"]) if row else 0
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# One-shot backfill (called at startup if the DB is empty)
# ---------------------------------------------------------------------------

def backfill_if_empty(projects_dir: Path, workers_dir: Path) -> None:
    """Walk the JSON tree once and populate the index if it's empty."""
    try:
        if queued_count() == 0:
            _backfill_queued(projects_dir)
        _backfill_execution_locations(projects_dir)
        if worker_token_count() == 0:
            _backfill_workers(workers_dir)
    except Exception as e:
        logger.warning("index_db backfill failed: %s", e)


def _backfill_queued(projects_dir: Path) -> None:
    if not projects_dir or not projects_dir.exists():
        return
    count = 0
    for proj_dir in projects_dir.iterdir():
        if not proj_dir.is_dir():
            continue
        exec_dir = proj_dir / "history" / "executions"
        if not exec_dir.exists():
            exec_dir = proj_dir / "executions"
            if not exec_dir.exists():
                continue
        for f in exec_dir.glob("*.json"):
            try:
                with open(f, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                if data.get("status") != "QUEUED":
                    continue
                add_queued_execution(
                    data.get("id") or f.stem,
                    proj_dir.name,
                    float(data.get("queuedAt") or data.get("createdAt") or 0),
                    {
                        "tags": data.get("tags"),
                        "capabilities": data.get("requiredCapabilities"),
                    },
                )
                count += 1
            except Exception:
                continue
    if count:
        logger.info("index_db backfilled %d QUEUED executions", count)


def _backfill_execution_locations(projects_dir: Path) -> None:
    if not projects_dir or not projects_dir.exists():
        return
    count = 0
    running = 0
    for proj_dir in projects_dir.iterdir():
        if not proj_dir.is_dir():
            continue
        exec_dir = proj_dir / "history" / "executions"
        if not exec_dir.exists():
            exec_dir = proj_dir / "executions"
            if not exec_dir.exists():
                continue
        for f in exec_dir.glob("*.json"):
            try:
                with open(f, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                execution_id = data.get("id") or f.stem
                status = data.get("status")
                worker_id = data.get("workerId")
                upsert_execution_location(
                    execution_id,
                    proj_dir.name,
                    status,
                    worker_id,
                    data.get("statusUpdatedAt") or data.get("createdAt") or 0,
                )
                if status == "RUNNING" and worker_id:
                    mark_running_execution(
                        execution_id,
                        proj_dir.name,
                        worker_id,
                        data.get("startedAt") or data.get("createdAt") or 0,
                    )
                    running += 1
                else:
                    remove_running_execution(execution_id)
                count += 1
            except Exception:
                continue
    if count:
        logger.info(
            "index_db backfilled %d execution locations (%d RUNNING)",
            count,
            running,
        )


def _backfill_workers(workers_dir: Path) -> None:
    if not workers_dir or not workers_dir.exists():
        return
    count = 0
    for f in workers_dir.glob("*.json"):
        try:
            with open(f, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            wid = data.get("id")
            th = data.get("tokenHash")
            salt = data.get("tokenSalt")
            if wid and th and salt:
                upsert_worker_token(wid, th, salt)
                count += 1
        except Exception:
            continue
    if count:
        logger.info("index_db backfilled %d worker tokens", count)
