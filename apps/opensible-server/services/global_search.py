"""Global search across stacks, runs, and secrets (UC396)."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from storage import pg
from utils.project_paths import get_project_executions_dir


def search(
    query: str,
    project_id: Optional[str] = None,
    limit: int = 20,
) -> Dict[str, Any]:
    """Search across stacks, runs, and secrets.

    Args:
        query: Search string (case-insensitive partial match)
        project_id: Optional project scope; if None, search all accessible projects
        limit: Max results per category (stacks, runs, secrets)

    Returns:
        Dict with keys: 'stacks', 'runs', 'secrets', each a list of results
    """
    if not query or len(query.strip()) < 2:
        return {"stacks": [], "runs": [], "secrets": []}

    q = query.strip().lower()
    limit = max(1, min(limit, 100))

    # Build project filter
    project_clause = ""
    project_params: List[str] = []
    if project_id:
        project_clause = "AND project_id = %s"
        project_params = [project_id]

    # 1. Search stacks (stack_meta table)
    stacks_query = f"""
        SELECT project_id, stack, data
        FROM stack_meta
        WHERE LOWER(stack) LIKE %s
        {project_clause}
        ORDER BY stack
        LIMIT %s
    """
    params = [f"%{q}%"] + project_params + [limit]
    stack_rows = pg.query_all(stacks_query, tuple(params))
    stacks = [
        {
            "type": "stack",
            "project_id": row["project_id"],
            "name": row["stack"],
            "meta": row.get("data", {}),
            "provider": (row.get("data") or {}).get("provider"),
            "env": (row.get("data") or {}).get("env"),
        }
        for row in stack_rows
    ]

    # 2. Search runs (from execution JSON files)
    # We'll scan the most recent execution files (up to 500) per project
    runs: List[Dict[str, Any]] = []
    run_limit = limit * 3  # fetch extra to filter

    # Determine projects to scan
    projects_to_scan: List[str] = []
    if project_id:
        projects_to_scan = [project_id]
    else:
        # Get all project IDs from stack_meta (or projects table)
        proj_rows = pg.query_all("SELECT DISTINCT project_id FROM stack_meta")
        projects_to_scan = [row["project_id"] for row in proj_rows]

    # For each project, scan recent execution files
    for pid in projects_to_scan:
        exec_dir = get_project_executions_dir(pid)
        if not exec_dir.exists():
            continue
        # Get all JSON files sorted by mtime descending
        try:
            files = sorted(exec_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        except Exception:
            continue
        count = 0
        for f in files:
            if count >= run_limit:
                break
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                # Extract searchable fields
                run_id = data.get("id", "")
                run_params = data.get("runParams", {})
                stack_name = run_params.get("stack_name", "")
                action = run_params.get("tofu_action", "") or run_params.get("action", "")
                status = data.get("status", "")
                triggered_by = data.get("triggeredBy", "")
                # Check if query matches any of these
                if (q in run_id.lower() or
                    q in stack_name.lower() or
                    q in action.lower() or
                    q in status.lower() or
                    q in triggered_by.lower()):
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
                    count += 1
            except Exception:
                continue
        if len(runs) >= limit:
            break

    # Limit runs
    runs = runs[:limit]

    # 3. Search secrets (stack_secrets table)
    # data is stored as bytea (encrypted JSON), so we need to decode it to text.
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
    secrets = []
    for row in secret_rows:
        # Decode the encrypted data blob to inspect keys? We'll just search the raw JSON text.
        # Since we already matched via ILIKE, we can extract the keys that matched.
        # But for safety, we'll just list the stack and project.
        # We could also parse the JSON and check keys.
        try:
            raw = row.get("data")
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8")
            # Try to parse as JSON to extract keys
            payload = json.loads(raw) if isinstance(raw, str) else {}
            # Since encrypted, we can't see values, but we can see keys
            # We'll just list the stack and project, and mention it contains the query
            secrets.append({
                "type": "secret",
                "project_id": row["project_id"],
                "stack": row["stack"],
                # We don't expose the actual secret names/values; just indicate match
                "matched": True,
            })
        except Exception:
            # If parsing fails, still include the stack
            secrets.append({
                "type": "secret",
                "project_id": row["project_id"],
                "stack": row["stack"],
                "matched": True,
            })

    return {
        "stacks": stacks,
        "runs": runs,
        "secrets": secrets,
    }