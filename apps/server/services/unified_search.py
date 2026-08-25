"""Unified full-text search across stacks, runs, playbooks, and secrets (UC637)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from storage import pg
from utils.project_paths import get_project_executions_dir


def search_all(
    query: str,
    project_id: Optional[str] = None,
    types: Optional[List[str]] = None,
    limit: int = 50,
) -> Dict[str, Any]:
    """Search across stacks, runs, playbooks, and secrets (UC637)."""
    if not query or len(query.strip()) < 2:
        return {
            "query": query,
            "total_matches": 0,
            "stacks": [],
            "runs": [],
            "playbooks": [],
            "secrets": [],
        }

    q = query.strip().lower()
    limit = max(1, min(limit, 100))
    enabled_types = types or ["stacks", "runs", "playbooks", "secrets"]

    project_clause = ""
    project_params: List[str] = []
    if project_id:
        project_clause = "AND project_id = %s"
        project_params = [project_id]

    stacks: List[Dict[str, Any]] = []
    if "stacks" in enabled_types:
        stacks_query = f"""
            SELECT project_id, stack, data
            FROM stack_meta
            WHERE (
                LOWER(stack) LIKE %s
                OR LOWER(CAST(data AS text)) LIKE %s
            )
            {project_clause}
            ORDER BY stack
            LIMIT %s
        """
        params = [f"%{q}%", f"%{q}%"] + project_params + [limit]
        stack_rows = pg.query_all(stacks_query, tuple(params))
        for row in stack_rows:
            meta = row.get("data") or {}
            if isinstance(meta, str):
                try:
                    meta = json.loads(meta)
                except Exception:
                    meta = {}
            stacks.append({
                "type": "stack",
                "project_id": row["project_id"],
                "name": row["stack"],
                "meta": meta,
                "provider": meta.get("provider"),
                "env": meta.get("env"),
                "tags": meta.get("tags", []),
                "description": meta.get("description", ""),
            })

    runs: List[Dict[str, Any]] = []
    if "runs" in enabled_types:
        projects_to_scan: List[str] = []
        if project_id:
            projects_to_scan = [project_id]
        else:
            proj_rows = pg.query_all("SELECT DISTINCT project_id FROM stack_meta")
            projects_to_scan = [row["project_id"] for row in proj_rows]

        import os
        for pid in projects_to_scan:
            try:
                exec_dir = get_project_executions_dir(pid)
            except Exception:
                exec_dir = None

            if not exec_dir or not exec_dir.exists():
                data_dir_env = os.environ.get("DATA_DIR")
                if data_dir_env:
                    base = Path(data_dir_env) / "projects" / pid
                    if (base / "history" / "executions").exists():
                        exec_dir = base / "history" / "executions"
                    elif (base / "executions").exists():
                        exec_dir = base / "executions"
                    else:
                        continue
                else:
                    continue
            try:
                files = sorted(exec_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
            except Exception:
                continue

            for f in files:
                if len(runs) >= limit:
                    break
                try:
                    data = json.loads(f.read_text(encoding="utf-8"))
                    run_id = str(data.get("id", ""))
                    run_params = data.get("runParams") or {}
                    stack_name = str(run_params.get("stack_name", ""))
                    action = str(run_params.get("tofu_action") or run_params.get("action", ""))
                    status = str(data.get("status", ""))
                    triggered_by = str(data.get("triggeredBy", ""))

                    matched = (
                        q in run_id.lower()
                        or q in stack_name.lower()
                        or q in action.lower()
                        or q in status.lower()
                        or q in triggered_by.lower()
                    )

                    if matched:
                        runs.append({
                            "type": "run",
                            "project_id": pid,
                            "id": run_id,
                            "stack": stack_name,
                            "action": action,
                            "status": status,
                            "triggered_by": triggered_by,
                            "started_at": data.get("startedAt"),
                            "finished_at": data.get("finishedAt"),
                        })
                except Exception:
                    continue

    playbooks: List[Dict[str, Any]] = []
    if "playbooks" in enabled_types:
        try:
            from services.playbook_service import list_playbooks
            all_pbs = list_playbooks(project_id)
            for pb in all_pbs:
                if len(playbooks) >= limit:
                    break
                if q in pb.get("name", "").lower() or q in pb.get("description", "").lower():
                    playbooks.append({
                        "type": "playbook",
                        "id": pb.get("id"),
                        "name": pb.get("name"),
                        "description": pb.get("description"),
                    })
        except Exception:
            pass

    secrets: List[Dict[str, Any]] = []
    if "secrets" in enabled_types:
        secrets_query = f"""
            SELECT project_id, stack, data
            FROM stack_secrets
            WHERE convert_from(data, 'UTF8') ILIKE %s
            {project_clause}
            ORDER BY project_id, stack
            LIMIT %s
        """
        secret_params = [f"%{q}%"] + project_params + [limit]
        secret_rows = pg.query_all(secrets_query, tuple(secret_params))
        for row in secret_rows:
            secrets.append({
                "type": "secret",
                "project_id": row["project_id"],
                "stack": row["stack"],
                "matched": True,
            })

    total_matches = len(stacks) + len(runs) + len(playbooks) + len(secrets)
    return {
        "query": query,
        "total_matches": total_matches,
        "stacks": stacks,
        "runs": runs,
        "playbooks": playbooks,
        "secrets": secrets,
    }
