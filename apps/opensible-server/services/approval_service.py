"""Approval workflow (Fase 2 — UC 50/68/72)."""
from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional


def _store_path() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "approvals.json"
    except Exception:
        return Path("data") / "approvals.json"


def _load() -> List[Dict[str, Any]]:
    try:
        p = _store_path()
        if p.exists():
            d = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(d, list):
                return d
    except Exception:
        pass
    return []


def _save(records: List[Dict[str, Any]]) -> None:
    p = _store_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(records, indent=2), encoding="utf-8")


def create_approval(stack: str, project_id: str, action: str,
                    requested_by: str = "", note: str = "") -> Dict[str, Any]:
    rec = {
        "id": str(uuid.uuid4()),
        "stack": stack,
        "project_id": project_id,
        "action": action,
        "status": "pending",
        "requested_by": requested_by,
        "note": note,
        "created_at": time.time(),
        "decided_at": None,
        "decided_by": None,
    }
    records = _load()
    records.append(rec)
    _save(records)
    return rec


def decide(approval_id: str, status: str, decided_by: str = "") -> Optional[Dict[str, Any]]:
    records = _load()
    for r in records:
        if r.get("id") == approval_id:
            r["status"] = status
            r["decided_at"] = time.time()
            r["decided_by"] = decided_by
            _save(records)
            if status == "approved" and r.get("action") == "apply":
                # Auto-apply after review (UC 51).
                try:
                    from services.cloud_provisioning import _create_execution
                    _create_execution(r.get("project_id"), r.get("stack"), "apply",
                                      triggered_by=f"approval:{approval_id}")
                except Exception:
                    pass
            return r
    return None


def list_approvals(project_id: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
    out = []
    for r in _load():
        if project_id and r.get("project_id") != project_id:
            continue
        if status and r.get("status") != status:
            continue
        out.append(r)
    out.sort(key=lambda x: x.get("created_at") or 0, reverse=True)
    return out


def has_approved(stack: str, project_id: str, action: str) -> bool:
    for r in list_approvals(project_id=project_id):
        if (r.get("stack") == stack and r.get("action") == action
                and r.get("status") == "approved"):
            return True
    return False


def latest_pending(stack: str, project_id: str, action: str) -> Optional[Dict[str, Any]]:
    for r in list_approvals(project_id=project_id):
        if (r.get("stack") == stack and r.get("action") == action
                and r.get("status") == "pending"):
            return r
    return None
