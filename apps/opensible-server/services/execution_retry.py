"""Retry a finished execution as a new queued run (Fase 5 — UC 82)."""
from __future__ import annotations

import json
import uuid
from typing import Optional


def find_project(execution_id: str) -> Optional[str]:
    try:
        from storage.index_db import find_execution_project
        return find_execution_project(execution_id)
    except Exception:
        return None


def retry_execution(execution_id: str, project_id: Optional[str] = None) -> Optional[str]:
    from services.execution_history import create_execution_record
    from utils.project_paths import get_project_executions_dir

    if not project_id:
        project_id = find_project(execution_id)
    if not project_id:
        return None

    p = get_project_executions_dir(project_id) / f"{execution_id}.json"
    if not p.exists():
        return None

    orig = json.loads(p.read_text(encoding="utf-8"))
    data = {
        "playbookName": orig.get("playbookName", "dynamic_playbook"),
        "mode": orig.get("mode", "PER_GROUP"),
        "inventorySnapshot": orig.get("inventorySnapshot", {}),
        "selectionSnapshot": orig.get("selectionSnapshot", {}),
        "stats": {},
        "type": orig.get("type"),
        "project_id": project_id,
    }
    new_id = str(uuid.uuid4())
    create_execution_record(data, project_id=project_id, execution_id=new_id)

    # tag retry_of for traceability
    try:
        p2 = get_project_executions_dir(project_id) / f"{new_id}.json"
        d = json.loads(p2.read_text(encoding="utf-8"))
        d["retry_of"] = execution_id
        p2.write_text(json.dumps(d, indent=2), encoding="utf-8")
    except Exception:
        pass
    return new_id
